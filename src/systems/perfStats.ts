/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Pure frame-time statistics and the adaptive-quality policy (no three.js, no DOM), so both are unit-tested.
 */

export interface FrameSummary {
  frames: number;
  /** Average frames per second over the window (frames / total time). */
  fpsAvg: number;
  /** "1% low": the frame rate of the slowest 1% of frames (fps of their average frame time). */
  fpsLow1: number;
  frameMsAvg: number;
  frameMsP99: number;
  frameMsMax: number;
}

/** Summarizes frame durations in milliseconds. Non-finite or non-positive samples are ignored. */
export function summarizeFrames(durationsMs: readonly number[]): FrameSummary {
  const samples = durationsMs.filter((d) => Number.isFinite(d) && d > 0);
  if (samples.length === 0) return { frames: 0, fpsAvg: 0, fpsLow1: 0, frameMsAvg: 0, frameMsP99: 0, frameMsMax: 0 };
  const total = samples.reduce((a, b) => a + b, 0);
  const sorted = [...samples].sort((a, b) => a - b);
  const worstCount = Math.max(1, Math.ceil(sorted.length * 0.01));
  const worst = sorted.slice(sorted.length - worstCount);
  const worstAvg = worst.reduce((a, b) => a + b, 0) / worst.length;
  const p99 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1)];
  return {
    frames: samples.length,
    fpsAvg: (samples.length * 1000) / total,
    fpsLow1: 1000 / worstAvg,
    frameMsAvg: total / samples.length,
    frameMsP99: p99,
    frameMsMax: sorted[sorted.length - 1],
  };
}

/** Fixed-size ring of frame durations (no per-frame allocation). */
export class FrameRing {
  private readonly data: Float64Array;
  private next = 0;
  private filled = 0;

  constructor(readonly capacity: number) {
    this.data = new Float64Array(capacity);
  }

  push(ms: number): void {
    this.data[this.next] = ms;
    this.next = (this.next + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled++;
  }

  get size(): number {
    return this.filled;
  }

  /** The newest `count` samples (or all), oldest first. Allocates: call it a few times per second at most. */
  values(count = this.filled): number[] {
    const n = Math.min(count, this.filled);
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) out[i] = this.data[(this.next - n + i + this.capacity) % this.capacity];
    return out;
  }

  clear(): void {
    this.next = 0;
    this.filled = 0;
  }
}

/**
 * Adaptive quality policy for one XR session.
 * - Step 1 (in session): if the frame rate stays below `slowRatio` of the display rate for `slowForSec`, ask the
 *   headset for the next lower supported refresh rate (e.g. 90 -> 72 Hz). Steady 72 beats a judder at 90.
 * - Step 2 (next session): if the session still averaged below `slowRatio` of 72 Hz, the next session starts at
 *   a lower render resolution (three.js only takes a framebuffer scale before the session starts).
 * The governor never raises quality inside a session, so it cannot oscillate.
 */
export interface GovernorOptions {
  slowRatio: number;
  slowForSec: number;
  /** Refresh rate the game is budgeted for. */
  baseHz: number;
}

export const DEFAULT_GOVERNOR: GovernorOptions = { slowRatio: 0.9, slowForSec: 4, baseHz: 72 };

export type GovernorAction = { type: 'none' } | { type: 'lower-refresh'; toHz: number };

export class QualityGovernor {
  private slowSec = 0;
  private lowered = false;

  constructor(private readonly options: GovernorOptions = DEFAULT_GOVERNOR) {}

  /**
   * Feed once per evaluation step: the measured fps over the last step, the current display rate and the
   * rates the session supports. Returns the action to take now.
   */
  evaluate(measuredFps: number, displayHz: number, supportedHz: readonly number[], stepSec: number): GovernorAction {
    if (this.lowered || displayHz <= 0) return { type: 'none' };
    const slow = measuredFps < displayHz * this.options.slowRatio;
    this.slowSec = slow ? this.slowSec + stepSec : 0;
    if (this.slowSec < this.options.slowForSec) return { type: 'none' };
    const lower = [...supportedHz].filter((hz) => hz < displayHz && hz >= this.options.baseHz).sort((a, b) => b - a)[0];
    this.slowSec = 0;
    if (lower === undefined) return { type: 'none' };
    this.lowered = true;
    return { type: 'lower-refresh', toHz: lower };
  }

  /** Whether a whole session's average says the next session should render at reduced resolution. */
  static nextSessionReduced(sessionFpsAvg: number, options: GovernorOptions = DEFAULT_GOVERNOR): boolean {
    return sessionFpsAvg > 0 && sessionFpsAvg < options.baseHz * options.slowRatio;
  }
}

/** Render resolution scale for a session that starts after a slow one (1 = native). */
export const REDUCED_FRAMEBUFFER_SCALE = 0.8;
