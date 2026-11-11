/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Desktop HUD view builders. Pure functions: mission state + scenario config in, HTML out.
 * Every number shown here comes from the scenario config or the live mission state.
 */

import {
  CAMPAIGN_OPERATIONS,
  describeWeather,
  getScanCost,
  getScenarioRequests,
  getScenarioSector,
  getScenarioThresholds,
  GROUND_REQUEST_ORDER,
  isWeightedScenario,
  MISSION_SCENARIOS,
  requestValue,
  SCORING,
  SENSOR_PLAIN_GUIDE,
  verificationBonus,
} from '../mission/missionConfig';
import { coveredRequestIds, formatClock, isPassStalled, type NextStep } from '../mission/guidance';
import type { MissionScenarioConfig, MissionScenarioId, MissionState, SensorMode } from '../mission/types';
import { escapeHtml } from './debriefText';
import {
  COCKPIT_SKINS,
  COCKPIT_SKIN_ORDER,
  isCockpitSkinUnlocked,
  starsFor,
  starString,
  totalStarsEarned,
  type CockpitSkinId,
  type MissionMastery,
  type MissionProfile,
} from '../systems/missionProfile';
import { buildDailyPassCrisis } from '../mission/proceduralCrisis';

const SENSOR_COLOR: Record<SensorMode, string> = { OPTICAL: '#38bdf8', THERMAL: '#fb923c', RADAR: '#facc15' };
const TONE_COLOR: Record<NextStep['tone'], string> = { info: '#38bdf8', warn: '#f59e0b', critical: '#f87171', success: '#34d399' };

export interface MasteryView { bestScore: number; bestGrade: string; attempts: number }

function scenarioOf(state: MissionState, custom?: MissionScenarioConfig | null): MissionScenarioConfig {
  return custom ?? MISSION_SCENARIOS[state.scenarioId] ?? MISSION_SCENARIOS.STANDARD_INDUS_PASS;
}

function chip(text: string, color: string, filled = false): string {
  return `<span style="display:inline-block;font-size:11px;font-weight:800;letter-spacing:.5px;color:${filled ? '#0b1220' : color};background:${filled ? color : 'transparent'};border:1px solid ${color};border-radius:4px;padding:1px 6px;">${text}</span>`;
}

function btn(action: string, label: string, color: string, opts: { disabled?: boolean; active?: boolean; title?: string; id?: string } = {}): string {
  const { disabled = false, active = false, title = '', id } = opts;
  return `<button ${id ? `id="${id}"` : ''} data-action="${action}" ${disabled ? 'disabled' : ''} title="${escapeHtml(title)}" style="
    font: 800 12px/1.2 Inter, system-ui, sans-serif; letter-spacing:.4px; cursor:${disabled ? 'not-allowed' : 'pointer'};
    padding:8px 12px; border-radius:7px; pointer-events:auto; white-space:nowrap;
    color:${disabled ? '#475569' : active ? '#0b1220' : '#f8fafc'};
    background:${disabled ? 'rgba(15,23,42,.6)' : active ? color : 'rgba(15,23,42,.88)'};
    border:1.5px solid ${disabled ? '#334155' : color}; opacity:${disabled ? 0.65 : 1};">${label}</button>`;
}

/** Rules line shown on the Mission Card and the Next Step banner. */
export function rulesText(state: MissionState, custom?: MissionScenarioConfig | null): string {
  const { successScore, partialScore } = getScenarioThresholds(state.scenarioId, custom);
  const requests = getScenarioRequests(state.scenarioId, custom);
  const weighted = isWeightedScenario(requests);
  const bonus = weighted ? '' : ` All three verified adds +${SCORING.allVerifiedBonus}.`;
  const extra = weighted ? '' : ' Every request needs at least partial evidence.';
  return `WIN: ${successScore}+ pts.${extra} PARTIAL: ${partialScore}+ pts. Below that the mission FAILS.${bonus} Each ARIA hint costs ${SCORING.hintPenalty} pts.`;
}

export function missionCardHtml(state: MissionState, custom?: MissionScenarioConfig | null, mastery?: MasteryView | null): string {
  const scenario = scenarioOf(state, custom);
  const requests = getScenarioRequests(state.scenarioId, custom);
  const sensors = scenario.availableSensors ?? ['RADAR', 'OPTICAL'];
  const budget = scenario.budget;
  const rows = GROUND_REQUEST_ORDER.map((id) => {
    const r = requests[id];
    const sector = getScenarioSector(state.scenarioId, r.targetSectorId, custom);
    return `<tr>
      <td style="padding:6px 8px;vertical-align:top;">${chip(`SECTOR ${r.targetSectorId}`, '#38bdf8', true)}</td>
      <td style="padding:6px 8px;vertical-align:top;">
        <div style="font-weight:800;color:#f8fafc;font-size:13px;">${escapeHtml(r.shortLabel.split('|')[1]?.trim() ?? r.title)}</div>
        <div style="color:#cbd5e1;font-size:12px;">${escapeHtml(r.stakeLabel ?? r.question)}</div>
        <div style="color:#94a3b8;font-size:11px;margin-top:2px;">Weather: <b style="color:#e2e8f0;">${describeWeather(sector.cloudCover)}</b> | needs <b style="color:#e2e8f0;">${r.minimumConfidence}</b></div>
      </td>
      <td style="padding:6px 8px;vertical-align:top;text-align:right;font:800 15px monospace;color:#34d399;">${requestValue(r)}<span style="font-size:10px;color:#94a3b8;"> pts</span></td>
    </tr>`;
  }).join('');
  const sensorRows = sensors.map((m) => {
    const cost = getScanCost(budget, m);
    const g = SENSOR_PLAIN_GUIDE[m];
    return `<div style="display:flex;gap:8px;align-items:baseline;font-size:12px;margin:2px 0;">
      <b style="color:${SENSOR_COLOR[m]};min-width:96px;">${g.label}</b>
      <span style="color:#e2e8f0;">${g.sees}.</span> <span style="color:#94a3b8;">${g.blind}.</span>
      <span style="margin-left:auto;color:#94a3b8;font-family:monospace;">${cost.powerCost} Wh</span></div>`;
  }).join('');
  const clock = state.passDurationSec
    ? `<b style="color:#f59e0b;">${formatClock(state.passDurationSec)} pass clock</b> starts at your first scan. When it hits zero the link opens by itself.`
    : '<b style="color:#34d399;">No clock</b> on this pass.';
  const best = mastery && mastery.attempts > 0
    ? `<div style="font-size:11px;color:#94a3b8;margin-top:6px;">Your best: <b style="color:#f8fafc;">${mastery.bestScore} pts (Grade ${mastery.bestGrade})</b> in ${mastery.attempts} attempt(s) <span style="color:#fbbf24;font-size:14px;letter-spacing:2px;">${starString(starsFor(mastery as MissionMastery, getScenarioThresholds(state.scenarioId, custom).successScore))}</span></div>`
    : '';
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span style="font-size:11px;color:#38bdf8;font-weight:800;letter-spacing:1px;">${escapeHtml(scenario.operationCode ?? 'OPERATION')} // MISSION CARD [SIMULATED]</span>
      <div style="display:flex;gap:12px;align-items:center;">
        <button data-action="landing-menu" style="background:none;border:none;color:#94a3b8;font-size:11px;cursor:pointer;text-decoration:underline;pointer-events:auto;">← Landing page</button>
        <button data-action="campaign" style="background:none;border:none;color:#94a3b8;font-size:11px;cursor:pointer;text-decoration:underline;pointer-events:auto;">Change operation [C]</button>
      </div>
    </div>
    <div style="font-size:21px;font-weight:800;color:#f8fafc;margin-bottom:4px;">${escapeHtml(scenario.name)}</div>
    <div style="font-size:13px;color:#cbd5e1;line-height:1.5;margin-bottom:10px;">${escapeHtml(scenario.storyLine ?? scenario.briefing)}</div>
    <div style="font-size:11px;color:#94a3b8;font-weight:800;letter-spacing:1px;margin-bottom:2px;">GROUND REQUESTS</div>
    <table style="width:100%;border-collapse:collapse;background:rgba(15,23,42,.6);border-radius:8px;">${rows}</table>
    <div style="font-size:11px;color:#94a3b8;font-weight:800;letter-spacing:1px;margin:10px 0 2px;">YOUR SENSORS: MATCH THE SENSOR TO THE WEATHER</div>
    ${sensorRows}
    <div style="font-size:12px;color:#cbd5e1;line-height:1.5;margin-top:10px;background:rgba(15,23,42,.7);border-left:3px solid #38bdf8;padding:8px 10px;border-radius:0 6px 6px 0;">
      <b>HOW TO PLAY:</b> 1) Click a sector on the globe. 2) Pick a sensor and SCAN. 3) Compress big cubes if they won't fit. 4) Load the Downlink Bay, most valuable first. 5) TRANSMIT before the window closes.<br>
      <span style="color:#94a3b8;">Keys: Click globe to aim · [1-3] Sensor · [Space] Scan · [P] Compress · [Q] Load · [T] Transmit · [R] Retry</span><br>
      Battery ${budget.initialPower} Wh | Memory ${budget.maxStorage} blocks | Transmit window ${budget.downlinkDurationSec.toFixed(1)}s | ${clock}
    </div>
    <div style="font-size:12px;color:#fde68a;margin-top:8px;font-weight:700;">${escapeHtml(rulesText(state, custom))}</div>
    ${best}
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
      ${btn('enter-vr', 'ENTER VR', '#38bdf8', { id: 'btn-mission-enter-vr' })}
      ${btn('academy', 'TRAINING FIRST (90s)', '#a78bfa')}
      ${btn('start-pass', 'START PASS [Enter]', '#34d399', { active: true, id: 'btn-commence-pass' })}
    </div>`;
}

export function requestTrackerHtml(state: MissionState, custom?: MissionScenarioConfig | null): string {
  const requests = getScenarioRequests(state.scenarioId, custom);
  const covered = coveredRequestIds(state);
  const queuedIds = new Set(state.queuePacketIds);
  return GROUND_REQUEST_ORDER.map((id) => {
    const r = requests[id];
    const onBoard = state.packets.filter((p) => p.satisfiesRequestId === id && p.confidence !== 'UNVERIFIED');
    const best = onBoard.sort((a, b) => (a.confidence === 'CONFIRMED' ? -1 : 1) - (b.confidence === 'CONFIRMED' ? -1 : 1))[0];
    const meets = best && (r.minimumConfidence === 'PROBABLE' || best.confidence === 'CONFIRMED');
    const loaded = onBoard.some((p) => queuedIds.has(p.id));
    const sent = onBoard.some((p) => p.transmitted);
    const status = sent ? 'SENT' : loaded ? 'LOADED' : covered.has(id) ? (meets ? 'ON BOARD' : 'WEAK') : 'NEEDED';
    const color = status === 'SENT' ? '#34d399' : status === 'LOADED' ? '#38bdf8' : status === 'ON BOARD' ? '#a3e635' : status === 'WEAK' ? '#f59e0b' : '#94a3b8';
    const bg = status === 'SENT' ? 'rgba(16,185,129,0.14)' : status === 'LOADED' ? 'rgba(56,189,248,0.14)' : status === 'WEAK' ? 'rgba(245,158,11,0.12)' : 'rgba(15,23,42,0.72)';
    return `<span style="display:inline-flex;gap:6px;align-items:center;background:${bg};border:1px solid ${color};border-left:3px solid ${color};border-radius:7px;padding:3px 9px;font-size:11px;color:#e2e8f0;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06);">
      <span style="font-weight:800;color:#0b1220;background:${color};border-radius:4px;padding:0 5px;font-size:10px;line-height:1.45;">${r.targetSectorId}</span>
      <span style="font-weight:700;color:#f8fafc;">${escapeHtml(r.shortLabel.split('|')[1]?.trim() ?? r.id)}</span>
      <b style="font-family:monospace;color:#f8fafc;">${requestValue(r)}</b>
      <span style="color:${color};font-weight:800;font-size:10px;letter-spacing:.4px;">${status}</span></span>`;
  }).join(' ');
}

export function nextStepBannerHtml(step: NextStep, state: MissionState, custom?: MissionScenarioConfig | null): string {
  const color = TONE_COLOR[step.tone];
  const clock = state.passRemainingSec === null
    ? 'NO CLOCK'
    : state.passStarted ? formatClock(state.passRemainingSec) : `${formatClock(state.passRemainingSec)} WAIT`;
  const lowPower = state.power < 15;
  const pill = (lbl: string, val: string, c: string) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(15,23,42,0.85);border:1px solid rgba(148,163,184,0.22);border-radius:5px;padding:2px 7px;font:700 10px monospace;color:#cbd5e1;"><span style="color:#64748b;">${lbl}</span><b style="color:${c};">${val}</b></span>`;
  return `
    <div id="next-step-card" style="text-align:left;">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid rgba(56,189,248,0.16);">
        <span style="display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:800;letter-spacing:1.2px;color:${color};">
          <span class="oz-live-dot" style="width:7px;height:7px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color};display:inline-block;"></span>NEXT STEP
        </span>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          ${pill('CLOCK', clock, state.passStarted && (state.passRemainingSec ?? 99) <= 25 ? '#f87171' : '#fbbf24')}
          ${pill('BATT', `${state.power}/${state.maxPower} Wh`, lowPower ? '#f87171' : '#38bdf8')}
          ${pill('MEM', `${state.storageUsed}/${state.maxStorage}`, state.storageUsed >= state.maxStorage ? '#f59e0b' : '#cbd5e1')}
          ${pill('LINK', `${state.downlinkCommittedSec.toFixed(1)}/${state.downlinkWindowSec.toFixed(1)}s`, state.downlinkCommittedSec > state.downlinkWindowSec + 0.01 ? '#f87171' : '#34d399')}
        </div>
      </div>
      <div id="next-step-title" style="font-size:17px;font-weight:800;color:#f8fafc;letter-spacing:-0.2px;margin:2px 0;">${escapeHtml(step.title)}</div>
      <div style="font-size:12.5px;color:#cbd5e1;line-height:1.45;">${escapeHtml(step.body)}</div>
      <div style="font-size:11.5px;color:${color};font-weight:700;margin-top:4px;">▸ ${escapeHtml(step.desktop)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">${requestTrackerHtml(state, custom)}</div>
    </div>`;
}

/** Bottom action bar: every action is a visible, labelled button (mouse-only play). */
export function actionBarHtml(state: MissionState, custom?: MissionScenarioConfig | null): string {
  const scenario = scenarioOf(state, custom);
  const budget = scenario.budget;
  const sensors = scenario.availableSensors ?? ['RADAR', 'OPTICAL'];
  const sel = state.packets.find((p) => p.id === state.selectedPacketId) ?? null;
  const live = state.phase === 'DOWNLINK';
  const ops = state.phase === 'OPERATIONS' && !state.paused;
  const procCost = budget.onboardProcess.powerCost;

  const cubeChips = state.packets.length
    ? state.packets.map((p, i) => {
      const color = p.confidence === 'CONFIRMED' ? '#34d399' : p.confidence === 'PROBABLE' ? '#f59e0b' : '#f87171';
      const where = p.transmitted ? 'SENT' : p.queued ? `BAY ${(p.queueIndex ?? 0) + 1}` : 'TRAY';
      const isSel = p.id === state.selectedPacketId;
      return `<button data-action="select:${p.id}" title="${escapeHtml(p.headline)}" style="pointer-events:auto;cursor:pointer;text-align:left;font:700 11px/1.3 Inter,system-ui;padding:5px 10px;border-radius:8px;
        background:${isSel ? 'rgba(56,189,248,0.2)' : 'rgba(11,19,36,0.92)'};border:1.5px solid ${isSel ? '#f8fafc' : color};border-left:4px solid ${color};color:#f8fafc;box-shadow:${isSel ? '0 0 14px rgba(56,189,248,0.28)' : 'none'};">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
          <span>CUBE ${i + 1} · SEC ${p.sectorId} · ${SENSOR_PLAIN_GUIDE[p.sensorMode].label.split(' ')[0]}${p.processed ? ' · COMP' : ''}</span>
          <span style="font-size:10px;color:#0b1220;background:${color};border-radius:4px;padding:0 5px;font-weight:800;">${where}</span>
        </div>
        <div style="color:${color};font-size:10.5px;margin-top:1px;">${p.confidence}${p.satisfiesRequestId ? ` · ${p.satisfiesRequestId.replace('_', ' ')}` : ' · off-target'} · ${p.transmitSec.toFixed(1)}s</div>
      </button>`;
    }).join('')
    : '<span style="color:#94a3b8;font-size:11.5px;letter-spacing:0.2px;">No cubes yet — pick a sector on the globe, then click SCAN or press Space.</span>';

  const sensorButtons = sensors.map((m) => {
    const cost = getScanCost(budget, m);
    return btn(`sensor:${m}`, `${SENSOR_PLAIN_GUIDE[m].label} · ${cost.powerCost} Wh`, SENSOR_COLOR[m], {
      active: state.activeSensorMode === m, disabled: !ops, title: `${SENSOR_PLAIN_GUIDE[m].sees}. ${SENSOR_PLAIN_GUIDE[m].blind}.`,
    });
  }).join('');

  const stalled = isPassStalled(state, custom);
  const scanCost = getScanCost(budget, state.activeSensorMode).powerCost;
  const activeSensorHex = SENSOR_COLOR[state.activeSensorMode] ?? '#67e8f9';
  const actions = live
    ? [
      btn('queue', 'DOCK SELECTED CUBE [Q]', '#38bdf8', { disabled: !sel || sel.queued || sel.confidence === 'UNVERIFIED', id: 'tb-queue' }),
      btn('cycle', 'NEXT CUBE [→]', '#94a3b8'),
      btn('transmit', 'CLOSE LINK [T]', '#34d399', { active: true, id: 'tb-transmit' }),
    ]
    : [
      btn('scan', `SCAN SECTOR ${state.selectedSectorId} [Space] -${scanCost} Wh`, activeSensorHex, { disabled: !ops || state.power < scanCost, active: ops && state.power >= scanCost && !sel, id: 'tb-scan' }),
      btn('process', `COMPRESS [P] -${procCost} Wh`, '#f59e0b', { disabled: !ops || !sel || sel.processed || sel.confidence === 'UNVERIFIED' || state.power < procCost, id: 'tb-process' }),
      sel?.queued
        ? btn('unqueue', 'UNLOAD BAY [U]', '#38bdf8', { disabled: !ops, id: 'tb-queue' })
        : btn('queue', 'LOAD BAY [Q]', '#38bdf8', { disabled: !ops || !sel, id: 'tb-queue' }),
      btn('discard', 'DISCARD [X]', '#f87171', { disabled: !ops || !sel, id: 'tb-discard' }),
      stalled
        ? btn('abort', 'ABORT PASS', '#f87171', { active: true, id: 'tb-abort' })
        : btn('transmit', 'TRANSMIT [T]', '#34d399', { disabled: !ops || state.queuePacketIds.length === 0, active: state.queuePacketIds.length > 0, id: 'tb-transmit' }),
    ];

  return `
    <div style="display:flex;flex-direction:column;gap:7px;align-items:center;">
      <div style="display:flex;gap:7px;flex-wrap:wrap;justify-content:center;align-items:center;">${cubeChips}</div>
      ${live ? '' : `<div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:center;align-items:center;background:rgba(2,6,23,0.55);border:1px solid rgba(56,189,248,0.18);border-radius:9px;padding:4px 8px;"><span style="font-size:10px;color:#94a3b8;font-weight:800;letter-spacing:1px;padding:0 4px;">SENSOR [S]</span>${sensorButtons}</div>`}
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;align-items:center;">
        ${actions.join('')}
        <span style="width:1px;height:22px;background:rgba(148,163,184,0.22);margin:0 2px;"></span>
        ${btn('hint', `ASK ARIA [A] -${SCORING.hintPenalty} pts`, '#a78bfa', { disabled: state.phase === 'DEBRIEF' || state.paused, id: 'tb-aria-hint' })}
        ${btn('pause', state.paused ? 'RESUME [Esc]' : 'PAUSE [Esc]', '#94a3b8')}
        ${btn('help', 'HELP [?]', '#94a3b8', { id: 'tb-shortcuts-btn' })}
      </div>
    </div>`;
}

  export function campaignHtml(
    state: MissionState,
    mastery: Partial<Record<MissionScenarioId, MasteryView>>,
    profile?: MissionProfile | null,
  ): string {
    const card = (id: MissionScenarioId, accent: string) => {
      const s = MISSION_SCENARIOS[id];
      const m = mastery[id];
      const active = state.scenarioId === id;
      const requests = getScenarioRequests(id);
      const weighted = isWeightedScenario(requests);
      const { successScore } = getScenarioThresholds(id);
      const sensors = (s.availableSensors ?? ['RADAR', 'OPTICAL']).map((x) => SENSOR_PLAIN_GUIDE[x].label.split(' ')[0]).join(' + ');
      return `<div data-action="launch:${id}" style="cursor:pointer;pointer-events:auto;background:rgba(15,23,42,.85);border:1.5px solid ${active ? accent : 'rgba(148,163,184,.25)'};border-radius:10px;padding:14px;">
      <div style="font-size:10px;color:${accent};font-weight:800;letter-spacing:1px;">${escapeHtml(s.operationCode ?? id)}</div>
      <div style="font-size:15px;font-weight:800;color:#f8fafc;margin:3px 0 6px;">${escapeHtml(s.name)}</div>
      <div style="font-size:12px;color:#cbd5e1;line-height:1.45;min-height:52px;">${escapeHtml(s.storyLine ?? s.subtitle)}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:8px;">${s.budget.initialPower} Wh · ${s.budget.maxStorage} memory · ${s.budget.downlinkDurationSec.toFixed(1)}s window${s.passDurationSec ? ` · ${formatClock(s.passDurationSec)} clock` : ''}</div>
      <div style="font-size:11px;color:#94a3b8;">Sensors: ${sensors} · win at ${successScore}+ pts${weighted ? ' · weighted triage' : ''}</div>
      <div style="font-size:16px;margin-top:6px;color:#fbbf24;letter-spacing:2px;">${starString(starsFor(m as MissionMastery | undefined, successScore))}</div>
      <div style="font-size:11px;margin-top:2px;color:${m?.attempts ? '#34d399' : '#64748b'};font-weight:800;">${m?.attempts ? `BEST ${m.bestScore} PTS · GRADE ${m.bestGrade}` : 'NOT PLAYED YET'}${active ? ' · ACTIVE' : ''}</div>
    </div>`;
    };
    const accents = ['#f59e0b', '#38bdf8', '#34d399'];
    const todayUtc = new Date().toISOString().slice(0, 10);
    const dailyCrisis = buildDailyPassCrisis(todayUtc);
    const streak = profile?.daily?.streak ?? 0;
    const bestStreak = Math.max(profile?.bestStreak ?? 0, streak);
    const starsTotal = profile ? totalStarsEarned(profile) : 0;
    const activeSkin: CockpitSkinId = profile?.preferences?.cockpitSkin ?? 'ORBITAL_CYAN';
    const skinButtons = COCKPIT_SKIN_ORDER.map((skinId) => {
      const spec = COCKPIT_SKINS[skinId];
      const unlocked = !profile || isCockpitSkinUnlocked(profile, skinId);
      const hexCss = `#${spec.primaryHex.toString(16).padStart(6, '0')}`;
      const isActive = activeSkin === skinId;
      return `<button data-action="skin:${skinId}" ${unlocked ? '' : 'disabled'} title="${escapeHtml(spec.unlockHint)}" style="
      font:800 11px/1.2 Inter,system-ui,sans-serif; padding:5px 10px; border-radius:6px; pointer-events:auto;
      cursor:${unlocked ? 'pointer' : 'not-allowed'}; opacity:${unlocked ? 1 : 0.45};
      color:${isActive ? '#0b1220' : '#e2e8f0'}; background:${isActive ? hexCss : 'rgba(15,23,42,.85)'};
      border:1.5px solid ${hexCss};">${escapeHtml(spec.shortLabel)}${unlocked ? '' : ` (LOCK: ${spec.unlockHint})`}</button>`;
    }).join(' ');
    return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <div style="font-size:11px;color:#00f0ff;font-weight:800;letter-spacing:2px;">CAMPAIGN [SIMULATED SCENARIOS] · ${starsTotal}★</div>
      <button data-action="close-campaign" id="btn-close-campaign" style="background:none;border:none;color:#94a3b8;font-size:16px;cursor:pointer;pointer-events:auto;">✕</button>
    </div>
    <div style="font-size:13px;color:#cbd5e1;margin-bottom:12px;">Each operation teaches one new idea. Beat your best score to earn Grade S and unlock console skins.</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px;">
      ${CAMPAIGN_OPERATIONS.map((id, i) => card(id, accents[i % accents.length])).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;background:rgba(15,23,42,.9);border:1.5px solid #f59e0b;border-radius:10px;padding:10px 14px;margin-bottom:10px;">
      <div>
        <div style="font-size:10px;color:#fbbf24;font-weight:800;letter-spacing:1px;">DAILY SEEDED CHALLENGE · ${todayUtc} · STREAK ${streak}d (BEST ${bestStreak}d)</div>
        <div style="font-size:13px;font-weight:800;color:#f8fafc;">${escapeHtml(dailyCrisis.config.name)} — ${escapeHtml(dailyCrisis.config.subtitle)}</div>
        <div style="font-size:11px;color:#94a3b8;">${escapeHtml(dailyCrisis.config.storyLine ?? dailyCrisis.config.briefing)}</div>
      </div>
      ${btn('daily-pass', 'LAUNCH DAILY PASS', '#fbbf24', { active: true, id: 'btn-launch-daily' })}
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;background:rgba(15,23,42,.65);border:1px solid rgba(148,163,184,.22);border-radius:8px;padding:8px 12px;margin-bottom:12px;">
      <span style="font-size:11px;font-weight:800;color:#94a3b8;letter-spacing:.6px;">COCKPIT SKIN</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${skinButtons}</div>
    </div>
    <div style="display:flex;justify-content:space-between;gap:10px;">
      ${btn('academy', 'OP 00: ORBITAL ACADEMY (TRAINING, NO CLOCK)', '#a78bfa', { id: 'camp-card-academy' })}
      ${btn('close-campaign', 'BACK TO COCKPIT', '#38bdf8', { id: 'btn-close-campaign-bottom' })}
    </div>`;
  }

  export function helpHtml(state: MissionState, custom?: MissionScenarioConfig | null): string {
    const scenario = scenarioOf(state, custom);
    const proc = scenario.budget.onboardProcess;
    const row = (k: string, v: string) => `<tr><td style="color:#38bdf8;padding:2px 10px 2px 0;font-weight:800;white-space:nowrap;">${k}</td><td>${v}</td></tr>`;
    return `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;padding-bottom:10px;margin-bottom:12px;">
      <div style="font-size:18px;font-weight:800;color:#38bdf8;">HOW TO PLAY ORBIT ZERO</div>
      <button data-action="help" id="btn-close-help" style="background:none;border:1px solid #64748b;color:#cbd5e1;border-radius:4px;padding:4px 8px;cursor:pointer;pointer-events:auto;">Close [?]</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;font-size:12px;line-height:1.55;color:#cbd5e1;">
      <div>
        <div style="font-weight:800;color:#f8fafc;margin-bottom:4px;">THE GOAL</div>
        <p style="margin:0 0 8px;">Ground teams sent three requests. You have one satellite pass with limited battery, memory and transmit time. Send the most valuable evidence before the window closes. ${escapeHtml(rulesText(state, custom))}</p>
        <div style="font-weight:800;color:#f8fafc;margin-bottom:4px;">THE RULES</div>
        <p style="margin:0 0 6px;"><b>Sensors:</b> ${Object.values(SENSOR_PLAIN_GUIDE).map((g) => `${g.label}: ${g.sees.toLowerCase()}; ${g.blind.toLowerCase()}.`).join(' ')}</p>
        <p style="margin:0 0 6px;"><b>Blocked scans</b> [X] hold no evidence. Compression cannot fix them: discard them.</p>
        <p style="margin:0 0 6px;"><b>Compress</b> (${proc.powerCost} Wh): shrinks a cube to ${proc.compressedStorageCost} memory block and ${proc.compressedTransmitSec.toFixed(1)}s of transmit time.</p>
        <p style="margin:0 0 6px;"><b>Pass clock:</b> starts at your first scan. At zero the link opens by itself.</p>
        <p style="margin:0;"><b>Live window:</b> after TRANSMIT you can still dock tray cubes, but idle seconds are lost and the last cube may be cut off.</p>
      </div>
      <div>
        <div style="font-weight:800;color:#f8fafc;margin-bottom:4px;">MOUSE</div>
        <p style="margin:0 0 8px;">Click a sector on the globe · drag the globe to rotate · wheel to zoom · drag a cube onto the Cradle, Downlink Bay or discard chute · or use the buttons at the bottom.</p>
        <div style="font-weight:800;color:#f8fafc;margin-bottom:4px;">KEYBOARD</div>
        <table style="border-collapse:collapse;font-size:12px;">
          ${row('1-6 / Tab', 'Select Sector A-F / next sector')}
          ${row('S or M', 'Next sensor')}
          ${row('Space', 'Scan selected sector')}
          ${row('← →', 'Select previous / next cube')}
          ${row('P', 'Compress selected cube')}
          ${row('Q / U', 'Load into bay / unload')}
          ${row('X', 'Discard selected cube')}
          ${row('O', 'Reorder bay')}
          ${row('T', 'Transmit (or close the live link)')}
          ${row('A', `Ask ARIA-7 for a hint (-${SCORING.hintPenalty} pts)`)}
          ${row('Esc', 'Close dialog / pause')}
          ${row('C', 'Campaign menu')}
          ${row('R / N', 'Retry / next operation (press twice during a pass)')}
          ${row('?', 'This help')}
        </table>
        <div style="margin-top:8px;color:#94a3b8;">In VR: point your hand laser and pinch to choose; pinch the plunger or aim the scanner beam at a sector and let go to scan; carry cubes to the stations; pinch the green lever to transmit.</div>
      </div>
    </div>`;
  }

  /** Points line for one debrief: achieved vs best possible, with hint cost. */
  export function debriefScoreLine(state: MissionState, custom?: MissionScenarioConfig | null): string {
    const d = state.debrief;
    if (!d) return '';
    const requests = getScenarioRequests(state.scenarioId, custom);
    const bonus = verificationBonus(requests, d.requestsVerifiedCount, d.droppedPacketIds.length);
    const hintCost = (d.hintsUsed ?? 0) * (d.hintPenalty ?? SCORING.hintPenalty);
    return `${d.totalScore} pts (best possible ${d.achievableScore})${bonus ? ` incl. +${bonus} bonus` : ''}${hintCost ? ` · hints -${hintCost}` : ''} · win line ${d.successScore ?? SCORING.defaultSuccessScore}`;
  }
