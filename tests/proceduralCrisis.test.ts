import { describe, expect, it } from 'vitest';
import { generateProceduralCrisis, hashSeed } from '../src/mission/proceduralCrisis';

describe('Procedural Crisis & Replay Engine', () => {
  it('produces identical crisis scenarios for the same seed (determinism)', () => {
    const pass1 = generateProceduralCrisis(421337);
    const pass2 = generateProceduralCrisis(421337);

    expect(pass1.seed).toBe(pass2.seed);
    expect(pass1.threat.name).toBe(pass2.threat.name);
    expect(pass1.threat.category).toBe(pass2.threat.category);
    expect(pass1.config.budget.initialPower).toBe(pass2.config.budget.initialPower);
    expect(pass1.config.budget.downlinkDurationSec).toBe(pass2.config.budget.downlinkDurationSec);
  });

  it('produces varying threat vectors and budgets across different seeds', () => {
    const seeds = [101, 202, 303, 404, 505];
    const names = new Set(seeds.map((s) => generateProceduralCrisis(s).threat.name));
    expect(names.size).toBe(seeds.length);
  });

  it('guarantees fair mathematical budgets for S-Rank solvability', () => {
    for (let s = 1; s <= 20; s++) {
      const crisis = generateProceduralCrisis(s * 7919);
      // Power must be sufficient for 3 scans + 2 compressions (48 Wh minimum)
      expect(crisis.config.budget.initialPower).toBeGreaterThanOrEqual(50);
      expect(crisis.config.budget.initialPower).toBeLessThanOrEqual(58);
      // Downlink must be at least 9.0s (sufficient for 1.8 + 4.0 + 1.8 = 7.6s)
      expect(crisis.config.budget.downlinkDurationSec).toBeGreaterThanOrEqual(9.0);
      expect(crisis.config.budget.downlinkDurationSec).toBeLessThanOrEqual(11.0);
    }
  });

  it('hashes string seeds correctly', () => {
    const h1 = hashSeed('META_VR_START_2026');
    const h2 = hashSeed('META_VR_START_2026');
    const h3 = hashSeed('QUEST_3_HORIZON');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });
});

