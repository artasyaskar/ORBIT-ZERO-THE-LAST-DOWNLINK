// A judge is not the developer: standing, sitting low, or sitting where they like. This test starts the emulated
// Quest headset at several real head positions and checks that the game fits the cockpit to the player.
//
// For each start pose it checks: the head ends on the design eye (SEATED_EYE) after entering VR; every near
// target (pads, cubes, scanner) is within a natural pinch reach of the nearer shoulder (body model below), and
// the closest thing on the globe is not closer than a comfortable focus distance; RECENTER puts a drifted head
// back; sitting down after a standing start refits the height; and a laser press still works from the fitted pose.
// A body model is used because IWER teleports hands: the older suites prove the touch maps to the right action,
// this one proves a human could actually be where the hand has to be.
//
// Usage: npm run build ; node tests/e2e-judge-fit.mjs     (JUDGE_FIT_ONLY="standing" runs one case)
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DESIGN_EYE, launchApp, root } from './_harness.mjs';

const out = join(root, 'artifacts', 'judge-fit');
await mkdir(out, { recursive: true });
const results = [];
const check = (ok, name, detail = '') => {
  results.push(Boolean(ok));
  console.log(`[judge-fit] ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Seated body model: shoulders 25 cm below the eye, 18 cm to each side, 8 cm behind the eye plane.
const PINCH_REACH_M = 0.7; // natural pinch reach from the shoulder, a slight lean included
const MIN_FOCUS_M = 0.4; // nearest comfortable focus distance for content the player looks at
const NEAR_TARGETS = ['scanner-tool', 'evidence-cube-1', 'evidence-cube-2', 'evidence-cube-3', 'pad-fire-swath', 'pad-toggle-sensor',
  'pad-process-cradle', 'pad-queue-downlink', 'pad-commit-downlink', 'pad-discard-chute', 'pad-recenter-desk', 'pad-master-power', 'pad-aria-delegate'];

async function enterVr(page, url) {
  await page.goto(`${url}?scenario=FIRELINE_PASS`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#oz-xr-entry')?.dataset.phase === 'ready', null, { timeout: 180000 });
  await page.click('#oz-xr-enter');
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getSeatFit().count > 0, null, { timeout: 15000 });
  await page.waitForTimeout(600);
}
const head = (page) => page.evaluate(() => window.__ORBIT_ZERO__.getRendererStats().cameraWorldPosition);

/** Laser + pinch on START PASS from a resting hand, aimed in the headset's floor-origin space (see note below). */
const pressStartPass = (page) => page.evaluate(async () => {
  const api = window.__ORBIT_ZERO__;
  const remote = window.__ORBIT_IWER__.remote;
  await remote.dispatch('set_input_mode', { mode: 'hand' });
  for (const d of ['hand-left', 'hand-right']) await remote.dispatch('set_connected', { device: d, connected: true });
  const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
  // IWER places devices in the headset's floor-origin space; the game shifts that space by the seat fit to land
  // the head on the design eye. A world target is therefore aimed at as (world - rig offset). On a real headset
  // the hands and their lasers move with the rig, so this bookkeeping exists only in the emulator.
  const [ox, oy, oz] = api.getSeatFit().playerOffset;
  const world = api.get3DTargetWorldPosition('mission-hud:Btn_StartPass');
  const target = { x: world.x - ox, y: world.y - oy, z: world.z - oz };
  const iwerHead = window.__ORBIT_IWER__.position;
  // A resting hand: 20 cm right of and 23 cm below the head, 22 cm ahead of it.
  await remote.dispatch('set_transform', { device: 'hand-right', position: { x: iwerHead.x + 0.2, y: iwerHead.y - 0.23, z: iwerHead.z - 0.22 } });
  await remote.dispatch('look_at', { device: 'hand-right', target });
  await settle();
  await remote.dispatch('set_select_value', { device: 'hand-right', value: 1 });
  await settle();
  await remote.dispatch('set_select_value', { device: 'hand-right', value: 0 });
  await settle();
  await settle();
  return {
    kicker: api.getPanelText('mission-hud', 'StepKicker'),
    pointer: api.getHandPointerState('right'),
    hover: api.getLaserHover(),
    offset: [ox, oy, oz],
    target,
    head: [iwerHead.x, iwerHead.y, iwerHead.z],
  };
});

const CASES = [['seated normal', 1.25], ['seated low (bed/couch)', 1.0], ['standing', 1.7], ['tall, standing', 1.9]]
  .filter(([label]) => !process.env.JUDGE_FIT_ONLY || label.startsWith(process.env.JUDGE_FIT_ONLY));

for (const [label, eyeY] of CASES) {
  const app = await launchApp({ headStart: { x: 0, y: eyeY, z: 0 } });
  const { page, url, failures } = app;
  try {
    await enterVr(page, url);
    const eye = await head(page);
    check(near(eye[1], DESIGN_EYE.y, 0.03) && near(eye[0], DESIGN_EYE.x, 0.04) && near(eye[2], DESIGN_EYE.z, 0.04),
      `${label} (eye ${eyeY} m): the head ends on the design eye`, `world eye ${eye.map((v) => v.toFixed(2)).join(', ')}`);

    const targets = await page.evaluate((ids) => {
      const api = window.__ORBIT_ZERO__;
      const t = {};
      for (const id of ids) { const p = api.get3DTargetWorldPosition(id); if (p) t[id] = [p.x, p.y, p.z]; }
      return t;
    }, NEAR_TARGETS);
    const shoulders = [[-0.18, eye[1] - 0.25, eye[2] + 0.08], [0.18, eye[1] - 0.25, eye[2] + 0.08]];
    const reach = Object.entries(targets).map(([id, p]) => [id, Math.min(dist(shoulders[0], p), dist(shoulders[1], p))]);
    const far = reach.filter(([, d]) => d > PINCH_REACH_M);
    const farthest = reach.reduce((a, b) => (b[1] > a[1] ? b : a), ['none', 0]);
    check(reach.length >= NEAR_TARGETS.length - 1 && far.length === 0,
      `${label}: every pad, cube and the scanner is within ${PINCH_REACH_M} m of the nearer shoulder`,
      far.length ? far.map(([id, d]) => `${id} ${d.toFixed(2)}`).join(', ')
        : `${reach.length} targets, farthest ${farthest[0]} ${farthest[1].toFixed(2)} m; over the 0.6 m goal: ${reach.filter(([, d]) => d > 0.6).map(([id, d]) => `${id} ${d.toFixed(2)}`).join(', ') || 'none'}`);

    // The nearest thing the player looks at: the globe (centre 0,1.07,-0.48, radius 0.2 at full size).
    const nearestGlobe = dist(eye, [0, 1.07, -0.48]) - 0.2;
    check(nearestGlobe >= MIN_FOCUS_M, `${label}: the globe's near surface is at a comfortable focus distance`, `${nearestGlobe.toFixed(2)} m`);

    const pressed = await pressStartPass(page);
    check(/NEXT STEP|ACTION|TRAINING/.test(pressed.kicker ?? ''), `${label}: laser + pinch on START PASS works from the fitted pose`,
      pressed.kicker ? String(pressed.kicker) : JSON.stringify(pressed));
    if (label === 'standing') await page.screenshot({ path: join(out, 'standing-after-fit.png') });
    if (label === 'seated normal') await page.screenshot({ path: join(out, 'seated-after-fit.png') });

    if (label === 'standing') {
      // Sit down: the head drops 0.45 m and stays there. After about 3 s the height refits.
      await page.evaluate(async () => { await window.__ORBIT_IWER__.remote.dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.25, z: 0 } }); });
      await page.waitForTimeout(500);
      const dropped = await head(page);
      await page.waitForFunction(() => window.__ORBIT_ZERO__.getSeatFit().count > 1, null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(500);
      const refit = await head(page);
      check(dropped[1] < 0.9 && near(refit[1], DESIGN_EYE.y, 0.03), 'standing -> sat down: the height refits by itself after a few seconds', `eye y ${dropped[1].toFixed(2)} -> ${refit[1].toFixed(2)}`);

      // Drift: lean 40 cm sideways and back, press RECENTER.
      await page.evaluate(async () => { await window.__ORBIT_IWER__.remote.dispatch('set_transform', { device: 'headset', position: { x: 0.4, y: 1.25, z: 0.5 } }); });
      await page.waitForTimeout(400);
      const drifted = await head(page);
      await page.evaluate(() => window.__ORBIT_ZERO__.calibrateSeatedView());
      await page.waitForTimeout(500);
      const recentred = await head(page);
      check(Math.abs(drifted[0] - DESIGN_EYE.x) > 0.3 && near(recentred[0], DESIGN_EYE.x, 0.04) && near(recentred[1], DESIGN_EYE.y, 0.04) && near(recentred[2], DESIGN_EYE.z, 0.04),
        'RECENTER brings a drifted head back to the design eye on all three axes', `${drifted.map((v) => v.toFixed(2))} -> ${recentred.map((v) => v.toFixed(2))}`);
    }
    check(failures.length === 0, `${label}: no page errors`, failures.slice(0, 2).join(' | '));
  } finally {
    await app.close();
  }
}

const passed = results.filter(Boolean).length;
console.log(`[judge-fit] ${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
