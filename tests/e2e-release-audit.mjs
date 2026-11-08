import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { get as getHttps } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Build/revision identification for reproducible audit reports.
let GIT_REVISION = 'UNKNOWN';
try { GIT_REVISION = execSync('git rev-parse --short HEAD', { cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..') }).toString().trim(); } catch { /* non-git env */ }

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, 'artifacts', 'release-audit');
await mkdir(artifacts, { recursive: true });

const run = (script, args = []) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolveRun() : reject(new Error(`Command exited ${code}`))));
  });

const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
if (!process.env.ORBIT_SKIP_BUILD && !process.env.ORBIT_TEST_URL) {
  await run(vite, ['build']);
}

const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolvePort(address.port));
  });
});

const baseUrl = process.env.ORBIT_TEST_URL || `https://localhost:${port}/`;
const preview = process.env.ORBIT_TEST_URL
  ? null
  : spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: 'pipe',
  });

let serverLog = '';
preview?.stdout.on('data', (data) => {
  serverLog += data;
});
preview?.stderr.on('data', (data) => {
  serverLog += data;
});

let browser;
let page;
const failures = [];
const stageReport = [{ stage: 0, name: 'Build Identification', status: 'INFO', gitRevision: GIT_REVISION, timestamp: new Date().toISOString() }];

try {
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      const ready = baseUrl.startsWith('https://')
        ? await new Promise((resolveReady) => {
          const request = getHttps(baseUrl, { rejectUnauthorized: false }, (response) => {
            response.resume();
            resolveReady(response.statusCode === 200);
          });
          request.on('error', () => resolveReady(false));
          request.setTimeout(1000, () => {
            request.destroy();
            resolveReady(false);
          });
        })
        : (await fetch(baseUrl)).ok;
      if (ready) break;
    } catch { }
    if (Date.now() > deadline) throw new Error(`Preview did not start: ${serverLog}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }

  const installed =
    process.env.ORBIT_BROWSER_PATH || (existsSync(chromium.executablePath()) ? chromium.executablePath() : undefined);
  browser = await chromium.launch({
    ...(installed
      ? { executablePath: installed }
      : { channel: process.env.ORBIT_BROWSER_CHANNEL || (process.platform === 'win32' ? 'chrome' : 'chromium') }),
    headless: process.env.ORBIT_HEADED !== '1',
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
    ],
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, ignoreHTTPSErrors: true });
  const iwerSource = await readFile(join(root, 'node_modules', 'iwer', 'build', 'iwer.js'), 'utf8');
  await context.addInitScript({
    content: `${iwerSource}\nconst device = new window.IWER.XRDevice(window.IWER.metaQuest3, { stereoEnabled: false }); device.installRuntime({forceInstall:true}); device.primaryInputMode = 'hand'; window.__ORBIT_IWER__ = device;`,
  });

  page = await context.newPage();
  page.on('pageerror', (error) => failures.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text();
      if (!text.includes('ERR_NAME_NOT_RESOLVED') && !text.includes('ERR_INTERNET_DISCONNECTED')) {
        failures.push(text);
      }
    }
  });

  // =========================================================================
  // STAGE 1: First Launch Hero Screen. IWER reports the Meta Quest user agent, which routes the root URL
  // to the headset lobby, so ?landing forces the cinematic landing that desktop visitors get.
  // =========================================================================
  await page.goto(`${baseUrl}${baseUrl.includes('?') ? '&' : '?'}landing`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#oz-hero-screen', { state: 'visible', timeout: 15000 });
  await page.waitForTimeout(500);
  const heroText = await page.locator('#oz-hero-screen').innerText();
  assert.ok(heroText.includes('ORBIT ZERO'), 'Hero screen must display ORBIT ZERO title');
  assert.ok(heroText.includes('ORBITAL TRIAGE OFFICER'), 'Hero screen must explain player role');
  assert.ok(heroText.includes('10.0 MB/s'), 'Hero screen must display S-Band link rate');
  await page.screenshot({ path: join(artifacts, '01-first-launch-hero.png') });
  stageReport.push({ stage: 1, name: 'First Launch Hero Screen (Root URL /)', status: 'PASS', screenshot: '01-first-launch-hero.png' });

  // =========================================================================
  // STAGE 2: Main Menu & Campaign Selection (Mouse/Pointer Only, No Keyboard)
  // =========================================================================
  await page.click('#btn-enter-experience');
  await page.waitForTimeout(700);
  const selectionText = await page.locator('#oz-selection-screen').innerText();
  assert.ok(selectionText.includes('OP 00: ORBITAL ACADEMY'), 'Campaign screen must show OP 00: Orbital Academy');
  assert.ok(selectionText.includes('OP 01: FIRELINE'), 'Campaign screen must show OP 01: Fireline');
  assert.ok(selectionText.includes('OP 02: MONSOON SHIELD'), 'Campaign screen must show OP 02: Monsoon Shield');
  assert.ok(selectionText.includes('OP 03: AFTERSHOCK'), 'Campaign screen must show OP 03: Aftershock');
  await page.screenshot({ path: join(artifacts, '02-main-menu-campaign-select.png') });
  stageReport.push({ stage: 2, name: 'Main Menu & Campaign Selection', status: 'PASS', screenshot: '02-main-menu-campaign-select.png' });

  // =========================================================================
  // STAGE 3: Select Campaign Operation 1 (Fireline) & Mission Briefing
  // =========================================================================
  await page.click('#card-op-fireline');
  await page.waitForTimeout(200);
  const briefingPreviewText = await page.locator('#oz-mission-briefing-preview').innerText();
  assert.ok(briefingPreviewText.includes('OP 01: FIRELINE'), 'Briefing preview must update to Fireline');
  await page.click('#btn-play-desktop');
  await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__), null, { timeout: 60000 });
  await page.waitForTimeout(900);

  const initialFirelineState = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(initialFirelineState.scenarioId, 'FIRELINE_PASS');
  assert.equal(initialFirelineState.power, 52);
  assert.equal(initialFirelineState.maxStorage, 9);
  assert.equal(initialFirelineState.downlinkWindowSec, 10.0);
  await page.screenshot({ path: join(artifacts, '03-mission-briefing-fireline.png') });
  stageReport.push({ stage: 3, name: 'Campaign Operation 01 (Fireline) & Mission Briefing', status: 'PASS', screenshot: '03-mission-briefing-fireline.png' });

  // Dismiss briefing modal via button click
  const commenceVisible = await page.locator('#btn-commence-pass').isVisible().catch(() => false);
  if (commenceVisible) {
    await page.click('#btn-commence-pass');
    await page.waitForTimeout(300);
  }

  // =========================================================================
  // STAGE 4: Complete Tutorial / Orbital Academy Hand-Gesture Verification
  // =========================================================================
  await page.evaluate(() => {
    window.__ORBIT_ZERO__.clickPanel('briefing-panel', 'Btn_StartTutorial');
    window.__ORBIT_DESKTOP__?.updateHud?.();
  });
  await page.waitForTimeout(400);
  const tutStep1 = await page.evaluate(() => window.__ORBIT_ZERO__.getTutorialState());
  assert.equal(tutStep1.active, true);
  assert.equal(tutStep1.currentStepId, 'STEP_1_ENVIRONMENT');
  assert.ok(
    tutStep1.stepSpec.vrInstruction.includes('35-60 cm') &&
    tutStep1.stepSpec.vrInstruction.includes('automatically snap back'),
    'Step 1 must teach seated reach envelope and tracking recovery',
  );

  // TEST_SETUP: trigger3DNode() is a deterministic ECS shortcut that fires the same
  // internal event as a physical globe hover+pinch. It is used here as test setup
  // because desktop headless tests cannot perform optical tracking gestures.
  // On a physical Quest, replace these with actual hand-joint positioning via IWER remote.
  // If this API is unavailable the test must fail — no silent bypass.
  assert.ok(
    await page.evaluate(() => typeof window.__ORBIT_ZERO__?.trigger3DNode === 'function'),
    'DEBUG API: window.__ORBIT_ZERO__.trigger3DNode must be available — missing means debug mode is off or app failed to boot',
  );

  // Advance to STEP_2_POINT -> STEP_3_PINCH using 3D globe beacon nodes
  await page.evaluate(() => {
    window.__ORBIT_ZERO__.trigger3DNode('sector-a');
    window.__ORBIT_ZERO__.trigger3DNode('sector-b');
    window.__ORBIT_DESKTOP__?.updateHud?.();
  });
  await page.waitForTimeout(300);
  const tutStep3 = await page.evaluate(() => window.__ORBIT_ZERO__.getTutorialState());
  assert.equal(tutStep3.currentStepId, 'STEP_3_PINCH');
  assert.ok(tutStep3.stepSpec.title.includes('HOW TO PINCH'), 'Step 3 must explicitly teach how to pinch');

  await page.screenshot({ path: join(artifacts, '04-orbital-academy-hand-gestures.png') });

  // Complete remaining tutorial steps via 3D hardware & physical cube drop nodes through STEP_8_TRANSMIT
  const tutAdvanced = await page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    // TEST_SETUP: simulateCubeDrop() teleports a cube to a named station. This mirrors
    // the physics of a hand-released grab drop and fires the same station snap callback.
    // On Quest, replace with IWER remote hand-joint positioning + release gesture.
    while (api.getState().activeSensorMode !== 'THERMAL') {
      api.trigger3DNode('pad-toggle-sensor');
    }
    api.trigger3DNode('pad-fire-swath');
    api.simulateCubeDrop(0, 'PROCESS');
    api.simulateCubeDrop(0, 'QUEUE');
    window.__ORBIT_DESKTOP__?.updateHud?.();
    return api.getTutorialState();
  });
  assert.equal(tutAdvanced.currentStepId, 'STEP_8_TRANSMIT');

  stageReport.push({
    stage: 4,
    name: 'Orbital Academy Hand Gesture & Tracking Recovery Tutorial',
    status: 'PASS',
    stepVerified: `${tutStep3.stepSpec.title} -> ${tutAdvanced.currentStepId}`,
    screenshot: '04-orbital-academy-hand-gestures.png',
  });

  // Toggle tutorial off via 3D panel button and reset via 3D panel button for Stage 5
  await page.evaluate(() => {
    window.__ORBIT_ZERO__.clickPanel('briefing-panel', 'Btn_StartTutorial');
    window.__ORBIT_ZERO__.clickPanel('debrief-panel', 'Btn_RestartMission');
    window.__ORBIT_DESKTOP__?.updateHud?.();
  });
  await page.waitForTimeout(300);

  // =========================================================================
  // STAGE 5: Complete Operation 01: Fireline (UI Controls + Compression Proof)
  // =========================================================================
  const ariaProbe = () =>
    page.evaluate(() => {
      const bar = document.querySelector('#aria-subtitle-bar');
      const txt = document.querySelector('#aria-subtitle-text');
      return { opacity: bar ? Number(getComputedStyle(bar).opacity) : 0, text: txt?.textContent ?? '' };
    });

  const firelineQueued = await page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    api.setScenario('FIRELINE_PASS');

    while (api.getState().selectedSectorId !== 'B') api.clickPanel('briefing-panel', 'Btn_CycleSector');
    while (api.getState().activeSensorMode !== 'THERMAL') api.clickPanel('briefing-panel', 'Btn_ToggleSensor');
    api.clickPanel('briefing-panel', 'Btn_ScanSector');
    api.clickPanel('telemetry-hud', 'Btn_QueueCube');

    while (api.getState().selectedSectorId !== 'C') api.clickPanel('briefing-panel', 'Btn_CycleSector');
    while (api.getState().activeSensorMode !== 'OPTICAL') api.clickPanel('briefing-panel', 'Btn_ToggleSensor');
    api.clickPanel('briefing-panel', 'Btn_ScanSector');
    api.clickPanel('telemetry-hud', 'Btn_QueueCube');

    while (api.getState().selectedSectorId !== 'E') api.clickPanel('briefing-panel', 'Btn_CycleSector');
    while (api.getState().activeSensorMode !== 'THERMAL') api.clickPanel('briefing-panel', 'Btn_ToggleSensor');
    api.clickPanel('briefing-panel', 'Btn_ScanSector');
    api.clickPanel('telemetry-hud', 'Btn_QueueCube');
    window.__ORBIT_DESKTOP__?.updateHud?.();
    return api.getState().downlinkCommittedSec;
  });
  // GENUINE overflow (12.4s > 10.0s): ARIA-7 must be warning right now.
  assert.equal(firelineQueued, 12.4);
  await page.waitForFunction(
    () => {
      const bar = document.querySelector('#aria-subtitle-bar');
      const txt = document.querySelector('#aria-subtitle-text');
      return Boolean(txt?.textContent?.includes('DOWNLINK OVERFLOW')) && Number(getComputedStyle(bar).opacity) > 0.5;
    },
    null,
    { timeout: 5000 },
  );
  const ariaGenuine = await ariaProbe();
  assert.ok(
    ariaGenuine.text.includes('DOWNLINK OVERFLOW') && ariaGenuine.opacity > 0.5,
    `ARIA-7 must warn on genuine 12.4s/10.0s overflow (got opacity ${ariaGenuine.opacity}, text "${ariaGenuine.text}")`,
  );

  const firelineResult = await page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    const rawCommittedSec = api.getState().downlinkCommittedSec;
    // TEST_SETUP: simulateCubeDrop() — deterministic station drop shortcut for headless tests.
    api.simulateCubeDrop(0, 'PROCESS'); // Compress Sector B Thermal (42 MB -> 18 MB, saves 24 MB)
    const oneCompressedSec = api.getState().downlinkCommittedSec;
    // TEST_SETUP: simulateCubeDrop() — strictly dominant B+E (76 MB / 7.6s)
    api.simulateCubeDrop(2, 'PROCESS'); // Compress Sector E Thermal (42 MB -> 18 MB, saves 24 MB) -> strictly dominant B+E (76 MB / 7.6s)
    const twoCompressedSec = api.getState().downlinkCommittedSec;

    window.__ORBIT_DESKTOP__?.updateHud?.();
    return {
      state: api.getState(),
      rawCommittedSec,
      oneCompressedSec,
      twoCompressedSec,
    };
  });
  assert.equal(firelineResult.rawCommittedSec, 12.4, 'Raw 3-sector Fireline queue must overflow at 12.4s (124 MB)');
  assert.equal(firelineResult.oneCompressedSec, 10.0, '1 compressed Thermal packet reduces Fireline queue to 10.0s (100 MB)');
  assert.equal(firelineResult.twoCompressedSec, 7.6, 'Strictly dominant B+E compressed Thermal packets reduce Fireline queue to 7.6s (76 MB)');
  assert.equal(firelineResult.state.packets.length, 3);
  assert.equal(firelineResult.state.queuePacketIds.length, 3);
  await page.waitForTimeout(600);
  // 7.6s / 10.0s: the stale overflow advisory must have been withdrawn (no visible OVERFLOW text).
  const ariaFits = await ariaProbe();
  assert.ok(
    !(ariaFits.text.includes('DOWNLINK OVERFLOW') && ariaFits.opacity > 0.05),
    `ARIA-7 must NOT show overflow at 7.6s/10.0s (opacity ${ariaFits.opacity}, text "${ariaFits.text}")`,
  );
  await page.screenshot({ path: join(artifacts, '05-fireline-gameplay.png') });
  // Gallery: Processing Cradle close-up (genuine runtime camera, desktop mode)
  await page.evaluate(() => window.__ORBIT_ZERO__.setCameraView?.([0.18, 1.0, -0.12], [0.18, 0.78, -0.49], 55));
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(artifacts, '13-processing-cradle-closeup.png') });
  await page.evaluate(() => window.__ORBIT_ZERO__.setCameraView?.([0, 1.12, 0.46], [0, 0.95, -0.4], 60));
  await page.waitForTimeout(300);

  // Commit downlink via 3D panel button Btn_CommitDownlink
  await page.evaluate(() => {
    window.__ORBIT_ZERO__.clickPanel('debrief-panel', 'Btn_CommitDownlink');
  });
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DOWNLINK', null, { timeout: 5000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(artifacts, '14-fireline-live-downlink.png') });
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 16000 });
  await page.waitForTimeout(500);
  const firelineDebrief = await page.evaluate(() => window.__ORBIT_ZERO__.getState().debrief);
  const firelineFinal = await page.evaluate(() => {
    const s = window.__ORBIT_ZERO__.getState();
    return {
      scenarioId: s.scenarioId,
      power: s.power,
      packets: s.packets.map((p) => `${p.sectorId}:${p.sensorMode}`).sort(),
      subtitle: document.querySelector('#aria-subtitle-text')?.textContent ?? '',
      opacity: Number(getComputedStyle(document.querySelector('#aria-subtitle-bar') ?? document.body).opacity),
    };
  });
  assert.equal(firelineDebrief.outcome, 'SUCCESS');
  assert.equal(firelineDebrief.certification, 'GOLD');
  assert.equal(firelineDebrief.totalScore, 100);
  // Bind the Fireline victory screenshot to the Fireline scenario's authoritative state.
  assert.equal(firelineFinal.scenarioId, 'FIRELINE_PASS');
  assert.deepEqual(firelineFinal.packets, ['B:THERMAL', 'C:OPTICAL', 'E:THERMAL']);
  assert.equal(firelineDebrief.transmittedPayloadMb, 76);
  assert.equal(firelineDebrief.downlinkUsedSec, 7.6);
  assert.equal(firelineFinal.power, 10);
  assert.ok(!firelineFinal.subtitle.includes('DOWNLINK OVERFLOW') || firelineFinal.opacity < 0.05, 'No stale overflow warning in Fireline debrief');
  await page.screenshot({ path: join(artifacts, '15-fireline-victory-debrief.png') });
  stageReport.push({
    stage: 5,
    name: 'Operation 01: Fireline Full Playthrough (12.4s Raw -> 7.6s Strictly Dominant B+E GOLD)',
    status: 'PASS',
    score: firelineDebrief.totalScore,
    outcome: firelineDebrief.outcome,
    rawCommittedSec: firelineResult.rawCommittedSec,
    compressedCommittedSec: firelineResult.twoCompressedSec,
    ariaWarnsOnGenuineOverflow: true,
    ariaClearAt7_6s: true,
    firelineVictoryBinding: { scenarioId: firelineFinal.scenarioId, packets: firelineFinal.packets, payloadMb: firelineDebrief.transmittedPayloadMb, seconds: firelineDebrief.downlinkUsedSec, powerRemaining: firelineFinal.power },
    screenshot: '05-fireline-gameplay.png',
    extraScreenshots: ['13-processing-cradle-closeup.png', '14-fireline-live-downlink.png', '15-fireline-victory-debrief.png'],
  });

  // =========================================================================
  // STAGE 6: Operation 02: Monsoon Shield (SAR Flood + Optical Bridge)
  // =========================================================================
  await page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    api.setScenario('STANDARD_INDUS_PASS');
    api.selectSector('B');
    while (api.getState().activeSensorMode !== 'RADAR') api.toggleSensor();
    api.scan(); // Sector B SAR (91% confidence, NASA SAR caveat)
    api.process();
    api.queue();

    api.selectSector('C');
    while (api.getState().activeSensorMode !== 'OPTICAL') api.toggleSensor();
    api.scan(); // Sector C Optical (96% confidence)
    api.process();
    api.queue();

    api.selectSector('E');
    while (api.getState().activeSensorMode !== 'RADAR') api.toggleSensor();
    api.scan(); // Sector E SAR
    api.queue();
    window.__ORBIT_DESKTOP__?.updateHud?.();
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(artifacts, '06-monsoon-shield-flood-gameplay.png') });
  const monsoonState = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.ok(monsoonState.packets[0].scientificCaveat.includes('NASA SAR Note'));
  stageReport.push({
    stage: 6,
    name: 'Operation 02: Monsoon Shield Flood Gameplay & Scientific Caveats',
    status: 'PASS',
    caveatSample: monsoonState.packets[0].scientificCaveat,
    screenshot: '06-monsoon-shield-flood-gameplay.png',
  });

  // =========================================================================
  // STAGE 7: Operation 03: Aftershock (6 STR Buffer & Change Detection)
  // =========================================================================
  const aftershockCheck = await page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    api.setScenario('AFTERSHOCK_PASS');
    api.selectSector('E');
    while (api.getState().activeSensorMode !== 'RADAR') api.toggleSensor();
    api.scan();
    const beforeConfidence = api.getState().packets[0].confidence;
    api.process(); // Runs INTERFEROMETRIC_CHANGE_DETECTION -> upgrades PROBABLE to CONFIRMED (92%)
    const afterPacket = api.getState().packets[0];
    api.queue();

    api.selectSector('B');
    while (api.getState().activeSensorMode !== 'RADAR') api.toggleSensor();
    api.scan();
    api.process();
    api.queue();

    api.selectSector('C');
    while (api.getState().activeSensorMode !== 'OPTICAL') api.toggleSensor();
    api.scan();
    api.queue();
    window.__ORBIT_DESKTOP__?.updateHud?.();
    return {
      beforeConfidence,
      afterConfidence: afterPacket.confidence,
      afterPct: afterPacket.observationConfidencePct,
      algorithm: afterPacket.compressionAlgorithm,
      storageUsed: api.getState().storageUsed,
      maxStorage: api.getState().maxStorage,
    };
  });
  assert.equal(aftershockCheck.beforeConfidence, 'PROBABLE');
  assert.equal(aftershockCheck.afterConfidence, 'CONFIRMED');
  assert.equal(aftershockCheck.afterPct, 90);
  assert.equal(aftershockCheck.algorithm, 'MULTI_TEMPORAL_CHANGE_DETECTION');
  assert.ok(aftershockCheck.storageUsed <= aftershockCheck.maxStorage, 'Must fit inside 6 STR partition');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(artifacts, '07-aftershock-change-detection.png') });
  stageReport.push({
    stage: 7,
    name: 'Operation 03: Aftershock Change Detection & 6 STR Buffer',
    status: 'PASS',
    aftershockCheck,
    screenshot: '07-aftershock-change-detection.png',
  });

  // =========================================================================
  // STAGE 8: Trigger a Real Mission Failure & Verify Diagnostic Explanation
  // =========================================================================
  await page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    api.setScenario('STANDARD_INDUS_PASS');
    api.selectSector('B'); // 95% storm cloud cover
    while (api.getState().activeSensorMode !== 'OPTICAL') api.toggleSensor();
    api.scan(); // Produces UNVERIFIED cloud washout packet
    api.queue();
    api.commitDownlink();
  });
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 12000 });
  await page.waitForTimeout(400);
  const failedDebrief = await page.evaluate(() => window.__ORBIT_ZERO__.getState().debrief);
  assert.equal(failedDebrief.outcome, 'FAILED');
  assert.equal(failedDebrief.failureReasonCode, 'WRONG_SENSOR_FOR_WEATHER');
  const diagText = await page.locator('#debrief-failure-diagnostic').innerText();
  assert.ok(/wrong sensor for the conditions/i.test(diagText), 'Failure screen must show plain-language retry guidance');
  assert.ok(!/[A-Z]{3,}_[A-Z_]{3,}/.test(diagText), 'Failure screen must not expose raw internal reason codes');
  await page.screenshot({ path: join(artifacts, '08-mission-failure-diagnostics.png') });
  stageReport.push({
    stage: 8,
    name: 'Mission Failure Screen & Diagnostic Explanation',
    status: 'PASS',
    failureReasonCode: failedDebrief.failureReasonCode,
    failureExplanation: failedDebrief.failureExplanation,
    screenshot: '08-mission-failure-diagnostics.png',
  });

  // =========================================================================
  // STAGE 9: Trigger a Real Partial Success (Horizon Cutoff Dropped Packet)
  // =========================================================================
  await page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    api.setScenario('STANDARD_INDUS_PASS');
    api.selectSector('B');
    while (api.getState().activeSensorMode !== 'RADAR') api.toggleSensor();
    api.scan(); // 4.5s uncompressed
    api.queue();

    api.selectSector('C');
    while (api.getState().activeSensorMode !== 'OPTICAL') api.toggleSensor();
    api.scan(); // 4.0s uncompressed
    api.queue();

    api.selectSector('E');
    while (api.getState().activeSensorMode !== 'RADAR') api.toggleSensor();
    api.scan(); // 4.5s uncompressed -> total 13.0s > 10.0s window!
    api.queue();

    api.commitDownlink();
  });
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 15000 });
  await page.waitForTimeout(400);
  const partialDebrief = await page.evaluate(() => window.__ORBIT_ZERO__.getState().debrief);
  assert.equal(partialDebrief.outcome, 'PARTIAL_SUCCESS');
  assert.equal(partialDebrief.failureReasonCode, 'WINDOW_CUTOFF_DROPPED_PACKETS');
  assert.equal(partialDebrief.droppedPacketIds.length, 1);
  await page.screenshot({ path: join(artifacts, '09-partial-success-debrief.png') });
  stageReport.push({
    stage: 9,
    name: 'Partial Success Debrief (Horizon Cutoff Overflow)',
    status: 'PASS',
    score: partialDebrief.totalScore,
    failureReasonCode: partialDebrief.failureReasonCode,
    screenshot: '09-partial-success-debrief.png',
  });

  // =========================================================================
  // STAGE 10: Trigger Full Mission Victory & Verify Debrief Screen
  // =========================================================================
  await page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    api.setScenario('STANDARD_INDUS_PASS');
    api.selectSector('B');
    while (api.getState().activeSensorMode !== 'RADAR') api.toggleSensor();
    api.scan();
    api.process(); // 45 MB -> 18 MB (1.8s)
    api.queue();

    api.selectSector('C');
    while (api.getState().activeSensorMode !== 'OPTICAL') api.toggleSensor();
    api.scan(); // 40 MB (4.0s)
    api.queue();

    api.selectSector('E');
    while (api.getState().activeSensorMode !== 'RADAR') api.toggleSensor();
    api.scan();
    api.process(); // 45 MB -> 18 MB (1.8s) -> total 7.6s / 76 MB!
    api.queue();

    api.commitDownlink();
  });
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 14000 });
  await page.waitForTimeout(400);
  const victoryDebrief = await page.evaluate(() => window.__ORBIT_ZERO__.getState().debrief);
  assert.equal(victoryDebrief.outcome, 'SUCCESS');
  assert.equal(victoryDebrief.certification, 'GOLD');
  assert.equal(victoryDebrief.totalScore, 100);
  assert.equal(victoryDebrief.transmittedPayloadMb, 76);
  const victoryHeadline = await page.locator('#debrief-outcome-headline').innerText();
  assert.ok(victoryHeadline.includes('MISSION SUCCESS'), 'Victory banner must show MISSION SUCCESS');
  // Bind this screenshot to Monsoon Shield (STANDARD_INDUS_PASS): RADAR + OPTICAL evidence on B/C/E.
  const monsoonBinding = await page.evaluate(() => {
    const s = window.__ORBIT_ZERO__.getState();
    return { scenarioId: s.scenarioId, packets: s.packets.map((p) => `${p.sectorId}:${p.sensorMode}`).sort() };
  });
  assert.equal(monsoonBinding.scenarioId, 'STANDARD_INDUS_PASS');
  assert.deepEqual(monsoonBinding.packets, ['B:RADAR', 'C:OPTICAL', 'E:RADAR']);
  await page.screenshot({ path: join(artifacts, '10-monsoon-victory-debrief.png') });
  stageReport.push({
    stage: 10,
    name: 'Operation 02: Monsoon Shield Victory Screen (100/100 GOLD, STANDARD_INDUS_PASS)',
    status: 'PASS',
    scenarioId: monsoonBinding.scenarioId,
    transmittedPayloadMb: victoryDebrief.transmittedPayloadMb,
    screenshot: '10-monsoon-victory-debrief.png',
  });

  // =========================================================================
  // STAGE 11: Replay / Restart Mission Clean Reset Verification
  // =========================================================================
  await page.click('#btn-aar-restart');
  await page.waitForTimeout(300);
  const commenceAfterRestart = await page.locator('#btn-commence-pass').isVisible().catch(() => false);
  if (commenceAfterRestart) {
    await page.click('#btn-commence-pass');
    await page.waitForTimeout(250);
  }
  const resetState = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(resetState.phase, 'OPERATIONS');
  assert.equal(resetState.power, 55);
  assert.equal(resetState.storageUsed, 0);
  assert.equal(resetState.packets.length, 0);
  assert.equal(resetState.queuePacketIds.length, 0);
  await page.screenshot({ path: join(artifacts, '11-replay-clean-restart.png') });
  stageReport.push({
    stage: 11,
    name: 'Replay / Clean State Reset Verification',
    status: 'PASS',
    powerAfterReset: resetState.power,
    packetsAfterReset: resetState.packets.length,
    screenshot: '11-replay-clean-restart.png',
  });

  // =========================================================================
  // STAGE 12: Emulated WebXR Hands-Only Playthrough (IWER 2.7.0 device.remote) & Reach Envelope Audit
  // =========================================================================
  await page.evaluate(() => window.__ORBIT_ZERO__.clickPanel('briefing-panel', 'xr-button'));
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 20000 });
  await page.waitForTimeout(500);

  const xrHandsAudit = await page.evaluate(async () => {
    const api = window.__ORBIT_ZERO__;
    const remote = window.__ORBIT_IWER__.remote;
    api.setScenario('FIRELINE_PASS');
    api.resetGlobeFocalDistance();
    const reachReport = api.verifySeatedReachEnvelope();

    await remote.dispatch('set_input_mode', { mode: 'hand' });
    await remote.dispatch('set_connected', { device: 'hand-left', connected: true });
    await remote.dispatch('set_connected', { device: 'hand-right', connected: true });

    const pinchTarget = async (handDevice, targetId) => {
      const pos = api.get3DTargetWorldPosition(targetId);
      await remote.dispatch('set_hand_pose', { device: handDevice, poseId: 'point' });
      await remote.dispatch('set_transform', { device: handDevice, position: pos, anchor: 'index-tip' });
      await new Promise((r) => setTimeout(r, 60));
      await remote.dispatch('set_select_value', { device: handDevice, value: 1.0 });
      await new Promise((r) => setTimeout(r, 60));
      await remote.dispatch('set_select_value', { device: handDevice, value: 0.0 });
      await new Promise((r) => setTimeout(r, 60));
    };

    const grabCarryRelease = async (handDevice, cubeId, dropZoneId) => {
      const cubePos = api.get3DTargetWorldPosition(cubeId);
      const dropPos = api.get3DTargetWorldPosition(dropZoneId);
      await remote.dispatch('set_hand_pose', { device: handDevice, poseId: 'pinch' });
      await remote.dispatch('set_transform', { device: handDevice, position: cubePos, anchor: 'grasp' });
      await new Promise((r) => setTimeout(r, 60));
      await remote.dispatch('set_select_value', { device: handDevice, value: 1.0 });
      await new Promise((r) => setTimeout(r, 65));
      await remote.dispatch('set_transform', { device: handDevice, position: dropPos, anchor: 'grasp' });
      await new Promise((r) => setTimeout(r, 65));
      await remote.dispatch('set_select_value', { device: handDevice, value: 0.0 });
      await new Promise((r) => setTimeout(r, 75));
    };

    // Drive complete 3-cube Fireline triage (strictly dominant B+E compression: 76 MB / 7.6s) via real IWER 2.7.0 hand joints & pinch events
    await pinchTarget('hand-right', 'sector-b');
    while (api.getState().activeSensorMode !== 'THERMAL') {
      await pinchTarget('hand-right', 'pad-toggle-sensor');
    }
    await pinchTarget('hand-right', 'pad-fire-swath');
    await grabCarryRelease('hand-left', 'evidence-cube-1', 'PROCESS_CRADLE');
    await grabCarryRelease('hand-right', 'evidence-cube-1', 'DOWNLINK_SLOT_1');

    await pinchTarget('hand-right', 'sector-c');
    while (api.getState().activeSensorMode !== 'OPTICAL') {
      await pinchTarget('hand-right', 'pad-toggle-sensor');
    }
    await pinchTarget('hand-right', 'pad-fire-swath');
    await grabCarryRelease('hand-left', 'evidence-cube-2', 'DOWNLINK_SLOT_2');

    await pinchTarget('hand-right', 'sector-e');
    while (api.getState().activeSensorMode !== 'THERMAL') {
      await pinchTarget('hand-right', 'pad-toggle-sensor');
    }
    await pinchTarget('hand-right', 'pad-fire-swath');
    await grabCarryRelease('hand-left', 'evidence-cube-3', 'PROCESS_CRADLE');
    await grabCarryRelease('hand-right', 'evidence-cube-3', 'DOWNLINK_SLOT_3');

    return {
      immersive: api.getRuntimeStatus().immersive,
      reachReport,
      queuedCount: api.getState().queuePacketIds.length,
      committedSec: api.getState().downlinkCommittedSec,
      handTelemetryCount: api.getXRHandTelemetryLog().length,
      rendererStats: api.getRendererStats(),
    };
  });

  assert.equal(xrHandsAudit.immersive, true);
  assert.equal(
    xrHandsAudit.reachReport.pass,
    true,
    `Seated reach violations: ${JSON.stringify(xrHandsAudit.reachReport.violations)}`,
  );
  assert.equal(xrHandsAudit.queuedCount, 3);
  assert.ok(xrHandsAudit.handTelemetryCount >= 20, 'Must record IWER hand telemetry events');
  await page.screenshot({ path: join(artifacts, '12-vr-hands-only-playthrough.png') });

  // Verify hands-only Pause/Resume (Btn_Pause) and Campaign Switch (Btn_SelectCampaign) via IWER hand pinch inside XR
  const xrNavigationAudit = await page.evaluate(async () => {
    const api = window.__ORBIT_ZERO__;
    const remote = window.__ORBIT_IWER__.remote;
    const pinchBtn = async (targetId) => {
      const pos = api.get3DTargetWorldPosition(targetId);
      await remote.dispatch('set_hand_pose', { device: 'hand-right', poseId: 'point' });
      await remote.dispatch('set_transform', { device: 'hand-right', position: pos, anchor: 'index-tip' });
      await new Promise((r) => setTimeout(r, 60));
      await remote.dispatch('set_select_value', { device: 'hand-right', value: 1.0 });
      await new Promise((r) => setTimeout(r, 60));
      await remote.dispatch('set_select_value', { device: 'hand-right', value: 0.0 });
      await new Promise((r) => setTimeout(r, 60));
    };

    await pinchBtn('telemetry-hud:Btn_Pause');
    const pausedState = api.getState().paused;
    await pinchBtn('telemetry-hud:Btn_Pause');
    const resumedState = api.getState().paused;
    await pinchBtn('briefing-panel:Btn_SelectCampaign');
    const nextScenarioId = api.getState().scenarioId;
    return { pausedState, resumedState, nextScenarioId, phaseAfterReset: api.getState().phase };
  });
  assert.equal(xrNavigationAudit.pausedState, true, 'Hands-only Btn_Pause must pause mission in XR');
  assert.equal(xrNavigationAudit.resumedState, false, 'Hands-only Btn_Pause must resume mission in XR');
  assert.equal(xrNavigationAudit.nextScenarioId, 'STANDARD_INDUS_PASS', 'Hands-only Btn_SelectCampaign must cycle to OP 02 in XR');

  await page.evaluate(async () => {
    const api = window.__ORBIT_ZERO__;
    const remote = window.__ORBIT_IWER__.remote;
    const pos = api.get3DTargetWorldPosition('briefing-panel:exit-button');
    await remote.dispatch('set_hand_pose', { device: 'hand-right', poseId: 'point' });
    await remote.dispatch('set_transform', { device: 'hand-right', position: pos, anchor: 'index-tip' });
    await new Promise((r) => setTimeout(r, 60));
    await remote.dispatch('set_select_value', { device: 'hand-right', value: 1.0 });
    await new Promise((r) => setTimeout(r, 60));
    if (api.getRuntimeStatus().immersive) {
      try {
        await remote.dispatch('set_select_value', { device: 'hand-right', value: 0.0 });
      } catch { }
    }
  });
  await page.waitForFunction(() => !window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 10000 });

  stageReport.push({
    stage: 12,
    name: 'Emulated WebXR Hands-Only Playthrough & Seated Reach Envelope (<0.65m)',
    status: 'PASS',
    reachEnvelopePass: xrHandsAudit.reachReport.pass,
    maxReachMeters: xrHandsAudit.reachReport.maxDistance,
    rendererStats: xrHandsAudit.rendererStats,
    screenshot: '12-vr-hands-only-playthrough.png',
  });

  assert.equal(failures.length, 0, `Console/page errors detected:\n${failures.join('\n')}`);

  const summary = {
    status: 'PASS',
    verificationTier: 'Desktop Playwright + IWER Emulated Meta Quest 3 (Physical Quest 3/3S headset remains unverified hardware tier)',
    stagesCompleted: stageReport.length,
    stageReport,
    failures,
  };
  await writeFile(join(artifacts, 'release-audit-report.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser?.close();
  preview?.kill();
}

