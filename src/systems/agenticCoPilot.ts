/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * ARIA-7 co-pilot: a rule-based (non-LLM) assistant bound to live mission state.
 *
 * Design rules:
 * - ARIA never plays moves for the operator and never volunteers the right sensor. Deducing the
 *   sensor from the weather is the puzzle.
 * - Free alerts cover only resource facts the operator can already see (bay too big for the window,
 *   battery nearly empty, hesitation).
 * - Pinching / poking the ARIA hologram asks for a hint: the next move of the best known plan,
 *   spoken and captioned. Each hint costs points (SCORING.hintPenalty) and is listed in the debrief.
 */

import type { MissionAction, MissionSolution, MissionState } from '../mission/types';
import { solveMission } from '../mission/missionPlanner';
import { describeHint } from '../mission/guidance';
import { getScanCost, MISSION_SCENARIOS, SCORING } from '../mission/missionConfig';
import type { OrbitalAudioController } from './orbitalAudio';
import type { VoiceCommander } from './voiceCommander';

export type AgentUrgencyLevel = 'NOMINAL' | 'ADVISORY' | 'CRITICAL' | 'EMERGENCY';

export interface AgenticIntervention {
  readonly id: string;
  readonly urgency: AgentUrgencyLevel;
  readonly headline: string;
  readonly detailedAdvice: string;
  /** The action taken when the operator accepts the intervention (always a paid hint). */
  readonly recommendedAction: MissionAction;
  readonly targetControlId: string;
  readonly reasonCode: 'HESITATION' | 'QUEUE_OVERFLOW' | 'POWER_BROWNOUT' | 'CUTOFF_IMMINENT';
}

export interface AgenticCoPilotHost {
  getState: () => MissionState;
  /** Memoized solver owned by the host. Falls back to an uncached solve when absent. */
  getSolution?: (state: MissionState) => MissionSolution;
  applyAction: (action: MissionAction) => { ok: boolean; message: string };
  playCue?: (cue: string) => void;
  voiceCommander?: VoiceCommander;
  audio?: OrbitalAudioController;
}

const HINT: MissionAction = { type: 'USE_HINT' };

export class AgenticCoPilot {
  private host: AgenticCoPilotHost;
  private idleTimeSec = 0;
  private lastStepCounter = -1;
  private activeIntervention: AgenticIntervention | null = null;
  private hintCooldownSec = 0;
  private hintsGiven = 0;
  private lastHintText = '';

  constructor(host: AgenticCoPilotHost) {
    this.host = host;
    this.lastStepCounter = host.getState().stepCounter;
  }

  public update(deltaSec: number): AgenticIntervention | null {
    const state = this.host.getState();
    if (state.paused || state.phase === 'DEBRIEF') {
      this.activeIntervention = null;
      return null;
    }
    if (this.hintCooldownSec > 0) this.hintCooldownSec = Math.max(0, this.hintCooldownSec - deltaSec);
    if (state.stepCounter !== this.lastStepCounter) {
      this.lastStepCounter = state.stepCounter;
      this.idleTimeSec = 0;
    } else {
      this.idleTimeSec += deltaSec;
    }
    this.activeIntervention = this.diagnoseLiveEmergency(state);
    return this.activeIntervention;
  }

  public getActiveIntervention(): AgenticIntervention | null {
    return this.activeIntervention;
  }

  /** Number of paid hints given this session (kept for mastery medals). */
  public getTotalDelegations(): number {
    return this.hintsGiven;
  }

  public getLastHintText(): string {
    return this.lastHintText;
  }

  /** Free, fact-based alerts only. None of them reveal which sensor to use. */
  public diagnoseLiveEmergency(state: MissionState): AgenticIntervention | null {
    if (state.phase === 'OPERATIONS' && state.downlinkCommittedSec > state.downlinkWindowSec + 0.01) {
      return {
        id: 'INTERVENTION_QUEUE_OVERFLOW',
        urgency: 'CRITICAL',
        headline: 'BAY TOO FULL FOR THE WINDOW',
        detailedAdvice: `Loaded cubes need ${state.downlinkCommittedSec.toFixed(1)}s, the window is ${state.downlinkWindowSec.toFixed(1)}s. The last slot will be cut off unless you compress or unload a cube.`,
        recommendedAction: HINT,
        targetControlId: 'pad-process-cradle',
        reasonCode: 'QUEUE_OVERFLOW',
      };
    }

    if (state.phase === 'OPERATIONS' && state.passStarted && state.passRemainingSec !== null && state.passRemainingSec <= 20 && state.passRemainingSec > 0) {
      return {
        id: 'INTERVENTION_CUTOFF_IMMINENT',
        urgency: 'EMERGENCY',
        headline: `${Math.ceil(state.passRemainingSec)}s TO GROUND-STATION CONTACT`,
        detailedAdvice: 'The window opens automatically when the clock hits zero. Load your best cubes now.',
        recommendedAction: HINT,
        targetControlId: 'pad-queue-downlink',
        reasonCode: 'CUTOFF_IMMINENT',
      };
    }

    const scenario = MISSION_SCENARIOS[state.scenarioId];
    const cheapest = scenario
      ? Math.min(...(scenario.availableSensors ?? ['RADAR', 'OPTICAL']).map((m) => getScanCost(scenario.budget, m).powerCost))
      : 8;
    if (state.phase === 'OPERATIONS' && state.power < cheapest && state.packets.length > 0) {
      return {
        id: 'INTERVENTION_POWER_BROWNOUT',
        urgency: 'ADVISORY',
        headline: 'BATTERY TOO LOW TO SCAN',
        detailedAdvice: `${state.power} Wh left: no more scans this pass. Load what you have and transmit.`,
        recommendedAction: HINT,
        targetControlId: 'pad-queue-downlink',
        reasonCode: 'POWER_BROWNOUT',
      };
    }

    if (this.idleTimeSec >= 12 && this.hintCooldownSec <= 0) {
      return {
        id: 'INTERVENTION_HESITATION',
        urgency: 'ADVISORY',
        headline: 'STUCK? ASK ARIA-7',
        detailedAdvice: `Poke or pinch the ARIA hologram for a hint (-${SCORING.hintPenalty} pts).`,
        recommendedAction: HINT,
        targetControlId: 'avatar-aria',
        reasonCode: 'HESITATION',
      };
    }

    return null;
  }

  /**
   * Operator asked ARIA for help: records a paid hint in the engine and speaks the next best move.
   * Never mutates the mission beyond the hint counter.
   */
  public executeActiveIntervention(): { ok: boolean; message: string; action: MissionAction | null } {
    const state = this.host.getState();
    if (state.phase === 'DEBRIEF' || state.paused) {
      return { ok: false, message: 'ARIA-7 hints are available during an active pass.', action: null };
    }
    if (this.hintCooldownSec > 0) {
      return { ok: false, message: this.lastHintText || 'ARIA-7 is still processing the last request.', action: null };
    }
    const solution = state.phase === 'OPERATIONS'
      ? (this.host.getSolution ? this.host.getSolution(state) : solveMission(state))
      : null;
    const text = describeHint(state, solution);
    const result = this.host.applyAction(HINT);
    if (!result.ok) return { ok: false, message: result.message, action: HINT };

    this.hintsGiven++;
    this.lastHintText = text;
    this.idleTimeSec = 0;
    this.hintCooldownSec = 3.0;
    this.host.playCue?.('PROCESS_SUCCESS');
    this.host.voiceCommander?.speakDirect(text.replace(/^ARIA-7 \([^)]*\):\s*/, ''), `[ARIA-7] ${text}`, 'HIGH');
    this.activeIntervention = null;
    return { ok: true, message: text, action: HINT };
  }
}
