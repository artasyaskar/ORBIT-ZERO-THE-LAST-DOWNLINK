import { describe, expect, it } from 'vitest';
import { AgenticCoPilot } from '../src/systems/agenticCoPilot';
import { MissionEngine } from '../src/mission/missionEngine';
import type { MissionAction } from '../src/mission/types';

describe('Deep Agentic Systems Integration (AgenticCoPilot)', () => {
  it('detects player hesitation after 5 seconds of idle during crisis', () => {
    const engine = new MissionEngine();
    let cuePlayed = '';
    const coPilot = new AgenticCoPilot({
      getState: () => engine.getState(),
      applyAction: (action) => {
        const res = engine.dispatch(action);
        return 'ok' in res ? res : { ok: true, message: 'Dispatched' };
      },
      playCue: (cue) => { cuePlayed = cue; },
    });

    // Initial state: not idle yet
    expect(coPilot.update(1.0)).toBeNull();
    expect(coPilot.update(2.0)).toBeNull();

    // After 5+ seconds total idle:
    const intervention = coPilot.update(3.0); // total 6.0s
    expect(intervention).not.toBeNull();
    expect(intervention?.reasonCode).toBe('HESITATION');
    expect(intervention?.recommendedAction).toBeDefined();
  });

  it('detects sensor mismatch when scanning dense clouds with optical', () => {
    const engine = new MissionEngine();
    engine.selectSector('B');
    engine.setSensorMode('OPTICAL');

    const coPilot = new AgenticCoPilot({
      getState: () => engine.getState(),
      applyAction: (action) => {
        const res = engine.dispatch(action);
        if ('ok' in res) return { ok: res.ok, message: res.message };
        return { ok: true, message: 'Action dispatched' };
      },
    });

    const intervention = coPilot.update(0.1);
    expect(intervention).not.toBeNull();
    expect(intervention?.reasonCode).toBe('SENSOR_MISMATCH');
    expect(intervention?.recommendedAction).toEqual({ type: 'SET_SENSOR', sensorMode: 'RADAR' });
  });

  it('executes delegated tactical action when operator pinches/delegates', () => {
    const engine = new MissionEngine();
    let cuePlayed = '';
    const coPilot = new AgenticCoPilot({
      getState: () => engine.getState(),
      applyAction: (action) => {
        const res = engine.dispatch(action);
        if ('ok' in res) return { ok: res.ok, message: res.message };
        return { ok: true, message: 'Action dispatched' };
      },
      playCue: (cue) => { cuePlayed = cue; },
    });

    // Advance time to trigger hesitation intervention
    coPilot.update(6.0);
    const active = coPilot.getActiveIntervention();
    expect(active).not.toBeNull();

    // Execute delegation
    const result = coPilot.executeActiveIntervention();
    expect(result.ok).toBe(true);
    expect(coPilot.getTotalDelegations()).toBe(1);
    expect(cuePlayed).toBe('PROCESS_SUCCESS');
    expect(coPilot.getActiveIntervention()).toBeNull();
  });
});
