// Virtual headset player: plays ORBIT ZERO the way a judge would in a Quest, with hands only.
// Landing -> Fireline card -> ENTER VR -> Mission Card (pinch START) -> scan B (thermal) -> compress
// -> dock -> scan C (optical) -> dock -> scan E (thermal) -> pull lever -> LIVE-dock E during the
// window -> result. Uses the IWER Meta Quest 3 emulator (hand input mode), saves headset-view
// screenshots, checks HUD placement in the seated field of view, and samples render cost.
//
// Usage: npm run build ; node tests/virtual-headset-player.mjs
// This is an emulator check. It does not replace a physical Quest test (tracking noise, optics, fps).
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchApp, root } from './_harness.mjs';

const out = join(root, 'artifacts', 'virtual-headset');
await mkdir(out, { recursive: true });
const { url, page, failures, close } = await launchApp();
const results = [];
const log = (...a) => console.log('[headset]', ...a);
const check = (ok, name, detail = '') => { results.push({ ok: Boolean(ok), name, detail }); log(ok ? 'PASS' : 'FAIL', name, detail); };
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const state = () => page.evaluate(() => window.__ORBIT_ZERO__.getState());
const hudText = (id) => page.evaluate((i) => window.__ORBIT_ZERO__.getPanelText('mission-hud', i), id);
const SEATED_EYE = { x: 0, y: 1.25, z: 0 };

const settleFrames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));

async function pointAndPinch(hand, targetId) {
  return page.evaluate(async ({ hand, targetId }) => {
    const api = window.__ORBIT_ZERO__;
    const remote = window.__ORBIT_IWER__.remote;
    const pos = api.get3DTargetWorldPosition(targetId);
    if (!pos) return { ok: false, reason: `target not found: ${targetId}` };
    const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    await remote.dispatch('set_hand_pose', { device: hand, poseId: 'point' });
    await remote.dispatch('set_select_value', { device: hand, value: 0 });
    await remote.dispatch('set_transform', { device: hand, position: pos, anchor: 'index-tip' });
    await settle();
    await remote.dispatch('set_select_value', { device: hand, value: 1 });
    await settle();
    await remote.dispatch('set_select_value', { device: hand, value: 0 });
    await settle();
    // Park the hand away so it does not keep hovering the control.
    await remote.dispatch('set_transform', { device: hand, position: { x: hand === 'hand-left' ? -0.25 : 0.25, y: 1.0, z: -0.2 } });
    await settle();
    return { ok: true, pos };
  }, { hand, targetId });
}

async function grabCarryRelease(hand, cubeId, dropId) {
  return page.evaluate(async ({ hand, cubeId, dropId }) => {
    const api = window.__ORBIT_ZERO__;
    const remote = window.__ORBIT_IWER__.remote;
    const cubePos = api.get3DTargetWorldPosition(cubeId);
    const dropPos = api.get3DTargetWorldPosition(dropId);
    if (!cubePos || !dropPos) return { ok: false, reason: 'missing target' };
    const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    const moveGrasp = async (position) => {
      await remote.dispatch('set_transform', { device: hand, position, anchor: 'grasp' });
      const h = await remote.dispatch('get_hand_state', { device: hand });
      const i = h.anchors['index-tip'];
      const t = h.anchors['thumb-tip'];
      await remote.dispatch('set_transform', {
        device: hand,
        position: { x: h.position.x + position.x - (i.x + t.x) / 2, y: h.position.y + position.y - (i.y + t.y) / 2, z: h.position.z + position.z - (i.z + t.z) / 2 },
      });
    };
    await remote.dispatch('set_hand_pose', { device: hand, poseId: 'point' });
    await remote.dispatch('set_select_value', { device: hand, value: 0 });
    await moveGrasp(cubePos);
    await settle();
    await remote.dispatch('set_select_value', { device: hand, value: 1 });
    await settle();
    const grabbed = api.getActiveXRHandGrabs().length;
    await moveGrasp({ x: (cubePos.x + dropPos.x) / 2, y: 0.9, z: -0.44 });
    await settle();
    await moveGrasp(dropPos);
    await settle();
    await remote.dispatch('set_select_value', { device: hand, value: 0 });
    await settle();
    await remote.dispatch('set_transform', { device: hand, position: { x: hand === 'hand-left' ? -0.25 : 0.25, y: 1.0, z: -0.2 } });
    await settle();
    return { ok: true, grabbed };
  }, { hand, cubeId, dropId });
}

async function setSensorByHand(mode) {
  for (let i = 0; i < 5; i++) {
    if ((await state()).activeSensorMode === mode) return true;
    await pointAndPinch('hand-right', 'pad-toggle-sensor');
  }
  return (await state()).activeSensorMode === mode;
}

/** Angle (deg) between seated forward (-Z) and the direction to a world point. */
function offAxisDeg(p) {
  const dx = p.x - SEATED_EYE.x; const dy = p.y - SEATED_EYE.y; const dz = p.z - SEATED_EYE.z;
  const len = Math.hypot(dx, dy, dz);
  return (Math.acos(-dz / len) * 180) / Math.PI;
}

async function renderCost(label) {
  const sample = await page.evaluate(() => new Promise((resolve) => {
    const api = window.__ORBIT_ZERO__;
    const times = [];
    let last = performance.now();
    const t0 = last;
    const tick = () => {
      const now = performance.now();
      times.push(now - last);
      last = now;
      if (now - t0 < 2000) requestAnimationFrame(tick);
      else {
        times.sort((a, b) => a - b);
        resolve({ calls: api.getDrawCalls(), triangles: api.getTriangles(), frames: times.length, p50ms: times[Math.floor(times.length / 2)], p95ms: times[Math.floor(times.length * 0.95)] });
      }
    };
    requestAnimationFrame(tick);
  }));
  log(`render ${label}:`, JSON.stringify(sample));
  return { label, ...sample };
}

const perf = [];
try {
  // 1. Enter like a judge: landing -> Fireline -> ENTER VR.
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#oz-hero-screen', { state: 'visible', timeout: 20000 });
  await page.click('#btn-enter-experience');
  await page.waitForSelector('#oz-selection-screen', { state: 'visible', timeout: 10000 });
  await page.click('#card-op-fireline');
  await page.click('#btn-enter-vr');
  await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__), null, { timeout: 90000 });
  if (!(await page.evaluate(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive))) {
    await page.evaluate(() => window.__ORBIT_ZERO__.clickPanel('briefing-panel', 'xr-button'));
  }
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 30000 });
  await page.evaluate(async () => {
    const remote = window.__ORBIT_IWER__.remote;
    await remote.dispatch('set_input_mode', { mode: 'hand' });
    for (const d of ['hand-left', 'hand-right']) await remote.dispatch('set_connected', { device: d, connected: true });
    await remote.dispatch('set_hand_pose', { device: 'hand-left', poseId: 'default' });
    await remote.dispatch('set_hand_pose', { device: 'hand-right', poseId: 'point' });
  });
  await page.waitForTimeout(1500);
  let s = await state();
  check(s.scenarioId === 'FIRELINE_PASS', 'entered Fireline in an immersive session', s.scenarioId);

  // 2. Mission Card in the headset.
  const cardTitle = await hudText('CardTitle');
  const cardRules = await hudText('CardRules');
  check(/Fireline/i.test(cardTitle ?? ''), 'headset Mission Card shows the operation', cardTitle);
  check(/WIN \d+\+ pts/.test(cardRules ?? ''), 'headset Mission Card states the win line', cardRules);
  const card1 = await hudText('CardReq1Title');
  check(!/THERMAL|RADAR|OPTICAL|SAR/.test(card1 ?? ''), 'Mission Card request row does not give the sensor answer', card1);
  const hudPos = await page.evaluate(() => window.__ORBIT_ZERO__.get3DTargetWorldPosition('mission-hud'));
  check(hudPos && offAxisDeg(hudPos) < 20, 'Mission Card is within 20 deg of seated forward', hudPos ? `${offAxisDeg(hudPos).toFixed(1)} deg` : 'missing');
  check(s.passStarted === false && s.passRemainingSec === 150, 'pass clock waits while the card is open', `${s.passRemainingSec}`);
  await shot('hmd-01-mission-card');
  perf.push(await renderCost('mission-card'));

  // 3. Pinch START PASS.
  const start = await pointAndPinch('hand-right', 'mission-hud:Btn_StartPass');
  await page.waitForTimeout(500);
  const stepTitle = await hudText('StepTitle');
  check(start.ok && /PICK A TARGET|SCAN SECTOR/.test(stepTitle ?? ''), 'pinching START PASS opens the Next Step strip', stepTitle);
  const stripPos = await page.evaluate(() => window.__ORBIT_ZERO__.get3DTargetWorldPosition('mission-hud'));
  check(stripPos && stripPos.y > 1.4, 'Next Step strip moved above the globe', stripPos ? `y=${stripPos.y.toFixed(2)}` : 'missing');
  await shot('hmd-02-next-step');

  // 4. Sector B: thermal through smoke, by hand.
  await pointAndPinch('hand-right', 'sector-b');
  check((await state()).selectedSectorId === 'B', 'point + pinch selects Sector B');
  check(await setSensorByHand('THERMAL'), 'sensor switch reaches THERMAL by hand');
  await pointAndPinch('hand-right', 'pad-fire-swath');
  s = await state();
  check(s.packets.length === 1 && s.packets[0].confidence === 'CONFIRMED', 'thermal scan through smoke is CONFIRMED');
  check(s.passStarted, 'pass clock started with the first scan', `${s.passRemainingSec?.toFixed(1)}s`);
  await page.waitForTimeout(600);
  await shot('hmd-03-scan-reveal');

  const comp = await grabCarryRelease('hand-left', 'evidence-cube-1', 'PROCESS_CRADLE');
  s = await state();
  check(comp.grabbed === 1 && s.packets[0].processed, 'grab cube -> drop in Cradle compresses it');
  await grabCarryRelease('hand-left', 'evidence-cube-1', 'DOWNLINK_SLOT_1');
  check((await state()).queuePacketIds.length === 1, 'cube docked in bay slot 1 by hand');

  // 5. Sector C optical, Sector E thermal.
  await pointAndPinch('hand-right', 'sector-c');
  await setSensorByHand('OPTICAL');
  await pointAndPinch('hand-right', 'pad-fire-swath');
  await grabCarryRelease('hand-left', 'evidence-cube-2', 'DOWNLINK_SLOT_2');
  await pointAndPinch('hand-right', 'sector-e');
  await setSensorByHand('THERMAL');
  await pointAndPinch('hand-right', 'pad-fire-swath');
  s = await state();
  check(s.packets.length === 3 && s.queuePacketIds.length === 2, 'three cubes on board, two docked', `queue=${s.queuePacketIds.length}`);
  perf.push(await renderCost('three-cubes'));

  // 6. Pull the lever with E still on the tray, then dock E LIVE during the window.
  await pointAndPinch('hand-right', 'pad-commit-downlink');
  s = await state();
  check(s.phase === 'DOWNLINK', 'pinching the lever opens the live window');
  await shot('hmd-04-live-window');
  const live = await grabCarryRelease('hand-left', 'evidence-cube-3', 'DOWNLINK_SLOT_3');
  s = await state();
  check(live.grabbed === 1 && s.queuePacketIds.length === 3, 'tray cube docked by hand DURING the live window');
  perf.push(await renderCost('live-window'));

  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  s = await state();
  check(s.debrief.outcome === 'SUCCESS', 'hands-only Fireline pass succeeds', `${s.debrief.totalScore} pts, grade ${s.debrief.efficiencyGrade}`);
  const resultTitle = await hudText('ResultTitle');
  const resultScore = await hudText('ResultScore');
  check(/MISSION SUCCESS \| GRADE [SABC]/.test(resultTitle ?? ''), 'headset result headline agrees with the grade', resultTitle);
  check(/best possible/.test(resultScore ?? ''), 'headset result shows best possible score', resultScore);
  check(!/GRADE S\)/.test(s.debrief.summaryHeadline) || s.debrief.efficiencyGrade === 'S', 'summary headline grade matches efficiency grade', s.debrief.summaryHeadline);
  await shot('hmd-05-result');

  // 7. Retry by hand returns to the Mission Card.
  await pointAndPinch('hand-right', 'mission-hud:Btn_HudRetry');
  await page.waitForTimeout(600);
  s = await state();
  check(s.phase === 'OPERATIONS' && s.packets.length === 0 && /Fireline/i.test((await hudText('CardTitle')) ?? ''), 'RETRY by hand restarts at the Mission Card');
} catch (err) {
  check(false, 'run completed without exceptions', String(err?.stack ?? err));
  await shot('hmd-error').catch(() => {});
} finally {
  const pageErrors = failures.filter((f) => !/ERR_BLOB_OUT_OF_MEMORY|Couldn't load texture blob/.test(f));
  check(pageErrors.length === 0, 'no page errors', pageErrors.slice(0, 3).join(' | '));
  const passed = results.filter((r) => r.ok).length;
  const report = { when: new Date().toISOString(), passed, total: results.length, results, perf, note: 'IWER Meta Quest 3 emulation on desktop Chromium. Not a physical-headset measurement.' };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  log(`${passed}/${results.length} checks passed. Screenshots and report.json in artifacts/virtual-headset/`);
  await close();
  process.exit(passed === results.length ? 0 : 1);
}
