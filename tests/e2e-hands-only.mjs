// UNIT-LEVEL CHECK of the direct-touch input path, run in a browser.
// It places (teleports) the emulated fingertip exactly on each target and pinches, so it proves that a touch on
// each object maps to the right action. It does NOT prove a seated player can reach or aim at them: that is
// tests/e2e-hands-first-proof.mjs (laser aim from a rest pose, hand paths in small steps) and, finally, the
// headset checklist in docs/HEADSET_SESSION_CHECKLIST.md.
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
const artifacts = process.env.ORBIT_ARTIFACT_DIR || join(root, 'artifacts', 'hands-only-audit');
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

try {
  // A cold `vite preview` can take ~100 s on the 8 GB dev laptop (~10-15 s warm); see tests/_harness.mjs.
  const deadline = Date.now() + 240000;
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
    } catch {}
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
    content: `${iwerSource}\nconst device = new window.IWER.XRDevice(window.IWER.metaQuest3, { stereoEnabled: false }); device.installRuntime({forceInstall:true}); device.primaryInputMode = 'hand'; window.__ORBIT_IWER__ = device; window.IWER_DEVICE = device;`,
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
  // 1. Entry from Public Root URL `/` -> Campaign Selection -> Enter VR
  // =========================================================================
  // IWER reports the Meta Quest user agent, so the root URL opens the headset lobby. A first-time
  // visitor gets the Orbital Academy; one tap on ENTER VR starts the session.
  console.log('[1/8] Navigating to public root URL / (headset lobby) and entering VR with one tap...');
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#oz-xr-entry')?.dataset.phase === 'ready', null, { timeout: 60000 });
  await page.click('#oz-xr-enter');

  await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__), null, { timeout: 60000 });
  await page.waitForFunction(
    () => Boolean(window.__ORBIT_ZERO__) && window.__ORBIT_ZERO__.getRuntimeStatus().immersive,
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(400);

  // Configure IWER 2.7.0 remote hand mode
  const initHandSession = await page.evaluate(async () => {
    const remote = window.__ORBIT_IWER__.remote;
    await remote.dispatch('set_input_mode', { mode: 'hand' });
    await remote.dispatch('set_connected', { device: 'hand-left', connected: true });
    await remote.dispatch('set_connected', { device: 'hand-right', connected: true });
    await remote.dispatch('set_hand_pose', { device: 'hand-left', poseId: 'default' });
    await remote.dispatch('set_hand_pose', { device: 'hand-right', poseId: 'point' });

    const leftState = await remote.dispatch('get_hand_state', { device: 'hand-left' });
    const rightState = await remote.dispatch('get_hand_state', { device: 'hand-right' });
    return {
      immersive: window.__ORBIT_ZERO__.getRuntimeStatus().immersive,
      tutorialState: window.__ORBIT_ZERO__.getTutorialState(),
      leftConnected: leftState.connected,
      rightConnected: rightState.connected,
      rightPose: rightState.poseId,
    };
  });

  assert.equal(initHandSession.immersive, true, 'WebXR session must be active in immersive VR');
  assert.equal(initHandSession.leftConnected, true, 'IWER hand-left must be connected');
  assert.equal(initHandSession.rightConnected, true, 'IWER hand-right must be connected');
  assert.equal(initHandSession.tutorialState.active, true, 'Orbital Academy tutorial must be active');
  assert.equal(initHandSession.tutorialState.vrMode, true, 'TutorialEngine must enforce vrMode=true in WebXR');
  assert.equal(initHandSession.tutorialState.currentStepId, 'STEP_1_ENVIRONMENT');

  // Helper in page context: point index-tip of an IWER hand at a 3D target and perform a real pinch
  const handPointAndPinch = async (handDevice, targetId) => {
    const res = await page.evaluate(
      async ({ handDevice, targetId }) => {
        const api = window.__ORBIT_ZERO__;
        const remote = window.__ORBIT_IWER__.remote;
        const pos = api.get3DTargetWorldPosition(targetId);
        if (!pos) throw new Error(`3D target not found: ${targetId}`);

        const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await remote.dispatch('set_hand_pose', { device: handDevice, poseId: 'point' });
        await remote.dispatch('set_select_value', { device: handDevice, value: 0.0 });
        await remote.dispatch('set_transform', {
          device: handDevice,
          position: pos,
          anchor: 'index-tip',
        });
        await settle();

        await remote.dispatch('set_select_value', { device: handDevice, value: 1.0 });
        await settle();
        const pinchedHand = await remote.dispatch('get_hand_state', { device: handDevice });

        await remote.dispatch('set_select_value', { device: handDevice, value: 0.0 });
        await settle();
        const releasedHand = await remote.dispatch('get_hand_state', { device: handDevice });

        return {
          targetId,
          targetPos: pos,
          pinchedHand: {
            connected: pinchedHand.connected,
            poseId: pinchedHand.poseId,
            pinchValue: pinchedHand.pinchValue,
            pressed: pinchedHand.pressed,
            indexTip: pinchedHand.anchors['index-tip'],
          },
          releasedHand: {
            pinchValue: releasedHand.pinchValue,
            pressed: releasedHand.pressed,
          },
          missionState: api.getState(),
          tutorialState: api.getTutorialState(),
        };
      },
      { handDevice, targetId },
    );
    return res;
  };

  // Helper in page context: pinch-grab a 3D Data Cube, carry it through 3D space, and release inside a 3D Drop Zone
  const handGrabCarryAndRelease = async (handDevice, cubeNodeId, dropZoneTargetId) => {
    return page.evaluate(
      async ({ handDevice, cubeNodeId, dropZoneTargetId }) => {
        const api = window.__ORBIT_ZERO__;
        const remote = window.__ORBIT_IWER__.remote;
        const cubePos = api.get3DTargetWorldPosition(cubeNodeId);
        const dropPos = api.get3DTargetWorldPosition(dropZoneTargetId);
        if (!cubePos || !dropPos) {
          throw new Error(`Missing 3D coordinates for ${cubeNodeId} or ${dropZoneTargetId}`);
        }

        // 1. Move hand grasp anchor to the 3D Data Cube
        const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const moveGrasp = async (position) => {
          await remote.dispatch('set_transform', { device: handDevice, position, anchor: 'grasp' });
          const hand = await remote.dispatch('get_hand_state', { device: handDevice });
          const index = hand.anchors['index-tip'], thumb = hand.anchors['thumb-tip'];
          await remote.dispatch('set_transform', {
            device: handDevice,
            position: {
              x: hand.position.x + position.x - (index.x + thumb.x) * 0.5,
              y: hand.position.y + position.y - (index.y + thumb.y) * 0.5,
              z: hand.position.z + position.z - (index.z + thumb.z) * 0.5,
            },
          });
        };
        await remote.dispatch('set_hand_pose', { device: handDevice, poseId: 'point' });
        await remote.dispatch('set_select_value', { device: handDevice, value: 0.0 });
        await moveGrasp(cubePos);
        await settle();
        const beforePinch = api.getXRHandTelemetryLog().slice(-5).map(e => ({ type:e.eventType, target:e.targetId, pose:e.poseId, wrist:e.position, grasp:e.graspPosition, tip:e.indexTipPosition }));

        // 2. Close pinch to grab the 3D Data Cube
        await remote.dispatch('set_select_value', { device: handDevice, value: 1.0 });
        await settle();
        const activeGrabsAtStart = api.getActiveXRHandGrabs();

        // 3. Lift & carry cube through 3D inspection waypoint
        const waypoint = {
          x: Number(((cubePos.x + dropPos.x) * 0.5).toFixed(3)),
          y: 0.89,
          z: -0.44,
        };
        await moveGrasp(waypoint);
        await settle();
        const cubeMidCarryPos = api.get3DTargetWorldPosition(cubeNodeId);

        // 4. Carry cube into the 3D target drop zone (Processing Cradle or Downlink Bay Slot)
        await moveGrasp(dropPos);
        await settle();
        const cubeAtDropZonePos = api.get3DTargetWorldPosition(cubeNodeId);

        // 5. Open hand pinch to release the cube inside the drop zone
        await remote.dispatch('set_select_value', { device: handDevice, value: 0.0 });
        await settle();
        const activeGrabsAfterRelease = api.getActiveXRHandGrabs();

        return {
          handDevice,
          beforePinch,
          cubeNodeId,
          dropZoneTargetId,
          cubePos,
          waypoint,
          dropPos,
          activeGrabsAtStart,
          cubeMidCarryPos,
          cubeAtDropZonePos,
          activeGrabsAfterRelease,
          missionState: api.getState(),
          tutorialState: api.getTutorialState(),
        };
      },
      { handDevice, cubeNodeId, dropZoneTargetId },
    );
  };

  // =========================================================================
  // 2. Step-by-Step VR Hand Gesture Tutorial Verification (Priority 2)
  // =========================================================================
  console.log('[2/8] Verifying VR tutorial gesture provenance & desktop shortcut rejection...');
  // Verify desktop shortcut rejection while vrMode === true
  const desktopRejectedInVR = await page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    api.tutorial.notifyGlobeInteraction('desktop');
    api.tutorial.syncWithMissionState(api.getState(), undefined, 'desktop');
    return api.getTutorialState().currentStepId;
  });
  assert.equal(
    desktopRejectedInVR,
    'STEP_1_ENVIRONMENT',
    'Desktop input must be rejected when VR tutorial mode (vrMode=true) is active',
  );

  // STEP 1 (STEP_1_ENVIRONMENT): Touch the 3D Earth Globe Gimbal with hand-right
  await page.evaluate(async () => {
    const remote = window.__ORBIT_IWER__.remote;
    const globePos = window.__ORBIT_ZERO__.get3DTargetWorldPosition('GLOBE_GIMBAL');
    await remote.dispatch('set_transform', {
      device: 'hand-right',
      position: globePos,
      anchor: 'index-tip',
    });
    await new Promise((r) => setTimeout(r, 75));
  });
  const afterStep1 = await page.evaluate(() => window.__ORBIT_ZERO__.getTutorialState());
  assert.equal(afterStep1.currentStepId, 'STEP_2_POINT', 'Hand globe touch must advance STEP_1 -> STEP_2_POINT');

  // STEP 2 (STEP_2_POINT): Point index-tip of hand-right at Sector B beacon and pinch
  const step2Res = await handPointAndPinch('hand-right', 'sector-b');
  assert.equal(step2Res.missionState.selectedSectorId, 'B');
  assert.equal(step2Res.tutorialState.currentStepId, 'STEP_3_PINCH', 'Hand point+pinch on Sector B must advance STEP_2 -> STEP_3_PINCH');

  // STEP 3 (STEP_3_PINCH): Ensure THERMAL sensor is active and pinch pad-fire-swath with hand-right
  let toggleSafety = 0;
  while ((await page.evaluate(() => window.__ORBIT_ZERO__.getState().activeSensorMode)) !== 'THERMAL') {
    await handPointAndPinch('hand-right', 'pad-toggle-sensor');
    if (++toggleSafety > 5) throw new Error(`Sensor toggle did not reach THERMAL: ${JSON.stringify(await page.evaluate(() => ({mode: window.__ORBIT_ZERO__.getState().activeSensorMode, grabs: window.__ORBIT_ZERO__.getActiveXRHandGrabs(), events: window.__ORBIT_ZERO__.getXRHandTelemetryLog().slice(-18).map(e => [e.handedness,e.eventType,e.targetId,e.actionOrOutcome])})))}`);
  }
  const step3Res = await handPointAndPinch('hand-right', 'pad-fire-swath');
  assert.equal(step3Res.missionState.packets.length, 1);
  assert.equal(step3Res.missionState.packets[0].sectorId, 'B');
  assert.equal(step3Res.missionState.packets[0].sensorMode, 'THERMAL');
  assert.equal(step3Res.missionState.packets[0].payloadMb, 42);
  // CRITICAL PRIORITY 2 CHECK: Even though scanning auto-selected PKT-1, tutorial MUST stop at STEP_4_GRAB!
  assert.equal(
    step3Res.tutorialState.currentStepId,
    'STEP_4_GRAB',
    'STEP_4_GRAB must NOT auto-complete after scanning even though selectedPacketId is non-null',
  );

  // =========================================================================
  // 3. Hand Tracking Loss & Dropped Cube Recovery Test (hand-left)
  // =========================================================================
  console.log('[3/8] Verifying hand-left 3D cube grab, lift, tracking loss & snap-back recovery...');
  const trackingRecoveryAudit = await page.evaluate(async () => {
    const api = window.__ORBIT_ZERO__;
    const remote = window.__ORBIT_IWER__.remote;
    const cubeHome = api.get3DTargetWorldPosition('evidence-cube-1');

    // Recovery requires a tracked open hand before a new pinch can acquire a cube.
    await remote.dispatch('set_hand_pose', { device: 'hand-left', poseId: 'point' });
    await remote.dispatch('set_select_value', { device: 'hand-left', value: 0.0 });
    await new Promise((r) => setTimeout(r, 120));
    // Grab evidence-cube-1 with hand-left and lift it to y = 0.93m
    await remote.dispatch('set_hand_pose', { device: 'hand-left', poseId: 'point' });
    await remote.dispatch('set_transform', {
      device: 'hand-left',
      position: cubeHome,
      anchor: 'grasp',
    });
    await new Promise((r) => setTimeout(r, 60));
    await remote.dispatch('set_select_value', { device: 'hand-left', value: 1.0 });
    await new Promise((r) => setTimeout(r, 65));

    await remote.dispatch('set_transform', {
      device: 'hand-left',
      position: { x: -0.20, y: 0.93, z: -0.42 },
      anchor: 'grasp',
    });
    await new Promise((r) => setTimeout(r, 75));
    const liftedPos = api.get3DTargetWorldPosition('evidence-cube-1');

    // Simulate sudden hand tracking loss while holding the cube!
    await remote.dispatch('set_connected', { device: 'hand-left', connected: false });
    await new Promise((r) => setTimeout(r, 75));
    const snappedBackPos = api.get3DTargetWorldPosition('evidence-cube-1');
    const grabsAfterLoss = api.getActiveXRHandGrabs();

    // Reconnect hand-left and reset select value
    await remote.dispatch('set_hand_pose', { device: 'hand-left', poseId: 'point' });
    await remote.dispatch('set_select_value', { device: 'hand-left', value: 0.0 });
    await remote.dispatch('set_connected', { device: 'hand-left', connected: true });
    await new Promise((r) => setTimeout(r, 60));

    return {
      cubeHome,
      liftedPos,
      snappedBackPos,
      grabsAfterLossCount: grabsAfterLoss.length,
      tutorialStepAfterLift: api.getTutorialState().currentStepId,
    };
  });

  assert.ok(trackingRecoveryAudit.liftedPos.y > 0.88, 'Grabbed cube must physically lift in 3D space with hand-left');
  assert.equal(trackingRecoveryAudit.grabsAfterLossCount, 0, 'Tracking loss must immediately release active hand grab');
  assert.ok(
    Math.abs(trackingRecoveryAudit.snappedBackPos.x - trackingRecoveryAudit.cubeHome.x) < 0.01 &&
      Math.abs(trackingRecoveryAudit.snappedBackPos.y - trackingRecoveryAudit.cubeHome.y) < 0.01,
    'Dropped cube on tracking loss must automatically snap back to its home tray slot',
  );
  // Lifting the valid cube during the tracking test completed STEP_4_GRAB and STEP_5_INSPECT!
  assert.equal(trackingRecoveryAudit.tutorialStepAfterLift, 'STEP_6_PROCESS');

  // =========================================================================
  // 4. STEP 6 (PROCESS IN CRADLE) & STEP 7 (DOCK IN DOWNLINK BAY) via Hand Grab
  // =========================================================================
  console.log('[4/8] Grabbing cube with hand-left -> Processing Cradle, then hand-right -> Downlink Bay Slot 1...');
  const cradleDropRes = await handGrabCarryAndRelease('hand-left', 'evidence-cube-1', 'PROCESS_CRADLE');
  assert.equal(cradleDropRes.activeGrabsAtStart.length, 1, 'Cube must be actively grabbed by hand-left');
  assert.equal(cradleDropRes.activeGrabsAfterRelease.length, 0, 'Cube must be released on pinch open');
  assert.equal(cradleDropRes.missionState.packets[0].processed, true, 'Releasing cube in Processing Cradle must compress packet');
  assert.equal(cradleDropRes.missionState.packets[0].storageCost, 1, 'Compressed packet must occupy 1 STR');
  assert.equal(cradleDropRes.missionState.packets[0].payloadMb, 18, 'Compressed packet must be 18 MB (1.8s Tx)');
  assert.equal(cradleDropRes.tutorialState.currentStepId, 'STEP_7_STAGE', 'Cradle release must advance STEP_6 -> STEP_7_STAGE');
  await page.waitForTimeout(750);

  const bayDropRes = await handGrabCarryAndRelease('hand-right', 'evidence-cube-1', 'DOWNLINK_SLOT_1');
  assert.equal(bayDropRes.missionState.queuePacketIds.length, 1, `Releasing cube in Downlink Bay must queue packet: ${JSON.stringify({carry:bayDropRes,events:await page.evaluate(() => window.__ORBIT_ZERO__.getXRHandTelemetryLog().slice(-12).map(e => [e.handedness,e.eventType,e.targetId,e.actionOrOutcome]))})}`);
  assert.equal(bayDropRes.tutorialState.currentStepId, 'STEP_8_TRANSMIT', 'Downlink Bay release must advance STEP_7 -> STEP_8_TRANSMIT');

  // =========================================================================
  // 5. Hands-Only Pause & Resume Verification
  // =========================================================================
  console.log('[5/8] Verifying hands-only Pause & Resume via telemetry-hud:Btn_Pause...');
  const pauseRes = await handPointAndPinch('hand-right', 'telemetry-hud:Btn_Pause');
  assert.equal(pauseRes.missionState.paused, true, 'Hand pinch on Btn_Pause must pause mission');
  const resumeRes = await handPointAndPinch('hand-right', 'telemetry-hud:Btn_Pause');
  assert.equal(resumeRes.missionState.paused, false, 'Hand pinch on Btn_Pause while paused must resume mission');

  // =========================================================================
  // 6. STEP 8 & STEP 9: Commit Downlink (Orbital Academy Qualification -> Advance to OP 01: FIRELINE)
  // =========================================================================
  console.log('[6/8] Committing tutorial downlink (Orbital Academy Qualification -> Advance to OP 01: FIRELINE)...');
  const commitTutorialRes = await handPointAndPinch('hand-right', 'pad-commit-downlink');
  assert.equal(
    commitTutorialRes.tutorialState.currentStepId,
    'STEP_9_DEBRIEF',
    'Hand pinch on pad-commit-downlink must advance STEP_8 -> STEP_9_DEBRIEF',
  );

  // Wait for the 1.8s transmission to finish naturally in the WebXR loop
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 15000 });
  await page.waitForTimeout(300);

  const tutorialFinal = await page.evaluate(() => ({
    state: window.__ORBIT_ZERO__.getState(),
    tutorial: window.__ORBIT_ZERO__.getTutorialState(),
  }));
  assert.equal(tutorialFinal.state.scenarioId, 'ORBITAL_ACADEMY', 'Tutorial must run in dedicated ORBITAL_ACADEMY training scenario');
  assert.equal(tutorialFinal.tutorial.currentStepId, 'COMPLETED', 'Reaching Debrief must complete STEP_9_DEBRIEF -> COMPLETED');
  assert.equal(tutorialFinal.tutorial.completedStepIds.length, 9, 'All 9 tutorial steps must be completed');
  assert.equal(
    tutorialFinal.tutorial.stepVerificationLog.slice(0, 8).every((e) => e.source === 'xr-hand'),
    true,
    'Steps 1-8 in VR tutorial mode must all be verified with source="xr-hand"',
  );
  // Orbital Academy single-target training completes with TRAINING COMPLETE — ORBITAL OPERATOR QUALIFIED (not FAILED / 30/100)
  assert.equal(tutorialFinal.state.debrief.outcome, 'SUCCESS');
  assert.equal(tutorialFinal.state.debrief.missionRank, 'TRAINING COMPLETE — ORBITAL OPERATOR QUALIFIED');
  assert.equal(tutorialFinal.state.debrief.totalScore, 100);
  assert.equal(tutorialFinal.state.debrief.efficiencyGrade, 'A');
  assert.equal(tutorialFinal.state.debrief.certification, 'SILVER');

  // Advance directly from ORBITAL_ACADEMY to OP 01: FIRELINE (FIRELINE_PASS) using hand-right pinch on mission-hud:Btn_HudNext (the headset result is on the HUD)
  const toFirelineRes = await handPointAndPinch('hand-right', 'mission-hud:Btn_HudNext');
  assert.equal(toFirelineRes.missionState.scenarioId, 'FIRELINE_PASS', 'Hand pinch on Btn_NextMission after Orbital Academy must launch OP 01: FIRELINE');
  assert.equal(toFirelineRes.missionState.phase, 'OPERATIONS');
  assert.equal(toFirelineRes.missionState.packets.length, 0);
  assert.equal(toFirelineRes.missionState.power, 52);

  // =========================================================================
  // 7. Full Optimal 100/100 GOLD Victory Playthrough on FIRELINE_PASS (Dominant B+E Compression) Using Only Hands
  // =========================================================================
  console.log('[7/8] Executing complete optimal 100/100 GOLD Fireline playthrough (strictly dominant B+E compression: 76 MB / 7.6s) using only IWER hands...');
  // 7a. Scan Sector B with THERMAL (42 MB), compress in Cradle (hand-left -> 18 MB / 1.8s), dock in Slot 1 (hand-right)
  await handPointAndPinch('hand-right', 'sector-b');
  toggleSafety = 0;
  while ((await page.evaluate(() => window.__ORBIT_ZERO__.getState().activeSensorMode)) !== 'THERMAL') {
    await handPointAndPinch('hand-right', 'pad-toggle-sensor');
    if (++toggleSafety > 5) throw new Error(`Sensor toggle did not reach THERMAL: ${JSON.stringify(await page.evaluate(() => ({mode: window.__ORBIT_ZERO__.getState().activeSensorMode, grabs: window.__ORBIT_ZERO__.getActiveXRHandGrabs(), events: window.__ORBIT_ZERO__.getXRHandTelemetryLog().slice(-18).map(e => [e.handedness,e.eventType,e.targetId,e.actionOrOutcome])})))}`);
  }
  await handPointAndPinch('hand-right', 'pad-fire-swath');
  await handGrabCarryAndRelease('hand-left', 'evidence-cube-1', 'PROCESS_CRADLE');
  await page.waitForTimeout(750);
  await handGrabCarryAndRelease('hand-right', 'evidence-cube-1', 'DOWNLINK_SLOT_1');
  const after7a = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(after7a.queuePacketIds.length, 1, `7a failed: ${JSON.stringify({ packets: after7a.packets, queue: after7a.queuePacketIds, sel: after7a.selectedSectorId, pwr: after7a.power })}`);

  // 7b. Scan Sector C with OPTICAL (40 MB), dock raw 40 MB cube directly in Slot 2 (hand-right)
  await handPointAndPinch('hand-right', 'sector-c');
  toggleSafety = 0;
  while ((await page.evaluate(() => window.__ORBIT_ZERO__.getState().activeSensorMode)) !== 'OPTICAL') {
    await handPointAndPinch('hand-right', 'pad-toggle-sensor');
    if (++toggleSafety > 5) throw new Error('Sensor toggle did not reach OPTICAL');
  }
  await handPointAndPinch('hand-right', 'pad-fire-swath');
  await handGrabCarryAndRelease('hand-right', 'evidence-cube-2', 'DOWNLINK_SLOT_2');
  const after7b = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(after7b.queuePacketIds.length, 2, `7b failed: ${JSON.stringify({ packets: after7b.packets, queue: after7b.queuePacketIds, sel: after7b.selectedSectorId, pwr: after7b.power })}`);

  // 7c. Scan Sector E with THERMAL (42 MB), compress in Cradle (hand-left -> 18 MB / 1.8s), dock in Slot 3 (hand-right) -> 18 + 40 + 18 = 76 MB (7.6s / 10.0s, 10 Wh left)
  await handPointAndPinch('hand-right', 'sector-e');
  toggleSafety = 0;
  while ((await page.evaluate(() => window.__ORBIT_ZERO__.getState().activeSensorMode)) !== 'THERMAL') {
    await handPointAndPinch('hand-right', 'pad-toggle-sensor');
    if (++toggleSafety > 5) throw new Error(`Sensor toggle did not reach THERMAL: ${JSON.stringify(await page.evaluate(() => ({mode: window.__ORBIT_ZERO__.getState().activeSensorMode, grabs: window.__ORBIT_ZERO__.getActiveXRHandGrabs(), events: window.__ORBIT_ZERO__.getXRHandTelemetryLog().slice(-18).map(e => [e.handedness,e.eventType,e.targetId,e.actionOrOutcome])})))}`);
  }
  await handPointAndPinch('hand-right', 'pad-fire-swath');
  const after7cScan = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(after7cScan.packets.length, 3, `7c scan failed: ${JSON.stringify({ packets: after7cScan.packets, queue: after7cScan.queuePacketIds, sel: after7cScan.selectedSectorId, pwr: after7cScan.power })}`);
  const after7cCradle = await handGrabCarryAndRelease('hand-left', 'evidence-cube-3', 'PROCESS_CRADLE');
  await page.waitForTimeout(750);
  const after7cDock = await handGrabCarryAndRelease('hand-right', 'evidence-cube-3', 'DOWNLINK_SLOT_3');

  const preCommitFireline = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(
    preCommitFireline.queuePacketIds.length,
    3,
    `7c dock failed: ${JSON.stringify({
      packets: preCommitFireline.packets.map((p) => ({ id: p.id, sec: p.sectorId, proc: p.processed, q: p.queued, qIdx: p.queueIndex })),
      queue: preCommitFireline.queuePacketIds,
      cradleGrabs: after7cCradle.activeGrabsAtStart,
      cradlePos: after7cCradle.cubePos,
      dockGrabs: after7cDock.activeGrabsAtStart,
      dockCubePos: after7cDock.cubePos,
      dockDropPos: after7cDock.dropPos,
    })}`,
  );
  assert.equal(preCommitFireline.downlinkCommittedSec, 7.6, JSON.stringify({beforePinch:after7cCradle.beforePinch,cradle:after7cCradle.activeGrabsAtStart,cradlePacket:after7cCradle.missionState.packets.map(p=>({id:p.id,sector:p.sectorId,processed:p.processed})),events:await page.evaluate(()=>window.__ORBIT_ZERO__.getXRHandTelemetryLog().slice(-16).map(e=>[e.handedness,e.eventType,e.targetId,e.actionOrOutcome]))}));
  assert.equal(preCommitFireline.power, 10, JSON.stringify({packets:preCommitFireline.packets.map(p=>({id:p.id,sector:p.sectorId,sensor:p.sensorMode,processed:p.processed})),events:await page.evaluate(()=>window.__ORBIT_ZERO__.getXRHandTelemetryLog().filter(e=>e.eventType==='selectstart').slice(-16).map(e=>[e.handedness,e.targetId,e.actionOrOutcome]))}));

  // 7d. Commit Downlink with hand-right pinch on pad-commit-downlink
  await handPointAndPinch('hand-right', 'pad-commit-downlink');
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 25000 });
  await page.waitForTimeout(300);

  const victoryState = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(victoryState.debrief.outcome, 'SUCCESS');
  assert.equal(victoryState.debrief.totalScore, 100);
  assert.equal(victoryState.debrief.efficiencyGrade, 'S');
  assert.equal(victoryState.debrief.certification, 'GOLD');
  assert.equal(victoryState.debrief.transmittedPayloadMb, 76);
  await page.screenshot({ path: join(artifacts, 'hands-only-fireline-gold-victory.png') });

  // =========================================================================
  // 8. Advance to Next Operation (OP 02: MONSOON SHIELD) with Hand Pinch
  // =========================================================================
  console.log('[8/8] Advancing to OP 02: MONSOON SHIELD via mission-hud:Btn_HudNext pinch...');
  const nextOpRes = await handPointAndPinch('hand-right', 'mission-hud:Btn_HudNext');
  assert.equal(nextOpRes.missionState.scenarioId, 'STANDARD_INDUS_PASS', 'Hand pinch on Btn_NextMission must load OP 02: MONSOON SHIELD');
  assert.equal(nextOpRes.missionState.phase, 'OPERATIONS');

  // Collect full IWER hand telemetry log & seated reach envelope proof
  const finalTelemetry = await page.evaluate(() => ({
    handEventLog: window.__ORBIT_ZERO__.getXRHandTelemetryLog(),
    tutorialVerificationLog: window.__ORBIT_ZERO__.getTutorialState().stepVerificationLog,
    reachEnvelope: window.__ORBIT_ZERO__.verifySeatedReachEnvelope(),
    rendererStats: window.__ORBIT_ZERO__.getRendererStats(),
  }));

  assert.ok(finalTelemetry.handEventLog.length >= 35, 'Hand telemetry log must record comprehensive hand interaction sequence');
  assert.ok(
    finalTelemetry.handEventLog.some((e) => e.handedness === 'left' && e.eventType === 'grabstart'),
    'Must record left-hand 3D cube grab',
  );
  assert.ok(
    finalTelemetry.handEventLog.some((e) => e.handedness === 'right' && e.eventType === 'grabstart'),
    'Must record right-hand 3D cube grab',
  );
  assert.ok(
    finalTelemetry.handEventLog.some((e) => e.eventType === 'tracking_lost_recovery'),
    'Must record hand tracking loss & automatic cube snap-back recovery',
  );
  assert.equal(
    finalTelemetry.reachEnvelope.pass,
    true,
    `Seated reach violations: ${JSON.stringify(finalTelemetry.reachEnvelope.violations)}`,
  );
  assert.ok(
    finalTelemetry.reachEnvelope.maxDistance <= 0.58,
    `Expected all interactive objects within <= 0.58 m comfortable reach envelope, got maxDistance=${finalTelemetry.reachEnvelope.maxDistance}: ${JSON.stringify(finalTelemetry.reachEnvelope.objects)}`,
  );
  assert.equal(failures.length, 0, `Console/page errors detected:\n${failures.join('\n')}`);

  const report = {
    status: 'PASS',
    verificationTier:
      'IWER 2.7.0 RemoteControlInterface (device.remote) Emulated Meta Quest 3 Hand-Joint & Pinch Pipeline (Physical Quest 3/3S headset camera tracking remains separate hardware tier)',
    zeroShortcutsUsed: {
      trigger3DNodeCalls: 0,
      simulateCubeDropCalls: 0,
      clickPanelCalls: 0,
      keyboardEventsUsed: 0,
    },
    tutorialStepsVerified: tutorialFinal.tutorial.stepVerificationLog,
    orbitalAcademyQualificationDebrief: {
      scenarioId: tutorialFinal.state.scenarioId,
      outcome: tutorialFinal.state.debrief.outcome,
      missionRank: tutorialFinal.state.debrief.missionRank,
      totalScore: tutorialFinal.state.debrief.totalScore,
      efficiencyGrade: tutorialFinal.state.debrief.efficiencyGrade,
      certification: tutorialFinal.state.debrief.certification,
      transmittedPayloadMb: tutorialFinal.state.debrief.transmittedPayloadMb,
      downlinkUsedSec: tutorialFinal.state.debrief.downlinkUsedSec,
      powerRemaining: tutorialFinal.state.debrief.powerRemaining,
    },
    trackingLossRecovery: trackingRecoveryAudit,
    firelineVictoryDebrief: {
      outcome: victoryState.debrief.outcome,
      totalScore: victoryState.debrief.totalScore,
      efficiencyGrade: victoryState.debrief.efficiencyGrade,
      certification: victoryState.debrief.certification,
      transmittedPayloadMb: victoryState.debrief.transmittedPayloadMb,
      downlinkUsedSec: victoryState.debrief.downlinkUsedSec,
      powerRemaining: victoryState.debrief.powerRemaining,
    },
    nextOperationLoaded: nextOpRes.missionState.scenarioId,
    totalHandTelemetryEvents: finalTelemetry.handEventLog.length,
    sampleHandTelemetryEvents: finalTelemetry.handEventLog.slice(0, 30),
    reachEnvelope: finalTelemetry.reachEnvelope,
    rendererStats: finalTelemetry.rendererStats,
  };

  await writeFile(join(artifacts, 'hands-only-audit-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  preview?.kill();
}

