/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Pure player guidance: one "Next Step" instruction derived from mission state, stall detection
 * (no way left to finish), and ARIA-7 hint text. Never reveals the right sensor unless the player
 * explicitly asks for a hint (which costs points).
 */

import { OUTCOME_LABELS } from './resultLabels';
import {
  describeWeather,
  getScanCost,
  getScenarioRequests,
  getScenarioSector,
  GROUND_REQUEST_ORDER,
  MAX_EVIDENCE_CUBES,
  MISSION_SCENARIOS,
  requestValue,
  SCORING,
} from './missionConfig';
import { getNextPlanAction } from './missionPlanner';
import type {
  GroundRequest,
  MissionScenarioConfig,
  MissionSolution,
  MissionState,
  SensorMode,
} from './types';

export type GuidanceTone = 'info' | 'warn' | 'critical' | 'success';

export interface NextStep {
  title: string;
  body: string;
  tone: GuidanceTone;
  /** Short desktop control reminder. */
  desktop: string;
  /** Short hand-gesture reminder for XR. */
  hands: string;
}

export const SENSOR_SHORT: Record<SensorMode, string> = { OPTICAL: 'Optical', THERMAL: 'Thermal IR', RADAR: 'Radar' };

function scenarioOf(state: MissionState, custom?: MissionScenarioConfig | null): MissionScenarioConfig {
  return custom ?? MISSION_SCENARIOS[state.scenarioId] ?? MISSION_SCENARIOS.STANDARD_INDUS_PASS;
}

/** Requests that already have usable (not blocked) evidence on board. */
export function coveredRequestIds(state: MissionState): Set<string> {
  return new Set(
    state.packets
      .filter((p) => p.satisfiesRequestId && p.confidence !== 'UNVERIFIED')
      .map((p) => p.satisfiesRequestId as string),
  );
}

export function cheapestScanCost(state: MissionState, custom?: MissionScenarioConfig | null): number {
  const scenario = scenarioOf(state, custom);
  const sensors = scenario.availableSensors ?? ['RADAR', 'OPTICAL'];
  return Math.min(...sensors.map((m) => getScanCost(scenario.budget, m).powerCost));
}

function canScanMore(state: MissionState, custom?: MissionScenarioConfig | null): boolean {
  const scenario = scenarioOf(state, custom);
  const storagePerScan = getScanCost(scenario.budget, 'OPTICAL').storageCost;
  return (
    state.packets.length < MAX_EVIDENCE_CUBES &&
    state.storageUsed + storagePerScan <= state.maxStorage &&
    state.power >= cheapestScanCost(state, custom)
  );
}

/** True when the pass can no longer send anything: no usable cube and no affordable scan. */
export function isPassStalled(state: MissionState, custom?: MissionScenarioConfig | null): boolean {
  if (state.phase !== 'OPERATIONS') return false;
  const usable = state.packets.some((p) => p.confidence !== 'UNVERIFIED');
  if (usable) return false;
  return state.power < cheapestScanCost(state, custom);
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Requests sorted by value, highest first (what a responder would prioritise). */
export function requestsByValue(state: MissionState, custom?: MissionScenarioConfig | null): GroundRequest[] {
  const requests = getScenarioRequests(state.scenarioId, custom);
  return GROUND_REQUEST_ORDER.map((id) => requests[id]).sort((a, b) => requestValue(b) - requestValue(a));
}

export function getNextStep(state: MissionState, custom?: MissionScenarioConfig | null): NextStep {
  const requests = getScenarioRequests(state.scenarioId, custom);

  if (state.phase === 'DEBRIEF') {
    const d = state.debrief;
    const label = OUTCOME_LABELS[d?.outcome ?? 'FAILED'];
    return {
      title: `${label} - ${d?.totalScore ?? 0} PTS`,
      body: 'Read what reached the ground and what did not. Retry the pass to beat your score, or go to the next operation.',
      tone: d?.outcome === 'SUCCESS' ? 'success' : d?.outcome === 'PARTIAL_SUCCESS' ? 'warn' : 'critical',
      desktop: 'R = retry  |  N = next operation',
      hands: 'Point at RETRY PASS or NEXT OPERATION and pinch',
    };
  }

  if (state.paused) {
    return { title: 'PAUSED', body: 'The pass clock is held. Resume when ready.', tone: 'info', desktop: 'Esc = resume', hands: 'Point at RESUME PASS below and pinch' };
  }

  if (state.phase === 'DOWNLINK') {
    const left = Math.max(0, state.downlinkWindowSec - state.downlinkElapsedSec);
    const maxSlots = MAX_EVIDENCE_CUBES;
    const dockable = state.queuePacketIds.length < maxSlots && state.packets.some((p) => !p.queued && p.confidence !== 'UNVERIFIED');
    return dockable
      ? {
        title: `LIVE WINDOW - ${left.toFixed(1)}s LEFT`,
        body: 'The link is open. Cubes still on the tray can be docked now: every idle second is lost.',
        tone: 'critical',
        desktop: 'Drag a cube to the Bay or press Q  |  T = close link',
        hands: 'Grab a tray cube and drop it in the Downlink Bay',
      }
      : {
        title: `TRANSMITTING - ${left.toFixed(1)}s LEFT`,
        body: 'Packets stream in slot order. Watch which ones finish before loss of signal.',
        tone: 'info',
        desktop: 'T = close link early',
        hands: 'Pinch the green lever again to close the link early',
      };
  }

  if (isPassStalled(state, custom)) {
    return {
      title: 'NO WAY TO FINISH',
      body: `Battery (${state.power} Wh) cannot pay for another scan and no usable evidence is on board. Abort the pass and try a new plan.`,
      tone: 'critical',
      desktop: 'Click ABORT PASS',
      hands: 'Pinch the green lever (or ABORT PASS above) to end the pass',
    };
  }

  const clockWarn = state.passStarted && state.passRemainingSec !== null && state.passRemainingSec <= 25;
  const latest = state.packets.find((p) => p.id === state.selectedPacketId) ?? state.packets[state.packets.length - 1];

  if (state.downlinkCommittedSec > state.downlinkWindowSec + 0.01) {
    return {
      title: 'BAY TOO FULL FOR THE WINDOW',
      body: `Loaded cubes need ${state.downlinkCommittedSec.toFixed(1)}s but the window is ${state.downlinkWindowSec.toFixed(1)}s. Compress a cube in the Cradle or take the least valuable one out. The last slot gets cut off.`,
      tone: 'warn',
      desktop: 'P = compress  |  U = unload',
      hands: 'Drop a cube in the amber Cradle, or back on the tray',
    };
  }

  if (latest && latest.confidence === 'UNVERIFIED' && !latest.queued) {
    return {
      title: 'BLOCKED SCAN',
      body: `${SENSOR_SHORT[latest.sensorMode]} could not see through the weather over Sector ${latest.sectorId}. This cube holds no evidence. Discard it to free memory, then try a different sensor.`,
      tone: 'warn',
      desktop: 'X = discard  |  S = change sensor',
      hands: 'Drop the cube in the red discard chute',
    };
  }

  const covered = coveredRequestIds(state);
  const open = requestsByValue(state, custom).filter((r) => !covered.has(r.id));
  const sector = getScenarioSector(state.scenarioId, state.selectedSectorId, custom);
  const weather = describeWeather(sector.cloudCover);
  const targetRequest = GROUND_REQUEST_ORDER.map((id) => requests[id]).find((r) => r.targetSectorId === state.selectedSectorId);
  const clockPrefix = clockWarn ? `${formatClock(state.passRemainingSec!)} LEFT - ` : '';

  if (open.length && canScanMore(state, custom)) {
    if (targetRequest && !covered.has(targetRequest.id)) {
      return {
        title: `${clockPrefix}SCAN SECTOR ${state.selectedSectorId}: ${weather.toUpperCase()}`,
        body: `${targetRequest.shortLabel.split('|')[1]?.trim() ?? targetRequest.title} needs ${targetRequest.minimumConfidence} evidence. Pick the sensor that can see through "${weather.toLowerCase()}", then fire the scan.`,
        tone: clockWarn ? 'warn' : 'info',
        desktop: 'Click a sensor chip, then SCAN (Space)',
        hands: 'Pinch the plunger, or aim the scanner beam at the sector and let go',
      };
    }
    const sectors = open.map((r) => r.targetSectorId).join(', ');
    return {
      title: `${clockPrefix}PICK A TARGET SECTOR`,
      body: `Requests still need evidence from Sector ${sectors}. Sector ${state.selectedSectorId} is ${targetRequest ? 'already covered' : 'not part of any request'}. Highest value first.`,
      tone: clockWarn ? 'warn' : 'info',
      desktop: `Click Sector ${open[0].targetSectorId} on the globe (or press its number key)`,
      hands: 'Point at a glowing sector beacon and pinch',
    };
  }

  if (open.length && !canScanMore(state, custom) && state.power >= cheapestScanCost(state, custom) && state.packets.length > 0) {
    const fullTray = state.packets.length >= MAX_EVIDENCE_CUBES;
    return {
      title: `${clockPrefix}${fullTray ? 'TRAY FULL' : 'MEMORY FULL'}`,
      body: fullTray
        ? 'All three cube slots are used. Discard a cube you do not need to scan again.'
        : 'Raw cubes fill memory. Compress one in the Cradle to free space, or discard one.',
      tone: 'warn',
      desktop: 'P = compress  |  X = discard',
      hands: 'Drop a cube in the amber Cradle',
    };
  }

  const usableUnloaded = state.packets.filter((p) => !p.queued && p.confidence !== 'UNVERIFIED');
  if (usableUnloaded.length && state.queuePacketIds.length < MAX_EVIDENCE_CUBES) {
    return {
      title: `${clockPrefix}LOAD THE DOWNLINK BAY`,
      body: `Put cubes in the bay in priority order: Slot 1 transmits first. Loaded: ${state.downlinkCommittedSec.toFixed(1)}s of ${state.downlinkWindowSec.toFixed(1)}s.`,
      tone: clockWarn ? 'warn' : 'info',
      desktop: 'Drag a cube to the Bay (or select it and press Q)',
      hands: 'Grab a cube and drop it in the Downlink Bay',
    };
  }

  if (state.queuePacketIds.length) {
    return {
      title: `${clockPrefix}READY TO TRANSMIT`,
      body: `Bay holds ${state.downlinkCommittedSec.toFixed(1)}s of ${state.downlinkWindowSec.toFixed(1)}s. Use the green lever to open the link.${open.length ? ' Some requests stay unanswered: that can be the right call.' : ''}`,
      tone: 'success',
      desktop: 'Click TRANSMIT (T) or the lever',
      hands: 'Pinch the green lever, or TRANSMIT above',
    };
  }

  return {
    title: 'SCAN A TARGET',
    body: `Sector ${state.selectedSectorId}: ${weather}. Choose a sensor and scan.`,
    tone: 'info',
    desktop: 'Space = scan',
    hands: 'Pinch the plunger, or aim the scanner beam at the sector and let go',
  };
}

/** ARIA-7 hint text: the next move of the best known plan from the current state. Costs points. */
export function describeHint(state: MissionState, solution: MissionSolution | null): string {
  const penalty = `(-${SCORING.hintPenalty} pts)`;
  if (state.phase === 'DOWNLINK') return `ARIA-7 ${penalty}: dock any usable cube now, most valuable first.`;
  if (!solution) return `ARIA-7 ${penalty}: load what you have and transmit.`;
  const action = getNextPlanAction(state, solution);
  if (!action) {
    return state.queuePacketIds.length
      ? `ARIA-7 ${penalty}: your bay is the best plan I can find. Transmit now.`
      : `ARIA-7 ${penalty}: nothing more can be gained. Load your best cube and transmit.`;
  }
  switch (action.type) {
    case 'SCAN':
      return `ARIA-7 ${penalty}: scan Sector ${action.sectorId} with ${SENSOR_SHORT[action.sensorMode]}.`;
    case 'PROCESS':
      return `ARIA-7 ${penalty}: compress the Sector ${action.sectorId} cube in the Cradle.`;
    case 'QUEUE':
      return `ARIA-7 ${penalty}: load the Sector ${action.sectorId} cube into the Downlink Bay.`;
    case 'UNQUEUE':
      return `ARIA-7 ${penalty}: take the Sector ${action.sectorId} cube out of the bay.`;
    case 'DISCARD':
      return `ARIA-7 ${penalty}: discard the Sector ${action.sectorId} cube to free space.`;
    default:
      return `ARIA-7 ${penalty}: transmit now.`;
  }
}
