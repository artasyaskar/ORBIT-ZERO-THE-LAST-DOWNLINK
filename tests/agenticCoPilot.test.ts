import { describe, expect, it } from 'vitest';
import { AgenticCoPilot } from '../src/systems/agenticCoPilot';
import { MissionEngine } from '../src/mission/missionEngine';
import { SCORING } from '../src/mission/missionConfig';

function makeCoPilot(engine: MissionEngine, onCue?: (cue: string) => void) {
  return new AgenticCoPilot({
    getState: () => engine.getState(),
    applyAction: (action) => {
      const res = engine.dispatch(action);
      return 'ok' in res ? { ok: res.ok, message: res.message } : { ok: res.lastActionOk, message: res.lastStatusMessage };
    },
    playCue: onCue,
  });
}

describe('ARIA-7 co-pilot (hint-on-request, never plays for you)', () => {
  it('offers a hint after the operator hesitates', () => {
    const engine = new MissionEngine();
    const coPilot = makeCoPilot(engine);
    expect(coPilot.update(5.0)).toBeNull();
    const intervention = coPilot.update(8.0);
    expect(intervention?.reasonCode).toBe('HESITATION');
    expect(intervention?.recommendedAction).toEqual({ type: 'USE_HINT' });
  });

  it('does not volunteer the correct sensor when optical is aimed at storm clouds', () => {
    const engine = new MissionEngine();
    engine.selectSector('B');
    engine.setSensorMode('OPTICAL');
    const coPilot = makeCoPilot(engine);
    expect(coPilot.update(0.1)).toBeNull();
  });

  it('a requested hint names the next best move, costs points and does not change the mission', () => {
    const engine = new MissionEngine();
    let cue = '';
    const coPilot = makeCoPilot(engine, (c) => { cue = c; });
    const before = engine.getState();
    const result = coPilot.executeActiveIntervention();
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/scan Sector [BCE] with (Radar|Optical)/);
    expect(result.message).toContain(`-${SCORING.hintPenalty} pts`);
    const after = engine.getState();
    expect(after.hintsUsed).toBe(1);
    expect(after.packets).toHaveLength(before.packets.length);
    expect(after.power).toBe(before.power);
    expect(coPilot.getTotalDelegations()).toBe(1);
    expect(cue).toBe('PROCESS_SUCCESS');
  });

  it('warns about an overflowing bay without naming a sensor', () => {
    const engine = new MissionEngine();
    for (const [s, m] of [['B', 'RADAR'], ['C', 'OPTICAL'], ['E', 'RADAR']] as const) {
      engine.queuePacket(engine.scanSector(s, m).packet!.id);
    }
    const intervention = makeCoPilot(engine).update(0.1);
    expect(intervention?.reasonCode).toBe('QUEUE_OVERFLOW');
    expect(intervention?.detailedAdvice).not.toMatch(/RADAR|OPTICAL|THERMAL|SAR/);
  });
});
