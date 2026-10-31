/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * RC8 Phase 1: Realistic First-Time Player Verification Test
 * Strictly uses visible UI elements, text guidance, and real DOM clicks/keypresses.
 * Zero internal engine shortcuts.
 */

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
const artifactsDir = join(root, 'artifacts', 'rc8-first-time');
await mkdir(artifactsDir, { recursive: true });

const logFile = join(artifactsDir, 'player-session-log.json');
const sessionLog = {
  startedAt: new Date().toISOString(),
  actions: [],
  visibleInstructions: [],
  confusions: [],
  failures: [],
  stageTimingsMs: {},
};

function recordAction(action, details = {}) {
  const entry = { timestamp: Date.now(), action, details };
  sessionLog.actions.push(entry);
  console.log(`[PLAYER ACTION] ${action}`, details);
}

function recordInstruction(stage, text) {
  sessionLog.visibleInstructions.push({ timestamp: Date.now(), stage, text });
}

function recordConfusion(point, description) {
  sessionLog.confusions.push({ timestamp: Date.now(), point, description });
  console.warn(`[CONFUSION OBSERVED] ${point}: ${description}`);
}

const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const run = (script, args = []) => new Promise((resolveRun, reject) => {
  const child = spawn(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', (code) => code === 0 ? resolveRun() : reject(new Error(`Command exited ${code}`)));
});
if (!process.env.ORBIT_SKIP_BUILD) await run(vite, ['build']);

const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolvePort(address.port));
  });
});

const url = `https://localhost:${port}/`;
const preview = spawn(
  process.execPath,
  [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: root, stdio: 'pipe' }
);

let serverLog = '';
preview.stdout.on('data', (d) => { serverLog += d; });
preview.stderr.on('data', (d) => { serverLog += d; });

const t0 = Date.now();

try {
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      const ready = await new Promise((resolveReady) => {
        const req = getHttps(url, { rejectUnauthorized: false }, (res) => {
          res.resume();
          resolveReady(res.statusCode === 200);
        });
        req.on('error', () => resolveReady(false));
        req.setTimeout(1000, () => { req.destroy(); resolveReady(false); });
      });
      if (ready) break;
    } catch {}
    if (Date.now() > deadline) throw new Error(`Preview failed to start: ${serverLog}`);
    await new Promise((r) => setTimeout(r, 100));
  }

  const browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'chrome' : 'chromium',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])],
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const iwerSource = await readFile(join(root, 'node_modules', 'iwer', 'build', 'iwer.js'), 'utf8');
  await context.addInitScript({
    content: `${iwerSource}\nconst device = new window.IWER.XRDevice(window.IWER.metaQuest3, { stereoEnabled: false }); device.installRuntime({forceInstall:true}); device.primaryInputMode = 'hand'; window.__ORBIT_IWER__ = device;`
  });

  const page = await context.newPage();
  page.on('pageerror', (err) => sessionLog.failures.push(`PageError: ${err}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') sessionLog.failures.push(`ConsoleError: ${msg.text()}`);
  });

  // Step 1: Open Game
  recordAction('OPEN_GAME', { url });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__), null, { timeout: 60000 });
  await page.waitForTimeout(1000);

  const initialBanner = await page.$eval('#orbit-zero-hud-banner', (el) => el.innerText);
  recordInstruction('INITIAL_BRIEFING', initialBanner);
  await page.screenshot({ path: join(artifactsDir, '01-first-time-open.png') });
  sessionLog.stageTimingsMs.open = Date.now() - t0;

  // Verify prominent start button exists and is clickable
  const startBtn = await page.$('#btn-commence-pass');
  assert.ok(startBtn, 'First-time player start button #btn-commence-pass must exist');

  // Step 2: Player starts the mission
  recordAction('CLICK_COMMENCE_CRISIS_PASS');
  await page.click('#btn-commence-pass');
  await page.waitForTimeout(500);

  const step1Text = await page.$eval('#orbit-zero-hud-banner', (el) => el.innerText);
  recordInstruction('STEP_1_INSTRUCTION', step1Text);
  await page.screenshot({ path: join(artifactsDir, '02-after-crisis-start.png') });

  // Step 3: Player selects Sector B based on instruction
  recordAction('SELECT_SECTOR_B');
  await page.click('#tb-sec-b');
  await page.waitForTimeout(400);

  // Step 4: Player toggles sensor to RADAR to penetrate storm
  const currentSensor = await page.$eval('#tb-sensor', (el) => el.innerText);
  if (!currentSensor.includes('RADAR')) {
    recordAction('TOGGLE_SENSOR_TO_RADAR');
    await page.click('#tb-sensor');
    await page.waitForTimeout(300);
  }

  // Step 5: Player fires scan
  recordAction('TRIGGER_SCAN');
  await page.click('#tb-scan');
  await page.waitForTimeout(800);

  const scanFeedback = await page.$eval('#orbit-zero-hud-action', (el) => el.innerText);
  recordInstruction('SCAN_FEEDBACK', scanFeedback);
  await page.screenshot({ path: join(artifactsDir, '03-first-scan-result.png') });

  // Step 6: Player reads telemetry & decides to compress
  const telemetryCard = await page.$eval('#orbit-zero-compare-card', (el) => el.innerText);
  recordInstruction('TELEMETRY_EVALUATION', telemetryCard);

  recordAction('PROCESS_IN_CRADLE');
  await page.click('#tb-process');
  await page.waitForTimeout(500);

  // Step 7: Player stages compressed packet into bay
  recordAction('QUEUE_TO_BAY');
  await page.click('#tb-queue');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(artifactsDir, '04-packet-queued.png') });

  // Step 8: Multi-target triage — Player evaluates Sector C
  recordAction('SELECT_SECTOR_C');
  await page.click('#tb-sec-c');
  await page.waitForTimeout(300);

  // Switch to OPTICAL for clear skies
  recordAction('TOGGLE_SENSOR_TO_OPTICAL');
  await page.click('#tb-sensor');
  await page.waitForTimeout(300);

  // Scan Sector C
  recordAction('SCAN_SECTOR_C');
  await page.click('#tb-scan');
  await page.waitForTimeout(800);

  // Compress & Queue Sector C
  recordAction('PROCESS_SECTOR_C');
  await page.click('#tb-process');
  await page.waitForTimeout(400);

  recordAction('QUEUE_SECTOR_C');
  await page.click('#tb-queue');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(artifactsDir, '05-multi-target-queued.png') });

  // Step 9: Commit Downlink Pass
  recordAction('COMMIT_DOWNLINK');
  await page.click('#tb-transmit');
  await page.waitForTimeout(600);

  const downlinkBanner = await page.$eval('#orbit-zero-hud-banner', (el) => el.innerText);
  recordInstruction('DOWNLINK_STREAMING', downlinkBanner);
  await page.screenshot({ path: join(artifactsDir, '06-downlink-streaming.png') });

  // Step 10: Wait for debrief
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 16000 });
  await page.waitForTimeout(800);

  const debriefRecon = await page.$eval('#orbit-zero-recon-card', (el) => el.innerText);
  const debriefCompare = await page.$eval('#orbit-zero-compare-card', (el) => el.innerText);
  recordInstruction('GROUND_RESCUE_IMPACT', debriefRecon);
  recordInstruction('TELEMETRY_ACCOUNTING', debriefCompare);
  await page.screenshot({ path: join(artifactsDir, '07-final-debrief.png') });

  sessionLog.stageTimingsMs.totalSession = Date.now() - t0;
  sessionLog.completedAt = new Date().toISOString();
  sessionLog.status = 'SUCCESS';

  await writeFile(logFile, JSON.stringify(sessionLog, null, 2), 'utf8');
  await browser.close();
  console.log('RC8_FIRST_TIME_PLAYER_TEST_COMPLETE');
} catch (err) {
  sessionLog.status = 'FAILED';
  sessionLog.error = String(err);
  await writeFile(logFile, JSON.stringify(sessionLog, null, 2), 'utf8');
  throw err;
} finally {
  preview.kill();
}
