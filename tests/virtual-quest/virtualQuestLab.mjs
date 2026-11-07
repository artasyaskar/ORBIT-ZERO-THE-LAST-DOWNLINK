/**
 * ORBIT ZERO: VIRTUAL META QUEST TEST LAB
 *
 * Master Automated WebXR Player and Test Lab.
 * Runs complete hands-only campaign journeys and adversarial resiliency stress tests
 * over emulated Meta Quest 3 WebXR session.
 *
 * Usage:
 *   node tests/virtual-quest/virtualQuestLab.mjs
 *   npm run test:virtual-quest
 */

import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { get as getHttps } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { VirtualQuestPlayer } from './virtualQuestPlayer.mjs';
import { installPerfProbeInPage, summarizeRecording } from './virtualQuestPerfProbe.mjs';
import {
  playOrbitalAcademyHandsOnly,
  playFirelineHandsOnly,
  playMonsoonShieldHandsOnly,
  playAftershockHandsOnly,
  verifyCampaignProgressionAndPersistence,
} from './virtualQuestCampaign.mjs';
import {
  testTrackingLossAndRecovery,
  testDualHandContention,
  testRecenterAndAnchorConsistency,
  testInvalidDropRejection,
  testSyntheticJitterResilience,
} from './virtualQuestStress.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const artifactsDir = join(root, 'artifacts', 'virtual-quest');
await mkdir(artifactsDir, { recursive: true });

let IWER_VERSION = 'UNKNOWN';
try {
  IWER_VERSION = JSON.parse(await readFile(join(root, 'node_modules', 'iwer', 'package.json'), 'utf8')).version;
} catch {}

let GIT_REVISION = 'UNKNOWN';
try {
  GIT_REVISION = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
} catch {}

const run = (script, args = []) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolveRun() : reject(new Error(`Command exited ${code}`))));
  });

const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
if (!process.env.ORBIT_SKIP_BUILD && !process.env.ORBIT_TEST_URL) {
  console.log('[Lab] Building production bundle for Virtual Quest validation...');
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
preview?.stdout.on('data', (d) => (serverLog += d));
preview?.stderr.on('data', (d) => (serverLog += d));

let browser;
let page;
const failures = [];
const stageReports = [];

console.log('================================================================');
console.log('   ORBIT ZERO: VIRTUAL META QUEST TEST LAB (HEADS & HANDS XR)   ');
console.log(`   Revision: ${GIT_REVISION} | Emulated Device: Meta Quest 3`);
console.log('================================================================');

try {
  // Preview start-up (HTTPS cert + plugin load) can exceed 30 s on a loaded host.
  const deadline = Date.now() + 90000;
  while (true) {
    try {
      const ready = baseUrl.startsWith('https://')
        ? await new Promise((resolveReady) => {
            const req = getHttps(baseUrl, { rejectUnauthorized: false }, (res) => {
              res.resume();
              resolveReady(res.statusCode === 200);
            });
            req.on('error', () => resolveReady(false));
            req.setTimeout(1000, () => {
              req.destroy();
              resolveReady(false);
            });
          })
        : (await fetch(baseUrl)).ok;
      if (ready) break;
    } catch {}
    if (Date.now() > deadline) throw new Error(`Preview server did not start: ${serverLog}`);
    await new Promise((r) => setTimeout(r, 100));
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

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    ignoreHTTPSErrors: true,
  });

  const iwerSource = await readFile(join(root, 'node_modules', 'iwer', 'build', 'iwer.js'), 'utf8');
  await context.addInitScript({
    content: `${iwerSource}\nconst device = new window.IWER.XRDevice(window.IWER.metaQuest3, { stereoEnabled: true }); device.installRuntime({forceInstall:true}); device.primaryInputMode = 'hand'; window.__ORBIT_IWER__ = device; window.IWER_DEVICE = device;`,
  });

  page = await context.newPage();
  page.on('pageerror', (err) => failures.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (!txt.includes('ERR_NAME_NOT_RESOLVED') && !txt.includes('ERR_INTERNET_DISCONNECTED')) {
        failures.push(txt);
      }
    }
  });

  // -------------------------------------------------------------------------
  // STAGE 1: Launch & Enter WebXR Immersive Session
  // -------------------------------------------------------------------------
  console.log('\n[Stage 1/8] Booting game, entering Orbital Academy WebXR session...');
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#oz-hero-screen', { state: 'visible', timeout: 15000 });
  await page.screenshot({ path: join(artifactsDir, '01-landing-hero.png') });

  await page.click('#btn-enter-experience');
  await page.waitForSelector('#oz-selection-screen', { state: 'visible', timeout: 10000 });
  await page.click('#card-op-academy');
  await page.waitForTimeout(200);
  await page.click('#btn-enter-vr');

  await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__), null, { timeout: 60000 });
  const isAlreadyImmersive = await page.evaluate(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive);
  if (!isAlreadyImmersive) {
    await page.evaluate(() => window.__ORBIT_ZERO__.clickPanel('briefing-panel', 'xr-button'));
  }
  await page.waitForFunction(
    () => Boolean(window.__ORBIT_ZERO__) && window.__ORBIT_ZERO__.getRuntimeStatus().immersive,
    null,
    { timeout: 30000 },
  );

  const player = new VirtualQuestPlayer(page, { stereoEnabled: true });
  const sessionInfo = await player.initializeSession();
  assert.equal(sessionInfo.immersive, true, 'WebXR session must be active and presenting');

  // Verify Stereo Views, input sources and hand joints from the live XRFrame (no defaults).
  await page.evaluate(installPerfProbeInPage);
  const stereoStatus = await player.inspectStereoViews();
  assert.equal(stereoStatus.hasViewerPose, true, 'XRFrame.getViewerPose must return a pose');
  assert.equal(stereoStatus.viewCount, 2, 'Stereo session must expose exactly 2 XRViews');
  assert.deepEqual([...stereoStatus.eyes].sort(), ['left', 'right'], 'Views must be left and right eyes');
  assert.ok(Math.abs(stereoStatus.ipdMeasuredMeters - 0.063) < 0.001, `View origins must be ~63 mm apart (got ${stereoStatus.ipdMeasuredMeters})`);
  const handedness = stereoStatus.inputSources.filter((s) => s.hasHand).map((s) => s.handedness).sort();
  assert.deepEqual(handedness, ['left', 'right'], 'Both XRInputSource.hand objects must be present with correct handedness');
  for (const side of ['left', 'right']) {
    const j = stereoStatus.handJoints[side];
    assert.equal(j.total, 25, `XRHand must expose the 25 standard joints (got ${j.total})`);
    assert.equal(j.withPose, 25, 'All 25 joints must resolve a pose in the reference space');
  }

  await player.lean({ x: 0, y: -0.05, z: -0.1 }, 0.2);
  await player.returnToNeutral();
  await page.screenshot({ path: join(artifactsDir, '02-stereo-xr-cockpit.png') });

  stageReports.push({
    stage: 1,
    name: 'Virtual Headset Kinematics & Stereo Verification',
    status: 'PASS',
    stereoViews: stereoStatus.viewCount,
    eyes: stereoStatus.eyes,
    ipdConfiguredMeters: stereoStatus.ipdConfiguredMeters,
    ipdMeasuredFromViewPosesMeters: Number(stereoStatus.ipdMeasuredMeters.toFixed(5)),
    ipdNote: 'Measured = distance between XRView origins of an emulated device; it is a configuration echo, not a physical IPD or optical measurement.',
    xrHand: { standardJointCount: 25, jointsWithPose: stereoStatus.handJoints, inputSourceHandedness: handedness },
    emulatorExtras: 'IWER renders its own hand armature meshes (SkinnedMesh in the scene); these are not additional XRHand joints.',
    headsetPosition: sessionInfo.headsetPosition,
  });
  console.log('   ✓ Headset seated posture & stereo views verified.');

  // -------------------------------------------------------------------------
  // STAGE 2: OP 00: Orbital Academy Hands-Only Journey
  // -------------------------------------------------------------------------
  console.log('\n[Stage 2/8] Playing OP 00: Orbital Academy hands-only...');
  const academyRes = await playOrbitalAcademyHandsOnly(player);
  await page.screenshot({ path: join(artifactsDir, '03-academy-qualification.png') });
  stageReports.push({
    stage: 2,
    name: 'Orbital Academy Hands-Only Qualification',
    status: 'PASS',
    score: academyRes.totalScore,
    outcome: academyRes.outcome,
  });
  console.log(`   ✓ Orbital Academy completed: ${academyRes.totalScore}/100 pts (${academyRes.outcome}).`);

  // -------------------------------------------------------------------------
  // STAGE 3: OP 01: Fireline Hands-Only Journey (Optimal B+E Thermal Triage)
  // -------------------------------------------------------------------------
  console.log('\n[Stage 3/8] Playing OP 01: Fireline hands-only (Pareto-optimal B+E triage)...');
  const firelineRes = await playFirelineHandsOnly(player);
  await page.screenshot({ path: join(artifactsDir, '04-fireline-gold-victory.png') });
  stageReports.push({
    stage: 3,
    name: 'Operation 01: Fireline Optimal Triage',
    status: 'PASS',
    score: firelineRes.totalScore,
    grade: firelineRes.efficiencyGrade,
    certification: firelineRes.certification,
  });
  console.log(`   ✓ Fireline completed: ${firelineRes.totalScore}/100 pts | Grade ${firelineRes.efficiencyGrade} ${firelineRes.certification}.`);

  // -------------------------------------------------------------------------
  // STAGE 4: OP 02: Monsoon Shield Hands-Only Journey (SAR Radar & Optical)
  // -------------------------------------------------------------------------
  console.log('\n[Stage 4/8] Advancing to and playing OP 02: Monsoon Shield in WebXR...');
  const monsoonRes = await playMonsoonShieldHandsOnly(player);
  await page.screenshot({ path: join(artifactsDir, '05-monsoon-shield-victory.png') });
  stageReports.push({
    stage: 4,
    name: 'Operation 02: Monsoon Shield Triage',
    status: 'PASS',
    score: monsoonRes.totalScore,
    outcome: monsoonRes.outcome,
  });
  console.log(`   ✓ Monsoon Shield completed: ${monsoonRes.totalScore}/100 pts (${monsoonRes.outcome}).`);

  // -------------------------------------------------------------------------
  // STAGE 5: OP 03: Aftershock Hands-Only Journey (Seismic Fault Triage)
  // -------------------------------------------------------------------------
  console.log('\n[Stage 5/8] Advancing to and playing OP 03: Aftershock in WebXR...');
  const aftershockRes = await playAftershockHandsOnly(player);
  await page.screenshot({ path: join(artifactsDir, '06-aftershock-victory.png') });
  stageReports.push({
    stage: 5,
    name: 'Operation 03: Aftershock Seismic Triage',
    status: 'PASS',
    score: aftershockRes.totalScore,
    outcome: aftershockRes.outcome,
  });
  console.log(`   ✓ Aftershock completed: ${aftershockRes.totalScore}/100 pts (${aftershockRes.outcome}).`);

  // -------------------------------------------------------------------------
  // STAGE 6: Adversarial & Resiliency Stress Suite
  // -------------------------------------------------------------------------
  console.log('\n[Stage 6/8] Executing Adversarial & Resiliency Stress Suite...');
  // Reload mission to clean state for stress tests
  await player.pointAndPinch('hand-right', 'debrief-panel:Btn_RestartMission');
  await player.settle(6);

  // Scan a cube for stress tests
  await player.lookAt('GLOBE');
  await player.pointAndPinch('hand-right', 'sector-b');
  await player.pointAndPinch('hand-right', 'pad-fire-swath');
  await player.settle(5);

  const stress1 = await testTrackingLossAndRecovery(player);
  console.log('   ✓ Tracking loss & cube snap-back recovery verified.');

  const stress2 = await testDualHandContention(player);
  console.log('   ✓ Dual-hand simultaneous grab contention verified (zero duplicate cubes).');

  const stress3 = await testRecenterAndAnchorConsistency(player);
  console.log('   ✓ Mid-gameplay recenter & console anchor consistency verified.');

  const stress4 = await testInvalidDropRejection(player);
  console.log('   ✓ Out-of-bounds drop rejection & safe tray recovery verified.');

  const stress5 = await testSyntheticJitterResilience(player);
  console.log('   ✓ Synthetic 15mm hand tracking jitter hysteresis verified.');

  await page.screenshot({ path: join(artifactsDir, '07-adversarial-recovery.png') });
  stageReports.push({
    stage: 6,
    name: 'Adversarial & Resiliency Stress Tests',
    status: 'PASS',
    trackingLossRecovery: stress1.status,
    dualHandContention: stress2.status,
    recenterConsistency: stress3.status,
    invalidDropRejection: stress4.status,
    jitterResilience: stress5.status,
  });

  // -------------------------------------------------------------------------
  // STAGE 7: Profile Reload & Campaign Mastery Persistence
  // -------------------------------------------------------------------------
  console.log('\n[Stage 7/8] Verifying Campaign Progression & Persistence across Reload...');
  const persistenceRes = await verifyCampaignProgressionAndPersistence(page);
  stageReports.push({
    stage: 7,
    name: 'Campaign Mastery Persistence',
    status: 'PASS',
    tutorialComplete: persistenceRes.tutorialComplete,
    masteredMissions: persistenceRes.masteredMissions,
  });
  console.log(`   ✓ Persistence verified: ${persistenceRes.masteredMissions.join(', ')} (tutorialComplete=${persistenceRes.tutorialComplete}).`);

  // -------------------------------------------------------------------------
  // STAGE 8: Performance, Frame Interval & Memory Telemetry
  // -------------------------------------------------------------------------
  console.log('\n[Stage 8/8] Measuring emulated XR frame cadence (passive probe, driver idle)...');
  const runtimeTelemetry = await player.collectRuntimeTelemetry();
  // Warm-up is discarded; the Node driver then sleeps so no automation runs inside the window.
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__PERF__.begin('post-campaign cockpit (driver idle)', false));
  await page.waitForTimeout(6000);
  const perfRec = await page.evaluate(() => window.__PERF__.end());
  const perf = summarizeRecording(perfRec, 5);
  const hostRefresh = await page.evaluate(
    () =>
      new Promise((resolveHost) => {
        // Measured in the game page itself after the XR window; compare with XR cadence above.
        const ts = [];
        const loop = (t) => {
          ts.push(t);
          if (ts.length < 90) requestAnimationFrame(loop);
          else {
            const iv = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b);
            resolveHost({ medianMs: iv[Math.floor(iv.length / 2)], p95Ms: iv[Math.floor(iv.length * 0.95)] });
          }
        };
        requestAnimationFrame(loop);
      }),
  );

  const xrN = perf.xrFrameInterval_ms.n;
  assert.ok(xrN >= 30, `Probe must observe >= 30 XR frames (got ${xrN})`);

  stageReports.push({
    stage: 8,
    name: 'Emulated XR Frame Cadence & Renderer Statistics (MEASURED, not a pass/fail gate)',
    status: 'MEASURED',
    scope:
      'VERIFIED IN EMULATED WEBXR on the host GPU. IWER drives XRSession frames from window.requestAnimationFrame, so cadence is bounded by the host display. NOT VERIFIED: PHYSICAL QUEST REQUIRED (72/90/120 Hz, thermals, foveation).',
    cockpitState: 'End of campaign + stress suite, OPERATIONS/DEBRIEF whichever the run ended in; Node driver idle during window',
    window: perf,
    windowRafAfterWindow_ms: hostRefresh,
    frameBudgetsMs: { hz72: 13.9, hz36half: 27.8, hz20: 50 },
    rendererStatsNote:
      'rendererInfoCalls/rendererInfoTriangles are renderer.info for the single renderer.render() call per XR frame and include BOTH eyes (ArrayCamera, one draw per view). glDrawCommands is counted directly on the WebGL context and is the ground truth.',
    rendererStats: runtimeTelemetry.rendererStats,
    reachEnvelope: runtimeTelemetry.reachEnvelope,
    handTelemetryEventsCount: runtimeTelemetry.handTelemetryLog.length,
  });
  const x = perf.xrFrameInterval_ms;
  console.log(
    `   - XR frame interval ms (n=${x.n}): median ${x.median}, p90 ${x.p90}, p95 ${x.p95}, p99 ${x.p99}, max ${x.max}; >13.9: ${x['gt13.9ms']}, >27.8: ${x['gt27.8ms']}, >50: ${x['gt50ms']}`,
  );
  console.log(
    `   - JS in XR callback median ${perf.xrCallbackJs_ms.median} ms (render submit ${perf.renderSubmit_ms.median}, app ${perf.appUpdateJs_ms.median}); GPU timer ${perf.gpuTime_ms ? perf.gpuTime_ms.median + ' ms' : 'unavailable'}.`,
  );
  console.log(`   - GL draw commands/XR frame: ${perf.perXrFrame.glDrawCommands}; renderer.info.calls: ${perf.perXrFrame.rendererInfoCalls} (both eyes).`);
  console.log('   - Frame timing is EMULATOR/HOST data: not a Quest result and not a pass/fail gate.');
  assert.equal(failures.length, 0, `Uncaught page/console errors during test:\n${failures.join('\n')}`);

  // -------------------------------------------------------------------------
  // Summary & Artifact Generation
  // -------------------------------------------------------------------------
  const finalReport = {
    testSuite: 'ORBIT ZERO: VIRTUAL META QUEST TEST LAB',
    timestamp: new Date().toISOString(),
    gitRevision: GIT_REVISION,
    emulatedDevice: `Meta Quest 3 profile (IWER ${IWER_VERSION} installed; not a physical headset)`,
    overallStatus: 'PASS',
    totalStages: 8,
    stagesPassed: stageReports.filter((s) => s.status === 'PASS').length,
    stagesMeasured: stageReports.filter((s) => s.status === 'MEASURED').length,
    failures: failures.length,
    classification: {
      verifiedAutomatically: [
        'Deterministic mission simulation engine (MissionEngine, scoring, planner)',
        'Exclusive cube ownership authority (CubeInteractions: HELD/PREVIEW/RECOVERED)',
        'Console-local station snap resolution under translation/rotation/recenter',
        'Tutorial action tracking & explicit inspection separation',
        'Procedural crisis config propagation across solver, benchmark & debrief',
        'Profile mastery persistence across all 4 operations',
      ],
      verifiedInEmulatedWebXR: [
        'Immersive WebXR session entry; XRFrame.getViewerPose exposes 2 views (left/right); 25 standard XRHand joints per hand with poses; seated head poses',
        'Pure hands-only bimanual player journeys through all 4 operations',
        'Pinch-scanning, 3D cube near-hand grabbing, eye-level hologram inspection',
        'Processing Cradle compression and Downlink Bay slot docking via emulated hands',
        'Downlink transmission lever actuation and victory debrief navigation',
        'Seated reach envelope validation (all interactives within <= 0.58m forward reach)',
      ],
      syntheticStressTests: [
        'Tracking loss mid-carry: automatic cube recovery to home tray slot',
        'Tracking reacquisition: seamless hand reconnect and post-loss grab capability',
        'Dual-hand simultaneous grab contention: exclusive ownership, zero duplication',
        'High-frequency synthetic tracking jitter: 15mm amplitude grasp hysteresis',
        'Out-of-bounds drop rejection: automatic safe tray return',
      ],
      notVerifiedPhysicalQuestRequired: [
        'Physical Quest camera-based optical hand tracking accuracy under ambient lighting',
        'Stereoscopic lens optical clarity, chromatic aberration, and eye-strain comfort',
        'Physical seated ergonomic arm fatigue during 15-minute operational sessions',
        'Horizon OS WebXR Browser native GPU frame pacing (72/90/120 Hz), thermal throttling, foveation and framebuffer scale on Quest hardware',
        'Physical IPD fit and stereo comfort (the measured IPD here is the emulator configuration echoed back by view poses)',
      ],
    },
    stageReports,
  };

  await writeFile(
    join(artifactsDir, 'virtual-quest-report.json'),
    JSON.stringify(finalReport, null, 2),
    'utf8',
  );

  console.log('\n================================================================');
  console.log('   VIRTUAL QUEST LAB: functional stages 1-7 PASSED; stage 8 frame cadence MEASURED (emulator, not Quest)');
  console.log(`   Report saved to: artifacts/virtual-quest/virtual-quest-report.json`);
  console.log('================================================================\n');
} catch (error) {
  console.error('\n[Lab Fatal Error]:', error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (preview) preview.kill();
}

