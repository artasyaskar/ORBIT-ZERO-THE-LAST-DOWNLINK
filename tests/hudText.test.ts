import { describe, expect, it } from 'vitest';
import { MissionEngine } from '../src/mission/missionEngine';
import { missionCardModel, requestStatuses, resultModel, trackerText } from '../src/ui/hudText';

describe('shared HUD text models (desktop + headset)', () => {
  it('mission card lists every request with value and weather, never the sensor answer', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    const card = missionCardModel(engine.getState());
    expect(card.requests).toHaveLength(3);
    expect(card.requests[0].title).toMatch(/SECTOR B .*40 pts/);
    for (const r of card.requests) expect(`${r.title} ${r.meta}`).not.toMatch(/\b(THERMAL|RADAR|OPTICAL|SAR)\b/);
    expect(card.rules).toMatch(/WIN 75\+ pts/);
    expect(card.sensors).toHaveLength(3);
  });

  it('headset card is three plain lines: what, how (laser + pinch), win/lose; no sensor names, no jargon', () => {
    for (const id of ['ORBITAL_ACADEMY', 'FIRELINE_PASS', 'STANDARD_INDUS_PASS', 'AFTERSHOCK_PASS'] as const) {
      const card = missionCardModel(new MissionEngine(id).getState());
      const lines = [card.what, card.how, card.win];
      for (const line of lines) {
        expect(line.length).toBeGreaterThan(20);
        expect(line.length).toBeLessThanOrEqual(110);
        expect(line).not.toMatch(/\b(THERMAL|RADAR|OPTICAL|SAR|STR|Tx|MB|S-Band|SIMULATED TELEMETRY)\b/);
      }
      expect(card.how).toMatch(/laser/i);
      expect(card.how).toMatch(/pinch/i);
    }
    const fireline = missionCardModel(new MissionEngine('FIRELINE_PASS').getState());
    expect(fireline.win).toBe('WIN 75+ pts. Under 40 pts the mission fails. The clock starts at your first scan.');
    expect(missionCardModel(new MissionEngine('ORBITAL_ACADEMY').getState()).win).toMatch(/No clock/);
  });

  it('request statuses follow the cube lifecycle: NEEDED -> ON BOARD -> LOADED -> SENT', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    expect(requestStatuses(engine.getState())[0].status).toBe('NEEDED');
    const b = engine.scanSector('B', 'THERMAL').packet!;
    expect(requestStatuses(engine.getState())[0].status).toBe('ON BOARD');
    engine.queuePacket(b.id);
    expect(requestStatuses(engine.getState())[0].status).toBe('LOADED');
    engine.commitDownlink();
    expect(requestStatuses(engine.getState())[0].status).toBe('SENT');
    expect(trackerText(engine.getState())).toMatch(/B CANYON FIRELINE 40: SENT/);
  });

  it('a probable cube for a CONFIRMED request is flagged WEAK', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    engine.scanSector('B', 'RADAR'); // radar through smoke: PROBABLE only
    expect(requestStatuses(engine.getState())[0].status).toBe('WEAK');
  });

  it('result headline grade always matches the efficiency grade', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    for (const [s, m] of [['B', 'THERMAL'], ['C', 'OPTICAL'], ['E', 'THERMAL']] as const) {
      const p = engine.scanSector(s, m).packet!;
      if (s === 'B') engine.processPacket(p.id);
      engine.queuePacket(p.id);
    }
    const d = engine.commitDownlink()!;
    const r = resultModel(engine.getState())!;
    expect(r.title).toBe(`MISSION SUCCESS | GRADE ${d.efficiencyGrade}`);
    expect(d.summaryHeadline).toContain(`GRADE ${d.efficiencyGrade}`);
    expect(r.score).toMatch(/best possible 100/);
  });
});
