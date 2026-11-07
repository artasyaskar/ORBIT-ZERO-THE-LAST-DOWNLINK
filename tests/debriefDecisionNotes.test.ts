import { describe, expect, it } from 'vitest';
import { MissionEngine } from '../src/mission/missionEngine';

/**
 * Debrief decision notes explain what the player's own sensor / staging choices meant for each
 * ground request. They must be deterministic, tied to the packets actually transmitted, and
 * must not leak Fireline-specific wording into other operations.
 */
describe('Debrief decision notes', () => {
  it('names the wrong sensor and the required one for the mission that was actually flown', () => {
    const engine = new MissionEngine('STANDARD_INDUS_PASS');
    const wrong = engine.scanSector('B', 'OPTICAL').packet!;
    expect(wrong.confidence).toBe('UNVERIFIED');
    engine.queuePacket(wrong.id);
    const debrief = engine.commitDownlink()!;
    expect(debrief.failureReasonCode).toBe('WRONG_SENSOR_FOR_WEATHER');
    expect(debrief.failureExplanation).toContain('Sector B OPTICAL returned no usable evidence; RADAR is required there.');
    // Monsoon debrief must not tell the player to hunt wildfire hotspots.
    expect(debrief.failureExplanation).not.toMatch(/wildfire/i);

    const sectorBEval = debrief.evaluations.find((ev) => ev.matchedSectorId === 'B')!;
    expect(sectorBEval.decisionNote).toMatch(/OPTICAL returned no usable evidence/);
    expect(sectorBEval.decisionNote).toMatch(/RADAR reaches/);
  });

  it('distinguishes evidence captured but never transmitted from a sector never observed', () => {
    const engine = new MissionEngine('STANDARD_INDUS_PASS');
    const good = engine.scanSector('B', 'RADAR').packet!;
    expect(good.confidence).not.toBe('UNVERIFIED');
    // Captured, but deliberately left out of the downlink queue.
    const other = engine.scanSector('C', 'OPTICAL').packet!;
    engine.queuePacket(other.id);
    const debrief = engine.commitDownlink()!;
    const notes = debrief.evaluations.map((ev) => ev.decisionNote ?? '');
    expect(notes.some((n) => /captured but never reached the ground/.test(n))).toBe(true);
    expect(notes.some((n) => /was never observed/.test(n))).toBe(true);
  });

  it('records a valid alternative strategy when a non-preferred sensor still meets the threshold', () => {
    // Run every sensor on each Fireline sector and look for a verified-but-not-recommended case.
    const engine = new MissionEngine('FIRELINE_PASS');
    const b = engine.scanSector('B', 'THERMAL').packet!;
    const c = engine.scanSector('C', 'OPTICAL').packet!;
    const e = engine.scanSector('E', 'THERMAL').packet!;
    for (const id of [b.id, c.id, e.id]) engine.processPacket(id);
    for (const id of [b.id, c.id, e.id]) engine.queuePacket(id);
    const debrief = engine.commitDownlink()!;
    const processedNote = debrief.evaluations.map((ev) => ev.decisionNote ?? '').join(' ');
    expect(processedNote).toMatch(/Compression kept extracted features only; it added no certainty/);
  });

  it('is deterministic for identical decisions', () => {
    const run = () => {
      const engine = new MissionEngine('AFTERSHOCK_PASS');
      const p = engine.scanSector('B', 'OPTICAL').packet!;
      engine.queuePacket(p.id);
      return engine.commitDownlink()!.evaluations.map((ev) => ev.decisionNote);
    };
    expect(run()).toEqual(run());
  });
  it('keeps every note short enough for the 430 px spatial debrief panel (3 lines of ~60 chars)', () => {
    const lengths: number[] = [];
    for (const scenario of ['FIRELINE_PASS', 'STANDARD_INDUS_PASS', 'AFTERSHOCK_PASS', 'MONSOON_SUPERCELL_PASS', 'SOLAR_BROWNOUT_PASS'] as const) {
      const variants: Array<(e: MissionEngine) => void> = [
        () => undefined, // nothing observed
        (e) => { const p = e.scanSector('B', 'OPTICAL').packet!; e.queuePacket(p.id); },
        (e) => { const p = e.scanSector('B', 'RADAR').packet!; e.processPacket(p.id); e.queuePacket(p.id); },
        (e) => { e.scanSector('C', 'THERMAL'); },
      ];
      for (const play of variants) {
        const engine = new MissionEngine(scenario);
        play(engine);
        const debrief = engine.commitDownlink();
        for (const ev of debrief?.evaluations ?? []) {
          if (ev.decisionNote) lengths.push(ev.decisionNote.length);
        }
      }
    }
    expect(lengths.length).toBeGreaterThan(10);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(190);
  });});
