/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Gameplay Balance & Strategy Simulation Test Harness (RC3)
 *
 * Exercises 10 distinct player strategies across all 3 mission scenarios (30 passes total):
 * 1. Optimal evidence-first strategy
 * 2. Greedy scan-everything strategy
 * 3. Wrong sensor selection
 * 4. Inefficient processing order
 * 5. Poor packet prioritization
 * 6. Early transmission
 * 7. Delayed transmission / queue overflow
 * 8. Excessive storage consumption & discard recovery
 * 9. Conservative low-resource strategy
 * 10. Deliberately poor decisions (unverified packets queued)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { MISSION_SCENARIOS } from '../src/mission/missionConfig';
import { MissionEngine } from '../src/mission/missionEngine';
import { getMissionBenchmark } from '../src/mission/missionPlanner';
import type { MissionScenarioId, SectorId, SensorMode } from '../src/mission/types';

export interface StrategyRunResult {
  scenarioId: MissionScenarioId;
  strategyName: string;
  randomSeed: number | null;
  initialResources: {
    power: number;
    maxStorage: number;
    downlinkWindowSec: number;
  };
  executedActionSequence: string[];
  completionStatus: 'COMPLETED' | 'RECOVERED' | 'DROPPED_BY_WINDOW' | 'INSUFFICIENT_RESOURCES';
  score: number;
  maxScore: number;
  efficiencyGrade: string;
  powerRemaining: number;
  powerUsed: number;
  storageUsed: number;
  requestsVerified: number;
  requestsPartial: number;
  requestsUnverified: number;
  transmittedCount: number;
  droppedCount: number;
  keyMistake: string;
  canRecover: boolean;
}

function extractResult(
  scenarioId: MissionScenarioId,
  strategyName: string,
  engine: MissionEngine,
  completionStatus: StrategyRunResult['completionStatus'],
  keyMistake: string,
  executedActions?: string[],
  canRecover = true,
): StrategyRunResult {
  const state = engine.getState();
  const debrief = state.debrief!;
  const budget = MISSION_SCENARIOS[scenarioId].budget;
  return {
    scenarioId,
    strategyName,
    randomSeed: null,
    initialResources: {
      power: budget.initialPower,
      maxStorage: budget.maxStorage,
      downlinkWindowSec: budget.downlinkDurationSec,
    },
    executedActionSequence: (executedActions && executedActions.length > 0)
      ? executedActions
      : engine.getJournal().map((j) => JSON.stringify(j.action)),
    completionStatus,
    score: debrief.totalScore,
    maxScore: debrief.maxScore,
    efficiencyGrade: debrief.efficiencyGrade,
    powerRemaining: debrief.powerRemaining,
    powerUsed: debrief.powerUsed,
    storageUsed: debrief.storageUsed,
    requestsVerified: debrief.requestsVerifiedCount,
    requestsPartial: debrief.requestsPartialCount,
    requestsUnverified: debrief.requestsUnverifiedCount,
    transmittedCount: debrief.transmittedPacketIds.length,
    droppedCount: debrief.droppedPacketIds.length,
    keyMistake,
    canRecover,
  };
}

export function runOptimalStrategy(scenarioId: MissionScenarioId): StrategyRunResult {
  const engine = new MissionEngine(scenarioId);
  const benchmark = getMissionBenchmark(scenarioId);
  const actions: string[] = [];
  for (const action of benchmark.actions) {
    if (action.type === 'SCAN') {
      engine.scanSector(action.sectorId, action.sensorMode);
      actions.push(`SCAN ${action.sectorId} ${action.sensorMode}`);
    } else if (action.type === 'PROCESS') {
      const pkt = engine.getState().packets.find((p) => p.sectorId === action.sectorId && p.sensorMode === action.sensorMode);
      if (pkt) {
        engine.processPacket(pkt.id);
        actions.push(`PROCESS ${pkt.id} (${action.sectorId})`);
      }
    } else if (action.type === 'QUEUE') {
      const pkt = engine.getState().packets.find((p) => p.sectorId === action.sectorId && p.sensorMode === action.sensorMode);
      if (pkt) {
        engine.queuePacket(pkt.id);
        actions.push(`QUEUE ${pkt.id} (${action.sectorId})`);
      }
    } else if (action.type === 'DISCARD') {
      const pkt = engine.getState().packets.find((p) => p.sectorId === action.sectorId && p.sensorMode === action.sensorMode);
      if (pkt) {
        engine.discardPacket(pkt.id);
        actions.push(`DISCARD ${pkt.id} (${action.sectorId})`);
      }
    }
  }
  engine.startDownlink();
  actions.push('START_DOWNLINK');
  engine.tickDownlink(20);
  actions.push('TICK_DOWNLINK 20s');
  return extractResult(scenarioId, 'Optimal Evidence-First', engine, 'COMPLETED', 'None - optimal execution.', actions, true);
}

export function runGreedyScanStrategy(scenarioId: MissionScenarioId): StrategyRunResult {
  const engine = new MissionEngine(scenarioId);
  const errors: string[] = [];
  const actions: string[] = [];

  // Blindly scan sectors A, B, C, D without checking resources or processing
  for (const s of ['A', 'B', 'C', 'D'] as SectorId[]) {
    const res = engine.scanSector(s, 'RADAR');
    actions.push(`SCAN ${s} RADAR -> ${res.ok ? 'OK' : res.code}`);
    if (!res.ok) errors.push(res.code);
  }

  // Queue whatever is on the tray
  for (const pkt of engine.getState().packets) {
    engine.queuePacket(pkt.id);
    actions.push(`QUEUE ${pkt.id} (${pkt.sectorId})`);
  }
  engine.startDownlink();
  actions.push('START_DOWNLINK');
  engine.tickDownlink(20);
  actions.push('TICK_DOWNLINK 20s');

  const state = engine.getState();
  const debrief = state.debrief!;
  const status = debrief.droppedPacketIds.length ? 'DROPPED_BY_WINDOW' : 'COMPLETED';
  return extractResult(
    scenarioId,
    'Greedy Scan-Everything',
    engine,
    status,
    `Resource exhaustion and tray overflow: encountered ${errors.join(', ')}.`,
    actions,
    true,
  );
}

export function runWrongSensorStrategy(scenarioId: MissionScenarioId): StrategyRunResult {
  const engine = new MissionEngine(scenarioId);
  const actions: string[] = [];

  // Scan with deliberately wrong sensors:
  // Sector B (dense cloud) with OPTICAL (blocked)
  // Sector C with RADAR on Standard Indus
  // Sector E (dense cloud) with OPTICAL (blocked)
  engine.scanSector('B', 'OPTICAL');
  actions.push('SCAN B OPTICAL');
  engine.scanSector('C', 'RADAR');
  actions.push('SCAN C RADAR');
  engine.scanSector('E', 'OPTICAL');
  actions.push('SCAN E OPTICAL');

  for (const pkt of engine.getState().packets) {
    if (pkt.confidence !== 'UNVERIFIED') {
      engine.processPacket(pkt.id);
      actions.push(`PROCESS ${pkt.id} (${pkt.sectorId})`);
    }
    engine.queuePacket(pkt.id);
    actions.push(`QUEUE ${pkt.id} (${pkt.sectorId})`);
  }

  engine.startDownlink();
  actions.push('START_DOWNLINK');
  engine.tickDownlink(20);
  actions.push('TICK_DOWNLINK 20s');

  return extractResult(
    scenarioId,
    'Wrong Sensor Selection',
    engine,
    'COMPLETED',
    'Selected passive optical under dense cloud cover; acquired zero usable surface evidence for Requests 1 & 3.',
    actions,
    true,
  );
}

export function runInefficientProcessingStrategy(scenarioId: MissionScenarioId): StrategyRunResult {
  const engine = new MissionEngine(scenarioId);
  const actions: string[] = [];

  // Scan irrelevant Sector A (not part of requests 1-3) and process it, wasting 6 PWR
  engine.scanSector('A', 'RADAR');
  actions.push('SCAN A RADAR');
  const pktA = engine.getState().packets.find((p) => p.sectorId === 'A');
  if (pktA) {
    engine.processPacket(pktA.id);
    actions.push(`PROCESS ${pktA.id} (A)`);
  }

  // Scan Sector B (RADAR)
  engine.scanSector('B', 'RADAR');
  actions.push('SCAN B RADAR');

  // Try to scan Sector E (RADAR)
  engine.scanSector('E', 'RADAR');
  actions.push('SCAN E RADAR');

  // Queue everything available
  for (const pkt of engine.getState().packets) {
    engine.queuePacket(pkt.id);
    actions.push(`QUEUE ${pkt.id} (${pkt.sectorId})`);
  }

  engine.startDownlink();
  actions.push('START_DOWNLINK');
  engine.tickDownlink(20);
  actions.push('TICK_DOWNLINK 20s');

  const state = engine.getState();
  const debrief = state.debrief!;
  const status = debrief.droppedPacketIds.length ? 'DROPPED_BY_WINDOW' : 'COMPLETED';
  return extractResult(
    scenarioId,
    'Inefficient Processing Order',
    engine,
    status,
    'Spent power processing non-target Sector A; left insufficient time or power for primary objectives.',
    actions,
    true,
  );
}

export function runPoorPrioritizationStrategy(scenarioId: MissionScenarioId): StrategyRunResult {
  const engine = new MissionEngine(scenarioId);
  const actions: string[] = [];

  // Scan B, C, E
  engine.scanSector('B', 'RADAR');
  actions.push('SCAN B RADAR');
  engine.scanSector('C', 'OPTICAL');
  actions.push('SCAN C OPTICAL');
  engine.scanSector('E', 'RADAR');
  actions.push('SCAN E RADAR');

  // Compress only Sector E
  const pktE = engine.getState().packets.find((p) => p.sectorId === 'E');
  if (pktE) {
    engine.processPacket(pktE.id);
    actions.push(`PROCESS ${pktE.id} (E)`);
  }

  // Poor prioritization: Queue raw uncompressed B (4.5s) in Slot 1, raw C (4.0s) in Slot 2.
  // Then queue compressed E (1.8s) in Slot 3. Total: 4.5 + 4.0 + 1.8 = 10.3s > 10.0s!
  // Slot 3 (E) will be cut off by the window expiration!
  const pktB = engine.getState().packets.find((p) => p.sectorId === 'B');
  const pktC = engine.getState().packets.find((p) => p.sectorId === 'C');
  if (pktB) {
    engine.queuePacket(pktB.id);
    actions.push(`QUEUE ${pktB.id} (B raw 4.5s)`);
  }
  if (pktC) {
    engine.queuePacket(pktC.id);
    actions.push(`QUEUE ${pktC.id} (C raw 4.0s)`);
  }
  if (pktE) {
    engine.queuePacket(pktE.id);
    actions.push(`QUEUE ${pktE.id} (E compressed 1.8s)`);
  }

  engine.startDownlink();
  actions.push('START_DOWNLINK');
  engine.tickDownlink(20);
  actions.push('TICK_DOWNLINK 20s');

  return extractResult(
    scenarioId,
    'Poor Packet Prioritization',
    engine,
    'DROPPED_BY_WINDOW',
    'Queued heavy raw packets first, pushing crucial highland spur evidence past the 10.0s cutoff.',
    actions,
    true,
  );
}

export function runEarlyTransmissionStrategy(scenarioId: MissionScenarioId): StrategyRunResult {
  const engine = new MissionEngine(scenarioId);
  const actions: string[] = [];

  // Scan only Sector B, queue raw, commit immediately
  engine.scanSector('B', 'RADAR');
  actions.push('SCAN B RADAR');
  const pktB = engine.getState().packets.find((p) => p.sectorId === 'B');
  if (pktB) {
    engine.queuePacket(pktB.id);
    actions.push(`QUEUE ${pktB.id} (B)`);
  }

  engine.startDownlink();
  actions.push('START_DOWNLINK');
  engine.tickDownlink(20);
  actions.push('TICK_DOWNLINK 20s');

  return extractResult(
    scenarioId,
    'Early Transmission (Incomplete Evidence)',
    engine,
    'COMPLETED',
    'Committed downlink with 2 ground requests completely unaddressed.',
    actions,
    true,
  );
}

export function runDelayedOverflowStrategy(scenarioId: MissionScenarioId): StrategyRunResult {
  const engine = new MissionEngine(scenarioId);
  const actions: string[] = [];

  // Scan 3 sectors, compress NONE, queue all 3:
  // 4.5s + 4.0s + 4.5s = 13.0s total (> 10.0s window)
  engine.scanSector('B', 'RADAR');
  actions.push('SCAN B RADAR');
  engine.scanSector('C', 'OPTICAL');
  actions.push('SCAN C OPTICAL');
  engine.scanSector('E', 'RADAR');
  actions.push('SCAN E RADAR');

  for (const pkt of engine.getState().packets) {
    engine.queuePacket(pkt.id);
    actions.push(`QUEUE ${pkt.id} (${pkt.sectorId} raw)`);
  }

  engine.startDownlink();
  actions.push('START_DOWNLINK');
  engine.tickDownlink(20);
  actions.push('TICK_DOWNLINK 20s');

  return extractResult(
    scenarioId,
    'Delayed Transmission / Queue Overflow',
    engine,
    'DROPPED_BY_WINDOW',
    'Queued 13.0s of raw packets into a 10.0s horizon window without compressing in the cradle.',
    actions,
    true,
  );
}

export function runStorageExhaustionAndRecoveryStrategy(scenarioId: MissionScenarioId): StrategyRunResult {
  const engine = new MissionEngine(scenarioId);
  const actions: string[] = [];

  // Fill tray with 3 low-power scans (8 PWR each = 24 PWR) to preserve power
  engine.scanSector('A', 'OPTICAL');
  actions.push('SCAN A OPTICAL');
  engine.scanSector('C', 'OPTICAL');
  actions.push('SCAN C OPTICAL');
  engine.scanSector('D', 'OPTICAL');
  actions.push('SCAN D OPTICAL');

  // Try 4th scan -> fails with TRAY_FULL or INSUFFICIENT_STORAGE (has ample power)
  const fourthScan = engine.scanSector('E', 'OPTICAL');
  actions.push(`SCAN E OPTICAL -> ${fourthScan.ok ? 'OK' : fourthScan.code}`);
  expect(fourthScan.ok).toBe(false);
  expect(['TRAY_FULL', 'INSUFFICIENT_STORAGE']).toContain(fourthScan.code);

  // RECOVERY: Discard unneeded Sector A
  const pktA = engine.getState().packets.find((p) => p.sectorId === 'A');
  expect(pktA).toBeDefined();
  const discardResult = engine.discardPacket(pktA!.id);
  actions.push(`DISCARD ${pktA!.id} (A) -> ${discardResult.ok ? 'OK' : discardResult.code}`);
  expect(discardResult.ok).toBe(true);

  // Now scan target Sector B with RADAR
  const recoveredScan = engine.scanSector('B', 'RADAR');
  actions.push(`SCAN B RADAR -> ${recoveredScan.ok ? 'OK' : recoveredScan.code}`);
  expect(recoveredScan.ok).toBe(true);

  // Compress and queue
  for (const pkt of engine.getState().packets) {
    if (pkt.confidence !== 'UNVERIFIED' && engine.getState().power >= 6) {
      engine.processPacket(pkt.id);
      actions.push(`PROCESS ${pkt.id} (${pkt.sectorId})`);
    }
    engine.queuePacket(pkt.id);
    actions.push(`QUEUE ${pkt.id} (${pkt.sectorId})`);
  }

  engine.startDownlink();
  actions.push('START_DOWNLINK');
  engine.tickDownlink(20);
  actions.push('TICK_DOWNLINK 20s');

  return extractResult(
    scenarioId,
    'Storage Exhaustion & Discard Recovery',
    engine,
    'RECOVERED',
    'Initially overfilled tray with non-critical sectors; successfully recovered by discarding.',
    actions,
    true,
  );
}

export function runConservativeLowResourceStrategy(scenarioId: MissionScenarioId): StrategyRunResult {
  const engine = new MissionEngine(scenarioId);
  const actions: string[] = [];

  // Scan only 1 primary target sector using its appropriate sensor
  const targetSector: SectorId = scenarioId === 'MONSOON_SUPERCELL_PASS' ? 'B' : 'C';
  const targetMode: SensorMode = scenarioId === 'MONSOON_SUPERCELL_PASS' ? 'RADAR' : 'OPTICAL';
  engine.scanSector(targetSector, targetMode);
  actions.push(`SCAN ${targetSector} ${targetMode}`);
  const pkt = engine.getState().packets.find((p) => p.sectorId === targetSector);
  if (pkt) {
    if (pkt.confidence !== 'UNVERIFIED') {
      engine.processPacket(pkt.id);
      actions.push(`PROCESS ${pkt.id} (${targetSector})`);
    }
    engine.queuePacket(pkt.id);
    actions.push(`QUEUE ${pkt.id} (${targetSector})`);
  }

  engine.startDownlink();
  actions.push('START_DOWNLINK');
  engine.tickDownlink(20);
  actions.push('TICK_DOWNLINK 20s');

  return extractResult(
    scenarioId,
    'Conservative Low-Resource',
    engine,
    'COMPLETED',
    'Saved high power reserves but left 2 of 3 disaster areas completely unmapped.',
    actions,
    true,
  );
}

export function runDeliberatePoorDecisionsStrategy(scenarioId: MissionScenarioId): StrategyRunResult {
  const engine = new MissionEngine(scenarioId);
  const actions: string[] = [];

  // Scan Sector B with OPTICAL (dense storm -> UNVERIFIED)
  engine.scanSector('B', 'OPTICAL');
  actions.push('SCAN B OPTICAL');
  const pktB = engine.getState().packets.find((p) => p.sectorId === 'B');
  expect(pktB?.confidence).toBe('UNVERIFIED');

  // Try to process unverified packet -> must be rejected
  const procRes = engine.processPacket(pktB!.id);
  actions.push(`PROCESS ${pktB!.id} -> ${procRes.ok ? 'OK' : procRes.code}`);
  expect(procRes.ok).toBe(false);
  expect(procRes.code).toBe('CANNOT_PROCESS_UNVERIFIED');

  // Queue the unverified packet anyway
  engine.queuePacket(pktB!.id);
  actions.push(`QUEUE ${pktB!.id} (UNVERIFIED)`);

  engine.startDownlink();
  actions.push('START_DOWNLINK');
  engine.tickDownlink(20);
  actions.push('TICK_DOWNLINK 20s');

  return extractResult(
    scenarioId,
    'Deliberately Poor Decisions',
    engine,
    'COMPLETED',
    'Queued an [X] UNVERIFIED cloud-blocked frame into the downlink bay; ground teams received zero usable telemetry.',
    actions,
    true,
  );
}

describe('Gameplay Balance & Strategy Matrix (RC3 Audit)', () => {
  const scenarios: MissionScenarioId[] = [
    'STANDARD_INDUS_PASS',
    'MONSOON_SUPERCELL_PASS',
    'SOLAR_BROWNOUT_PASS',
  ];

  for (const scenarioId of scenarios) {
    describe(`Scenario: ${scenarioId}`, () => {
      it('executes Optimal Strategy and achieves benchmark', () => {
        const res = runOptimalStrategy(scenarioId);
        const benchmark = getMissionBenchmark(scenarioId);
        expect(res.score).toBe(benchmark.score);
        expect(res.efficiencyGrade).toBe('S');
        expect(res.droppedCount).toBe(0);
      });

      it('executes Greedy Scan Strategy with resource constraints', () => {
        const res = runGreedyScanStrategy(scenarioId);
        expect(res.score).toBeLessThanOrEqual(getMissionBenchmark(scenarioId).score);
      });

      it('executes Wrong Sensor Strategy and penalizes obscured scans', () => {
        const res = runWrongSensorStrategy(scenarioId);
        expect(res.requestsUnverified).toBeGreaterThanOrEqual(1);
        expect(res.score).toBeLessThan(70);
      });

      it('executes Inefficient Processing Strategy and verifies resource waste', () => {
        const res = runInefficientProcessingStrategy(scenarioId);
        expect(res.score).toBeLessThanOrEqual(getMissionBenchmark(scenarioId).score);
      });

      it('executes Poor Prioritization and verifies window cutoff drop', () => {
        const res = runPoorPrioritizationStrategy(scenarioId);
        expect(res.droppedCount).toBeGreaterThan(0);
      });

      it('executes Early Transmission Strategy and verifies partial completion', () => {
        const res = runEarlyTransmissionStrategy(scenarioId);
        expect(res.requestsVerified).toBe(1);
        expect(res.requestsUnverified).toBe(2);
        expect(res.score).toBe(30);
      });

      it('executes Delayed Overflow Strategy and verifies packet drop at cutoff', () => {
        const res = runDelayedOverflowStrategy(scenarioId);
        expect(res.droppedCount).toBeGreaterThan(0);
      });

      it('executes Storage Exhaustion and verifies successful discard recovery', () => {
        const res = runStorageExhaustionAndRecoveryStrategy(scenarioId);
        expect(res.completionStatus).toBe('RECOVERED');
        expect(res.canRecover).toBe(true);
      });

      it('executes Conservative Strategy and verifies power conservation trade-off', () => {
        const res = runConservativeLowResourceStrategy(scenarioId);
        expect(res.powerRemaining).toBeGreaterThanOrEqual(25);
        expect(res.requestsVerified).toBe(1);
      });

      it('executes Deliberately Poor Decisions and verifies unverified rejection', () => {
        const res = runDeliberatePoorDecisionsStrategy(scenarioId);
        expect(res.score).toBe(0);
      });
    });
  }

  it('generates complete empirical gameplay balance summary', () => {
    const fns = [
      runOptimalStrategy,
      runGreedyScanStrategy,
      runWrongSensorStrategy,
      runInefficientProcessingStrategy,
      runPoorPrioritizationStrategy,
      runEarlyTransmissionStrategy,
      runDelayedOverflowStrategy,
      runStorageExhaustionAndRecoveryStrategy,
      runConservativeLowResourceStrategy,
      runDeliberatePoorDecisionsStrategy,
    ];
    const fullResults: StrategyRunResult[] = [];
    const summary = [];
    for (const s of scenarios) {
      for (const fn of fns) {
        const r = fn(s);
        fullResults.push(r);
        summary.push({
          scenario: s,
          strategy: r.strategyName,
          status: r.completionStatus,
          score: r.score,
          grade: r.efficiencyGrade,
          pwrRem: r.powerRemaining,
          reqV: r.requestsVerified,
          reqP: r.requestsPartial,
          reqU: r.requestsUnverified,
          tx: r.transmittedCount,
          drop: r.droppedCount,
          mistake: r.keyMistake,
        });
      }
    }

    const releaseDir = path.resolve(__dirname, '../artifacts/release');
    if (!fs.existsSync(releaseDir)) {
      fs.mkdirSync(releaseDir, { recursive: true });
    }
    const targetFile = path.join(releaseDir, 'strategy-simulation-results.json');
    fs.writeFileSync(targetFile, JSON.stringify(fullResults, null, 2), 'utf-8');

    console.log('__BALANCE_DATA_START__' + JSON.stringify(summary) + '__BALANCE_DATA_END__');
    expect(fullResults.length).toBe(30);
    expect(fs.existsSync(targetFile)).toBe(true);
  });
});
