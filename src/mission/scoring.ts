import {
  DOWNLINK_THROUGHPUT_MBPS,
  getRecommendedSensor,
  getScenarioRequests,
  getScenarioSector,
  getScenarioThresholds,
  GROUND_REQUEST_ORDER,
  isWeightedScenario,
  MISSION_BUDGET,
  MISSION_SCENARIOS,
  requestPointsFor,
  requestValue,
  SCORING,
  verificationBonus,
} from './missionConfig';
import { describeMissionPlan, getMissionBenchmark } from './missionPlanner';
import { compressedPayloadMb, scanPayloadMb } from './budgetText';
import { memoryBlocks } from './resultLabels';
import type {
  ConfidenceLevel, DataPacket, DebriefReport, FailureReasonCode, GroundRequest,
  MissionCertification, MissionOutcome, MissionScenarioConfig,
  MissionScenarioId, RequestEvaluation,
} from './types';

const confidenceRank: Record<ConfidenceLevel, number> = { UNVERIFIED: 0, PROBABLE: 1, CONFIRMED: 2 };

interface DecisionContext {
  allPackets: DataPacket[];
  scenarioId: MissionScenarioId;
  customScenario?: MissionScenarioConfig | null;
}

/**
 * Explains what the player's actual sensor / processing / staging decisions meant for one ground
 * request: whether the sensor was the strongest available one, whether a different sensor was a
 * valid alternative, what the evidence still cannot tell responders, and (when evidence never
 * arrived) why. Pure and deterministic; it only reads the packets and the scenario tables.
 */
export function describeRequestDecision(
  request: GroundRequest,
  status: RequestEvaluation['status'],
  best: DataPacket | null,
  packet: DataPacket | null,
  transmittedPackets: DataPacket[],
  ctx: DecisionContext,
): string {
  const recommended = getRecommendedSensor(ctx.scenarioId, request.targetSectorId, ctx.customScenario);
  const sector = getScenarioSector(ctx.scenarioId, request.targetSectorId, ctx.customScenario);
  const ceiling = sector.outcomes[recommended] ?? sector.outcomes.OPTICAL;
  const ceilingMeets = confidenceRank[ceiling.confidence] >= confidenceRank[request.minimumConfidence];
  const parts: string[] = [];

  if (status === 'VERIFIED' && best) {
    if (best.sensorMode === recommended) {
      parts.push(`${best.sensorMode} was the strongest sensor available for Sector ${request.targetSectorId}.`);
    } else {
      parts.push(
        `Valid alternative: ${best.sensorMode} met the threshold (${best.confidence}); ${recommended} would reach ${ceiling.confidence}.`,
      );
    }
    if (best.confidence === 'PROBABLE') parts.push('Residual uncertainty: confirm on site.');
    if (best.processed && best.compressionAlgorithm) {
      parts.push('Compression kept extracted features only; it added no certainty.');
    }
  } else if (status === 'PARTIAL' && best) {
    parts.push(
      ceilingMeets
        ? `${best.sensorMode} reached only ${best.confidence}; ${recommended} could reach ${ceiling.confidence} here.`
        : `${best.sensorMode} reached only ${best.confidence}; no sensor this pass reaches ${request.requiredBadge} here (best: ${recommended}, ${ceiling.confidence}).`,
    );
  } else {
    const transmittedIds = new Set(transmittedPackets.map((p) => p.id));
    const usableNotSent = ctx.allPackets.find(
      (p) => p.satisfiesRequestId === request.id && p.confidence !== 'UNVERIFIED' && !transmittedIds.has(p.id),
    );
    if (usableNotSent) {
      parts.push(
        `A ${usableNotSent.sensorMode} observation (${usableNotSent.confidence}) was captured but never reached the ground (unqueued, discarded or cut off).`,
      );
    } else if (
      (packet ?? ctx.allPackets.find((p) => p.sectorId === request.targetSectorId && p.confidence === 'UNVERIFIED'))?.confidence === 'UNVERIFIED'
    ) {
      const blocked = (packet ?? ctx.allPackets.find((p) => p.sectorId === request.targetSectorId && p.confidence === 'UNVERIFIED'))!;
      parts.push(
        `${blocked.sensorMode} returned no usable evidence for Sector ${request.targetSectorId} (${blocked.phenomenologyTag.replace(/_/g, ' ').toLowerCase()}); ${recommended} reaches ${ceiling.confidence} here.`,
      );
    } else if (ctx.allPackets.some((p) => p.sectorId === request.targetSectorId)) {
      parts.push(`Sector ${request.targetSectorId} was observed but nothing usable for this request was transmitted.`);
    } else {
      parts.push(`Sector ${request.targetSectorId} was never observed, so ground teams received nothing for this request.`);
    }
  }
  return parts.join(' ');
}
export function evaluateRequestWithPackets(
  request: GroundRequest,
  transmittedPackets: DataPacket[],
  context?: DecisionContext,
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
    scorePoints: requestPointsFor(request, status),
    maxPoints: requestValue(request), matchedPacketId: packet?.id ?? null,
    matchedSectorId: packet?.sectorId ?? null, matchedSensorMode: packet?.sensorMode ?? null,
    matchedConfidence: packet?.confidence ?? null,
    explanation,
    decisionNote: context ? describeRequestDecision(request, status, best, packet, transmittedPackets, context) : undefined,
    groundConsequence: status === 'VERIFIED' ? (request.consequenceOnSuccess.includes('740 K') && packet?.sensorMode !== 'THERMAL'
      ? 'Processed SAR change-detection flagged probable surface disturbance around the Sector E substation; no temperature was measured, so grid engineers still verify the transformer on site.'
      : request.consequenceOnSuccess) : status === 'PARTIAL' ? request.consequenceOnPartial : request.consequenceOnFailure,
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
  customScenario?: MissionScenarioConfig | null;
  hintsUsed?: number;
  endReason?: 'NONE' | 'COMMITTED' | 'CLOCK_EXPIRED' | 'ABORTED';
}): DebriefReport {
  const {
    allPackets = [],
    transmittedPackets, droppedPackets, powerRemaining, storageUsed, downlinkUsedSec,
    initialPower = MISSION_BUDGET.initialPower,
    downlinkWindowSec = MISSION_BUDGET.downlinkDurationSec,
    scenarioId = 'STANDARD_INDUS_PASS',
    customScenario = null,
    hintsUsed = 0,
    endReason = 'COMMITTED',
  } = params;
  const benchmark = getMissionBenchmark(scenarioId, customScenario);
  const requests = getScenarioRequests(scenarioId, customScenario);
  const requestCount = GROUND_REQUEST_ORDER.length;
  const budget = (customScenario ?? MISSION_SCENARIOS[scenarioId])?.budget ?? MISSION_BUDGET;
  const throughput = budget.downlinkThroughputMbps ?? DOWNLINK_THROUGHPUT_MBPS;
  const proc = budget.onboardProcess;
  const thermalMb = scanPayloadMb(budget, 'THERMAL');
  const thermalExtraMb = thermalMb - scanPayloadMb(budget, 'OPTICAL');
  const thermalExtraSec = thermalExtraMb / throughput;
  const weighted = isWeightedScenario(requests);
  const { successScore, partialScore } = getScenarioThresholds(scenarioId, customScenario);
  const evaluations = GROUND_REQUEST_ORDER.map((id) => evaluateRequestWithPackets(requests[id], transmittedPackets, { allPackets, scenarioId, customScenario }));
  const requestsVerifiedCount = evaluations.filter((ev) => ev.status === 'VERIFIED').length;
  const requestsPartialCount = evaluations.filter((ev) => ev.status === 'PARTIAL').length;
  const requestsUnverifiedCount = evaluations.filter((ev) => ev.status === 'UNVERIFIED').length;
  const bonus = verificationBonus(requests, requestsVerifiedCount, droppedPackets.length);
  const hintPenalty = hintsUsed * SCORING.hintPenalty;
  const rawScore = evaluations.reduce((sum, ev) => sum + ev.scorePoints, 0) + bonus;
  const totalScore = Math.max(0, rawScore - hintPenalty);
  const achievedBest = rawScore >= benchmark.score;
  const powerUsed = initialPower - powerRemaining;
  const missionRank: DebriefReport['missionRank'] = requestsVerifiedCount === 3 ? 'OPTIMAL TRIAGE'
    : achievedBest ? 'BEST POSSIBLE TRIAGE'
      : requestsVerifiedCount + requestsPartialCount >= 2 ? 'PARTIAL DOWNLINK' : 'CRITICAL GAP';
  // Weighted (triage) scenarios judge the delivered value only: leaving a low-priority request
  // unanswered can be the correct call. Unweighted scenarios also require every request answered.
  const outcome: MissionOutcome =
    totalScore >= successScore && (weighted || requestsUnverifiedCount === 0)
      ? 'SUCCESS'
      : totalScore >= partialScore && (weighted || requestsVerifiedCount + requestsPartialCount >= 2)
        ? 'PARTIAL_SUCCESS'
        : 'FAILED';
  const maxEfficientSec = Math.min(Math.max(benchmark.transmitSec, SCORING.gradeSFloorSec), downlinkWindowSec - SCORING.linkSafetyMarginSec);
  const efficient = achievedBest && droppedPackets.length === 0 && hintsUsed === 0 &&
    downlinkUsedSec <= maxEfficientSec + 1e-6;
  const ratio = benchmark.score > 0 ? totalScore / benchmark.score : 0;
  const efficiencyGrade = efficient ? 'S' : ratio >= 0.8 ? 'A' : ratio >= 0.6 ? 'B' : 'C';
  const certification: MissionCertification =
    outcome === 'FAILED'
      ? 'NONE'
      : efficiencyGrade === 'S'
        ? 'GOLD'
        : efficiencyGrade === 'A'
          ? 'SILVER'
          : 'BRONZE';
  const advice: string[] = [];
  if (endReason === 'ABORTED') advice.push('The pass was aborted before any evidence was sent. Plan scans so that the most valuable request is covered first.');
  if (endReason === 'CLOCK_EXPIRED') advice.push('The orbital pass clock ran out before you opened the link. Load the Downlink Bay earlier and transmit before the satellite reaches the ground station.');
  if (droppedPackets.length) advice.push(`${droppedPackets.length} packet(s) missed the ${downlinkWindowSec.toFixed(1)}s cutoff. Compress big cubes, put the most valuable cube in Slot 1, and dock fast during the live window.`);
  if (hintsUsed > 0) advice.push(`${hintsUsed} ARIA-7 hint(s) cost ${hintPenalty} points. Try the pass without hints for a Grade S.`);
  for (const evaluation of evaluations) {
    if (evaluation.status === 'VERIFIED') continue;
    const request = requests[evaluation.requestId];
    const mode = getRecommendedSensor(scenarioId, request.targetSectorId, customScenario);
    const sector = getScenarioSector(scenarioId, request.targetSectorId, customScenario);
    const outcome = sector.outcomes[mode] ?? sector.outcomes.OPTICAL;
    if (confidenceRank[outcome.confidence] < confidenceRank[request.minimumConfidence]) {
      advice.push(`Sector ${request.targetSectorId}: even ${mode} reaches only ${outcome.confidence}. This pass cannot fully verify that request; preserve the highest-value evidence.`);
    } else if (!achievedBest) advice.push(`Use ${mode} on Sector ${request.targetSectorId} for ${outcome.confidence} evidence.`);
  }
  const windowMargin = Math.max(0, Number((downlinkWindowSec - downlinkUsedSec).toFixed(1)));
  const processedTxCount = transmittedPackets.filter((p) => p.processed).length;
  const transmittedPayloadMb = Number(
    transmittedPackets.reduce((sum, pkt) => sum + (pkt.payloadMb ?? Number((pkt.transmitSec * DOWNLINK_THROUGHPUT_MBPS).toFixed(1))), 0).toFixed(1),
  );
  if (!advice.length) {
    if (efficient) {
      if (processedTxCount === 2) {
        const isThermalPairDominant =
          scenarioId === 'FIRELINE_PASS' &&
          transmittedPackets.filter((p) => p.processed && p.sensorMode === 'THERMAL').length === 2;
        if (isThermalPairDominant) {
          advice.push(
            `Best evidence and strictly dominant 2-compression Pareto execution (B+E Thermal cubes compressed to ${transmittedPayloadMb} MB / ${downlinkUsedSec.toFixed(1)}s: +${powerRemaining} Wh battery reserve, +${windowMargin.toFixed(1)}s S-Band link safety margin — dominates B+C and C+E by +${thermalExtraMb.toFixed(1)} MB / +${thermalExtraSec.toFixed(1)}s for identical ${2 * proc.powerCost} Wh processing energy). Try the next orbital pass.`,
          );
        } else if (scenarioId === 'FIRELINE_PASS') {
          advice.push(
            `Best evidence and Grade S execution (2/${transmittedPackets.length} packets compressed to ${transmittedPayloadMb} MB / ${downlinkUsedSec.toFixed(1)}s: +${powerRemaining} Wh battery reserve, +${windowMargin.toFixed(1)}s S-Band link safety margin; note that compressing both ${thermalMb} MB Thermal cubes B+E saves an extra ${thermalExtraMb.toFixed(1)} MB / ${thermalExtraSec.toFixed(1)}s for the same ${2 * proc.powerCost} Wh energy). Try the next orbital pass.`,
          );
        } else {
          advice.push(
            `Best evidence and balanced Pareto execution (2/${transmittedPackets.length} packets compressed: +${powerRemaining} Wh battery reserve vs +${windowMargin.toFixed(1)}s S-Band link safety margin). Try the next orbital pass.`,
          );
        }
      } else if (processedTxCount >= 3) {
        advice.push(
          `Best evidence and Grade S execution (3/3 packets compressed to ${transmittedPayloadMb} MB / ${downlinkUsedSec.toFixed(1)}s: +${windowMargin.toFixed(1)}s S-Band link safety margin, ${powerRemaining} Wh deep-discharge battery reserve; in a deterministic ${downlinkWindowSec.toFixed(1)}s window, compressing the 3rd cube spends ${proc.powerCost} Wh for unused link capacity beyond the 2-cube optimum). Try the next orbital pass.`,
        );
      } else {
        advice.push(
          `Best evidence and efficient execution (+${powerRemaining} Wh battery reserve, +${windowMargin.toFixed(1)}s link safety margin). Try the next orbital pass.`,
        );
      }
    } else {
      advice.push(
        `All requested evidence arrived (+${powerRemaining} Wh battery reserve), but ${windowMargin.toFixed(1)}s link margin leaves almost no buffer against loss of signal (Grade A). Finish within ${maxEfficientSec.toFixed(1)}s (the best plan uses ${benchmark.transmitSec.toFixed(1)}s) by compressing one more cube to earn Grade S.`,
      );
    }
  }

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

  if (scenarioId === 'ORBITAL_ACADEMY') {
    const req1Eval = evaluations[0];
    const hasValidTrainingTx =
      droppedPackets.length === 0 &&
      transmittedPackets.some((p) =>
        p.processed && p.sensorMode === 'THERMAL' && p.confidence !== 'UNVERIFIED' &&
        p.sectorId === requests.REQ_1.targetSectorId);
    if (hasValidTrainingTx) {
      const trainingEvaluations: RequestEvaluation[] = evaluations.map((ev, idx) =>
        idx === 0
          ? {
              ...ev,
              status: 'VERIFIED',
              statusBadge: '[OK] TRAINING TARGET VERIFIED',
              scorePoints: 100,
              maxPoints: 100,
            }
          : {
              ...ev,
              status: 'VERIFIED',
              statusBadge: '[OK] ACADEMY SINGLE-TARGET SCOPE',
              scorePoints: 0,
              maxPoints: 0,
              explanation:
                'Orbital Academy requires 1 verified compressed observation (Sector B Thermal IR) to qualify.',
              groundConsequence:
                'Training qualification complete — full 3-sector triage begins in Operation 01: Fireline.',
            },
      );
      return {
        missionRank: 'TRAINING COMPLETE — ORBITAL OPERATOR QUALIFIED',
        outcome: 'SUCCESS',
        certification: 'SILVER',
        efficiencyGrade: 'A',
        totalScore: 100,
        maxScore: 100,
        requestsVerifiedCount: 1,
        requestsPartialCount: 0,
        requestsUnverifiedCount: 0,
        powerRemaining,
        powerUsed,
        storageUsed,
        downlinkUsedSec,
        downlinkWindowSec,
        transmittedPayloadMb,
        downlinkThroughputMbps: DOWNLINK_THROUGHPUT_MBPS,
        failureReasonCode: 'NONE',
        failureExplanation:
          'Orbital Academy workstation qualification completed with verified compressed telemetry.',
        transmittedPacketIds: transmittedPackets.map((p) => p.id),
        droppedPacketIds: droppedPackets.map((p) => p.id),
        evaluations: trainingEvaluations,
        evidenceProvenance,
        summaryHeadline:
          'TRAINING COMPLETE: ALL ORBITAL WORKSTATION GESTURES & TRIAGE STEPS QUALIFIED.',
        deterministicRecommendation:
          `TRAINING COMPLETE: You have qualified on globe sector targeting, Thermal IR smoke penetration, 3D Data Cube inspection, Processing Cradle compression (${thermalMb} MB -> ${compressedPayloadMb(budget)} MB, ${budget.thermalScan?.storageCost ?? budget.opticalScan.storageCost} -> ${memoryBlocks(proc.compressedStorageCost)}), Downlink Bay staging, and S-Band transmission. Proceed to Campaign Selection or launch Operation 01: Fireline.`,
        counterfactualComparison:
          `ACADEMY QUALIFICATION BENCHMARK (100/100 TRAINING PASS): 1 verified compressed observation (${transmittedPayloadMb} MB / ${downlinkUsedSec.toFixed(1)}s @ ${throughput.toFixed(1)} MB/s, ${powerRemaining} Wh remaining). Ready for Operation 01: Fireline.`,
        achievableScore: 100,
        windowMarginSec: Math.max(0, Number((downlinkWindowSec - downlinkUsedSec).toFixed(6))),
        benchmarkPowerUsed: (budget.thermalScan?.powerCost ?? budget.opticalScan.powerCost) + proc.powerCost,
        benchmarkDownlinkSec: proc.compressedTransmitSec,
      };
    }
  }

  const hasUnverifiedTransmitted = transmittedPackets.some((p) => p.confidence === 'UNVERIFIED');
  const hasUnverifiedScanned = allPackets.some((p) => p.confidence === 'UNVERIFIED');
  let failureReasonCode: FailureReasonCode = 'NONE';
  let failureExplanation = 'All emergency ground requests met operational verification thresholds within the downlink window.';

  if (outcome !== 'SUCCESS') {
    if (endReason === 'ABORTED') {
      failureReasonCode = 'MISSION_ABORTED';
      failureExplanation = 'PASS ABORTED: you ended the pass before any evidence reached the ground station.';
    } else if (endReason === 'CLOCK_EXPIRED' && transmittedPackets.length === 0) {
      failureReasonCode = 'PASS_CLOCK_EXPIRED';
      failureExplanation = 'PASS CLOCK EXPIRED: the satellite reached the ground station before any usable evidence was loaded into the Downlink Bay.';
    } else if (droppedPackets.length > 0) {
      failureReasonCode = 'WINDOW_CUTOFF_DROPPED_PACKETS';
      failureExplanation =
        `WINDOW CUTOFF OVERFLOW: ${droppedPackets.length} queued packet(s) (${droppedPackets.map((p) => p.id).join(', ')}) did not finish inside the ${downlinkWindowSec.toFixed(1)}s window (@ ${throughput} MB/s). Compress raw cubes in the Processing Cradle (${proc.powerCost} Wh each, ${proc.compressedTransmitSec.toFixed(1)}s Tx) and put the most valuable cube first.`;
    } else if (hasUnverifiedTransmitted || (hasUnverifiedScanned && requestsUnverifiedCount > 0)) {
      failureReasonCode = 'WRONG_SENSOR_FOR_WEATHER';
      const mismatches = evaluations
        .filter((ev) => ev.status === 'UNVERIFIED' && ev.matchedSensorMode && ev.matchedSectorId)
        .map((ev) => `Sector ${ev.matchedSectorId} ${ev.matchedSensorMode} returned no usable evidence; ${getRecommendedSensor(scenarioId, ev.matchedSectorId!, customScenario)} is required there.`);
      failureExplanation =
        `SENSOR-ATMOSPHERE MISMATCH: ${mismatches.length ? mismatches.join(' ') : 'A scan was blocked by weather or obscuration ([X] UNVERIFIED).'} Optical energy does not pass through dense cloud or smoke; SAR (microwave) penetrates cloud, and Thermal IR (3.9 um) sees through smoke to heat.`;
    } else if (storageUsed >= 6 && allPackets.every((p) => !p.processed) && requestsUnverifiedCount > 0) {
      failureReasonCode = 'UNPROCESSED_STORAGE_BOTTLENECK';
      failureExplanation =
        `ONBOARD BUFFER BOTTLENECK: Uncompressed raw cubes filled memory before every target could be scanned. Compress cubes in the Processing Cradle between scans (each shrinks to ${memoryBlocks(proc.compressedStorageCost)} for ${proc.powerCost} Wh).`;
    } else {
      failureReasonCode = 'INSUFFICIENT_VERIFIED_EVIDENCE';
      failureExplanation =
        weighted
          ? `NOT ENOUGH VALUE DELIVERED: ${totalScore} pts reached the ground; this pass needs ${successScore} pts to succeed. Spend power on the highest-value requests first.`
          : `INCOMPLETE TRIAGE COVERAGE: Only ${requestsVerifiedCount}/${requestCount} ground requests were verified (${requestsPartialCount} partial, ${requestsUnverifiedCount} unverified). Scan and queue evidence for every priority target sector (${GROUND_REQUEST_ORDER.map((id) => requests[id].targetSectorId).join(', ')}) before committing downlink.`;
    }
  }

  return {
    missionRank, outcome, certification, efficiencyGrade, totalScore, maxScore: 100,
    requestsVerifiedCount, requestsPartialCount, requestsUnverifiedCount,
    powerRemaining, powerUsed, storageUsed, downlinkUsedSec, downlinkWindowSec,
    transmittedPayloadMb,
    successScore, partialScore, hintsUsed, hintPenalty: SCORING.hintPenalty,
    downlinkThroughputMbps: throughput,
    failureReasonCode,
    failureExplanation,
    transmittedPacketIds: transmittedPackets.map((p) => p.id),
    droppedPacketIds: droppedPackets.map((p) => p.id), evaluations,
    evidenceProvenance,
    summaryHeadline: achievedBest
      ? benchmark.score === 100
        ? `ALL THREE REQUESTS VERIFIED BEFORE LOSS OF SIGNAL (GRADE ${efficiencyGrade}).`
        : weighted
          ? `BEST POSSIBLE TRIAGE: ${totalScore}/${benchmark.score} ACHIEVABLE POINTS. NOT EVERY REQUEST COULD BE ANSWERED THIS PASS, AND YOU SAVED THE MOST VALUABLE ONES.`
          : `SCENARIO MASTERY: ${totalScore}/${benchmark.score} POSSIBLE POINTS EARNED (GRADE ${efficiencyGrade}). THE WEATHER ON THIS PASS LIMITS CERTAINTY, NOT YOUR TRIAGE SKILL.`
      : `${requestsVerifiedCount}/${requestCount} VERIFIED - REVIEW THE EVIDENCE THAT DID NOT REACH EARTH.`,
    deterministicRecommendation: advice.join(' '),
    counterfactualComparison: `SCENARIO CEILING (${benchmark.score}/100 RAW): ${describeMissionPlan(benchmark)}. ${benchmark.powerUsed} Wh power units, ${benchmark.transmitSec.toFixed(1)}s transmission @ ${throughput.toFixed(1)} MB/s.`,
    achievableScore: benchmark.score,
    windowMarginSec: Math.max(0, Number((downlinkWindowSec - downlinkUsedSec).toFixed(6))),
    benchmarkPowerUsed: benchmark.powerUsed, benchmarkDownlinkSec: benchmark.transmitSec,
  };
}
