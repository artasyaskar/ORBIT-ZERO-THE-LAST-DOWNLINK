/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Shared, renderer-agnostic HUD text models. The desktop DOM HUD (desktopHudViews.ts) and the
 * headset Mission HUD panel (mission-hud.uikitml) both read these, so the two platforms can never
 * disagree about requests, values, weather, rules or results. Pure: no DOM, no Three.js.
 */

import {
  describeWeather,
  getScanCost,
  getScenarioRequests,
  getScenarioSector,
  getScenarioThresholds,
  GROUND_REQUEST_ORDER,
  isWeightedScenario,
  MISSION_SCENARIOS,
  requestValue,
  SCORING,
  SENSOR_PLAIN_GUIDE,
} from '../mission/missionConfig';
import type { GroundRequestId, MissionScenarioConfig, MissionState } from '../mission/types';
import { retryGuidanceFor } from './debriefText';

export type RequestStatus = 'NEEDED' | 'WEAK' | 'ON BOARD' | 'LOADED' | 'SENT' | 'CUT OFF';

export interface RequestStatusView {
  id: GroundRequestId;
  sectorId: string;
  label: string;
  value: number;
  status: RequestStatus;
}

function scenarioOf(state: MissionState, custom?: MissionScenarioConfig | null): MissionScenarioConfig {
  return custom ?? MISSION_SCENARIOS[state.scenarioId] ?? MISSION_SCENARIOS.STANDARD_INDUS_PASS;
}

export function shortRequestLabel(shortLabel: string, fallback: string): string {
  return shortLabel.split('|')[1]?.trim() ?? fallback;
}

/** Live status of every ground request, from the cubes on board, in the bay and transmitted. */
export function requestStatuses(state: MissionState, custom?: MissionScenarioConfig | null): RequestStatusView[] {
  const requests = getScenarioRequests(state.scenarioId, custom);
  return GROUND_REQUEST_ORDER.map((id) => {
    const r = requests[id];
    const onBoard = state.packets.filter((p) => p.satisfiesRequestId === id && p.confidence !== 'UNVERIFIED');
    const meets = onBoard.some((p) => r.minimumConfidence === 'PROBABLE' || p.confidence === 'CONFIRMED');
    let status: RequestStatus = 'NEEDED';
    if (onBoard.some((p) => p.transmitted)) status = 'SENT';
    else if (onBoard.some((p) => p.droppedByWindow)) status = 'CUT OFF';
    else if (onBoard.some((p) => p.queued)) status = 'LOADED';
    else if (onBoard.length) status = meets ? 'ON BOARD' : 'WEAK';
    return { id, sectorId: r.targetSectorId, label: shortRequestLabel(r.shortLabel, r.title), value: requestValue(r), status };
  });
}

export function trackerText(state: MissionState, custom?: MissionScenarioConfig | null): string {
  return requestStatuses(state, custom).map((r) => `${r.sectorId} ${r.label} ${r.value}: ${r.status}`).join('  |  ');
}

export function rulesLine(state: MissionState, custom?: MissionScenarioConfig | null): string {
  const { successScore, partialScore } = getScenarioThresholds(state.scenarioId, custom);
  const weighted = isWeightedScenario(getScenarioRequests(state.scenarioId, custom));
  const clock = state.passDurationSec ? 'The pass clock starts at your first scan.' : 'No clock on this pass.';
  return `WIN ${successScore}+ pts | PARTIAL ${partialScore}+ | below that FAILS.${weighted ? '' : ' Answer all three.'} ${clock} Hints cost ${SCORING.hintPenalty}.`;
}

export interface MissionCardModel {
  kicker: string;
  title: string;
  story: string;
  requests: { title: string; meta: string }[];
  sensors: string[];
  rules: string;
}

export function missionCardModel(state: MissionState, custom?: MissionScenarioConfig | null): MissionCardModel {
  const scenario = scenarioOf(state, custom);
  const requests = getScenarioRequests(state.scenarioId, custom);
  return {
    kicker: `${scenario.operationCode ?? 'OPERATION'} // MISSION CARD [SIMULATED]`,
    title: scenario.name,
    story: scenario.storyLine ?? scenario.briefing,
    requests: GROUND_REQUEST_ORDER.map((id) => {
      const r = requests[id];
      const sector = getScenarioSector(state.scenarioId, r.targetSectorId, custom);
      return {
        title: `SECTOR ${r.targetSectorId} | ${shortRequestLabel(r.shortLabel, r.title)} | ${requestValue(r)} pts`,
        meta: `${r.stakeLabel ?? r.question} | ${describeWeather(sector.cloudCover)} | needs ${r.minimumConfidence}`,
      };
    }),
    sensors: (scenario.availableSensors ?? ['RADAR', 'OPTICAL']).map((m) => {
      const g = SENSOR_PLAIN_GUIDE[m];
      return `${g.label} (${getScanCost(scenario.budget, m).powerCost} Wh): ${g.sees.toLowerCase()}; ${g.blind.toLowerCase()}.`;
    }),
    rules: rulesLine(state, custom),
  };
}

export interface ResultModel {
  title: string;
  tone: 'success' | 'warn' | 'critical';
  score: string;
  requests: string[];
  tip: string;
}

export function resultModel(state: MissionState, custom?: MissionScenarioConfig | null): ResultModel | null {
  const d = state.debrief;
  if (!d) return null;
  const isAcademy = state.scenarioId === 'ORBITAL_ACADEMY' && d.outcome === 'SUCCESS';
  const tone = d.outcome === 'SUCCESS' ? 'success' : d.outcome === 'PARTIAL_SUCCESS' ? 'warn' : 'critical';
  const label = isAcademy ? 'TRAINING COMPLETE' : d.outcome === 'SUCCESS' ? 'MISSION SUCCESS' : d.outcome === 'PARTIAL_SUCCESS' ? 'PARTIAL SUCCESS' : 'MISSION FAILED';
  const hintCost = (d.hintsUsed ?? 0) * (d.hintPenalty ?? SCORING.hintPenalty);
  const requests = getScenarioRequests(state.scenarioId, custom);
  const guidance = d.outcome === 'SUCCESS' ? null : retryGuidanceFor(d);
  return {
    title: isAcademy ? label : `${label} | GRADE ${d.efficiencyGrade}`,
    tone,
    score: `${d.totalScore} pts (best possible ${d.achievableScore}) | win line ${d.successScore ?? SCORING.defaultSuccessScore}${hintCost ? ` | hints -${hintCost}` : ''}`,
    requests: isAcademy
      ? ['Sector B thermal evidence compressed and delivered.']
      : d.evaluations.map((ev) => `${requests[ev.requestId].targetSectorId} ${shortRequestLabel(ev.shortLabel, ev.title)}: ${ev.status} ${ev.scorePoints}/${ev.maxPoints}`),
    tip: isAcademy
      ? 'You are ready. Operation 01 has a real pass clock.'
      : guidance ? `${guidance.title}. ${guidance.body}` : d.deterministicRecommendation,
  };
}
