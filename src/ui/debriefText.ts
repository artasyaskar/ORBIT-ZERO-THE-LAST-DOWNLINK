/** Shared debrief presentation helpers (desktop AAR and spatial XR debrief). */

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Shorten text at a sentence or word boundary so panels do not overflow. */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = cut.lastIndexOf('. ');
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 0)).trimEnd() + '...';
}

export type DebriefOutcome = 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';

/** One colour per outcome, used for the banner, border and result headline on every surface. */
export const OUTCOME_COLORS: Record<DebriefOutcome, string> = {
  SUCCESS: '#34d399',
  PARTIAL_SUCCESS: '#f59e0b',
  FAILED: '#ef4444',
};

export const OUTCOME_LABELS: Record<DebriefOutcome, string> = {
  SUCCESS: 'MISSION SUCCESS',
  PARTIAL_SUCCESS: 'PARTIAL SUCCESS',
  FAILED: 'MISSION FAILURE',
};

/** Player-facing titles for the engine's internal failure codes. The codes stay in the report for tests and logs. */
const RETRY_TITLES: Record<string, string> = {
  WRONG_SENSOR_FOR_WEATHER: 'Wrong sensor for the conditions',
  WINDOW_CUTOFF_DROPPED_PACKETS: 'Not everything fit in the downlink window',
  UNPROCESSED_STORAGE_BOTTLENECK: 'Onboard storage filled up',
  INSUFFICIENT_VERIFIED_EVIDENCE: 'Not enough verified evidence',
  PASS_CLOCK_EXPIRED: 'The pass clock ran out',
  MISSION_ABORTED: 'The pass was aborted',
};

export interface RetryGuidance {
  /** Plain-language headline, never an internal identifier. */
  title: string;
  /** Engine explanation without its all-caps label, so the sensor and sector named by the mission survive. */
  body: string;
}

/** Turns a debrief's failure code and explanation into text a player can act on. Returns null when nothing went wrong. */
export function describeRetryGuidance(
  code: string | undefined,
  explanation: string | undefined,
  fallback: string,
): RetryGuidance | null {
  if (code === 'NONE') return null;
  const title = (code && RETRY_TITLES[code]) || 'Review what reached Earth';
  const source = explanation && explanation.length > 0 ? explanation : fallback;
  const body = source.replace(/^[A-Z][A-Z0-9 \-/]{3,}:\s*/, '');
  return { title, body };
}

/** Guidance for a finished pass, or null for a clean success. Uses the debrief's own recommendation as the fallback text. */
export function retryGuidanceFor(
  d: { failureReasonCode?: string; failureExplanation?: string; deterministicRecommendation: string },
): RetryGuidance | null {
  return describeRetryGuidance(d.failureReasonCode ?? 'INSUFFICIENT_VERIFIED_EVIDENCE', d.failureExplanation, d.deterministicRecommendation);
}

export function requestStatusChip(status: 'VERIFIED' | 'PARTIAL' | 'UNVERIFIED'): { label: string; color: string } {
  if (status === 'VERIFIED') return { label: 'VERIFIED', color: '#34d399' };
  if (status === 'PARTIAL') return { label: 'PARTIAL', color: '#f59e0b' };
  return { label: 'MISSED', color: '#ef4444' };
}
