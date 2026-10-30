import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMissionProfile,
  getDailyPass,
  loadMissionProfile,
  recordDailyPass,
  recordMissionMastery,
  saveMissionProfile,
} from '../src/systems/missionProfile';
import { MissionEngine } from '../src/mission/missionEngine';
import { getMissionBenchmark } from '../src/mission/missionPlanner';
import type { MissionScenarioId } from '../src/mission/types';

function completedPass(scenarioId: MissionScenarioId = 'STANDARD_INDUS_PASS') {
  const engine = new MissionEngine(scenarioId);
  for (const action of getMissionBenchmark(scenarioId).actions) {
    if (action.type === 'SCAN') engine.dispatch(action);
    else {
      const packet = engine.getState().packets.find((p) => p.sectorId === action.sectorId && p.sensorMode === action.sensorMode)!;
      engine.dispatch({ type: action.type, packetId: packet.id });
    }
  }
  return engine.commitDownlink()!;
}

function memoryStorage(initial: string | null = null) {
  const data = new Map<string, string>();
  if (initial) data.set('orbit-zero-profile-v1', initial);
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Local mastery, preferences and daily passes', () => {
  it('persists accessibility preferences and mastery without a server', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const profile = createMissionProfile();
    profile.preferences.largeText = true;
    profile.preferences.reducedMotion = true;
    profile.preferences.dominantHand = 'LEFT';
    recordMissionMastery(profile, 'STANDARD_INDUS_PASS', completedPass());
    saveMissionProfile(profile);
    expect(loadMissionProfile()).toEqual(profile);
  });

  it('keeps the game playable when storage is blocked or corrupted', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('disabled'); }, setItem: () => { throw new Error('disabled'); } });
    expect(loadMissionProfile()).toEqual(createMissionProfile());
    expect(() => saveMissionProfile(createMissionProfile())).not.toThrow();
    vi.stubGlobal('localStorage', memoryStorage('broken json'));
    expect(loadMissionProfile()).toEqual(createMissionProfile());
    vi.stubGlobal('localStorage', memoryStorage(JSON.stringify({ version: 99 })));
    expect(loadMissionProfile()).toEqual(createMissionProfile());
  });

  it('awards medals against the actual mission objective, including uncertain Monsoon evidence and data discipline', () => {
    const profile = createMissionProfile();
    const report = completedPass('MONSOON_SUPERCELL_PASS');
    expect(report.achievableScore).toBe(83);
    const medals = recordMissionMastery(profile, 'MONSOON_SUPERCELL_PASS', report);
    expect(medals).toEqual(expect.arrayContaining(['GROUND TRUTH', 'POWER DISCIPLINE', 'LINK PRECISION', 'DATA DISCIPLINE']));
    expect(profile.mastery.MONSOON_SUPERCELL_PASS!.bestGrade).toBe('S');
  });

  it('persists tabletopMode, gazeAssist and seatOffset across sessions', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const profile = createMissionProfile();
    profile.preferences.tabletopMode = true;
    profile.preferences.gazeAssist = true;
    profile.preferences.seatOffset = [0.1, -0.05, 0.2];
    saveMissionProfile(profile);
    const loaded = loadMissionProfile();
    expect(loaded.preferences.tabletopMode).toBe(true);
    expect(loaded.preferences.gazeAssist).toBe(true);
    expect(loaded.preferences.seatOffset).toEqual([0.1, -0.05, 0.2]);
  });

  it('never replaces a personal best with a weaker later pass', () => {
    const profile = createMissionProfile();
    const best = completedPass();
    recordMissionMastery(profile, 'STANDARD_INDUS_PASS', best);
    const poor = new MissionEngine();
    const packet = poor.scanSector('B', 'RADAR').packet!;
    poor.queuePacket(packet.id);
    recordMissionMastery(profile, 'STANDARD_INDUS_PASS', poor.commitDownlink()!);
    expect(profile.mastery.STANDARD_INDUS_PASS!.attempts).toBe(2);
    expect(profile.mastery.STANDARD_INDUS_PASS!.bestScore).toBe(100);
    expect(profile.mastery.STANDARD_INDUS_PASS!.bestGrade).toBe('S');
    expect(profile.mastery.STANDARD_INDUS_PASS!.bestPowerUsed).toBe(best.powerUsed);
  });

  it('is deterministic and only selects mathematically validated daily mission templates', () => {
    const seen = new Set<MissionScenarioId>();
    for (let day = 0; day < 366; day++) {
      const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      const scenario = getDailyPass(date);
      expect(getDailyPass(date)).toBe(scenario);
      expect(getMissionBenchmark(scenario).score).toBeGreaterThan(0);
      seen.add(scenario);
    }
    expect(seen.size).toBe(3);
  });

  it('increments a daily streak once per UTC day and resets it after a missed day', () => {
    const profile = createMissionProfile();
    recordDailyPass(profile, '2026-10-30', 65);
    recordDailyPass(profile, '2026-10-30', 83);
    expect(profile.daily).toEqual({ lastCompletedDate: '2026-10-30', streak: 1, bestScore: 83 });
    recordDailyPass(profile, '2026-10-31', 100);
    expect(profile.daily.streak).toBe(2);
    recordDailyPass(profile, '2026-11-02', 100);
    expect(profile.daily.streak).toBe(1);
  });

  it('validates ONE-HAND and NO-HINT achievements honestly through recorded run telemetry rather than settings alone', () => {
    const profile = createMissionProfile();
    profile.preferences.oneHanded = true;
    profile.preferences.guidance = 'EXPERT';
    const report = completedPass('STANDARD_INDUS_PASS');

    // Case 1: Player toggled oneHanded, but actually used 2 hands -> ONE-HAND MODE denied!
    const medals2Hands = recordMissionMastery(profile, 'STANDARD_INDUS_PASS', report, { actualHandsUsed: 2, hintsRequestedCount: 0 });
    expect(medals2Hands).not.toContain('ONE-HAND MODE');
    expect(medals2Hands).toContain('NO-HINT SPECIALIST');

    // Case 2: Player toggled EXPERT, but requested a hint -> NO-HINT SPECIALIST denied!
    const medalsWithHints = recordMissionMastery(profile, 'STANDARD_INDUS_PASS', report, { actualHandsUsed: 1, hintsRequestedCount: 1 });
    expect(medalsWithHints).toContain('ONE-HAND MODE');
    expect(medalsWithHints).not.toContain('NO-HINT SPECIALIST');

    // Case 3: Honest 1-hand, 0-hint run -> both awarded!
    const honestMedals = recordMissionMastery(profile, 'STANDARD_INDUS_PASS', report, { actualHandsUsed: 1, hintsRequestedCount: 0 });
    expect(honestMedals).toContain('ONE-HAND MODE');
    expect(honestMedals).toContain('NO-HINT SPECIALIST');
  });
});
