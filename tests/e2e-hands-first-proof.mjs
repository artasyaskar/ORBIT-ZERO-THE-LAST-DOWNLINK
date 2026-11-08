// Hands-first proof in the IWER Meta Quest 3 emulator (hand input mode, no controller, no keyboard).
//
// Unlike tests/e2e-hands-only.mjs (which places the fingertip exactly on each target: a unit-level check of
// the direct-touch path), every action here is done the way a seated player does it:
//   - far targets: the hand stays at a seated rest pose and its target ray (the visible laser) is aimed, then pinched;
//   - near objects: the hand travels along a path in small steps, pinches, carries and releases;
//   - the scanner tool is really pinched, carried over the globe and released.
// Usage: node tests/e2e-hands-first-proof.mjs   (expects a production build in dist/; run `npx vite build` first)
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchApp, root } from './_harness.mjs';

const out = join(root, 'artifacts', 'hands-first-proof');
await mkdir(out, { recursive: true });
const { url, page, failures, close } = await launchApp({ skipLanding: true });

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok: Boolean(ok), name, detail: String(detail) });
  console.log(`[hands-first] ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`);
};
const state = () => page.evaluate(() => window.__ORBIT_ZERO__.getState());
const hud = (id) => page.evaluate((elementId) => window.__ORBIT_ZERO__.getPanelText('mission-hud', elementId), id);
const panel = (panelId, id) => page.evaluate(({ panelId, id }) => window.__ORBIT_ZERO__.getPanelText(panelId, id), { panelId, id });
const pos = (id) => page.evaluate((targetId) => window.__ORBIT_ZERO__.get3DTargetWorldPosition(targetId), id);

// ---- in-page hand helpers (installed once) ----
await page.addInitScript(() => {
  window.__HANDS__ = {
    settle: () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))),
    rest(hand) {
      return { x: hand === 'hand-left' ? -0.2 : 0.2, y: 1.02, z: -0.12 };
    },
    /** IWER animates hand-pose changes; wait for the fingers to settle before reaching (anchors move meanwhile). */
    async setPose(hand, poseId) {
      const r = window.__ORBIT_IWER__.remote;
      await r.dispatch('set_hand_pose', { device: hand, poseId });
      for (let i = 0; i < 30; i++) {
        if (!(await r.dispatch('get_hand_state', { device: hand })).transition) break;
        await window.__HANDS__.settle();
      }
    },
    async travel(hand, to, anchor = 'grasp', steps = 8) {
      const r = window.__ORBIT_IWER__.remote;
      const s = await r.dispatch('get_hand_state', { device: hand });
      const from = anchor === 'grasp' && s.anchors?.grasp ? s.anchors.grasp : s.position;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const lift = Math.sin(t * Math.PI) * 0.05;
        await r.dispatch('set_transform', {
          device: hand,
          anchor,
          position: { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t + lift, z: from.z + (to.z - from.z) * t },
        });
        await window.__HANDS__.settle();
      }
    },
    async pinch(hand, value) {
      await window.__ORBIT_IWER__.remote.dispatch('set_select_value', { device: hand, value });
      await window.__HANDS__.settle();
    },
    /** Seated far-target aim: hand at rest, its target ray (the laser) turned toward the point. No pinch. */
    async rayAim(hand, target) {
      const r = window.__ORBIT_IWER__.remote;
      await window.__HANDS__.setPose(hand, 'point');
      await window.__HANDS__.pinch(hand, 0);
      await r.dispatch('set_transform', { device: hand, position: window.__HANDS__.rest(hand) });
      await r.dispatch('look_at', { device: hand, target });
      await window.__HANDS__.settle();
      await window.__HANDS__.settle();
      const api = window.__ORBIT_ZERO__;
      return { pointer: api.getHandPointerState(hand === 'hand-left' ? 'left' : 'right'), hover: api.getLaserHover() };
    },
    /** Seated far-target pinch: aim the laser, pinch, release. */
    async rayPinch(hand, target) {
      await window.__HANDS__.rayAim(hand, target);
      await window.__HANDS__.pinch(hand, 1);
      await window.__HANDS__.pinch(hand, 0);
      await new Promise((res) => setTimeout(res, 120));
      await window.__HANDS__.settle();
    },
    /** Reach to a near object along a path, pinch it, carry it along a path, release. */
    async carry(hand, from, to) {
      const r = window.__ORBIT_IWER__.remote;
      await window.__HANDS__.setPose(hand, 'default');
      await window.__HANDS__.pinch(hand, 0);
      await window.__HANDS__.travel(hand, from);
      await window.__HANDS__.pinch(hand, 1);
      await window.__HANDS__.travel(hand, to, 'grasp', 10);
      await window.__HANDS__.pinch(hand, 0);
      await window.__HANDS__.travel(hand, window.__HANDS__.rest(hand), 'grasp', 6);
    },
    /**
     * Put the fingertip on a near control, turn the hand so its laser points at a far target while the
     * fingertip stays on the control, then pinch once. Returns what the laser was on at the pinch.
     */
    async touchWhileAiming(hand, touchId, aimIds) {
      const r = window.__ORBIT_IWER__.remote;
      const api = window.__ORBIT_ZERO__;
      const touchAt = api.get3DTargetWorldPosition(touchId);
      await window.__HANDS__.setPose(hand, 'point');
      await window.__HANDS__.pinch(hand, 0);
      await window.__HANDS__.travel(hand, touchAt, 'index-tip');
      // Turning the hand swings the fingertip off the control; alternate turn and re-place until both hold.
      // Beacons are small, so try them in turn until the laser rests on one.
      let pointer = null;
      for (const aimId of aimIds) {
        for (let i = 0; i < 4; i++) {
          await r.dispatch('look_at', { device: hand, target: api.get3DTargetWorldPosition(aimId) });
          await r.dispatch('set_transform', { device: hand, anchor: 'index-tip', position: touchAt });
        }
        await window.__HANDS__.settle();
        await window.__HANDS__.settle();
        pointer = api.getHandPointerState(hand === 'hand-left' ? 'left' : 'right');
        if (/^sector-/.test(pointer?.rayTarget ?? '')) break;
      }
      await window.__HANDS__.pinch(hand, 1);
      await window.__HANDS__.pinch(hand, 0);
      await new Promise((res) => setTimeout(res, 120));
      await window.__HANDS__.travel(hand, window.__HANDS__.rest(hand), 'grasp', 6);
      return { pointer };
    },
    /**
     * Brush the scanner head with the fingertip (no pinch), then pull the hand back up toward the globe.
     * Returns the furthest the tool moved from its holster and whether it was ever held on the way.
     */
    async brushScanner(hand) {
      const r = window.__ORBIT_IWER__.remote;
      const api = window.__ORBIT_ZERO__;
      const scanner = api.getSceneObject('scanner-tool');
      const laser = scanner.getObjectByName('ScannerAimLaser');
      const home = scanner.getWorldPosition(new scanner.position.constructor());
      await window.__HANDS__.setPose(hand, 'point');
      await window.__HANDS__.pinch(hand, 0);
      await window.__HANDS__.travel(hand, { x: home.x, y: home.y + 0.09, z: home.z + 0.03 }, 'index-tip');
      await window.__HANDS__.settle();
      let maxMoveM = 0;
      let everHeld = laser.visible;
      const from = (await r.dispatch('get_hand_state', { device: hand })).anchors['index-tip'];
      const to = { x: home.x + 0.12, y: home.y + 0.22, z: home.z + 0.14 };
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        await r.dispatch('set_transform', { device: hand, anchor: 'index-tip', position: { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t } });
        await window.__HANDS__.settle();
        maxMoveM = Math.max(maxMoveM, scanner.getWorldPosition(new scanner.position.constructor()).distanceTo(home));
        everHeld = everHeld || laser.visible;
      }
      await window.__HANDS__.travel(hand, window.__HANDS__.rest(hand), 'grasp', 6);
      return { maxMoveCm: Number((maxMoveM * 100).toFixed(1)), everHeld };
    },
    /** Reach to a desk control and pinch it `times` times where it sits (the hand stays on the control between pinches). */
    async pressDesk(hand, at, times = 1) {
      const r = window.__ORBIT_IWER__.remote;
      await window.__HANDS__.setPose(hand, 'default');
      await window.__HANDS__.pinch(hand, 0);
      await window.__HANDS__.travel(hand, at);
      for (let i = 0; i < times; i++) {
        await window.__HANDS__.pinch(hand, 1);
        await window.__HANDS__.pinch(hand, 0);
        await new Promise((res) => setTimeout(res, 120));
      }
      await window.__HANDS__.travel(hand, window.__HANDS__.rest(hand), 'grasp', 6);
    },
    /**
     * Pinch the scanner in its holster, carry it toward the globe and aim its beam the way a player does by eye:
     * look at where the tool really is and nudge the hand until the beam passes through the aim point, then let go.
     * (IWSDK's grab does not move the tool 1:1 with the emulated grasp point, so open-loop placement misses.)
     * `aimAt` is a sector target id ('sector-b') or a world point. Returns what the game showed while aiming.
     */
    async scanWithScanner(hand, aimAt) {
      const api = window.__ORBIT_ZERO__;
      const r = window.__ORBIT_IWER__.remote;
      const scanner = api.getSceneObject('scanner-tool');
      const V = scanner.position.constructor;
      const aim = () => {
        scanner.updateWorldMatrix(true, false);
        return { aperture: scanner.localToWorld(new V(0, 0.092, -0.075)), dir: new V(0, 0, -1).transformDirection(scanner.matrixWorld) };
      };
      const beacons = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => api.get3DTargetWorldPosition(`sector-${id}`)).filter(Boolean).map((b) => new V(b.x, b.y, b.z));
      // 'miss': a spot on the globe's face well clear of every beacon (the globe turns when a sector is selected).
      const missPoint = () => {
        const centre = beacons.reduce((acc, b) => acc.add(b), new V()).multiplyScalar(1 / beacons.length);
        for (const [dx, dy] of [[0.16, 0.05], [-0.16, 0.05], [0.14, -0.12], [-0.14, -0.12], [0.0, 0.17]]) {
          const p = centre.clone().add(new V(dx, dy, -0.03));
          if (beacons.every((b) => b.distanceTo(p) > 0.08)) return p;
        }
        return centre.clone().add(new V(0.2, 0.08, -0.03));
      };
      const missAt = aimAt === 'miss' ? missPoint() : null;
      const point = () => {
        if (missAt) return missAt.clone();
        const p = typeof aimAt === 'string' ? api.get3DTargetWorldPosition(aimAt) : aimAt;
        return new V(p.x, p.y, p.z);
      };
      const grasp = async () => (await r.dispatch('get_hand_state', { device: hand })).anchors.grasp;
      await window.__HANDS__.setPose(hand, 'default');
      await window.__HANDS__.pinch(hand, 0);
      await window.__HANDS__.travel(hand, api.get3DTargetWorldPosition('scanner-tool'));
      const before = scanner.getWorldPosition(new V());
      const side = hand === 'hand-left' ? 'left' : 'right';
      const atHolster = { pointer: api.getHandPointerState(side), transition: (await r.dispatch('get_hand_state', { device: hand })).transition };
      await window.__HANDS__.pinch(hand, 1);
      atHolster.afterPinch = api.getHandPointerState(side);
      // Coarse reach along a path to where the beam would pass through the aim point 6 cm ahead of the lens.
      let { aperture, dir } = aim();
      let g = await grasp();
      let e = point().addScaledVector(dir, -0.06).sub(aperture);
      await window.__HANDS__.travel(hand, { x: g.x + e.x, y: g.y + e.y, z: g.z + e.z }, 'grasp', 10);
      // A real hand is never perfectly still; the emulated one is. IWSDK's grab applies a hand move one pose
      // update late, so re-send the resting pose (the hand "holds still" for a moment) before judging the aim.
      const holdStill = async () => {
        const now = await grasp();
        await r.dispatch('set_transform', { device: hand, anchor: 'grasp', position: { x: now.x, y: now.y, z: now.z } });
        await window.__HANDS__.settle();
      };
      await holdStill();
      const grabbed = scanner.getWorldPosition(new V()).distanceTo(before) > 0.05;
      // Fine aim by eye.
      let corrections = 0;
      const trace = [];
      for (; corrections < 8; corrections++) {
        ({ aperture, dir } = aim());
        e = point().addScaledVector(dir, -0.06).sub(aperture);
        if (e.length() < 0.004) break;
        g = await grasp();
        trace.push({ g: [g.x, g.y, g.z].map((v) => +v.toFixed(3)), s: [scanner.position.x, scanner.position.y, scanner.position.z].map((v) => +v.toFixed(3)), ap: [aperture.x, aperture.y, aperture.z].map((v) => +v.toFixed(3)), d: [dir.x, dir.y, dir.z].map((v) => +v.toFixed(2)) });
        await r.dispatch('set_transform', { device: hand, anchor: 'grasp', position: { x: g.x + e.x, y: g.y + e.y, z: g.z + e.z } });
        await window.__HANDS__.settle();
        await holdStill();
      }
      ({ aperture, dir } = aim());
      const laser = scanner.getObjectByName('ScannerAimLaser');
      const shown = {
        grabbed,
        corrections,
        aimErrorCm: Number((point().addScaledVector(dir, -0.06).sub(aperture).length() * 100).toFixed(2)),
        selectedWhileAiming: api.getState().selectedSectorId,
        stepTitle: api.getPanelText('mission-hud', 'StepTitle'),
        beamOpacity: laser?.material?.opacity ?? null,
        beamLengthM: laser ? Number((0.28 * laser.scale.y).toFixed(3)) : null,
        atHolster: grabbed ? undefined : atHolster,
        trace: trace.slice(0, 2),
      };
      await window.__HANDS__.pinch(hand, 0);
      await new Promise((res) => setTimeout(res, 150));
      await window.__HANDS__.travel(hand, window.__HANDS__.rest(hand), 'grasp', 6);
      return shown;
    },
  };
});

const H = (fn, ...args) => page.evaluate(({ fn, args }) => window.__HANDS__[fn](...args), { fn, args });

try {
  await page.goto(`${url}?scenario=FIRELINE_PASS`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__), null, { timeout: 90000 });
  // Test setup only: enter the session through the in-world XR button (the landing flow is covered elsewhere).
  await page.evaluate(() => window.__ORBIT_ZERO__.clickPanel('briefing-panel', 'xr-button'));
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 30000 });
  await page.evaluate(async () => {
    const r = window.__ORBIT_IWER__.remote;
    await r.dispatch('set_input_mode', { mode: 'hand' });
    for (const d of ['hand-left', 'hand-right']) await r.dispatch('set_connected', { device: d, connected: true });
    for (const d of ['hand-left', 'hand-right']) await r.dispatch('set_transform', { device: d, position: window.__HANDS__.rest(d) });
  });
  await page.waitForTimeout(1200);

  const cuesSince = (t0) => page.evaluate((t) => window.__ORBIT_ZERO__.getCueLog().filter((c) => c.at >= t).map((c) => c.cue), t0);
  const now = () => page.evaluate(() => Math.round(performance.now()));
  const borderOf = (panelId, id) => page.evaluate(({ panelId, id }) =>
    window.__ORBIT_ZERO__.getSceneObject(panelId)?.getElementById(id)?.borderInset?.value?.[0] ?? null, { panelId, id });

  // ---- Mission Card: START by laser (hover feedback first, then pinch) ----
  const startBorder = await borderOf('mission-hud', 'Btn_StartPass');
  let t0 = await now();
  let aim = await H('rayAim', 'hand-right', await pos('mission-hud:Btn_StartPass'));
  check(aim.pointer?.activeKind === 'ray' && aim.pointer?.rayTarget === 'mission-hud',
    'seated hand at rest: the laser (IWSDK hand ray) is the active pointer and is on the Mission Card', JSON.stringify(aim.pointer));
  check(aim.hover.includes('ui:Btn_StartPass') && (await borderOf('mission-hud', 'Btn_StartPass')) > startBorder && (await cuesSince(t0)).includes('HOVER_TICK'),
    'laser on START PASS: the button border thickens and a hover tick plays', `border ${startBorder} -> ${await borderOf('mission-hud', 'Btn_StartPass')}, cues ${await cuesSince(t0)}`);
  await H('rayPinch', 'hand-right', await pos('mission-hud:Btn_StartPass'));
  await page.waitForTimeout(900);
  check(/PICK A TARGET|SCAN SECTOR/i.test((await hud('StepTitle')) ?? ''), 'laser + pinch on START PASS opens the Next Step strip', await hud('StepTitle'));

  // ---- Laser on a sector beacon and on a desk pad: hover feedback, then the pinch acts on exactly that ----
  t0 = await now();
  aim = await H('rayAim', 'hand-right', await pos('sector-c'));
  const beaconScale = await page.evaluate(() => window.__ORBIT_ZERO__.getSceneObject('sector-c').scale.x);
  check(aim.pointer?.rayTarget === 'sector-c' && aim.hover.includes('sector-c') && beaconScale > 1.2 && (await cuesSince(t0)).includes('HOVER_TICK'),
    'laser on Sector C: the beacon grows and a hover tick plays', `target=${aim.pointer?.rayTarget} scale=${beaconScale.toFixed(2)} cues=${await cuesSince(t0)}`);
  await H('rayPinch', 'hand-right', await pos('sector-c'));
  check((await state()).selectedSectorId === 'C' && /SECTOR C/i.test((await hud('StepTitle')) ?? ''),
    'laser + pinch on Sector C selects C and the HUD names it', `${(await state()).selectedSectorId} | ${await hud('StepTitle')}`);
  const sensorBefore = (await state()).activeSensorMode;
  const padBase = await page.evaluate(() => window.__ORBIT_ZERO__.getSceneObject('pad-toggle-sensor').scale.x);
  aim = await H('rayAim', 'hand-right', await pos('pad-toggle-sensor'));
  const padHoverScale = await page.evaluate(() => window.__ORBIT_ZERO__.getSceneObject('pad-toggle-sensor').scale.x);
  check(aim.pointer?.rayTarget === 'pad-toggle-sensor' && padHoverScale > padBase * 1.1,
    'laser on the SENSOR pad: the pad grows', `target=${aim.pointer?.rayTarget} scale ${padBase.toFixed(2)} -> ${padHoverScale.toFixed(2)}`);
  await H('rayPinch', 'hand-right', await pos('pad-toggle-sensor'));
  check((await state()).activeSensorMode !== sensorBefore, 'laser + pinch on the SENSOR pad switches the sensor', `${sensorBefore} -> ${(await state()).activeSensorMode}`);

  // ---- A pinch released with the laser on nothing must not swallow the next pinch (IWSDK 1.0.1 drops that release) ----
  await page.evaluate(async () => {
    const r = window.__ORBIT_IWER__.remote;
    await window.__HANDS__.rayAim('hand-right', window.__ORBIT_ZERO__.get3DTargetWorldPosition('sector-b'));
    await window.__HANDS__.pinch('hand-right', 1);
    await r.dispatch('look_at', { device: 'hand-right', target: { x: 0.6, y: 2.6, z: 0.4 } }); // up and away: nothing under the laser
    await window.__HANDS__.settle();
    await window.__HANDS__.pinch('hand-right', 0);
    await window.__HANDS__.settle();
  });
  const sensorBeforeNext = (await state()).activeSensorMode;
  const afterStuck = await page.evaluate(() => window.__ORBIT_ZERO__.getHandPointerState('right'));
  t0 = await now();
  await H('rayPinch', 'hand-right', await pos('pad-toggle-sensor'));
  check((await state()).activeSensorMode !== sensorBeforeNext,
    'after a pinch released over empty space, the next laser pinch still works',
    `${sensorBeforeNext} -> ${(await state()).activeSensorMode} | ray after release: ${afterStuck?.states?.ray} | cues ${await cuesSince(t0)} | ${JSON.stringify(await page.evaluate(() => window.__ORBIT_ZERO__.getHandPointerState('right')))}`);

  // ---- A pinch acts on what the hand touches, not on what its laser happens to point at ----
  const beforeTouch = await state();
  const touch = await H('touchWhileAiming', 'hand-right', 'pad-toggle-sensor', ['sector-e', 'sector-c', 'sector-a', 'sector-d', 'sector-f']);
  const afterTouch = await state();
  check(/^sector-/.test(touch.pointer?.rayTarget ?? '') && afterTouch.activeSensorMode !== beforeTouch.activeSensorMode && afterTouch.selectedSectorId === beforeTouch.selectedSectorId,
    'fingertip on the SENSOR pad with the laser on a beacon: the pinch presses the pad and does not select the beacon',
    `laser=${touch.pointer?.rayTarget} sensor ${beforeTouch.activeSensorMode} -> ${afterTouch.activeSensorMode} selected ${beforeTouch.selectedSectorId} -> ${afterTouch.selectedSectorId}`);

  // ---- Scan B with the scanner (thermal), then pinch the scanner again: evidence must survive ----
  await page.evaluate(() => window.__ORBIT_ZERO__.setSensor('THERMAL')); // test setup: the sensor switch is not under test here
  // A fingertip brushing the scanner must not pick it up (it used to stick to the finger without a pinch).
  const brush = await H('brushScanner', 'hand-right');
  check(!brush.everHeld && brush.maxMoveCm < 1 && (await state()).packets.length === 0,
    'a fingertip brushing the scanner without a pinch leaves it in the holster', JSON.stringify(brush));
  const powerBeforeMiss = (await state()).power;
  t0 = await now();
  const miss = await H('scanWithScanner', 'hand-right', 'miss'); // over the globe, beam on no beacon
  let s = await state();
  check(miss.grabbed, 'pinching the scanner in its holster picks it up (the tool follows the hand)', JSON.stringify(miss));
  const missCues = await cuesSince(t0);
  check(s.packets.length === 0 && s.power === powerBeforeMiss && miss.beamOpacity < 0.6 && missCues.includes('ERROR_REJECT'),
    'letting go at the globe with the beam on no beacon scans nothing, spends nothing and plays the reject cue', `packets=${s.packets.length} power=${s.power} cues=${missCues} ${JSON.stringify(miss)}`);

  const aimB = await H('scanWithScanner', 'hand-right', 'sector-b');
  check(aimB.selectedWhileAiming === 'B' && /SECTOR B/i.test(aimB.stepTitle ?? '') && aimB.beamOpacity > 0.8,
    'while aiming, the beam locks on Sector B: beacon selected, HUD names it, beam brightens', JSON.stringify(aimB));
  s = await state();
  check(s.packets.length === 1 && s.packets[0].sectorId === 'B' && s.packets[0].confidence === 'CONFIRMED',
    'letting go of the locked scanner scans Sector B', JSON.stringify(s.packets.map((p) => `${p.sectorId}:${p.confidence}`)));
  const aimE = await H('scanWithScanner', 'hand-right', 'sector-e');
  s = await state();
  check(aimE.selectedWhileAiming === 'E' && s.packets.length === 2 && s.packets.some((p) => p.sectorId === 'B') && s.packets.some((p) => p.sectorId === 'E'),
    'a second scanner pinch scans E and keeps the first cube (no accidental discard)', JSON.stringify(s.packets.map((p) => `${p.id}:${p.sectorId}`)));
  check((await pos('scanner-tool'))?.x < -0.4, 'scanner returns to the left holster after each release', JSON.stringify(await pos('scanner-tool')));

  // ---- Quest menu / headset off / leaving VR: the running pass pauses, nothing is lost, the laser resumes it ----
  const snap = () => page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    const st = api.getState();
    return { paused: st.paused, clock: st.passRemainingSec, phase: st.phase, media: api.getMediaState(), immersive: api.getRuntimeStatus().immersive,
      step: api.getPanelText('mission-hud', 'StepTitle'), button: api.getPanelText('mission-hud', 'Lbl_HudTransmit') };
  });
  const resumeByLaser = async () => {
    await H('rayPinch', 'hand-right', await pos('mission-hud:Btn_HudTransmit'));
    await page.waitForTimeout(300);
    return snap();
  };
  let before = await snap();
  await page.evaluate(() => window.__ORBIT_IWER__.updateVisibilityState('visible-blurred'));
  await page.waitForTimeout(400);
  const inMenu = await snap();
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.__ORBIT_IWER__.updateVisibilityState('visible'));
  await page.waitForTimeout(400);
  let after = await snap();
  check(before.clock !== null && !before.paused && inMenu.paused && inMenu.media.held && inMenu.media.audio.held && inMenu.media.voiceHeld,
    'Quest menu (session visible-blurred): the pass pauses, voice and sound are held', `before=${JSON.stringify(before)} inMenu=${JSON.stringify(inMenu)}`);
  check(after.paused && Math.abs(after.clock - before.clock) < 0.05 && after.step === 'PAUSED' && /RESUME PASS/.test(after.button ?? ''),
    '3 s in the Quest menu = 0 s of pass clock; back in the game the HUD reads PAUSED / RESUME PASS', `clock ${before.clock?.toFixed(2)} -> ${after.clock?.toFixed(2)} | ${after.step} | ${after.button}`);
  let resumed = await resumeByLaser();
  await page.waitForTimeout(1000);
  const ticking = await snap();
  check(!resumed.paused && !resumed.media.held && !resumed.media.audio.held && ticking.clock < resumed.clock - 0.3,
    'laser + pinch on RESUME PASS resumes: voice and sound return and the clock runs again', `paused=${resumed.paused} held=${resumed.media.held} clock ${resumed.clock?.toFixed(2)} -> ${ticking.clock?.toFixed(2)}`);

  before = await snap();
  await page.evaluate(() => window.__ORBIT_IWER__.updateVisibilityState('hidden'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__ORBIT_IWER__.updateVisibilityState('visible'));
  await page.waitForTimeout(400);
  after = await snap();
  check(after.paused && Math.abs(after.clock - before.clock) < 0.05, 'headset taken off (session hidden) for 1.5 s: paused, 0 s of pass clock used',
    `clock ${before.clock?.toFixed(2)} -> ${after.clock?.toFixed(2)} paused=${after.paused}`);
  resumed = await resumeByLaser();

  before = await snap();
  await page.evaluate(() => window.__ORBIT_IWER__.activeSession?.end());
  await page.waitForFunction(() => !window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  after = await snap();
  check(!resumed.paused && after.paused && !after.immersive && Math.abs(after.clock - before.clock) < 0.3,
    'the session ends mid-pass (Quest menu > Exit): the pass pauses on the flat page and keeps its clock', `clock ${before.clock?.toFixed(2)} -> ${after.clock?.toFixed(2)} paused=${after.paused}`);
  // Back into VR (test setup: in-world XR button), then resume by laser.
  await page.evaluate(() => window.__ORBIT_ZERO__.clickPanel('briefing-panel', 'xr-button'));
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 30000 });
  await page.evaluate(async () => {
    const r = window.__ORBIT_IWER__.remote;
    await r.dispatch('set_input_mode', { mode: 'hand' });
    for (const d of ['hand-left', 'hand-right']) await r.dispatch('set_connected', { device: d, connected: true });
    for (const d of ['hand-left', 'hand-right']) await r.dispatch('set_transform', { device: d, position: window.__HANDS__.rest(d) });
  });
  await page.waitForTimeout(1200);
  resumed = await resumeByLaser();
  check(resumed.immersive && !resumed.paused && resumed.clock <= after.clock && resumed.clock > after.clock - 3,
    'back in VR, laser + pinch on RESUME PASS continues the same pass', `immersive=${resumed.immersive} paused=${resumed.paused} clock ${after.clock?.toFixed(2)} -> ${resumed.clock?.toFixed(2)}`);

  // ---- Discard must be deliberate ----
  const beforeDiscard = (await state()).packets.length;
  await H('pressDesk', 'hand-right', await pos('pad-discard-chute'));
  s = await state();
  check(s.packets.length === beforeDiscard, 'one pinch on the DISCARD pad only arms it (nothing thrown away)', `packets=${s.packets.length}`);
  check(/PINCH AGAIN/i.test((await panel('telemetry-hud', 'Lbl_DiscardCube')) ?? ''), 'armed discard is shown on the panel button', await panel('telemetry-hud', 'Lbl_DiscardCube'));
  await page.waitForTimeout(3300);
  check(!/PINCH AGAIN/i.test((await panel('telemetry-hud', 'Lbl_DiscardCube')) ?? ''), 'an armed discard expires unspent after 3 s');
  await H('pressDesk', 'hand-right', await pos('pad-discard-chute'), 2);
  s = await state();
  check(s.packets.length === beforeDiscard - 1, 'pinching the DISCARD pad twice (hand stays on it) discards the selected cube', `packets=${s.packets.length}`);

  // Re-scan so two cubes are on board again, then carry one into the chute: the deliberate physical discard.
  await H('scanWithScanner', 'hand-right', 'sector-e');
  s = await state();
  const cubeSlot = s.packets.findIndex((p) => p.sectorId === 'E');
  const nBefore = s.packets.length;
  if (cubeSlot < 0) {
    check(false, 'carrying a cube into the chute discards it', `no Sector E cube to carry: ${JSON.stringify(s.packets.map((p) => p.sectorId))}`);
  } else {
    await H('carry', 'hand-left', await pos(`evidence-cube-${cubeSlot + 1}`), await pos('DISCARD_CHUTE'));
    s = await state();
    check(s.packets.length === nBefore - 1 && !s.packets.some((p) => p.sectorId === 'E'), 'carrying a cube into the chute discards it', `packets=${s.packets.length}`);
  }

  // A cube released over Downlink Slot 3 docks there and is never discarded (zones used to overlap).
  const keepSlot = s.packets.findIndex((p) => p.sectorId === 'B');
  if (keepSlot < 0) {
    check(false, 'a cube released over Slot 3 is docked, not discarded', `no Sector B cube to carry: ${JSON.stringify(s.packets.map((p) => p.sectorId))}`);
  } else {
    await H('carry', 'hand-left', await pos(`evidence-cube-${keepSlot + 1}`), await pos('DOWNLINK_SLOT_3'));
    s = await state();
    check(s.packets.some((p) => p.sectorId === 'B' && p.queued), 'a cube released over Slot 3 is docked, not discarded', JSON.stringify(s.packets.map((p) => `${p.sectorId}:${p.queued ? 'Q' : '-'}`)));
  }

  check(failures.length === 0, 'no page errors', failures.slice(0, 3).join(' | '));
} catch (err) {
  check(false, 'run completed without exceptions', String(err?.stack ?? err));
} finally {
  const passed = results.filter((r) => r.ok).length;
  await writeFile(join(out, 'report.json'), JSON.stringify({ when: new Date().toISOString(), passed, total: results.length, results,
    note: 'IWER Meta Quest 3 emulation (hand input) on desktop Chromium. Not a physical-headset measurement.' }, null, 2));
  console.log(`[hands-first] ${passed}/${results.length} checks passed.`);
  await close();
  process.exit(passed === results.length ? 0 : 1);
}
