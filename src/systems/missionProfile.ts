import type { DebriefReport, EfficiencyGrade, MissionScenarioId } from '../mission/types';

export type GuidanceMode = 'GUIDED' | 'STANDARD' | 'EXPERT';
export interface MissionPreferences {
  guidance: GuidanceMode;
  dominantHand: 'LEFT' | 'RIGHT';
  oneHanded: boolean;
  gazeAssist: boolean;
  tabletopMode: boolean;
  largeText: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  captions: boolean;
  audioLevel: number;
  seatOffset: [number, number, number];
}
export interface MissionMastery {
  attempts: number;
  bestScore: number;
  bestGrade: EfficiencyGrade;
  bestPowerUsed: number;
  bestMarginSec: number;
  medals: string[];
}
export interface MissionProfile {
  version: 1;
  preferences: MissionPreferences;
  mastery: Partial<Record<MissionScenarioId, MissionMastery>>;
  tutorialComplete: boolean;
  daily: { lastCompletedDate: string | null; streak: number; bestScore: number };
}

const PROFILE_KEY = 'orbit-zero-profile-v1';
export function createMissionProfile(): MissionProfile {
  return {
    version: 1,
    preferences: {
      guidance: 'GUIDED', dominantHand: 'RIGHT', oneHanded: false,
      gazeAssist: true, tabletopMode: false,
      largeText: false, highContrast: false, reducedMotion: false, captions: true, audioLevel: 0.65,
      seatOffset: [0, 0, 0],
    },
    mastery: {}, tutorialComplete: false,
    daily: { lastCompletedDate: null, streak: 0, bestScore: 0 },
  };
}

export function loadMissionProfile(): MissionProfile {
  const profile = createMissionProfile();
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(PROFILE_KEY);
    if (!raw) return profile;
    const value = JSON.parse(raw) as MissionProfile;
    if (value.version !== 1 || !value.preferences || typeof value.mastery !== 'object' || !value.mastery) return profile;
    const input = value.preferences;
    if (['GUIDED', 'STANDARD', 'EXPERT'].includes(input.guidance)) profile.preferences.guidance = input.guidance;
    if (input.dominantHand === 'LEFT' || input.dominantHand === 'RIGHT') profile.preferences.dominantHand = input.dominantHand;
    for (const key of ['oneHanded', 'gazeAssist', 'tabletopMode', 'largeText', 'highContrast', 'reducedMotion', 'captions'] as const) {
      if (typeof input[key] === 'boolean') profile.preferences[key] = input[key];
    }
    if (Number.isFinite(input.audioLevel)) profile.preferences.audioLevel = Math.max(0, Math.min(1, input.audioLevel));
    if (Array.isArray(input.seatOffset) && input.seatOffset.length === 3 && input.seatOffset.every((n) => Number.isFinite(n))) {
      profile.preferences.seatOffset = [
        Math.max(-0.8, Math.min(0.8, input.seatOffset[0])),
        Math.max(-0.65, Math.min(0.45, input.seatOffset[1])),
        Math.max(-0.8, Math.min(0.8, input.seatOffset[2])),
      ];
    }
    for (const id of ['STANDARD_INDUS_PASS', 'MONSOON_SUPERCELL_PASS', 'SOLAR_BROWNOUT_PASS'] as const) {
      const record = value.mastery[id];
      if (record && Number.isFinite(record.attempts) && record.attempts >= 0 &&
        Number.isFinite(record.bestScore) && record.bestScore >= 0 && record.bestScore <= 100 &&
        ['S', 'A', 'B', 'C'].includes(record.bestGrade) && Number.isFinite(record.bestPowerUsed) &&
        Number.isFinite(record.bestMarginSec) && Array.isArray(record.medals)) {
        profile.mastery[id] = { ...record, medals: record.medals.filter((medal) => typeof medal === 'string') };
      }
    }
    profile.tutorialComplete = value.tutorialComplete === true;
    if (value.daily && Number.isFinite(value.daily.streak) && Number.isFinite(value.daily.bestScore) &&
      (value.daily.lastCompletedDate === null || /^\d{4}-\d{2}-\d{2}$/.test(value.daily.lastCompletedDate))) {
      profile.daily = { ...value.daily };
    }
  } catch { /* Storage can be disabled in private or embedded browsers. */ }
  return profile;
}

export function saveMissionProfile(profile: MissionProfile): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch { /* Play remains available without persistent storage. */ }
}

export interface MissionRunTelemetry {
  actualHandsUsed?: number;
  hintsRequestedCount?: number;
}

export function recordMissionMastery(
  profile: MissionProfile,
  scenarioId: MissionScenarioId,
  report: DebriefReport,
  telemetry: MissionRunTelemetry = { actualHandsUsed: 1, hintsRequestedCount: 0 },
): string[] {
  const earned: string[] = [];
  if (report.totalScore >= report.achievableScore) earned.push('GROUND TRUTH');
  if (report.powerUsed <= report.benchmarkPowerUsed && report.totalScore >= report.achievableScore) earned.push('POWER DISCIPLINE');
  if (!report.droppedPacketIds.length && report.downlinkUsedSec <= report.benchmarkDownlinkSec + 1e-6 && report.totalScore >= report.achievableScore) earned.push('LINK PRECISION');
  if (!report.droppedPacketIds.length && report.transmittedPacketIds.length === 3 && report.powerUsed <= report.benchmarkPowerUsed && report.totalScore >= report.achievableScore) earned.push('DATA DISCIPLINE');
  if (profile.preferences.oneHanded && telemetry.actualHandsUsed === 1 && report.totalScore >= report.achievableScore) earned.push('ONE-HAND MODE');
  if (profile.preferences.guidance === 'EXPERT' && (telemetry.hintsRequestedCount ?? 0) === 0 && report.totalScore >= report.achievableScore) earned.push('NO-HINT SPECIALIST');
  const previous = profile.mastery[scenarioId];
  const gradeRank = { C: 0, B: 1, A: 2, S: 3 };
  const improved = !previous || report.totalScore > previous.bestScore;
  profile.mastery[scenarioId] = {
    attempts: (previous?.attempts ?? 0) + 1,
    bestScore: Math.max(previous?.bestScore ?? 0, report.totalScore),
    bestGrade: !previous || gradeRank[report.efficiencyGrade] > gradeRank[previous.bestGrade] ? report.efficiencyGrade : previous.bestGrade,
    bestPowerUsed: improved ? report.powerUsed : report.totalScore === previous.bestScore
      ? Math.min(previous.bestPowerUsed, report.powerUsed) : previous.bestPowerUsed,
    bestMarginSec: improved ? report.windowMarginSec : report.totalScore === previous.bestScore
      ? Math.max(previous.bestMarginSec, report.windowMarginSec) : previous.bestMarginSec,
    medals: [...new Set([...(previous?.medals ?? []), ...earned])],
  };
  if (scenarioId === 'STANDARD_INDUS_PASS') profile.tutorialComplete = true;
  return earned;
}

export function getDailyPass(date: string): MissionScenarioId {
  const templates: MissionScenarioId[] = ['STANDARD_INDUS_PASS', 'MONSOON_SUPERCELL_PASS', 'SOLAR_BROWNOUT_PASS'];
  let hash = 2166136261;
  for (const character of date) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return templates[(hash >>> 0) % templates.length];
}

export function recordDailyPass(profile: MissionProfile, date: string, score: number): void {
  if (profile.daily.lastCompletedDate === date) {
    profile.daily.bestScore = Math.max(profile.daily.bestScore, score);
    return;
  }
  const elapsedDays = profile.daily.lastCompletedDate
    ? (Date.parse(date) - Date.parse(profile.daily.lastCompletedDate)) / 86400000 : 0;
  profile.daily = { lastCompletedDate: date, streak: elapsedDays === 1 ? profile.daily.streak + 1 : 1, bestScore: score };
}
