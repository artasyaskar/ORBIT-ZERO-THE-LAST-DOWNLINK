import { describe, expect, it } from 'vitest';
import { getScenarioSector, MISSION_SCENARIOS } from '../src/mission/missionConfig';
import { MissionEngine, replayMission } from '../src/mission/missionEngine';
import { getMissionBenchmark, getNextPlanAction, getQueueSchedule, solveMission } from '../src/mission/missionPlanner';
import type { MissionScenarioId, MissionSolution } from '../src/mission/types';

function executePlan(engine: MissionEngine, solution: MissionSolution) {
  for (const action of solution.actions) {
    if (action.type === 'SCAN') {
      expect(engine.dispatch(action)).toMatchObject({ ok: true });
    } else {
      const packet = engine.getState().packets.find((p) => p.sectorId === action.sectorId && p.sensorMode === action.sensorMode)!;
      expect(packet).toBeDefined();
      expect(engine.dispatch({ type: action.type, packetId: packet.id })).toMatchObject({ ok: true });
    }
  }
}

describe('Mission oracle, schedule, replay and fairness', () => {
  for (const scenarioId of Object.keys(MISSION_SCENARIOS) as MissionScenarioId[]) {
    it(`proves and executes the best ${scenarioId} outcome`, () => {
      const solution = getMissionBenchmark(scenarioId);
      const engine = new MissionEngine(scenarioId);
      executePlan(engine, solution);
      expect(engine.dispatch({ type: 'COMMIT' })).toMatchObject({ ok: true });
      expect(engine.getState().phase).toBe('DOWNLINK');
      engine.dispatch({ type: 'TICK', seconds: 0.5 });
      expect(engine.getState().phase).toBe('DOWNLINK');
      engine.dispatch({ type: 'TICK', seconds: 20 });
      expect(engine.getState().debrief!.totalScore).toBe(solution.score);
      expect(engine.getState().debrief!.efficiencyGrade).toBe(scenarioId === 'ORBITAL_ACADEMY' ? 'A' : 'S');
      expect(replayMission(scenarioId, engine.getJournal()).getStateHash()).toBe(engine.getStateHash());
      // Supercell is a damage-limitation pass; Aftershock is a forced-triage pass (only two of three requests are affordable).
      const ceilings: Partial<Record<MissionScenarioId, number>> = { MONSOON_SUPERCELL_PASS: 83, AFTERSHOCK_PASS: 70, DEFENSE_SHIELD_PASS: 100 };
      expect(solution.score).toBe(ceilings[scenarioId] ?? 100);
      expect(solution.transmitSec).toBeLessThanOrEqual(MISSION_SCENARIOS[scenarioId].budget.downlinkDurationSec);
    });
  }

  it('uses real elapsed time independently of frame rate', () => {
    const a = new MissionEngine();
    const b = new MissionEngine();
    for (const engine of [a, b]) {
      const packet = engine.scanSector('B', 'RADAR').packet!;
      engine.queuePacket(packet.id);
      engine.startDownlink();
    }
    for (let i = 0; i < 120; i++) a.tickDownlink(1 / 60);
    for (let i = 0; i < 144; i++) b.tickDownlink(1 / 72);
    expect(a.getState().downlinkElapsedSec).toBeCloseTo(2, 8);
    expect(b.getState().downlinkElapsedSec).toBeCloseTo(2, 8);
  });

  it('keeps later compressed packets behind an earlier cutoff packet', () => {
    const engine = new MissionEngine();
    const first = engine.scanSector('B', 'RADAR').packet!;
    const second = engine.scanSector('E', 'RADAR').packet!;
    const third = engine.scanSector('C', 'OPTICAL').packet!;
    engine.processPacket(third.id);
    engine.queuePacket(first.id);
    engine.queuePacket(second.id);
    engine.queuePacket(third.id);
    expect(getQueueSchedule(engine.getState()).map((slot) => slot.endSec)).toEqual([4.5, 9, 10.8]);
    const report = engine.commitDownlink()!;
    expect(report.transmittedPacketIds).toEqual([first.id, second.id]);
    expect(report.droppedPacketIds).toEqual([third.id]);
    expect(report.downlinkUsedSec).toBe(10);
  });

  it('locks queue and time while paused, then replays pause/resume exactly', () => {
    const engine = new MissionEngine();
    engine.dispatch({ type: 'SCAN', sectorId: 'B', sensorMode: 'RADAR' });
    const packet = engine.getState().packets[0];
    engine.dispatch({ type: 'QUEUE', packetId: packet.id });
    engine.dispatch({ type: 'COMMIT' });
    engine.dispatch({ type: 'TICK', seconds: 1 });
    engine.dispatch({ type: 'PAUSE' });
    engine.dispatch({ type: 'TICK', seconds: 100 });
    expect(engine.getState().downlinkElapsedSec).toBe(1);
    expect(engine.reorderQueue([packet.id]).code).toBe('INVALID_PHASE');
    engine.dispatch({ type: 'RESUME' });
    engine.dispatch({ type: 'TICK', seconds: 0.5 });
    expect(engine.getState().downlinkElapsedSec).toBe(1.5);
    expect(replayMission('STANDARD_INDUS_PASS', engine.getJournal()).getStateHash()).toBe(engine.getStateHash());
  });

  it('uses Monsoon weather for selection, hints and scientific evidence', () => {
    const engine = new MissionEngine('MONSOON_SUPERCELL_PASS');
    expect(engine.selectSector('C').lastStatusMessage).toContain('DENSE STORM');
    expect(getScenarioSector('MONSOON_SUPERCELL_PASS', 'C').outcomes.OPTICAL.confidence).toBe('UNVERIFIED');
    expect(getMissionBenchmark('MONSOON_SUPERCELL_PASS').score).toBe(83);
  });

  it('does not promise a perfect recovery after excess radar power is spent', () => {
    const engine = new MissionEngine();
    engine.scanSector('B', 'RADAR');
    engine.scanSector('C', 'RADAR');
    engine.scanSector('E', 'RADAR');
    const solution = solveMission(engine.getState());
    expect(solution.score).toBe(83);
    executePlan(engine, solution);
    expect(engine.commitDownlink()!.totalScore).toBe(83);
  });

  it('does not recommend transmission before processing a queued raw plan', () => {
    const engine = new MissionEngine();
    for (const [sectorId, sensorMode] of [['B', 'RADAR'], ['C', 'OPTICAL'], ['E', 'RADAR']] as const) {
      const packet = engine.scanSector(sectorId, sensorMode).packet!;
      engine.queuePacket(packet.id);
    }
    const solution = solveMission(engine.getState());
    expect(getNextPlanAction(engine.getState(), solution)?.type).toBe('PROCESS');
  });

  it('replays journal timestamps and coalesced frame ticks without changing state', () => {
    const engine = new MissionEngine();
    engine.dispatch({ type: 'SCAN', sectorId: 'B', sensorMode: 'RADAR' }, 2.5);
    engine.dispatch({ type: 'QUEUE', packetId: engine.getState().packets[0].id }, 4.5);
    engine.dispatch({ type: 'COMMIT' }, 6);
    for (let i = 0; i < 600; i++) engine.dispatch({ type: 'TICK', seconds: 1 / 72 }, 6 + (i + 1) / 72);
    expect(engine.getJournal()).toHaveLength(4);
    expect(replayMission('STANDARD_INDUS_PASS', engine.getJournal()).getStateHash()).toBe(engine.getStateHash());
    expect(engine.getJournal()[0].elapsedSec).toBe(2.5);
    engine.dispatch({ type: 'TICK', seconds: 1 });
    expect(engine.getJournal()).toHaveLength(4);
  });

  it('recovers a best plan from an unnecessary observation by discarding it', () => {
    const engine = new MissionEngine();
    engine.scanSector('A', 'OPTICAL');
    const solution = solveMission(engine.getState());
    expect(solution.actions[0].type).toBe('DISCARD');
    executePlan(engine, solution);
    expect(engine.commitDownlink()!.totalScore).toBe(solution.score);
  });
});
