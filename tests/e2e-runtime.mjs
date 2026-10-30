import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { get as getHttps } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, 'artifacts', 'enhanced');
await mkdir(artifacts, { recursive: true });
const run = (script, args = []) => new Promise((resolveRun, reject) => {
  const child = spawn(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', (code) => code === 0 ? resolveRun() : reject(new Error(`Command exited ${code}`)));
});
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
if (!process.env.ORBIT_SKIP_BUILD && !process.env.ORBIT_TEST_URL) await run(vite, ['build']);
const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolvePort(address.port));
  });
});
const url = process.env.ORBIT_TEST_URL || `https://localhost:${port}/`;
const preview = process.env.ORBIT_TEST_URL ? null : spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe' });
let serverLog = '';
preview?.stdout.on('data', (data) => { serverLog += data; });
preview?.stderr.on('data', (data) => { serverLog += data; });
let browser;
let page;
const failures = [];
const clicks = [];
try {
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      const ready = url.startsWith('https://')
        ? await new Promise((resolveReady) => {
          const request = getHttps(url, { rejectUnauthorized: false }, (response) => { response.resume(); resolveReady(response.statusCode === 200); });
          request.on('error', () => resolveReady(false));
          request.setTimeout(1000, () => { request.destroy(); resolveReady(false); });
        })
        : (await fetch(url)).ok;
      if (ready) break;
    } catch {}
    if (Date.now() > deadline) throw new Error(`Preview did not start: ${serverLog}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  const installed = process.env.ORBIT_BROWSER_PATH || (existsSync(chromium.executablePath()) ? chromium.executablePath() : undefined);
  browser = await chromium.launch({
    ...(installed ? { executablePath: installed } : { channel: process.env.ORBIT_BROWSER_CHANNEL || (process.platform === 'win32' ? 'chrome' : 'chromium') }),
    headless: process.env.ORBIT_HEADED !== '1',
    args: ['--enable-webgl', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
  const iwerSource = await readFile(join(root, 'node_modules', 'iwer', 'build', 'iwer.js'), 'utf8');
  await context.addInitScript({ content: `${iwerSource}\nconst device = new window.IWER.XRDevice(window.IWER.metaQuest3, { stereoEnabled: false }); device.installRuntime({forceInstall:true}); device.primaryInputMode = 'hand'; window.__ORBIT_IWER__ = device;` });
  page = await context.newPage();
  page.on('pageerror', (error) => failures.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
  page.on('requestfailed', (request) => { if (!request.failure()?.errorText.includes('ERR_ABORTED')) failures.push(`Request failed: ${request.url()} ${request.failure()?.errorText}`); });
  page.on('response', (response) => { if (response.status() >= 400) failures.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__), null, { timeout: 60000 });
  await page.waitForTimeout(700);
  const diagnostic = await page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      state: api.getState().phase,
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      stats: api.getRendererStats(),
    };
  });
  assert.equal(diagnostic.state, 'OPERATIONS');
  await page.screenshot({ path: join(artifacts, '01-hero.png') });
  const click = async (panelId, elementId) => {
    await page.mouse.move(1380, 950);
    await page.waitForTimeout(100);
    const location = await page.evaluate(({ panelId, elementId }) => window.__ORBIT_ZERO__.getControlScreenPosition?.(panelId, elementId), { panelId, elementId });
    clicks.push({ panelId, elementId, location });
    if (location) {
      await page.mouse.move(location.x, location.y);
      await page.waitForTimeout(60);
      await page.mouse.down();
      await page.waitForTimeout(60);
      await page.mouse.up();
    } else assert.equal(await page.evaluate(({ panelId, elementId }) => window.__ORBIT_ZERO__.clickPanel(panelId, elementId), { panelId, elementId }), true, `Missing control ${elementId}`);
    await page.waitForTimeout(260);
  };
  const clickAndObserve = async (panel, id, predicate) => {
    await click(panel, id);
    await page.waitForFunction(predicate, null, { timeout: 5000 });
  };
  await click('briefing-panel', 'Btn_CalibrateSeat');
  await click('briefing-panel', 'Btn_ScanSector');
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().packets.length === 1);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(artifacts, '02-scan-materialization.png') });
  await click('telemetry-hud', 'Btn_ProcessCube');
  await page.waitForTimeout(170);
  await page.screenshot({ path: join(artifacts, '03-compression.png') });
  await page.waitForTimeout(650);
  await click('telemetry-hud', 'Btn_Pause');
  assert.equal(await page.evaluate(() => window.__ORBIT_ZERO__.getState().paused), true);
  await click('telemetry-hud', 'Btn_Pause');
  await page.evaluate(() => window.__ORBIT_ZERO__.restart());

  const results = [];
  for (const scenarioId of ['STANDARD_INDUS_PASS', 'MONSOON_SUPERCELL_PASS', 'SOLAR_BROWNOUT_PASS']) {
    await page.evaluate((id) => window.__ORBIT_ZERO__.setScenario(id), scenarioId);
    const plan = await page.evaluate(() => window.__ORBIT_ZERO__.getMissionBenchmark());
    for (const action of plan.actions) {
      if (action.type === 'SCAN') {
        for (let attempt = 0; attempt < 6 && await page.evaluate((id) => window.__ORBIT_ZERO__.getState().selectedSectorId !== id, action.sectorId); attempt++) await click('briefing-panel', 'Btn_CycleSector');
        assert.equal(await page.evaluate(() => window.__ORBIT_ZERO__.getState().selectedSectorId), action.sectorId, 'Target sector control did not respond');
        if (await page.evaluate((mode) => window.__ORBIT_ZERO__.getState().activeSensorMode !== mode, action.sensorMode)) await click('briefing-panel', 'Btn_ToggleSensor');
        await click('briefing-panel', 'Btn_ScanSector');
      } else {
        const packet = await page.evaluate((action) => window.__ORBIT_ZERO__.getState().packets.find((p) => p.sectorId === action.sectorId && p.sensorMode === action.sensorMode), action);
        assert.ok(packet);
        for (let attempt = 0; attempt < 6 && await page.evaluate((id) => window.__ORBIT_ZERO__.getState().selectedPacketId !== id, packet.id); attempt++) await click('telemetry-hud', 'Btn_CycleCube');
        assert.equal(await page.evaluate(() => window.__ORBIT_ZERO__.getState().selectedPacketId), packet.id, 'Evidence selector did not respond');
        await click('telemetry-hud', action.type === 'PROCESS' ? 'Btn_ProcessCube' : action.type === 'DISCARD' ? 'Btn_DiscardCube' : 'Btn_QueueCube');
      }
    }
    await page.waitForTimeout(800);
    if (scenarioId === 'STANDARD_INDUS_PASS') await page.screenshot({ path: join(artifacts, '04-evidence-and-schedule.png') });
    const start = Date.now();
    await clickAndObserve('debrief-panel', 'Btn_CommitDownlink', () => window.__ORBIT_ZERO__.getState().phase === 'DOWNLINK');
    if (scenarioId === 'STANDARD_INDUS_PASS') {
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(artifacts, '05-live-downlink.png') });
      await click('telemetry-hud', 'Btn_Pause');
      const frozen = await page.evaluate(() => window.__ORBIT_ZERO__.getState().downlinkElapsedSec);
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => window.__ORBIT_ZERO__.getState().downlinkElapsedSec), frozen);
      await click('telemetry-hud', 'Btn_Pause');
    }
    await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 18000 });
    const state = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
    assert.equal(state.debrief.totalScore, plan.score);
    assert.equal(state.debrief.efficiencyGrade, 'S');
    assert.ok(Date.now() - start >= plan.transmitSec * 1000 - 300, 'Downlink completed faster than real time');
    assert.equal(await page.evaluate(() => window.__ORBIT_ZERO__.verifyReplay()), await page.evaluate(() => window.__ORBIT_ZERO__.getStateHash()));
    results.push({ scenarioId, score: state.debrief.totalScore, seconds: state.debrief.downlinkUsedSec, powerUsed: state.debrief.powerUsed });
    if (scenarioId === 'STANDARD_INDUS_PASS') {
      await page.screenshot({ path: join(artifacts, '06-ground-outcomes.png') });
      await click('debrief-panel', 'Btn_ReplayDecision');
      await page.screenshot({ path: join(artifacts, '07-decision-replay.png') });
    }
  }

  await page.evaluate(() => window.__ORBIT_ZERO__.setScenario('STANDARD_INDUS_PASS'));
  await click('telemetry-hud', 'Btn_Settings');
  for (const id of ['Btn_OneHanded', 'Btn_ReducedMotion', 'Btn_LargeText', 'Btn_HighContrast']) await click('telemetry-hud', id);
  const profile = await page.evaluate(() => window.__ORBIT_ZERO__.getProfile());
  assert.equal(profile.preferences.reducedMotion, true);
  assert.equal(profile.preferences.largeText, true);
  assert.equal(profile.preferences.highContrast, true);
  assert.equal(profile.preferences.oneHanded, true);
  await page.screenshot({ path: join(artifacts, '08-accessibility.png') });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  assert.deepEqual(await page.evaluate(() => window.__ORBIT_ZERO__.getProfile().preferences), profile.preferences);

  await click('briefing-panel', 'xr-button');
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 20000 });
  await page.screenshot({ path: join(artifacts, '09-emulated-xr.png') });
  await click('briefing-panel', 'exit-button');
  await page.waitForFunction(() => !window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 10000 });

  const finalStats = await page.evaluate(() => window.__ORBIT_ZERO__.getRendererStats());
  await writeFile(join(artifacts, 'verification.json'), JSON.stringify({ tier: 'Desktop Playwright plus emulated XR, not physical Quest', diagnostic, results, finalStats, failures }, null, 2));
  assert.equal(failures.length, 0, failures.join('\n'));
  if (!process.env.ORBIT_SKIP_BUDGETS) {
    assert.ok(finalStats.calls <= 145, `Draw calls ${finalStats.calls} exceed 145`);
    assert.ok(finalStats.triangles <= 85000, `Triangles ${finalStats.triangles} exceed 85000`);
    assert.ok(finalStats.textures <= 16, `Textures ${finalStats.textures} exceed 16`);
  }
  console.log(JSON.stringify({ status: 'PASS', results, finalStats, artifacts, xr: 'IWER emulation, not headset' }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {});
    const state = await page.evaluate(() => window.__ORBIT_ZERO__?.getState()).catch(() => null);
    await writeFile(join(artifacts, 'failure.json'), JSON.stringify({ error: String(error), state, failures, clicks, serverLog }, null, 2));
  }
  throw error;
} finally {
  await browser?.close();
  preview?.kill();
}
