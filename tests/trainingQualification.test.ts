import { describe, expect, it } from 'vitest';
import { createMissionProfile, loadMissionProfile, recordMissionMastery, saveMissionProfile } from '../src/systems/missionProfile';
import { MissionEngine } from '../src/mission/missionEngine';
import { TutorialEngine } from '../src/mission/tutorialEngine';
import { buildDebriefReport } from '../src/mission/scoring';
import type { DataPacket, DebriefReport } from '../src/mission/types';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
};

const report = (outcome: DebriefReport['outcome']) => ({
  outcome, totalScore: outcome === 'SUCCESS' ? 100 : 0, achievableScore: 100, efficiencyGrade: 'A',
  powerUsed: 10, benchmarkPowerUsed: 17, downlinkUsedSec: 2, benchmarkDownlinkSec: 1.8, windowMarginSec: 8,
  droppedPacketIds: [], transmittedPacketIds: ['a'],
}) as unknown as DebriefReport;

describe('training qualification persistence (F05/F11)', () => {
  it('a Fireline result does not certify training', () => {
    const profile = createMissionProfile();
    recordMissionMastery(profile, 'FIRELINE_PASS', report('SUCCESS'));
    expect(profile.tutorialComplete).toBe(false);
  });

  it('a failed Academy run does not certify training', () => {
    const profile = createMissionProfile();
    recordMissionMastery(profile, 'ORBITAL_ACADEMY', report('FAILED'));
    expect(profile.tutorialComplete).toBe(false);
  });

  it('a successful Academy run persists across reload', () => {
    const profile = createMissionProfile();
    recordMissionMastery(profile, 'ORBITAL_ACADEMY', report('SUCCESS'));
    saveMissionProfile(profile);
    const reloaded = loadMissionProfile();
    expect(reloaded.tutorialComplete).toBe(true);
    expect(reloaded.mastery.ORBITAL_ACADEMY?.attempts).toBe(1);
  });

  it('F05: grabbing a cube does not automatically inspect it', () => {
    const engine = new MissionEngine('ORBITAL_ACADEMY');
    const tutorial = new TutorialEngine();
    tutorial.start();

    // Step 1: Environment
    tutorial.syncWithMissionState(engine.getState());
    expect(tutorial.getState().currentStepId).toBe('STEP_1_ENVIRONMENT');

    // Initial state: Step 1 Environment
    tutorial.syncWithMissionState(engine.getState());
    expect(tutorial.getState().currentStepId).toBe('STEP_1_ENVIRONMENT');

    // Interact with globe -> advances through pointing to STEP_3_PINCH
    tutorial.syncWithMissionState(engine.getState(), { type: 'SELECT_SECTOR', sectorId: 'B' });
    expect(tutorial.getState().currentStepId).toBe('STEP_3_PINCH');

    // Step 3: Scan Thermal
    const pkt = engine.scanSector('B', 'THERMAL').packet!;
    tutorial.notifyPinchScan();
    tutorial.syncWithMissionState(engine.getState(), { type: 'SCAN', sectorId: 'B', sensorMode: 'THERMAL' });
    expect(tutorial.getState().currentStepId).toBe('STEP_4_GRAB');

    // Step 4: Grab or select cube — MUST stop at STEP_5_INSPECT, not advance past it!
    tutorial.notifyCubeGrabOrSelect();
    tutorial.syncWithMissionState(engine.getState(), { type: 'SELECT_PACKET' });
    expect(tutorial.getState().currentStepId).toBe('STEP_5_INSPECT');

    // Grabbing again must still stay at STEP_5_INSPECT
    tutorial.notifyCubeGrabOrSelect();
    tutorial.syncWithMissionState(engine.getState());
    expect(tutorial.getState().currentStepId).toBe('STEP_5_INSPECT');

    // Explicit inspection is required to advance to STEP_6_PROCESS
    tutorial.notifyCubeInspected();
    tutorial.syncWithMissionState(engine.getState());
    expect(tutorial.getState().currentStepId).toBe('STEP_6_PROCESS');
  });

  it('F05: Academy scoring strictly requires processed THERMAL packet', () => {
    const dummyPacket = (overrides: Partial<DataPacket> = {}): DataPacket => ({
      id: 'PKT-TEST',
      sectorId: 'B',
      sectorCode: 'SEC-B',
      sectorName: 'Wildfire Front',
      sensorMode: 'THERMAL',
      confidence: 'CONFIRMED',
      confidenceBadge: '[OK] CONFIRMED',
      headline: 'Active Fire Front Detected',
      snrDb: 24.5,
      swathWidthKm: 18.5,
      resolutionMeters: 0.75,
      phenomenologyTag: 'MWIR_WILDFIRE_FRONTLINE',
      storageCost: 1,
      rawStorageCost: 3,
      transmitSec: 1.8,
      rawTransmitSec: 4.2,
      compressionRatio: 2.33,
      processed: true,
      queued: true,
      queueIndex: 0,
      transmitted: true,
      droppedByWindow: false,
      satisfiesRequestId: 'REQ_1',
      finding: 'Active fire front confirmed',
      ambiguityReason: 'None',
      scientificReason: 'MWIR signature',
      provenanceLineage: 'RAW -> COMPRESSED',
      createdAtStep: 0,
      ...overrides,
    });

    // 1. Uncompressed thermal packet: must FAIL Academy
    const uncompressedReport = buildDebriefReport({
      allPackets: [dummyPacket({ processed: false, storageCost: 3, transmitSec: 4.2 })],
      transmittedPackets: [dummyPacket({ processed: false, storageCost: 3, transmitSec: 4.2 })],
      droppedPackets: [],
      powerRemaining: 30,
      storageUsed: 3,
      downlinkUsedSec: 4.2,
      scenarioId: 'ORBITAL_ACADEMY',
    });
    expect(uncompressedReport.outcome).toBe('FAILED');

    // 2. Compressed RADAR packet: must FAIL Academy (requires THERMAL)
    const radarReport = buildDebriefReport({
      allPackets: [dummyPacket({ sensorMode: 'RADAR', satisfiesRequestId: 'REQ_2' })],
      transmittedPackets: [dummyPacket({ sensorMode: 'RADAR', satisfiesRequestId: 'REQ_2' })],
      droppedPackets: [],
      powerRemaining: 30,
      storageUsed: 1,
      downlinkUsedSec: 1.8,
      scenarioId: 'ORBITAL_ACADEMY',
    });
    expect(radarReport.outcome).toBe('FAILED');

    // 3. Compressed THERMAL packet: must SUCCEED Academy
    const validReport = buildDebriefReport({
      allPackets: [dummyPacket()],
      transmittedPackets: [dummyPacket()],
      droppedPackets: [],
      powerRemaining: 30,
      storageUsed: 1,
      downlinkUsedSec: 1.8,
      scenarioId: 'ORBITAL_ACADEMY',
    });
    expect(validReport.outcome).toBe('SUCCESS');
    expect(validReport.totalScore).toBe(100);
  });
});
