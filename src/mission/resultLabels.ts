/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * One vocabulary for results, used by every surface (Mission HUD, debrief panel, desktop banner, share
 * card, voice): an outcome label plus "GRADE S/A/B/C". The certification and mission-rank fields stay in the
 * debrief report for tests and logs, but players only ever see these words.
 */

import type { MissionOutcome } from './types';

export const OUTCOME_LABELS: Record<MissionOutcome, string> = {
  SUCCESS: 'MISSION SUCCESS',
  PARTIAL_SUCCESS: 'PARTIAL SUCCESS',
  FAILED: 'MISSION FAILED',
};

export const TRAINING_COMPLETE_LABEL = 'TRAINING COMPLETE';

export type EfficiencyGrade = 'S' | 'A' | 'B' | 'C';

export function gradeLabel(grade: EfficiencyGrade | string): string {
  return `GRADE ${grade}`;
}

/** Outcome words for a debrief whose outcome may be missing (older reports): missing reads as failed. */
export function outcomeLabel(outcome: MissionOutcome | undefined): string {
  return OUTCOME_LABELS[outcome ?? 'FAILED'];
}

/** "MISSION SUCCESS | GRADE A", or the training label for a passed Academy run. */
export function resultHeadline(outcome: MissionOutcome | undefined, grade: EfficiencyGrade | string, isTrainingPass = false): string {
  return isTrainingPass ? TRAINING_COMPLETE_LABEL : `${outcomeLabel(outcome)} | ${gradeLabel(grade)}`;
}

/** Storage is counted in memory blocks everywhere a player reads it ("1 memory block", "3 memory blocks"). */
export function memoryBlocks(count: number): string {
  return `${count} memory block${count === 1 ? '' : 's'}`;
}
