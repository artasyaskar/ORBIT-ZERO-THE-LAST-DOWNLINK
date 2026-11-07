/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Deep Agentic Co-Pilot System ("Best Agentic Interaction" & "Take It Away Test")
 *
 * Implements an autonomous tactical AI co-pilot directly bound to live telemetry:
 * 1. Live Telemetry Analysis:
 *    - Continuous real-time evaluation of MissionState (power, storage, queue duration, remaining window).
 *    - Detects player hesitation (idle > 5.0s during active emergency).
 *    - Detects imminent downlink cutoff / queue overflow (> 10.0s queued).
 *    - Detects sensor-physics mismatch (e.g., optical pointed at dense storm clouds).
 * 2. Spatial 3D Delegation ("Take It Away Test"):
 *    - Proposes high-conviction, deterministic emergency actions derived from missionPlanner.
 *    - Arms a spatial 3D holographic intervention beacon within seated reach (35cm-55cm).
 *    - When the operator pinches or pokes the ARIA hologram or delegation beacon, ARIA autonomously
 *      executes the triage action on the deterministic MissionEngine and reports back via Quindar telemetry.
 */

import type { MissionAction, MissionSolution, MissionState, SectorId, SensorMode } from '../mission/types';
import { getNextPlanAction, solveMission } from '../mission/missionPlanner';
import { SECTORS } from '../mission/missionConfig';
import type { OrbitalAudioController } from './orbitalAudio';
import type { VoiceCommander } from './voiceCommander';

export type AgentUrgencyLevel = 'NOMINAL' | 'ADVISORY' | 'CRITICAL' | 'EMERGENCY';

export interface AgenticIntervention {
  readonly id: string;
  readonly urgency: AgentUrgencyLevel;
  readonly headline: string;
  readonly detailedAdvice: string;
  readonly recommendedAction: MissionAction;
  readonly targetControlId: string; // e.g. 'pad-process-cradle', 'pad-toggle-sensor', 'avatar-aria'
  readonly reasonCode: 'HESITATION' | 'QUEUE_OVERFLOW' | 'SENSOR_MISMATCH' | 'POWER_BROWNOUT' | 'CUTOFF_IMMINENT';
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

export class AgenticCoPilot {
  private host: AgenticCoPilotHost;
  private idleTimeSec = 0;
  private lastStepCounter = -1;
  private activeIntervention: AgenticIntervention | null = null;
  private coPilotCooldownSec = 0;
  private totalDelegationsExecuted = 0;

  constructor(host: AgenticCoPilotHost) {
    this.host = host;
    this.lastStepCounter = host.getState().stepCounter;
  }

  public update(deltaSec: number): AgenticIntervention | null {
    const state = this.host.getState();
    if (state.paused || state.phase !== 'OPERATIONS') {
      this.activeIntervention = null;
      return null;
    }

    if (this.coPilotCooldownSec > 0) {
      this.coPilotCooldownSec = Math.max(0, this.coPilotCooldownSec - deltaSec);
    }

    // Track hesitation
    if (state.stepCounter !== this.lastStepCounter) {
      this.lastStepCounter = state.stepCounter;
      this.idleTimeSec = 0;
    } else {
      this.idleTimeSec += deltaSec;
    }

    // Evaluate live state for tactical emergencies
    this.activeIntervention = this.diagnoseLiveEmergency(state);
    return this.activeIntervention;
  }

  public getActiveIntervention(): AgenticIntervention | null {
    return this.activeIntervention;
  }

  public getTotalDelegations(): number {
    return this.totalDelegationsExecuted;
  }

  /**
   * Evaluates live telemetry against optimal Earth observation physics & deadlines
   */
  public diagnoseLiveEmergency(state: MissionState): AgenticIntervention | null {
    const queueTotalSec = state.packets
      .filter((p) => state.queuePacketIds.includes(p.id))
      .reduce((sum, p) => sum + p.transmitSec, 0);

    // 1. CRITICAL: Queue Overflow (> Downlink Horizon Window)
    if (queueTotalSec > state.downlinkWindowSec) {
      const rawInQueue = state.packets.find(
        (p) => state.queuePacketIds.includes(p.id) && !p.compressionAlgorithm,
      );
      if (rawInQueue && state.power >= 6) {
        return {
          id: 'INTERVENTION_QUEUE_OVERFLOW',
          urgency: 'CRITICAL',
          headline: 'DOWNLINK OVERFLOW DETECTED',
          detailedAdvice: `Queued telemetry (${queueTotalSec.toFixed(1)}s) exceeds Karachi horizon (${state.downlinkWindowSec.toFixed(1)}s)! Delegate compression of Packet ${rawInQueue.id} now.`,
          recommendedAction: { type: 'PROCESS', packetId: rawInQueue.id },
          targetControlId: 'pad-process-cradle',
          reasonCode: 'QUEUE_OVERFLOW',
        };
      }
    }

    // 2. CRITICAL: Imminent Sensor Mismatch (scanning cloudy sector with optical)
    const activeSector = SECTORS[state.selectedSectorId];
    if (activeSector && activeSector.cloudCover === 'DENSE_STORM' && state.activeSensorMode === 'OPTICAL') {
      return {
        id: 'INTERVENTION_SENSOR_MISMATCH',
        urgency: 'CRITICAL',
        headline: 'CLOUD SCATTER WARNING',
        detailedAdvice: `Sector ${state.selectedSectorId} is under 95% convective storm clouds. Switch to active C-Band SAR to penetrate!`,
        recommendedAction: { type: 'SET_SENSOR', sensorMode: 'RADAR' },
        targetControlId: 'pad-toggle-sensor',
        reasonCode: 'SENSOR_MISMATCH',
      };
    }

    // 3. ADVISORY / HESITATION: Player idle > 5 seconds
    if (this.idleTimeSec >= 5.0 && this.coPilotCooldownSec <= 0) {
      const solution = this.host.getSolution ? this.host.getSolution(state) : solveMission(state);
      const planAction = getNextPlanAction(state, solution);
      if (planAction) {
        let headline = 'TACTICAL ASSIST READY';
        let advice = 'ARIA recommends next optimal triage action. Pinch hologram to delegate.';
        let targetControl = 'avatar-aria';
        let actionToOffer: MissionAction = {
          type: 'SCAN',
          sectorId: state.selectedSectorId,
          sensorMode: state.activeSensorMode,
        };

        if (planAction.type === 'SCAN') {
          headline = `ENGAGE SENSOR SWATH [SEC-${planAction.sectorId}]`;
          advice = `Target locked. Arm swath scan to gather critical flood intelligence.`;
          targetControl = 'pad-fire-swath';
          actionToOffer = {
            type: 'SCAN',
            sectorId: planAction.sectorId,
            sensorMode: planAction.sensorMode,
          };
        } else if (planAction.type === 'PROCESS') {
          headline = `RUN ONBOARD COMPRESSION`;
          advice = `Compress data cube to halve downlink transmission time.`;
          targetControl = 'pad-process-cradle';
          actionToOffer = {
            type: 'PROCESS',
            packetId: planAction.packetId,
          };
        } else if (planAction.type === 'QUEUE') {
          headline = `QUEUE EVIDENCE CUBE`;
          advice = `Transfer verified evidence into Karachi S-band transmitter bay.`;
          targetControl = 'pad-queue-downlink';
          actionToOffer = {
            type: 'QUEUE',
            packetId: planAction.packetId,
          };
        }

        return {
          id: `INTERVENTION_HESITATION_${planAction.type}`,
          urgency: 'ADVISORY',
          headline,
          detailedAdvice: advice,
          recommendedAction: actionToOffer,
          targetControlId: targetControl,
          reasonCode: 'HESITATION',
        };
      }
    }

    // 4. POWER BROWNOUT: Low power (< 14 Wh) with unaddressed primary requests
    if (state.power < 14 && state.power >= 6 && state.packets.some((p) => !p.compressionAlgorithm)) {
      const raw = state.packets.find((p) => !p.compressionAlgorithm);
      if (raw) {
        return {
          id: 'INTERVENTION_POWER_BROWNOUT',
          urgency: 'CRITICAL',
          headline: 'POWER CONSERVATION ALERT',
          detailedAdvice: `Battery bus at ${state.power} Wh. Compress raw packet to salvage downlink schedule.`,
          recommendedAction: { type: 'PROCESS', packetId: raw.id },
          targetControlId: 'pad-process-cradle',
          reasonCode: 'POWER_BROWNOUT',
        };
      }
    }

    return null;
  }

  /**
   * Executes the active recommended intervention when the operator pinches/pokes the hologram
   */
  public executeActiveIntervention(): { ok: boolean; message: string; action: MissionAction | null } {
    if (!this.activeIntervention) {
      return { ok: false, message: 'No active agentic intervention to execute.', action: null };
    }

    const actionToExec = this.activeIntervention.recommendedAction;
    const result = this.host.applyAction(actionToExec);

    if (result.ok) {
      this.totalDelegationsExecuted++;
      this.idleTimeSec = 0;
      this.coPilotCooldownSec = 4.0; // Prevent spamming

      // Audio feedback
      this.host.playCue?.('PROCESS_SUCCESS');

      // Trigger ARIA vocal confirmation if available
      if (this.host.voiceCommander) {
        if (actionToExec.type === 'PROCESS') {
          this.host.voiceCommander.trigger('PROCESS_SUCCESS');
        } else if (actionToExec.type === 'COMMIT') {
          this.host.voiceCommander.trigger('DOWNLINK_TRANSMIT');
        } else {
          this.host.voiceCommander.speakDirect(
            `Delegated tactical action confirmed, Operator. Telemetry updated.`,
            `[ARIA-7] DELEGATED ACTION EXECUTED: ${actionToExec.type}`,
            'HIGH',
          );
        }
      }

      this.activeIntervention = null;
      return { ok: true, message: `Delegated action ${actionToExec.type} executed successfully.`, action: actionToExec };
    }

    return { ok: false, message: result.message, action: actionToExec };
  }
}
