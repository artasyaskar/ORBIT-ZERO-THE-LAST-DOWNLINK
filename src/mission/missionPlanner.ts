import {
  CONFIDENCE_BADGES,
  getScenarioRequests,
  getScenarioSector,
  GROUND_REQUEST_ORDER,
  MAX_EVIDENCE_CUBES,
  MISSION_SCENARIOS,
} from './missionConfig';
import type {
  DataPacket,
  MissionPlanAction,
  MissionScenarioConfig,
  MissionScenarioId,
  MissionSolution,
  MissionState,
  QueueScheduleEntry,
  SensorMode,
} from './types';

const confidenceRank = { UNVERIFIED: 0, PROBABLE: 1, CONFIRMED: 2 };
// Cache keyed by "scenarioId|customScenarioId" to handle procedural scenarios correctly.
const solutionCache = new Map<string, MissionSolution>();

export function getQueueSchedule(state: MissionState): QueueScheduleEntry[] {
  let cursor = 0;
  return state.queuePacketIds.flatMap((packetId, slotIndex) => {
    const packet = state.packets.find((p) => p.id === packetId);
    if (!packet) return [];
    const startSec = cursor;
    cursor = Number((cursor + packet.transmitSec).toFixed(6));
    return [{
      packetId,
      slotIndex,
      startSec,
      endSec: cursor,
      fits: cursor <= state.downlinkWindowSec + 1e-6,
      progress: Math.max(0, Math.min(1, (state.downlinkElapsedSec - startSec) / packet.transmitSec)),
    }];
  });
}

export function scoreEvidence(
  packets: DataPacket[],
  scenarioId: MissionScenarioId = 'STANDARD_INDUS_PASS',
  customScenario?: MissionScenarioConfig | null,
): { score: number; verified: number; partial: number } {
  const requests = getScenarioRequests(scenarioId, customScenario);
  let points = 0;
  let verified = 0;
  let partial = 0;
  for (const id of GROUND_REQUEST_ORDER) {
    const request = requests[id];
    const rank = packets.reduce((best, packet) =>
      packet.satisfiesRequestId === id ? Math.max(best, confidenceRank[packet.confidence]) : best, 0);
    if (rank >= confidenceRank[request.minimumConfidence]) {
      points += 30;
      verified++;
    } else if (rank > 0) {
      points += 18;
      partial++;
    }
  }
  return { score: points + (verified === 3 ? 10 : verified >= 2 ? 5 : 0), verified, partial };
}

function better(candidate: MissionSolution, best: MissionSolution, downlinkWindowSec: number): boolean {
  if (candidate.score !== best.score) return candidate.score > best.score;
  const candSafe = candidate.transmitSec <= downlinkWindowSec - 0.35 + 1e-6;
  const bestSafe = best.transmitSec > 0 && best.transmitSec <= downlinkWindowSec - 0.35 + 1e-6;
  if (candSafe !== bestSafe) return candSafe;
  return (
    candidate.powerUsed < best.powerUsed ||
    (candidate.powerUsed === best.powerUsed && candidate.transmitSec < best.transmitSec - 1e-6)
  );
}

export function solveMission(state: Pick<MissionState, 'scenarioId' | 'power' | 'maxPower' | 'maxStorage' | 'downlinkWindowSec' | 'packets'>, customScenario?: MissionScenarioConfig | null): MissionSolution {
  const scenario = customScenario ?? MISSION_SCENARIOS[state.scenarioId] ?? MISSION_SCENARIOS.STANDARD_INDUS_PASS;
  const budget = scenario.budget;
  const availableSensors: SensorMode[] = scenario.availableSensors ?? ['RADAR', 'OPTICAL'];
  const requests = getScenarioRequests(state.scenarioId, customScenario);
  let best: MissionSolution = {
    score: 0, verifiedRequests: 0, partialRequests: 0,
    powerUsed: state.maxPower - state.power, powerRemaining: state.power,
    transmitSec: 0, actions: [],
  };
  const visited = new Set<string>();

  const search = (packets: DataPacket[], power: number, actions: MissionPlanAction[]) => {
    const signature = `${power}:${packets.map((p) => `${p.sectorId}/${p.sensorMode}/${p.processed}/${p.confidence}`).sort().join(',')}`;
    if (visited.has(signature)) return;
    visited.add(signature);
    const storage = packets.reduce((sum, p) => sum + p.storageCost, 0);
    const useful = packets.filter((p) => p.satisfiesRequestId && p.confidence !== 'UNVERIFIED');

    for (let mask = 1; mask < (1 << useful.length); mask++) {
      const transmitted = useful.filter((_, index) => mask & (1 << index));
      const duration = Number(transmitted.reduce((sum, p) => sum + p.transmitSec, 0).toFixed(6));
      if (transmitted.length > budget.maxQueueSlots || duration > state.downlinkWindowSec + 1e-6) continue;
      const result = scoreEvidence(transmitted, state.scenarioId, customScenario);
      const candidate: MissionSolution = {
        score: result.score, verifiedRequests: result.verified, partialRequests: result.partial,
        powerUsed: state.maxPower - power, powerRemaining: power, transmitSec: duration,
        actions: [...actions,
          ...packets.filter((p) => p.queued && !transmitted.some((chosen) => chosen.id === p.id))
            .map((p): MissionPlanAction => ({ type: 'UNQUEUE', packetId: p.id, sectorId: p.sectorId, sensorMode: p.sensorMode })),
          ...transmitted.map((p): MissionPlanAction => ({
            type: 'QUEUE', packetId: p.id, sectorId: p.sectorId, sensorMode: p.sensorMode,
          })),
        ],
      };
      if (better(candidate, best, state.downlinkWindowSec)) best = candidate;
    }

    for (const packet of packets) {
      if (!packet.processed && packet.confidence !== 'UNVERIFIED' && power >= budget.onboardProcess.powerCost) {
        const upgradedConfidence =
          scenario.performsChangeDetection &&
          packet.sensorMode === 'RADAR' &&
          packet.confidence === 'PROBABLE' &&
          packet.satisfiesRequestId
            ? 'CONFIRMED'
            : packet.confidence;
        const processed = packets.map((p) => p.id === packet.id ? {
          ...p,
          processed: true,
          confidence: upgradedConfidence,
          confidenceBadge: CONFIDENCE_BADGES[upgradedConfidence],
          storageCost: budget.onboardProcess.compressedStorageCost,
          transmitSec: budget.onboardProcess.compressedTransmitSec,
        } : p);
        search(processed, power - budget.onboardProcess.powerCost, [...actions, {
          type: 'PROCESS', packetId: packet.id, sectorId: packet.sectorId, sensorMode: packet.sensorMode,
        }]);
      }
      const sectorOutcomes = getScenarioSector(state.scenarioId, packet.sectorId, customScenario).outcomes;
      const betterObservationAvailable = packet.satisfiesRequestId &&
        availableSensors
          .map((m) => sectorOutcomes[m])
          .filter((o): o is NonNullable<typeof o> => Boolean(o))
          .some((outcome) => confidenceRank[outcome.confidence] > confidenceRank[packet.confidence]);
      if (!packet.id.startsWith('PLAN-') && (
        !packet.satisfiesRequestId || packet.confidence === 'UNVERIFIED' || betterObservationAvailable ||
        packets.some((p) => p.id !== packet.id && p.satisfiesRequestId === packet.satisfiesRequestId &&
          confidenceRank[p.confidence] >= confidenceRank[packet.confidence])
      )) {
        search(packets.filter((p) => p.id !== packet.id), power, [...actions, {
          type: 'DISCARD', packetId: packet.id, sectorId: packet.sectorId, sensorMode: packet.sensorMode,
        }]);
      }
    }

    if (packets.length >= MAX_EVIDENCE_CUBES) return;
    for (const requestId of GROUND_REQUEST_ORDER) {
      const request = requests[requestId];
      const sector = getScenarioSector(state.scenarioId, request.targetSectorId, customScenario);
      for (const sensorMode of availableSensors) {
        const outcome = sector.outcomes[sensorMode] ?? sector.outcomes.OPTICAL;
        const cost =
          sensorMode === 'RADAR'
            ? budget.radarScan
            : sensorMode === 'THERMAL'
              ? (budget.thermalScan ?? { powerCost: 11, storageCost: 3, transmitSec: 4.2 })
              : budget.opticalScan;
        if (outcome.satisfiesRequestId !== requestId || outcome.confidence === 'UNVERIFIED' ||
          power < cost.powerCost || storage + cost.storageCost > state.maxStorage ||
          packets.some((p) => p.satisfiesRequestId === requestId &&
            (p.id.startsWith('PLAN-') || confidenceRank[p.confidence] >= confidenceRank[outcome.confidence]))) continue;
        const packet: DataPacket = {
          ...outcome, id: `PLAN-${actions.length}-${request.targetSectorId}-${sensorMode}`,
          sectorId: sector.id, sectorCode: sector.code, sectorName: sector.name, sensorMode,
          storageCost: cost.storageCost, transmitSec: cost.transmitSec,
          rawStorageCost: cost.storageCost, rawTransmitSec: cost.transmitSec,
          compressionRatio: 1.0, ambiguityReason: outcome.scientificReason,
          provenanceLineage: `PLAN[SEC-${sector.id}|${sensorMode}]`,
          processed: false,
          queued: false, queueIndex: null, transmitted: false, droppedByWindow: false, createdAtStep: 0,
        };
        search([...packets, packet], power - cost.powerCost, [...actions, {
          type: 'SCAN', sectorId: sector.id, sensorMode,
        }]);
      }
    }
  };

  search(state.packets.map((p) => ({ ...p })), state.power, []);
  return best;
}

export function getMissionBenchmark(scenarioId: MissionScenarioId, customScenario?: MissionScenarioConfig | null): MissionSolution {
  const cacheKey = `${scenarioId}|${customScenario?.id ?? ''}`;
  let solution = solutionCache.get(cacheKey);
  if (!solution) {
    const scenario = customScenario ?? MISSION_SCENARIOS[scenarioId] ?? MISSION_SCENARIOS.STANDARD_INDUS_PASS;
    const budget = scenario.budget;
    solution = solveMission({
      scenarioId, power: budget.initialPower, maxPower: budget.initialPower,
      maxStorage: budget.maxStorage, downlinkWindowSec: budget.downlinkDurationSec, packets: [],
    }, customScenario);
    solutionCache.set(cacheKey, solution);
  }
  return { ...solution, actions: solution.actions.map((action) => ({ ...action })) };
}

export function getNextPlanAction(state: MissionState, solution: MissionSolution): MissionPlanAction | undefined {
  return solution.actions.find((action) => {
    if (action.type === 'SCAN') return true;
    const packet = state.packets.find((p) => p.id === action.packetId);
    if (!packet) return true;
    if (action.type === 'QUEUE') return !packet.queued;
    if (action.type === 'UNQUEUE') return packet.queued;
    if (action.type === 'PROCESS') return !packet.processed;
    return true;
  });
}

export function describeMissionPlan(solution: MissionSolution): string {
  return solution.actions.map((action) => action.type === 'SCAN'
    ? `scan ${action.sectorId} ${action.sensorMode}`
    : `${action.type.toLowerCase()} ${action.sectorId}`).join(' -> ');
}
