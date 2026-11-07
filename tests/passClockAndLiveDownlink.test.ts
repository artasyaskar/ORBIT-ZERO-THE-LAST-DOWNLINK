import { describe, expect, it } from 'vitest';
import { MISSION_SCENARIOS, SCORING } from '../src/mission/missionConfig';
import { MissionEngine, replayMission } from '../src/mission/missionEngine';
import { describeHint, getNextStep, isPassStalled } from '../src/mission/guidance';
import { getMissionBenchmark, solveMission } from '../src/mission/missionPlanner';

describe('Orbital pass clock', () => {
  it('starts at the first scan and is untimed before it', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    expect(engine.getState().passRemainingSec).toBe(MISSION_SCENARIOS.FIRELINE_PASS.passDurationSec);
    engine.dispatch({ type: 'TICK', seconds: 30 });
    expect(engine.getState().passRemainingSec).toBe(150);
    engine.scanSector('B', 'THERMAL');
    engine.dispatch({ type: 'TICK', seconds: 30 });
    expect(engine.getState().passRemainingSec).toBe(120);
  });

  it('opens the window automatically when the clock expires and fails if nothing is usable', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    const blocked = engine.scanSector('B', 'OPTICAL').packet!; // smoke blinds optical
    expect(blocked.confidence).toBe('UNVERIFIED');
    engine.dispatch({ type: 'TICK', seconds: 151 });
    const s = engine.getState();
    expect(s.phase).toBe('DEBRIEF');
    expect(s.debrief!.outcome).toBe('FAILED');
    expect(s.debrief!.failureReasonCode).toBe('PASS_CLOCK_EXPIRED');
  });

  it('auto-opens the live window with staged cubes when the clock runs out', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    const b = engine.scanSector('B', 'THERMAL').packet!;
    engine.queuePacket(b.id);
    engine.dispatch({ type: 'TICK', seconds: 200 });
    expect(engine.getState().phase).toBe('DOWNLINK');
    expect(engine.getState().endReason).toBe('CLOCK_EXPIRED');
  });

  it('relaxed mode removes the clock', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    engine.setRelaxedMode(true);
    engine.scanSector('B', 'THERMAL');
    engine.dispatch({ type: 'TICK', seconds: 500 });
    expect(engine.getState().phase).toBe('OPERATIONS');
    expect(engine.getState().passRemainingSec).toBeNull();
  });

  it('replays deterministically including pass-clock ticks', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    engine.dispatch({ type: 'SCAN', sectorId: 'B', sensorMode: 'THERMAL' });
    engine.dispatch({ type: 'TICK', seconds: 12.5 });
    engine.dispatch({ type: 'SCAN', sectorId: 'C', sensorMode: 'OPTICAL' });
    engine.dispatch({ type: 'TICK', seconds: 3 });
    expect(replayMission('FIRELINE_PASS', engine.getJournal()).getStateHash()).toBe(engine.getStateHash());
  });
});

describe('Live downlink docking', () => {
  it('lets a late cube be docked during the window, starting no earlier than its dock time', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    const b = engine.scanSector('B', 'THERMAL').packet!;
    const c = engine.scanSector('C', 'OPTICAL').packet!;
    engine.processPacket(b.id); // 1.8s
    engine.queuePacket(b.id);
    expect(engine.startDownlink().ok).toBe(true);
    engine.tickDownlink(3.0); // B finished at 1.8s, link idle since then
    expect(engine.getState().phase).toBe('DOWNLINK'); // C still dockable
    const dock = engine.queuePacket(c.id);
    expect(dock.ok).toBe(true);
    expect(engine.getState().packets.find((p) => p.id === c.id)!.txStartSec).toBe(3.0);
    engine.tickDownlink(4.0); // C runs 3.0 -> 7.0
    const d = engine.getState().debrief!;
    expect(d.transmittedPacketIds).toEqual([b.id, c.id]);
  });

  it('idle time can push a late cube past loss of signal', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    const b = engine.scanSector('B', 'THERMAL').packet!;
    const e = engine.scanSector('E', 'THERMAL').packet!;
    engine.queuePacket(b.id); // 4.2s
    engine.startDownlink();
    engine.tickDownlink(7.0);
    engine.queuePacket(e.id); // starts at 7.0, needs 4.2s -> 11.2 > 10.0
    engine.tickDownlink(5);
    const d = engine.getState().debrief!;
    expect(d.droppedPacketIds).toEqual([e.id]);
  });

  it('CLOSE_LINK finishes docked packets and ends the pass early', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    const b = engine.scanSector('B', 'THERMAL').packet!;
    engine.scanSector('C', 'OPTICAL');
    engine.queuePacket(b.id);
    engine.startDownlink();
    engine.tickDownlink(0.5);
    expect(engine.dispatch({ type: 'CLOSE_LINK' })).toMatchObject({ ok: true });
    expect(engine.getState().phase).toBe('DEBRIEF');
    expect(engine.getState().debrief!.transmittedPacketIds).toEqual([b.id]);
  });
});

describe('Abort, stall and hints', () => {
  it('detects a stalled pass and lets the player abort it', () => {
    const engine = new MissionEngine('STANDARD_INDUS_PASS');
    for (let i = 0; i < 3; i++) {
      const p = engine.scanSector('B', 'RADAR').packet!;
      engine.discardPacket(p.id);
    }
    const o = engine.scanSector('A', 'OPTICAL').packet!;
    engine.discardPacket(o.id);
    expect(engine.getState().power).toBe(5);
    expect(isPassStalled(engine.getState())).toBe(true);
    expect(getNextStep(engine.getState()).title).toBe('NO WAY TO FINISH');
    engine.dispatch({ type: 'ABORT' });
    const d = engine.getState().debrief!;
    expect(d.outcome).toBe('FAILED');
    expect(d.failureReasonCode).toBe('MISSION_ABORTED');
  });

  it('each hint costs points and blocks grade S', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    const plan = getMissionBenchmark('FIRELINE_PASS');
    expect(describeHint(engine.getState(), plan)).toMatch(/scan Sector [BCE]/);
    engine.dispatch({ type: 'USE_HINT' });
    for (const action of plan.actions) {
      if (action.type === 'SCAN') engine.dispatch(action);
      else {
        const pkt = engine.getState().packets.find((p) => p.sectorId === action.sectorId && p.sensorMode === action.sensorMode)!;
        engine.dispatch({ type: action.type, packetId: pkt.id });
      }
    }
    const d = engine.commitDownlink()!;
    expect(d.totalScore).toBe(plan.score - SCORING.hintPenalty);
    expect(d.efficiencyGrade).not.toBe('S');
    expect(d.hintsUsed).toBe(1);
  });

  it('rejects sensors that are not fitted on the pass', () => {
    const engine = new MissionEngine('STANDARD_INDUS_PASS');
    expect(engine.scanSector('B', 'THERMAL').code).toBe('INVALID_SENSOR');
  });
});

describe('Weighted triage balance', () => {
  it('Aftershock cannot confirm all three requests, and at least two strategies win', () => {
    const plan = getMissionBenchmark('AFTERSHOCK_PASS');
    expect(plan.score).toBe(70);
    expect(plan.score).toBeLessThan(100);
    const success = MISSION_SCENARIOS.AFTERSHOCK_PASS.successScore!;
    // Strategy 1: dam + hospital
    const a = new MissionEngine('AFTERSHOCK_PASS');
    const aB = a.scanSector('B', 'RADAR').packet!;
    const aC = a.scanSector('C', 'OPTICAL').packet!;
    a.queuePacket(aB.id); a.queuePacket(aC.id);
    expect(a.commitDownlink()!.totalScore).toBeGreaterThanOrEqual(success);
    // Strategy 2: dam + substation
    const b = new MissionEngine('AFTERSHOCK_PASS');
    const bB = b.scanSector('B', 'RADAR').packet!;
    const bE = b.scanSector('E', 'THERMAL').packet!;
    b.queuePacket(bB.id); b.queuePacket(bE.id);
    expect(b.commitDownlink()!.outcome).toBe('SUCCESS');
    // Losing strategy: skip the dam
    const c = new MissionEngine('AFTERSHOCK_PASS');
    const cC = c.scanSector('C', 'OPTICAL').packet!;
    const cE = c.scanSector('E', 'THERMAL').packet!;
    c.queuePacket(cC.id); c.queuePacket(cE.id);
    expect(c.commitDownlink()!.outcome).not.toBe('SUCCESS');
  });

  it('Fireline values the canyon road and the depot above the viaduct', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    const s = solveMission(engine.getState());
    expect(s.score).toBe(100);
    const partial = new MissionEngine('FIRELINE_PASS');
    const b = partial.scanSector('B', 'THERMAL').packet!;
    const e = partial.scanSector('E', 'THERMAL').packet!;
    partial.queuePacket(b.id); partial.queuePacket(e.id);
    const d = partial.commitDownlink()!;
    expect(d.totalScore).toBe(75);
    expect(d.outcome).toBe('SUCCESS');
  });

  it('never reveals the sensor answer in the Next Step text', () => {
    for (const id of ['FIRELINE_PASS', 'STANDARD_INDUS_PASS', 'AFTERSHOCK_PASS'] as const) {
      const engine = new MissionEngine(id);
      const step = getNextStep(engine.getState());
      expect(`${step.title} ${step.body}`).not.toMatch(/\b(RADAR|THERMAL|OPTICAL|SAR)\b/i);
    }
  });
});
