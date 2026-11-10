/** Shared debrief presentation helpers (desktop AAR and spatial XR debrief). */

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Science text for a headset panel: drops the data's "Simulated gameplay value (NN% confidence):" prefix (the
 * panel already says "NN% sure (simulated)") and bracketed remote-sensing symbols such as "(tau_3.9 = 0.18)"
 * or "(PM2.5 particle radius ...)" that a player cannot use.
 */
export function plainScience(text: string): string {
  return text
    .replace(/^Simulated gameplay value \([^)]*\):\s*/i, '')
    .replace(/\s*\([^()]*(?:tau|PM2\.5|GSD)[^()]*\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
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

/** Outcome words come from one place (src/mission/resultLabels.ts) for every surface. */
export { OUTCOME_LABELS } from '../mission/resultLabels';

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

/** Crisp plain-language bottleneck tag derived strictly from the mission outcome and live telemetry. */
export function bottleneckCauseTag(d: {
  outcome?: DebriefOutcome;
  failureReasonCode?: string;
  droppedPacketIds?: string[];
  powerRemaining?: number;
}): string {
  if (d.outcome === 'SUCCESS') return 'All priority evidence delivered within link budget';
  const code = d.failureReasonCode ?? 'INSUFFICIENT_VERIFIED_EVIDENCE';
  if (code === 'WINDOW_CUTOFF_DROPPED_PACKETS') {
    const cut = d.droppedPacketIds?.length ?? 0;
    return cut > 0 ? `Window cutoff (${cut} uncompressed cube${cut === 1 ? '' : 's'} dropped)` : 'Window cutoff before downlink finished';
  }
  if (code === 'WRONG_SENSOR_FOR_WEATHER') return 'Cloud or smoke blocked optical scan';
  if (code === 'UNPROCESSED_STORAGE_BOTTLENECK') return 'Memory tray filled with large raw cubes';
  if (code === 'PASS_CLOCK_EXPIRED') return 'Pass clock expired before launch';
  if (code === 'MISSION_ABORTED') return 'Pass aborted early';
  if ((d.powerRemaining ?? 99) < 8) return `Battery too low (${d.powerRemaining ?? 0} Wh remaining)`;
  return 'Not enough verified requests sent';
}

export function requestStatusChip(status: 'VERIFIED' | 'PARTIAL' | 'UNVERIFIED'): { label: string; color: string } {
  if (status === 'VERIFIED') return { label: 'VERIFIED', color: '#34d399' };
  if (status === 'PARTIAL') return { label: 'PARTIAL', color: '#f59e0b' };
  return { label: 'MISSED', color: '#ef4444' };
}

/** Deterministic compact code generated strictly from real end-of-pass telemetry (zero server dependency). */
export function formatRunCode(
  state: {
    scenarioId: string;
    debrief: {
      totalScore: number;
      efficiencyGrade: string;
    } | null;
  },
  custom?: { operationCode?: string } | null,
  dailyDate?: string | null,
): string {
  const d = state.debrief;
  const tag = dailyDate
    ? `DAILY-${dailyDate.replace(/-/g, '')}`
    : (custom?.operationCode ?? state.scenarioId)
        .replace(/[^A-Za-z0-9]+/g, '')
        .slice(0, 8)
        .toUpperCase();
  const scorePart = d ? `${d.totalScore}${d.efficiencyGrade}` : 'PASS';
  return `OZ-${tag}-${scorePart}`;
}

/** Shareable monospace/plain-text run card reflecting only verified DebriefReport metrics. */
export function formatShareCard(
  state: {
    scenarioId: string;
    debrief: {
      totalScore: number;
      achievableScore: number;
      efficiencyGrade: string;
      transmittedPacketIds: string[];
      droppedPacketIds: string[];
      downlinkUsedSec: number;
      downlinkWindowSec: number;
      powerRemaining: number;
      evaluations: ReadonlyArray<{ status: 'VERIFIED' | 'PARTIAL' | 'UNVERIFIED' }>;
    } | null;
  },
  dailyStreak: number,
  custom?: { operationCode?: string; name?: string } | null,
  dailyDate?: string | null,
): string {
  const d = state.debrief;
  if (!d) return 'ORBIT ZERO — Pass in progress';
  const code = formatRunCode(state, custom, dailyDate);
  const marks = d.evaluations.map((e) => (e.status === 'VERIFIED' ? '[OK]' : e.status === 'PARTIAL' ? '[~]' : '[X]')).join(' ');
  const label = dailyDate ? `DAILY ${dailyDate}` : (custom?.name ?? state.scenarioId);
  const streakPart = dailyDate || dailyStreak > 0 ? ` | Streak ${dailyStreak}d` : '';
  return `ORBIT ZERO | ${label} | ${d.totalScore}/${d.achievableScore} (Grade ${d.efficiencyGrade}) | ${marks} | ${d.downlinkUsedSec.toFixed(1)}/${d.downlinkWindowSec.toFixed(1)}s | ${d.powerRemaining} Wh left${streakPart} | ${code}`;
}
