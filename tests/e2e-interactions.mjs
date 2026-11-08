import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.ORBIT_TEST_URL;
if (!baseUrl) throw new Error('Set ORBIT_TEST_URL to a fresh dev server or production preview.');
const artifacts = process.env.ORBIT_ARTIFACT_DIR;
if (artifacts) await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.ORBIT_BROWSER_CHANNEL || 'chrome', headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])],
});
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 960 } });
const iwer = await readFile(resolve('node_modules/iwer/build/iwer.js'), 'utf8');
await context.addInitScript({ content: `${iwer}\nconst device = new window.IWER.XRDevice(window.IWER.metaQuest3, { stereoEnabled: false }); device.installRuntime({ forceInstall: true }); window.__ORBIT_IWER__ = device;` });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') console.error(message.text()); });
const results = [];
const settle = () => page.waitForTimeout(240);

try {
  // IWER reports the Meta Quest user agent (headset lobby); ?landing forces the desktop landing flow.
  await page.goto(`${baseUrl}${baseUrl.includes('?') ? '&' : '?'}landing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('#btn-enter-experience').click();
  await page.locator('#card-op-fireline').click();
  await page.locator('#btn-play-desktop').click();
  await page.waitForFunction(() => window.__ORBIT_ZERO__?.getState, null, { timeout: 120000 });
  await settle();

  // Fixture configuration and XR session setup are explicit, never interaction fallbacks.
  await page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    api.selectSector('B');
    while (api.getState().activeSensorMode !== 'THERMAL') api.toggleSensor();
    api.scan();
  });
  await page.waitForTimeout(1000);

  const screen = async (targetId) => page.evaluate((id) => {
    const api = window.__ORBIT_ZERO__, object = api.getSceneObject(id);
    const actualCamera = api.desktopControls.host.camera;
    const position = object.position.clone();
    object.getWorldPosition(position);
    position.project(actualCamera);
    const bounds = document.querySelector('#scene-container canvas').getBoundingClientRect();
    return { x: bounds.left + (position.x + 1) * bounds.width / 2, y: bounds.top + (1 - position.y) * bounds.height / 2 };
  }, targetId);
  const stationScreen = async (stationId) => page.evaluate((id) => {
    const api = window.__ORBIT_ZERO__, cube = api.getSceneObject('evidence-cube-1');
    const camera = api.desktopControls.host.camera;
    const p = api.get3DTargetWorldPosition(id), vector = cube.position.clone().set(p.x, p.y, p.z).project(camera);
    const bounds = document.querySelector('#scene-container canvas').getBoundingClientRect();
    return { x: bounds.left + (vector.x + 1) * bounds.width / 2, y: bounds.top + (1 - vector.y) * bounds.height / 2 };
  }, stationId);
  const desktopDrop = async (station) => {
    const from = await screen('evidence-cube-1'), to = await stationScreen(station);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 14 });
    await settle();
    await page.mouse.up();
    await settle();
  };
  await desktopDrop('PROCESS_CRADLE');
  assert.equal(await page.evaluate(() => window.__ORBIT_ZERO__.getState().packets[0].processed), true, 'Desktop physical drag must process without debug fallback');
  await desktopDrop('DOWNLINK_SLOT_3');
  assert.equal(await page.evaluate(() => window.__ORBIT_ZERO__.getState().packets[0].queued), true, 'Desktop physical drag must queue');
  await desktopDrop('RAW_TRAY_1');
  assert.equal(await page.evaluate(() => window.__ORBIT_ZERO__.getState().packets[0].queued), false, 'Desktop physical drag must unqueue');
  results.push('Desktop mouse drag: process, queue, unqueue');
  if (artifacts) await page.screenshot({ path: resolve(artifacts, 'desktop-interactions.png') });

  await page.evaluate(() => window.__ORBIT_ZERO__.clickPanel('briefing-panel', 'xr-button'));
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 20000 });
  const remote = async (method, params) => page.evaluate(async ({ method, params }) => {
    const device = window.IWER_DEVICE ?? window.__ORBIT_IWER__;
    return device.remote.dispatch(method, params);
  }, { method, params });
  const handAt = async (device, targetId) => {
    const position = await page.evaluate((id) => window.__ORBIT_ZERO__.get3DTargetWorldPosition(id), targetId);
    await remote('set_transform', { device, position, anchor: 'grasp' });
    await settle();
  };
  const grips = () => page.evaluate(() => window.__ORBIT_ZERO__.getActiveXRHandGrabs());
  await remote('set_input_mode', { mode: 'hand' });
  await remote('set_connected', { device: 'hand-left', connected: false });
  await remote('set_connected', { device: 'hand-right', connected: true });
  await remote('set_hand_pose', { device: 'hand-right', poseId: 'point' });
  await remote('set_select_value', { device: 'hand-right', value: 0 });
  await handAt('hand-right', 'evidence-cube-1');
  await remote('set_select_value', { device: 'hand-right', value: 1 });
  await settle();
  assert.equal((await grips()).length, 1, 'Right-first native XR hand must own one cube');

  await remote('set_connected', { device: 'hand-left', connected: true });
  await remote('set_hand_pose', { device: 'hand-left', poseId: 'point' });
  await remote('set_select_value', { device: 'hand-left', value: 0 });
  await handAt('hand-left', 'evidence-cube-1');
  await remote('set_select_value', { device: 'hand-left', value: 1 });
  await settle();
  assert.equal((await grips()).length, 1, 'Second hand must not claim the held cube');
  await remote('set_select_value', { device: 'hand-left', value: 0 });
  await remote('set_connected', { device: 'hand-right', connected: false });
  await settle();
  assert.equal((await grips()).length, 0, 'Tracking loss must terminate ownership');
  await remote('set_connected', { device: 'hand-right', connected: true });
  await handAt('hand-right', 'evidence-cube-1');
  assert.equal((await grips()).length, 0, 'Reacquisition while pinched must not grab');
  await remote('set_select_value', { device: 'hand-right', value: 0 });
  await settle();
  await remote('set_select_value', { device: 'hand-right', value: 1 });
  await settle();
  assert.equal((await grips()).length, 1);
  await handAt('hand-right', 'DOWNLINK_SLOT_2');
  await remote('set_select_value', { device: 'hand-right', value: 0 });
  await settle();
  assert.equal((await grips()).length, 0);
  assert.equal(await page.evaluate(() => window.__ORBIT_ZERO__.getState().packets[0].queued), true);
  results.push('IWER/native frames: right-first, exclusive owner, tracking loss, pinch rearm, queue');

  await handAt('hand-left', 'evidence-cube-1');
  await remote('set_select_value', { device: 'hand-left', value: 1 });
  await settle();
  assert.equal((await grips()).length, 1);
  await handAt('hand-left', 'evidence-cube-1');
  await remote('set_select_value', { device: 'hand-left', value: 0 });
  await settle();
  await remote('set_select_value', { device: 'hand-left', value: 1 });
  await settle();
  assert.equal((await grips()).length, 1);
  if (artifacts) await page.screenshot({ path: resolve(artifacts, 'xr-held-cube.png') });
  await page.evaluate(() => (window.IWER_DEVICE ?? window.__ORBIT_IWER__).remote.dispatch('end_session'));
  await page.waitForFunction(() => !window.__ORBIT_ZERO__.getRuntimeStatus().immersive);
  assert.equal((await grips()).length, 0, 'Session exit must recover held cube');
  results.push('Session exit clears cube ownership');
  await page.evaluate(() => window.__ORBIT_ZERO__.clickPanel('briefing-panel', 'xr-button'));
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive);
  await remote('set_input_mode', { mode: 'hand' });
  await remote('set_select_value', { device: 'hand-left', value: 0 });
  await handAt('hand-left', 'evidence-cube-1');
  await remote('set_select_value', { device: 'hand-left', value: 1 });
  await settle();
  assert.equal((await grips()).length, 1, 'Session re-entry must accept a fresh open/pinch');
  await remote('set_transform', { device: 'hand-left', position: { x: 0, y: 1.5, z: 0 }, anchor: 'grasp' });
  await settle();
  await remote('set_select_value', { device: 'hand-left', value: 0 });
  await settle();
  assert.equal((await grips()).length, 0);
  assert.equal(await page.evaluate(() => window.__ORBIT_ZERO__.getState().packets[0].queued), true, 'Invalid release retains the previous queue state');
  results.push('Session re-entry and invalid-drop recovery');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(JSON.stringify({ status: 'PASS', results, verification: 'Desktop and IWER integration; XR entry and mission fixture use explicit setup, no interaction fallback; not physical Quest' }));
} catch (error) {
  if (artifacts) await page.screenshot({ path: resolve(artifacts, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
