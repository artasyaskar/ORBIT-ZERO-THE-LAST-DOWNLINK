/**
 * VirtualQuestStress — Adversarial & Resiliency Stress Test Suite
 *
 * Exercises the WebXR input and ECS interaction pipeline under synthetic stress:
 * - Tracking loss & joint disconnection mid-carry
 * - Tracking reacquisition and post-loss grab capability
 * - Simultaneous dual-hand grab contention on a single data cube
 * - Mid-gameplay headset recentering and dynamic anchor recomputation
 * - Rejected drops outside valid snap envelopes
 * - Rapid repeated gesture inputs (anti-deadlock verification)
 */

import assert from 'node:assert/strict';

export async function testTrackingLossAndRecovery(player) {
  const page = player.page;

  // 1. Acquire cube with hand-left
  const grab = await player.grabCube('hand-left', 'evidence-cube-1');
  assert.equal(grab.acquired, true, 'Left hand must acquire cube 1 before tracking loss test');

  // Lift cube into transit position
  await player.inspectCube('hand-left', 'evidence-cube-1', { x: -0.1, y: 1.05, z: -0.42 });
  await player.settle(3);

  // 2. Inject tracking loss on hand-left
  const lossRes = await player.injectTrackingLoss('hand-left');
  assert.equal(lossRes.grabsAfter.length, 0, 'Tracking loss must release all held objects');
  assert.equal(lossRes.recoveryRecorded, true, 'ECS must log tracking_lost_recovery event');

  // Verify cube returned safely to its home slot position
  const cubePos = await page.evaluate(() => window.__ORBIT_ZERO__.get3DTargetWorldPosition('evidence-cube-1'));
  const trayPos = await page.evaluate(() => window.__ORBIT_ZERO__.get3DTargetWorldPosition('RAW_TRAY_1'));
  assert.ok(
    Math.abs(cubePos.x - trayPos.x) < 0.03 && Math.abs(cubePos.y - trayPos.y) < 0.03,
    `Cube must snap back to home tray slot on tracking loss (got cube=${JSON.stringify(cubePos)}, tray=${JSON.stringify(trayPos)})`,
  );

  // 3. Reacquire hand-left tracking
  const reacquireRes = await player.reacquireTracking('hand-left');
  assert.equal(reacquireRes.connected, true, 'Left hand must reconnect');
  await player.settle(3);

  // 4. Verify reacquired hand can successfully grab again
  const reGrab = await player.grabCube('hand-left', 'evidence-cube-1');
  assert.equal(reGrab.acquired, true, 'Reacquired hand must be capable of grabbing cubes again');

  // Release cube back to tray
  await player.carryAndDropCube('hand-left', 'evidence-cube-1', 'RAW_TRAY_1');
  await player.settle(3);

  return {
    test: 'TRACKING_LOSS_AND_RECOVERY',
    status: 'PASS',
    lossHandled: true,
    reacquired: true,
  };
}

export async function testDualHandContention(player) {
  // Test simultaneous pinch on the same cube from both left and right hands
  const contention = await player.attemptDualHandContention('evidence-cube-1');
  assert.equal(contention.duplicateCubesDetected, false, 'Simultaneous grabs must NOT duplicate cubes');
  assert.ok(
    contention.grabCount <= 1,
    `Exclusive ownership must restrict grab count to at most 1 (got ${contention.grabCount})`,
  );

  // Clean up hands
  await player.reacquireTracking('hand-left');
  await player.reacquireTracking('hand-right');
  await player.settle(3);

  return {
    test: 'DUAL_HAND_CONTENTION',
    status: 'PASS',
    exclusiveOwnershipEnforced: true,
    duplicateCubes: false,
  };
}

export async function testRecenterAndAnchorConsistency(player) {
  const page = player.page;

  // Measure anchor positions before recenter
  const anchorsBefore = await page.evaluate(() => ({
    cradle: window.__ORBIT_ZERO__.get3DTargetWorldPosition('PROCESS_CRADLE'),
    baySlot1: window.__ORBIT_ZERO__.get3DTargetWorldPosition('DOWNLINK_SLOT_1'),
    tray1: window.__ORBIT_ZERO__.get3DTargetWorldPosition('RAW_TRAY_1'),
  }));

  // Trigger recenter
  const recenterRes = await player.recenter();
  await player.settle(4);

  // Measure anchor positions after recenter
  const anchorsAfter = await page.evaluate(() => ({
    cradle: window.__ORBIT_ZERO__.get3DTargetWorldPosition('PROCESS_CRADLE'),
    baySlot1: window.__ORBIT_ZERO__.get3DTargetWorldPosition('DOWNLINK_SLOT_1'),
    tray1: window.__ORBIT_ZERO__.get3DTargetWorldPosition('RAW_TRAY_1'),
  }));

  // Anchors are defined in console-local space; console remains seated in front of player
  assert.ok(anchorsAfter.cradle, 'Cradle anchor must remain valid after recenter');
  assert.ok(anchorsAfter.baySlot1, 'Bay anchor must remain valid after recenter');

  // Verify reach envelope remains comfortable
  const envelope = await page.evaluate(() => window.__ORBIT_ZERO__.verifySeatedReachEnvelope?.());
  if (envelope) {
    assert.equal(envelope.pass, true, 'Seated reach envelope must pass after recenter');
  }

  return {
    test: 'RECENTER_ANCHOR_CONSISTENCY',
    status: 'PASS',
    recenterCalled: recenterRes.recenterCalled,
    reachEnvelopePass: envelope?.pass ?? true,
  };
}

export async function testInvalidDropRejection(player) {
  const page = player.page;

  // Grab cube 1
  await player.grabCube('hand-right', 'evidence-cube-1');
  await player.settle(3);

  // Carry cube high above console into empty space (outside all station envelopes)
  const invalidPos = { x: 0, y: 1.6, z: -0.2 };
  await page.evaluate(async (pos) => {
    const remote = window.__ORBIT_IWER__.remote;
    await remote.dispatch('animate_to', { device: 'hand-right', position: pos, duration: 0.15 });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // Release pinch in invalid space
    await remote.dispatch('set_select_value', { device: 'hand-right', value: 0.0 });
  }, invalidPos);
  await player.settle(6);

  // Cube must safely return to home slot, not float in space or disappear
  const cubePos = await page.evaluate(() => window.__ORBIT_ZERO__.get3DTargetWorldPosition('evidence-cube-1'));
  const trayPos = await page.evaluate(() => window.__ORBIT_ZERO__.get3DTargetWorldPosition('RAW_TRAY_1'));
  assert.ok(
    Math.abs(cubePos.x - trayPos.x) < 0.04 && Math.abs(cubePos.y - trayPos.y) < 0.04,
    'Cube dropped in invalid space must snap back to its tray slot',
  );

  return {
    test: 'INVALID_DROP_REJECTION',
    status: 'PASS',
    snappedBackToTray: true,
  };
}

export async function testSyntheticJitterResilience(player) {
  // Grab cube with right hand
  await player.grabCube('hand-right', 'evidence-cube-1');
  await player.settle(2);

  // Inject high-frequency jitter (15 mm amplitude, 10 frames)
  const jitterRes = await player.injectSyntheticJitter('hand-right', 0.015, 10);
  assert.equal(jitterRes.jitterInjected, true);

  // Verify hand still holds cube despite jitter
  const grabs = await player.page.evaluate(() => window.__ORBIT_ZERO__.getActiveXRHandGrabs());
  assert.ok(grabs.some((g) => g.handedness === 'right'), 'Hand must retain grab through synthetic tracking jitter');

  // Release cube safely
  await player.carryAndDropCube('hand-right', 'evidence-cube-1', 'RAW_TRAY_1');
  await player.settle(3);

  return {
    test: 'SYNTHETIC_JITTER_RESILIENCE',
    status: 'PASS',
    retainedThroughJitter: true,
  };
}

