import {
  getRecommendedSensor,
  getScenarioSector,
  GROUND_REQUEST_ORDER,
  GROUND_REQUESTS,
  MISSION_BUDGET,
} from './missionConfig';
import { describeMissionPlan, getMissionBenchmark } from './missionPlanner';
import type {
  ConfidenceLevel, DataPacket, DebriefReport, GroundRequest,
  MissionScenarioId, RequestEvaluation,
} from './types';

const confidenceRank: Record<ConfidenceLevel, number> = { UNVERIFIED: 0, PROBABLE: 1, CONFIRMED: 2 };

export function evaluateRequestWithPackets(
  request: GroundRequest,
  transmittedPackets: DataPacket[],
): RequestEvaluation {
  const matching = transmittedPackets.filter((packet) => packet.satisfiesRequestId === request.id && packet.confidence !== 'UNVERIFIED');
  const best = matching.reduce<DataPacket | null>((current, packet) =>
    !current || confidenceRank[packet.confidence] > confidenceRank[current.confidence] ? packet : current, null);
  const unverified = transmittedPackets.find((packet) => packet.sectorId === request.targetSectorId && packet.confidence === 'UNVERIFIED');
  const packet = best ?? unverified ?? null;
  const status = !best ? 'UNVERIFIED' : confidenceRank[best.confidence] >= confidenceRank[request.minimumConfidence] ? 'VERIFIED' : 'PARTIAL';
  const isThresholdMetProbable = status === 'VERIFIED' && best?.confidence === 'PROBABLE';
  const statusBadge =
    status === 'VERIFIED'
      ? isThresholdMetProbable
        ? '[OK] THRESHOLD MET: PROBABLE'
        : '[OK] VERIFIED'
      : status === 'PARTIAL'
        ? '[?] PARTIAL'
        : '[X] UNVERIFIED';

  const explanation =
    status === 'VERIFIED'
      ? isThresholdMetProbable
        ? `${best!.sectorCode} ${best!.sensorMode} meets operational acceptance threshold (${best!.confidenceBadge}). Terrain uncertainty remains.`
        : `${best!.sectorCode} ${best!.sensorMode} ${best!.confidenceBadge} meets the requested evidence threshold.`
      : status === 'PARTIAL'
        ? `${best!.sectorCode} ${best!.sensorMode} is only ${best!.confidenceBadge}; ground teams still require ${request.requiredBadge}.`
        : unverified ? `${unverified.sectorCode} observation contains no usable evidence for this request.`
          : `No valid evidence reached the ground for Sector ${request.targetSectorId}.`;

  return {
    requestId: request.id, shortLabel: request.shortLabel, title: request.title, status,
    statusBadge,
    scorePoints: status === 'VERIFIED' ? 30 : status === 'PARTIAL' ? 18 : 0,
    maxPoints: 30, matchedPacketId: packet?.id ?? null,
    matchedSectorId: packet?.sectorId ?? null, matchedSensorMode: packet?.sensorMode ?? null,
    matchedConfidence: packet?.confidence ?? null,
    explanation,
    groundConsequence: status === 'VERIFIED' ? request.consequenceOnSuccess : status === 'PARTIAL' ? request.consequenceOnPartial : request.consequenceOnFailure,
  };
}

export function buildDebriefReport(params: {
  allPackets: DataPacket[];
  transmittedPackets: DataPacket[];
  droppedPackets: DataPacket[];
  powerRemaining: number;
  storageUsed: number;
  downlinkUsedSec: number;
  initialPower?: number;
  downlinkWindowSec?: number;
  scenarioId?: MissionScenarioId;
}): DebriefReport {
  const {
    allPackets = [],
    transmittedPackets, droppedPackets, powerRemaining, storageUsed, downlinkUsedSec,
    initialPower = MISSION_BUDGET.initialPower,
    downlinkWindowSec = MISSION_BUDGET.downlinkDurationSec,
    scenarioId = 'STANDARD_INDUS_PASS',
  } = params;
  const benchmark = getMissionBenchmark(scenarioId);
  const evaluations = GROUND_REQUEST_ORDER.map((id) => evaluateRequestWithPackets(GROUND_REQUESTS[id], transmittedPackets));
  const requestsVerifiedCount = evaluations.filter((ev) => ev.status === 'VERIFIED').length;
  const requestsPartialCount = evaluations.filter((ev) => ev.status === 'PARTIAL').length;
  const requestsUnverifiedCount = evaluations.filter((ev) => ev.status === 'UNVERIFIED').length;
  const bonus = droppedPackets.length ? 0 : requestsVerifiedCount === 3 ? 10 : requestsVerifiedCount >= 2 ? 5 : 0;
  const totalScore = evaluations.reduce((sum, ev) => sum + ev.scorePoints, 0) + bonus;
  const achievedBest = totalScore >= benchmark.score;
  const powerUsed = initialPower - powerRemaining;
  const missionRank: DebriefReport['missionRank'] = requestsVerifiedCount === 3 ? 'OPTIMAL TRIAGE'
    : achievedBest ? 'BEST POSSIBLE TRIAGE'
      : requestsVerifiedCount + requestsPartialCount >= 2 ? 'PARTIAL DOWNLINK' : 'CRITICAL GAP';
  const efficient = achievedBest && droppedPackets.length === 0 &&
    powerUsed <= benchmark.powerUsed && downlinkUsedSec <= benchmark.transmitSec + 1e-6;
  const ratio = benchmark.score > 0 ? totalScore / benchmark.score : 0;
  const efficiencyGrade = efficient ? 'S' : ratio >= 0.8 ? 'A' : ratio >= 0.6 ? 'B' : 'C';
  const advice: string[] = [];
  if (droppedPackets.length) advice.push(`${droppedPackets.length} packet(s) missed the ${downlinkWindowSec.toFixed(1)}s cutoff. Processing and ordering must happen before COMMIT.`);
  for (const evaluation of evaluations) {
    if (evaluation.status === 'VERIFIED') continue;
    const request = GROUND_REQUESTS[evaluation.requestId];
    const mode = getRecommendedSensor(scenarioId, request.targetSectorId);
    const outcome = getScenarioSector(scenarioId, request.targetSectorId).outcomes[mode];
    if (confidenceRank[outcome.confidence] < confidenceRank[request.minimumConfidence]) {
      advice.push(`Sector ${request.targetSectorId}: even ${mode} reaches only ${outcome.confidence}. This pass cannot fully verify that request; preserve the highest-value evidence.`);
    } else if (!achievedBest) advice.push(`Use ${mode} on Sector ${request.targetSectorId} for ${outcome.confidence} evidence.`);
  }
  if (!advice.length) advice.push(efficient ? 'Best evidence and efficient execution. Try the next orbital pass.' : 'All requested evidence arrived. Replay to reduce power use and improve your time margin.');

  const evidenceProvenance = allPackets.map((pkt) => ({
    packetId: pkt.id,
    evidenceId: pkt.evidenceId,
    observationId: pkt.observationId,
    sectorCode: pkt.sectorCode,
    sensorMode: pkt.sensorMode,
    confidence: pkt.confidence,
    confidenceBadge: pkt.confidenceBadge,
    interpretationCategory: pkt.interpretationCategory,
    knownUncertainty: pkt.knownUncertainty,
    processed: pkt.processed,
    transmitted: pkt.transmitted,
    transmissionState: pkt.transmissionState ?? (pkt.transmitted ? 'TRANSMITTED' : pkt.droppedByWindow ? 'DROPPED_WINDOW' : pkt.queued ? 'QUEUED' : 'UNQUEUED'),
    provenance: pkt.provenanceLineage,
    provenanceChain: pkt.provenanceChain,
    ambiguityReason: pkt.ambiguityReason,
  }));

  return {
    missionRank, efficiencyGrade, totalScore, maxScore: 100,
    requestsVerifiedCount, requestsPartialCount, requestsUnverifiedCount,
    powerRemaining, powerUsed, storageUsed, downlinkUsedSec, downlinkWindowSec,
    transmittedPacketIds: transmittedPackets.map((p) => p.id),
    droppedPacketIds: droppedPackets.map((p) => p.id), evaluations,
    evidenceProvenance,
    summaryHeadline: achievedBest
      ? benchmark.score === 100
        ? 'ALL THREE REQUESTS VERIFIED BEFORE LOSS OF SIGNAL (GRADE S).'
        : `SCENARIO MASTERY: ${totalScore}/${benchmark.score} POSSIBLE POINTS EARNED (GRADE S). THE CONVECTIVE STORM LIMITS CERTAINTY, NOT YOUR TRIAGE SKILL.`
      : `${requestsVerifiedCount}/3 VERIFIED - REVIEW THE EVIDENCE THAT DID NOT REACH EARTH.`,
    deterministicRecommendation: advice.join(' '),
    counterfactualComparison: `SCENARIO CEILING (${benchmark.score}/100 RAW): ${describeMissionPlan(benchmark)}. ${benchmark.powerUsed} power units, ${benchmark.transmitSec.toFixed(1)}s transmission.`,
    achievableScore: benchmark.score,
    windowMarginSec: Math.max(0, Number((downlinkWindowSec - downlinkUsedSec).toFixed(6))),
    benchmarkPowerUsed: benchmark.powerUsed, benchmarkDownlinkSec: benchmark.transmitSec,
  };
}
