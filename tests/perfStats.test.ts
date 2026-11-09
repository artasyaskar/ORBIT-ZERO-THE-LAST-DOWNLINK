import { describe, expect, it } from 'vitest';
import { FrameRing, QualityGovernor, summarizeFrames } from '../src/systems/perfStats';

describe('summarizeFrames', () => {
  it('reports average fps, 1% low and frame-time percentiles', () => {
    // 99 frames at 72 Hz and one 50 ms hitch.
    const frames = [...Array(99).fill(1000 / 72), 50];
    const s = summarizeFrames(frames);
    expect(s.frames).toBe(100);
    expect(s.fpsAvg).toBeCloseTo(100000 / (99 * (1000 / 72) + 50), 6);
    expect(s.fpsLow1).toBeCloseTo(20, 6); // the slowest 1% (one frame) ran at 50 ms
    expect(s.frameMsMax).toBe(50);
    expect(s.frameMsP99).toBeCloseTo(1000 / 72, 6);
  });

  it('ignores empty, zero and non-finite samples', () => {
    expect(summarizeFrames([]).frames).toBe(0);
    expect(summarizeFrames([0, -1, Number.NaN, Number.POSITIVE_INFINITY]).fpsAvg).toBe(0);
    expect(summarizeFrames([10, Number.NaN]).fpsAvg).toBeCloseTo(100, 6);
  });
});

describe('FrameRing', () => {
  it('keeps the newest samples in order once full', () => {
    const ring = new FrameRing(3);
    for (const v of [1, 2, 3, 4, 5]) ring.push(v);
    expect(ring.size).toBe(3);
    expect(ring.values()).toEqual([3, 4, 5]);
    expect(ring.values(2)).toEqual([4, 5]);
    ring.clear();
    expect(ring.values()).toEqual([]);
  });
});

describe('QualityGovernor', () => {
  it('asks for the next lower supported refresh rate after a sustained slowdown, once', () => {
    const g = new QualityGovernor({ slowRatio: 0.9, slowForSec: 4, baseHz: 72 });
    expect(g.evaluate(70, 90, [72, 90, 120], 1)).toEqual({ type: 'none' });
    expect(g.evaluate(70, 90, [72, 90, 120], 1)).toEqual({ type: 'none' });
    expect(g.evaluate(70, 90, [72, 90, 120], 1)).toEqual({ type: 'none' });
    expect(g.evaluate(70, 90, [72, 90, 120], 1)).toEqual({ type: 'lower-refresh', toHz: 72 });
    // Never again in the same session.
    for (let i = 0; i < 10; i++) expect(g.evaluate(40, 72, [72, 90], 1)).toEqual({ type: 'none' });
  });

  it('resets the slow timer when a good second arrives, and never goes below the budget rate', () => {
    const g = new QualityGovernor({ slowRatio: 0.9, slowForSec: 3, baseHz: 72 });
    g.evaluate(60, 90, [72, 90], 1);
    g.evaluate(60, 90, [72, 90], 1);
    expect(g.evaluate(89, 90, [72, 90], 1)).toEqual({ type: 'none' });
    g.evaluate(60, 90, [72, 90], 1);
    g.evaluate(60, 90, [72, 90], 1);
    expect(g.evaluate(60, 90, [72, 90], 1)).toEqual({ type: 'lower-refresh', toHz: 72 });
    const atBase = new QualityGovernor({ slowRatio: 0.9, slowForSec: 1, baseHz: 72 });
    expect(atBase.evaluate(50, 72, [60, 72], 1)).toEqual({ type: 'none' });
  });

  it('reduces the next session only when the whole session averaged below 90% of 72 Hz', () => {
    expect(QualityGovernor.nextSessionReduced(71)).toBe(false);
    expect(QualityGovernor.nextSessionReduced(64)).toBe(true);
    expect(QualityGovernor.nextSessionReduced(0)).toBe(false);
  });
});
