/**
 * VirtualQuestCampaign — Automated Hands-Only Campaign Progression
 *
 * Implements end-to-end player journeys across all four operations:
 * - OP 00: Orbital Academy (9-step tutorial qualification)
 * - OP 01: Fireline (Pareto-optimal B+E thermal compression triage)
 * - OP 02: Monsoon Shield (SAR radar vs optical flood triage)
 * - OP 03: Aftershock (Seismic scarp, viaduct, and fault substation)
 *
 * Every action is driven through simulated WebXR hand kinematics.
 * Zero DOM shortcuts, debug teleports, or synthetic score injections are used.
 */

import assert from 'node:assert/strict';

export async function playOrbitalAcademyHandsOnly(player) {
  const page = player.page;

  // Step 1: Seated Environment check
  await player.lookAt('GLOBE');
  await player.settle(5);
  let tut = await page.evaluate(() => window.__ORBIT_ZERO__.getTutorialState());
  assert.equal(tut.active, true, 'Tutorial must be active');
  assert.equal(tut.currentStepId, 'STEP_1_ENVIRONMENT');

  // Step 2: Point right hand at Sector B beacon
  await player.pointAndPinch('hand-right', 'sector-b');
  await player.settle(4);
  tut = await page.evaluate(() => window.__ORBIT_ZERO__.getTutorialState());
  assert.ok(
    tut.currentStepId === 'STEP_2_POINT' || tut.currentStepId === 'STEP_3_PINCH',
    `Expected STEP_2 or STEP_3, got ${tut.currentStepId}`,
  );

  // Step 3: Ensure THERMAL sensor mode and fire swath
  let mode = await page.evaluate(() => window.__ORBIT_ZERO__.getState().activeSensorMode);
  let safety = 0;
  while (mode !== 'THERMAL' && ++safety < 6) {
    await player.pointAndPinch('hand-right', 'pad-toggle-sensor');
    await player.settle(3);
    mode = await page.evaluate(() => window.__ORBIT_ZERO__.getState().activeSensorMode);
  }
  await player.pointAndPinch('hand-right', 'pad-fire-swath');
  await player.settle(5);

  tut = await page.evaluate(() => window.__ORBIT_ZERO__.getTutorialState());
  assert.equal(tut.currentStepId, 'STEP_4_GRAB', 'Must reach STEP_4_GRAB after scanning');

  // Step 4 & 5: Grab cube with right hand, lift to eye-level to inspect
  await player.lookAt('CUBES_TRAY');
  const grabRes = await player.grabCube('hand-right', 'evidence-cube-1');
  assert.equal(grabRes.acquired, true, 'Right hand must acquire Cube 1');

  await player.lookAt('NEUTRAL');
  await player.inspectCube('hand-right', 'evidence-cube-1');
  await player.settle(5);
  tut = await page.evaluate(() => window.__ORBIT_ZERO__.getTutorialState());
  assert.equal(tut.currentStepId, 'STEP_6_PROCESS', 'Inspection must advance tutorial to STEP_6_PROCESS');

  // Step 6: Carry cube into Processing Cradle with right hand (already held)
  await player.lookAt('PROCESS_CRADLE');
  const cradleDrop = await player.carryAndDropCube('hand-right', 'evidence-cube-1', 'PROCESS_CRADLE');
  await page.waitForTimeout(600);
  await player.settle(6);
  tut = await page.evaluate(() => window.__ORBIT_ZERO__.getTutorialState());
  assert.equal(tut.currentStepId, 'STEP_7_STAGE', 'Cradle release must advance tutorial to STEP_7_STAGE');

  const stateAfterCradle = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(stateAfterCradle.packets[0].processed, true, 'Cube must be compressed in Cradle');
  assert.equal(stateAfterCradle.packets[0].storageCost, 1, 'Compressed cube must occupy 1 STR');

  // Step 7: Carry compressed cube into Downlink Bay Slot 1 with right hand
  await player.lookAt('DOWNLINK_BAY');
  await player.carryAndDropCube('hand-right', 'evidence-cube-1', 'DOWNLINK_SLOT_1');
  await page.waitForTimeout(400);
  await player.settle(6);
  tut = await page.evaluate(() => window.__ORBIT_ZERO__.getTutorialState());
  assert.equal(tut.currentStepId, 'STEP_8_TRANSMIT', 'Downlink bay docking must advance tutorial to STEP_8_TRANSMIT');

  // Step 8: Commit Downlink via right-hand pinch on Downlink lever / commit pad
  await player.pointAndPinch('hand-right', 'pad-commit-downlink');
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 25000 });
  await player.settle(4);

  const debriefState = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(debriefState.debrief.outcome, 'SUCCESS', 'Orbital Academy must complete with SUCCESS');
  assert.equal(debriefState.debrief.totalScore, 100, 'Academy qualification must earn 100/100 points');

  return {
    stage: 'OP_00_ACADEMY',
    status: 'PASS',
    totalScore: debriefState.debrief.totalScore,
    outcome: debriefState.debrief.outcome,
  };
}

async function advanceToNextMissionViaHud(player) {
  await player.lookAt('GLOBE');
  await player.pointAndPinch('hand-right', 'mission-hud:Btn_HudNext');
  await player.settle(5);
  // Advancing opens the next operation's Mission Card on the forward HUD.
  await player.pointAndPinch('hand-right', 'mission-hud:Btn_StartPass');
  await player.settle(5);
}

export async function playFirelineHandsOnly(player) {
  const page = player.page;

  // If in DEBRIEF (e.g. from Academy), advance to Fireline via hands-only forward Mission HUD button
  const current = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  if (current.phase === 'DEBRIEF') {
    await advanceToNextMissionViaHud(player);
  }

  const firelineInit = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(firelineInit.scenarioId, 'FIRELINE_PASS', 'Must be in FIRELINE_PASS');
  assert.equal(firelineInit.phase, 'OPERATIONS', 'Must be in OPERATIONS phase');
  assert.equal(firelineInit.packets.length, 0, 'Fireline must start with 0 packets');
  assert.equal(firelineInit.power, 52, 'Fireline initial power must be 52 Wh');

  const ensureSensor = async (targetMode) => {
    let mode = await page.evaluate(() => window.__ORBIT_ZERO__.getState().activeSensorMode);
    let tries = 0;
    while (mode !== targetMode && ++tries < 10) {
      await player.lookAt('PROCESS_CRADLE');
      await player.pointAndPinch('hand-right', 'pad-toggle-sensor');
      await player.settle(4);
      mode = await page.evaluate(() => window.__ORBIT_ZERO__.getState().activeSensorMode);
    }
    assert.equal(mode, targetMode, `Must have set sensor mode to ${targetMode}`);
  };

  // 1. Scan Sector B (Wildfire Front) with THERMAL
  await ensureSensor('THERMAL');
  await player.lookAt('GLOBE');
  await player.pointAndPinch('hand-right', 'sector-b');
  await player.pointAndPinch('hand-right', 'pad-fire-swath');
  await player.settle(5);

  // 2. Scan Sector C (Clear Viaduct) with OPTICAL
  await ensureSensor('OPTICAL');
  await player.lookAt('GLOBE');
  await player.pointAndPinch('hand-right', 'sector-c');
  await player.pointAndPinch('hand-right', 'pad-fire-swath');
  await player.settle(5);

  // 3. Scan Sector E (Fuel Depot) with THERMAL
  await ensureSensor('THERMAL');
  await player.lookAt('GLOBE');
  await player.pointAndPinch('hand-right', 'sector-e');
  await player.pointAndPinch('hand-right', 'pad-fire-swath');
  await player.settle(5);

  const stateAfterScans = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(stateAfterScans.packets.length, 3, 'Must have acquired 3 evidence cubes');

  // 4. Compress Cube 1 (Sector B Thermal, 42 MB -> 18 MB) in Cradle & dock into Bay Slot 1
  await player.lookAt('CUBES_TRAY');
  await player.carryAndDropCube('hand-left', 'evidence-cube-1', 'PROCESS_CRADLE');
  await page.waitForTimeout(750);
  await player.settle(5);
  await player.lookAt('DOWNLINK_BAY');
  await player.carryAndDropCube('hand-right', 'evidence-cube-1', 'DOWNLINK_SLOT_1');
  await player.settle(5);

  // 5. Compress Cube 3 (Sector E Thermal, 42 MB -> 18 MB) in Cradle & dock into Bay Slot 3
  await player.lookAt('CUBES_TRAY');
  await player.carryAndDropCube('hand-left', 'evidence-cube-3', 'PROCESS_CRADLE');
  await page.waitForTimeout(750);
  await player.settle(5);
  await player.lookAt('DOWNLINK_BAY');
  await player.carryAndDropCube('hand-right', 'evidence-cube-3', 'DOWNLINK_SLOT_3');
  await player.settle(5);

  // 6. Dock Cube 2 (Sector C Optical, raw 40 MB) directly into Bay Slot 2
  await player.lookAt('CUBES_TRAY');
  await player.carryAndDropCube('hand-right', 'evidence-cube-2', 'DOWNLINK_SLOT_2');
  await player.settle(5);

  const preCommit = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(preCommit.queuePacketIds.length, 3, 'All 3 cubes must be staged in Downlink Bay');
  assert.ok(preCommit.downlinkCommittedSec <= 10.0, 'B+E compressed queue must fit within 10.0s window');
  assert.ok(
    preCommit.downlinkCommittedSec === 7.6 || preCommit.downlinkCommittedSec === 7.8,
    `B+E compressed queue must be 7.6s or 7.8s (got ${preCommit.downlinkCommittedSec})`,
  );

  // 7. Commit Downlink
  await player.lookAt('DOWNLINK_BAY');
  await player.pointAndPinch('hand-right', 'pad-commit-downlink');
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 25000 });
  await player.settle(4);

  const firelineDebrief = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(firelineDebrief.debrief.outcome, 'SUCCESS', 'Fireline must complete with SUCCESS');
  assert.equal(firelineDebrief.debrief.totalScore, 100, 'Optimal Fireline triage must achieve 100/100 points');
  assert.equal(firelineDebrief.debrief.efficiencyGrade, 'S', 'Must achieve Grade S efficiency');
  assert.equal(firelineDebrief.debrief.certification, 'GOLD', 'Must achieve GOLD certification');

  return {
    stage: 'OP_01_FIRELINE',
    status: 'PASS',
    totalScore: firelineDebrief.debrief.totalScore,
    efficiencyGrade: firelineDebrief.debrief.efficiencyGrade,
    certification: firelineDebrief.debrief.certification,
  };
}

export async function playMonsoonShieldHandsOnly(player) {
  const page = player.page;

  // Advance to Monsoon Shield in VR via forward Mission HUD Next Operation -> Start Pass
  await advanceToNextMissionViaHud(player);

  const state = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(state.scenarioId, 'STANDARD_INDUS_PASS', 'Must transition to STANDARD_INDUS_PASS');
  assert.equal(state.phase, 'OPERATIONS', 'Must be in OPERATIONS phase');

  const ensureSensor = async (targetMode) => {
    let mode = await page.evaluate(() => window.__ORBIT_ZERO__.getState().activeSensorMode);
    let tries = 0;
    while (mode !== targetMode && ++tries < 10) {
      await player.lookAt('PROCESS_CRADLE');
      await player.pointAndPinch('hand-right', 'pad-toggle-sensor');
      await player.settle(4);
      mode = await page.evaluate(() => window.__ORBIT_ZERO__.getState().activeSensorMode);
    }
    assert.equal(mode, targetMode, `Must have set sensor mode to ${targetMode}`);
  };

  // 1. Sector B (Flooded Basin): SAR Radar
  await ensureSensor('RADAR');
  await player.lookAt('GLOBE');
  await player.pointAndPinch('hand-right', 'sector-b');
  await player.pointAndPinch('hand-right', 'pad-fire-swath');
  await player.settle(5);

  // 2. Sector C (Nowshera Viaduct): Optical
  await ensureSensor('OPTICAL');
  await player.lookAt('GLOBE');
  await player.pointAndPinch('hand-right', 'sector-c');
  await player.pointAndPinch('hand-right', 'pad-fire-swath');
  await player.settle(5);

  // 3. Sector E (Substation Flood): SAR Radar
  await ensureSensor('RADAR');
  await player.lookAt('GLOBE');
  await player.pointAndPinch('hand-right', 'sector-e');
  await player.pointAndPinch('hand-right', 'pad-fire-swath');
  await player.settle(5);

  // 4. Compress Cube 1 (Sector B Radar) in Cradle & dock into Bay Slot 1
  await player.lookAt('CUBES_TRAY');
  await player.carryAndDropCube('hand-left', 'evidence-cube-1', 'PROCESS_CRADLE');
  await page.waitForTimeout(750);
  await player.settle(5);
  await player.lookAt('DOWNLINK_BAY');
  await player.carryAndDropCube('hand-right', 'evidence-cube-1', 'DOWNLINK_SLOT_1');
  await player.settle(5);

  // 5. Compress Cube 3 (Sector E Radar) in Cradle & dock into Bay Slot 3
  await player.lookAt('CUBES_TRAY');
  await player.carryAndDropCube('hand-left', 'evidence-cube-3', 'PROCESS_CRADLE');
  await page.waitForTimeout(750);
  await player.settle(5);
  await player.lookAt('DOWNLINK_BAY');
  await player.carryAndDropCube('hand-right', 'evidence-cube-3', 'DOWNLINK_SLOT_3');
  await player.settle(5);

  // 6. Dock Cube 2 (Sector C Optical) directly into Bay Slot 2
  await player.lookAt('CUBES_TRAY');
  await player.carryAndDropCube('hand-right', 'evidence-cube-2', 'DOWNLINK_SLOT_2');
  await player.settle(5);

  const preCommitMonsoon = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(preCommitMonsoon.queuePacketIds.length, 3, 'All 3 cubes staged in Downlink Bay');
  assert.equal(preCommitMonsoon.downlinkCommittedSec, 7.6, 'Monsoon compressed queue must be 7.6s (76 MB)');

  // 7. Commit Downlink
  await player.lookAt('DOWNLINK_BAY');
  await player.pointAndPinch('hand-right', 'pad-commit-downlink');
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 25000 });
  await player.settle(4);

  const debrief = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(debrief.debrief.outcome, 'SUCCESS', 'Monsoon Shield must complete with SUCCESS');
  assert.equal(debrief.debrief.totalScore, 100, 'Optimal Monsoon triage must achieve 100/100 points');

  return {
    stage: 'OP_02_MONSOON_SHIELD',
    status: 'PASS',
    totalScore: debrief.debrief.totalScore,
    outcome: debrief.debrief.outcome,
  };
}

export async function playAftershockHandsOnly(player) {
  const page = player.page;

  // Advance to Aftershock in VR via forward Mission HUD Next Operation -> Start Pass
  await advanceToNextMissionViaHud(player);

  const state = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(state.scenarioId, 'AFTERSHOCK_PASS', 'Must transition to AFTERSHOCK_PASS');
  assert.equal(state.phase, 'OPERATIONS', 'Must be in OPERATIONS phase');

  const ensureSensor = async (targetMode) => {
    let mode = await page.evaluate(() => window.__ORBIT_ZERO__.getState().activeSensorMode);
    let tries = 0;
    while (mode !== targetMode && ++tries < 10) {
      await player.lookAt('PROCESS_CRADLE');
      await player.pointAndPinch('hand-right', 'pad-toggle-sensor');
      await player.settle(4);
      mode = await page.evaluate(() => window.__ORBIT_ZERO__.getState().activeSensorMode);
    }
    assert.equal(mode, targetMode, `Must have set sensor mode to ${targetMode}`);
  };

  // 1. Sector B (Landslide Dam Scarp, 40 pts): SAR Radar (creates evidence-cube-1, -14 Wh)
  await ensureSensor('RADAR');
  await player.lookAt('GLOBE');
  await player.pointAndPinch('hand-right', 'sector-b');
  await player.pointAndPinch('hand-right', 'pad-fire-swath');
  await player.settle(5);

  // In 6-STR Aftershock buffer, compress Cube 1 to free storage (3 STR -> 1 STR, -6 Wh)
  await player.lookAt('CUBES_TRAY');
  await player.carryAndDropCube('hand-left', 'evidence-cube-1', 'PROCESS_CRADLE');
  await page.waitForTimeout(750);
  await player.settle(5);
  await player.lookAt('DOWNLINK_BAY');
  await player.carryAndDropCube('hand-right', 'evidence-cube-1', 'DOWNLINK_SLOT_1');
  await player.settle(5);

  // 2. Sector E (Chaman Fault Substation, 30 pts): Thermal IR (creates evidence-cube-2, -11 Wh)
  await ensureSensor('THERMAL');
  await player.lookAt('GLOBE');
  await player.pointAndPinch('hand-right', 'sector-e');
  await player.pointAndPinch('hand-right', 'pad-fire-swath');
  await player.settle(5);

  // Compress Cube 2 in Cradle (3 STR -> 1 STR, -6 Wh) and stage to Bay Slot 2
  // (42 Wh solar-storm battery prevents confirming all 3 targets; B + E = 70 pts >= 65 win line)
  await player.lookAt('CUBES_TRAY');
  await player.carryAndDropCube('hand-left', 'evidence-cube-2', 'PROCESS_CRADLE');
  await page.waitForTimeout(750);
  await player.settle(5);
  await player.lookAt('DOWNLINK_BAY');
  await player.carryAndDropCube('hand-right', 'evidence-cube-2', 'DOWNLINK_SLOT_2');
  await player.settle(5);

  const preCommitAftershock = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(preCommitAftershock.queuePacketIds.length, 2, 'Optimal 2 priority cubes staged in Downlink Bay');
  assert.ok(preCommitAftershock.downlinkCommittedSec <= 9.0, 'Aftershock compressed queue must fit within 9.0s window');
  assert.equal(
    preCommitAftershock.downlinkCommittedSec,
    3.6,
    `B+E compressed queue must be 3.6s (got ${preCommitAftershock.downlinkCommittedSec})`,
  );

  // 3. Commit Downlink
  await player.lookAt('DOWNLINK_BAY');
  await player.pointAndPinch('hand-right', 'pad-commit-downlink');
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 25000 });
  await player.settle(4);

  const debrief = await page.evaluate(() => window.__ORBIT_ZERO__.getState());
  assert.equal(debrief.debrief.outcome, 'SUCCESS', 'Aftershock must complete with SUCCESS');
  assert.ok(debrief.debrief.totalScore >= 65, `Aftershock triage must meet 65+ win line (got ${debrief.debrief.totalScore})`);

  return {
    stage: 'OP_03_AFTERSHOCK',
    status: 'PASS',
    totalScore: debrief.debrief.totalScore,
    outcome: debrief.debrief.outcome,
  };
}

export async function verifyCampaignProgressionAndPersistence(page) {
  // Inspect mission profile in local storage
  const profile = await page.evaluate(() => window.__ORBIT_ZERO__.getProfile());
  assert.equal(profile.tutorialComplete, true, 'Profile must retain tutorialComplete: true');
  assert.ok(profile.mastery.ORBITAL_ACADEMY, 'Must have recorded ORBITAL_ACADEMY mastery');
  assert.ok(profile.mastery.FIRELINE_PASS, 'Must have recorded FIRELINE_PASS mastery');
  assert.ok(profile.mastery.STANDARD_INDUS_PASS, 'Must have recorded STANDARD_INDUS_PASS mastery');
  assert.ok(profile.mastery.AFTERSHOCK_PASS, 'Must have recorded AFTERSHOCK_PASS mastery');

  return {
    tutorialComplete: profile.tutorialComplete,
    masteredMissions: Object.keys(profile.mastery),
  };
}
