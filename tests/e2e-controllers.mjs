// A judge may pick up the controllers instead of using hands. Quest Browser starts a session with controllers
// unless hand tracking is on and the controllers are put down, so this is a likely first experience.
// The emulated Quest 3 runs in CONTROLLER input mode (no hands): everything is done with the controller's ray
// and trigger. Carrying a cube by hand is hand-tracking only, so the telemetry panel's buttons do the same jobs
// (compress, load into the bay, discard, select next cube); this test plays a whole pass that way, from START
// PASS to the open downlink window.
//
// Usage: npm run build ; node tests/e2e-controllers.mjs
import { launchApp } from './_harness.mjs';

const results = [];
const check = (ok, name, detail = '') => {
  results.push(Boolean(ok));
  console.log(`[controllers] ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`);
};

const app = await launchApp({ inputMode: 'controller' });
const { page, url, failures } = app;
const state = () => page.evaluate(() => window.__ORBIT_ZERO__.getState());

/** Aim a controller's ray at a named target and pull the trigger once. */
const press = (device, id) => page.evaluate(async ({ device, id }) => {
  const api = window.__ORBIT_ZERO__;
  const remote = window.__ORBIT_IWER__.remote;
  const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
  const world = api.get3DTargetWorldPosition(id);
  if (!world) return { ok: false, reason: `no target ${id}` };
  // IWER places devices in the floor-origin space; the seat fit shifts that space (see tests/e2e-judge-fit.mjs).
  const [ox, oy, oz] = api.getSeatFit().playerOffset;
  const head = window.__ORBIT_IWER__.position;
  const side = device.endsWith('right') ? 1 : -1;
  await remote.dispatch('set_transform', { device, position: { x: head.x + side * 0.25, y: head.y - 0.25, z: head.z - 0.2 } });
  await remote.dispatch('look_at', { device, target: { x: world.x - ox, y: world.y - oy, z: world.z - oz } });
  await settle();
  const pointer = api.getHandPointerState ? api.getHandPointerState(side > 0 ? 'right' : 'left') : null;
  await remote.dispatch('set_select_value', { device, value: 1 });
  await settle();
  await remote.dispatch('set_select_value', { device, value: 0 });
  await settle();
  await settle();
  return { ok: true, rayTarget: pointer?.rayTarget ?? null };
}, { device, id });

try {
  await page.goto(`${url}?scenario=FIRELINE_PASS`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#oz-xr-entry')?.dataset.phase === 'ready', null, { timeout: 180000 });
  await page.click('#oz-xr-enter');
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getSeatFit().count > 0, null, { timeout: 15000 });
  const mode = await page.evaluate(async () => {
    const remote = window.__ORBIT_IWER__.remote;
    await remote.dispatch('set_input_mode', { mode: 'controller' });
    for (const d of ['controller-left', 'controller-right']) await remote.dispatch('set_connected', { device: d, connected: true });
    return window.__ORBIT_IWER__.primaryInputMode;
  });
  await page.waitForTimeout(800);
  check(mode === 'controller', 'the emulated headset is in controller mode (no hands)', mode);

  // 1. Mission Card -> START PASS (UIKit button, ray + trigger)
  let r = await press('controller-right', 'mission-hud:Btn_StartPass');
  await page.waitForTimeout(300);
  const kicker = await page.evaluate(() => window.__ORBIT_ZERO__.getPanelText('mission-hud', 'StepKicker'));
  check(r.ok && /NEXT STEP|TRAINING/.test(kicker ?? ''), 'START PASS by controller ray + trigger closes the Mission Card', JSON.stringify({ r, kicker }));

  // 2. Select a sector beacon (ECS Pressed path): first with the LEFT controller, then with the right one.
  r = await press('controller-left', 'sector-e');
  let s = await state();
  check(s.selectedSectorId === 'E', 'the left controller selects a beacon by ray + trigger', `selected ${s.selectedSectorId} ${JSON.stringify(r)}`);
  r = await press('controller-right', 'sector-b');
  s = await state();
  check(s.selectedSectorId === 'B', 'the right controller selects a beacon by ray + trigger', `selected ${s.selectedSectorId} ${JSON.stringify(r)}`);

  // 3. Arm THERMAL with the sensor pad (up to three presses cycle through the fitted sensors)
  for (let i = 0; i < 3 && (await state()).activeSensorMode !== 'THERMAL'; i++) await press('controller-right', 'pad-toggle-sensor');
  s = await state();
  check(s.activeSensorMode === 'THERMAL', 'the sensor pad switches the sensor (THERMAL)', s.activeSensorMode);

  // 4. FIRE SWATH plunger scans the selected sector
  await press('controller-right', 'pad-fire-swath');
  s = await state();
  check(s.packets.length === 1 && s.packets[0].sectorId === 'B' && s.packets[0].confidence === 'CONFIRMED', 'the plunger scans Sector B with THERMAL (CONFIRMED cube)',
    JSON.stringify(s.packets.map((p) => `${p.id}:${p.sectorId}:${p.sensorMode}:${p.confidence}`)));

  // 5. Compress it with the telemetry panel
  await press('controller-right', 'telemetry-hud:Btn_ProcessCube');
  s = await state();
  check(s.packets[0]?.processed === true, 'COMPRESS SELECTED CUBE (panel button) compresses the cube', `processed=${s.packets[0]?.processed} power=${s.power}`);

  // 6. Load it into the bay
  await press('controller-right', 'telemetry-hud:Btn_QueueCube');
  s = await state();
  check(s.queuePacketIds.length === 1, 'ADD SELECTED CUBE TO DOWNLINK BAY (panel button) loads Slot 1', JSON.stringify(s.queuePacketIds));

  // 7. Open the link from the Mission HUD
  await press('controller-right', 'mission-hud:Btn_HudTransmit');
  await page.waitForTimeout(500);
  s = await state();
  check(s.phase === 'DOWNLINK', 'TRANSMIT (Mission HUD) opens the live downlink window', s.phase);

  check(failures.length === 0, 'no page errors', failures.slice(0, 3).join(' | '));
} finally {
  await app.close();
}
const passed = results.filter(Boolean).length;
console.log(`[controllers] ${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
