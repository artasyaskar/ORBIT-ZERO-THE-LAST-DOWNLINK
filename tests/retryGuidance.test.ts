import { describe, expect, it } from 'vitest';
import { MissionEngine } from '../src/mission/missionEngine';
import { retryGuidanceFor } from '../src/ui/debriefText';

/** Player-facing retry guidance must be readable, keep the mission's own sensor advice, and hide internal codes. */
describe('Retry guidance presentation', () => {
  it('turns a weather mismatch into plain language that still names the required sensor', () => {
    const engine = new MissionEngine('STANDARD_INDUS_PASS');
    engine.queuePacket(engine.scanSector('B', 'OPTICAL').packet!.id);
    const debrief = engine.commitDownlink()!;
    const g = retryGuidanceFor(debrief)!;
    expect(g.title).toBe('Wrong sensor for the conditions');
    expect(g.body).toContain('RADAR is required there');
    expect(g.body).not.toMatch(/SENSOR-ATMOSPHERE MISMATCH/);
    expect(`${g.title} ${g.body}`).not.toMatch(/[A-Z]{3,}_[A-Z_]{3,}/);
    // Internal code is preserved for tests and logs.
    expect(debrief.failureReasonCode).toBe('WRONG_SENSOR_FOR_WEATHER');
  });

  it('gives every failure code a readable title and no raw identifier', () => {
    for (const code of [
      'WRONG_SENSOR_FOR_WEATHER',
      'WINDOW_CUTOFF_DROPPED_PACKETS',
      'UNPROCESSED_STORAGE_BOTTLENECK',
      'INSUFFICIENT_VERIFIED_EVIDENCE',
    ]) {
      const g = retryGuidanceFor({ failureReasonCode: code, failureExplanation: 'LABEL: Do the thing.', deterministicRecommendation: 'x' })!;
      expect(g.title).not.toMatch(/_/);
      expect(g.body).toBe('Do the thing.');
    }
  });

  it('returns nothing when the code is NONE', () => {
    expect(retryGuidanceFor({ failureReasonCode: 'NONE', deterministicRecommendation: 'x' })).toBeNull();
  });
});
