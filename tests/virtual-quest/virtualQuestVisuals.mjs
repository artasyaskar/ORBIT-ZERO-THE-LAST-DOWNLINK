/**
 * Visual evidence capture for F15 (emulated WebXR, stereo side-by-side canvas).
 *   node tests/virtual-quest/virtualQuestVisuals.mjs --label=before [--skip-build]
 * Writes artifacts/virtual-quest/visual/<label>/*.png. Emulator pixels only: this says nothing
 * about headset optics, lens clarity or comfortable reading on a Quest.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { VirtualQuestPlayer } from './virtualQuestPlayer.mjs';
import { launchImmersiveGame, root } from './virtualQuestHarness.mjs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const label = arg('label', 'current');
const outDir = join(root, 'artifacts', 'virtual-quest', 'visual', label);
await mkdir(outDir, { recursive: true });
let shotNo = 0;

async function session(card, body, skipBuild) {
  const game = await launchImmersiveGame({ skipBuild, card });
  try {
    const { page } = game;
    const p = new VirtualQuestPlayer(page);
    await p.initializeSession();
    await page.waitForTimeout(3000);
    const shot = async (name) => {
      await p.settle(6);
      await page.waitForTimeout(500);
      const file = `${String(++shotNo).padStart(2, '0')}-${name}.png`;
      await page.screenshot({ path: join(outDir, file) });
      console.log('shot', file);
    };
    const gazeAt = async (id) => {
      const pos = await page.evaluate((i) => window.__ORBIT_ZERO__.get3DTargetWorldPosition(i), id);
      await p.lookAt(pos);
    };
    await body({ page, p, shot, gazeAt });
  } finally {
    await game.cleanup();
  }
}

const helpers = (page, p) => {
  const toggleTo = async (m) => {
    for (let i = 0; i < 6; i++) {
      const mode = await page.evaluate(() => window.__ORBIT_ZERO__.getState().activeSensorMode);
      if (mode === m) return;
      await p.lookAt('PROCESS_CRADLE');
      await p.pointAndPinch('hand-right', 'pad-toggle-sensor');
      await p.settle(3);
    }
  };
  const scan = async (sector, mode) => {
    await toggleTo(mode);
    await p.lookAt('GLOBE');
    await p.pointAndPinch('hand-right', `sector-${sector}`);
    await p.pointAndPinch('hand-right', 'pad-fire-swath');
    await p.settle(4);
  };
  const compressAndDock = async (cube, slot) => {
    await p.lookAt('CUBES_TRAY');
    await p.carryAndDropCube('hand-left', `evidence-cube-${cube}`, 'PROCESS_CRADLE');
    await page.waitForTimeout(750);
    await p.lookAt('DOWNLINK_BAY');
    await p.carryAndDropCube('hand-right', `evidence-cube-${cube}`, `DOWNLINK_SLOT_${slot}`);
  };
  const dock = async (cube, slot) => {
    await p.lookAt('CUBES_TRAY');
    await p.carryAndDropCube('hand-right', `evidence-cube-${cube}`, `DOWNLINK_SLOT_${slot}`);
  };
  const commit = async () => {
    await p.lookAt('DOWNLINK_BAY');
    await p.pointAndPinch('hand-right', 'pad-commit-downlink');
    await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 25000 });
  };
  return { toggleTo, scan, compressAndDock, dock, commit };
};

const skip = process.argv.includes('--skip-build');

// Session 1: Orbital Academy briefing + cockpit
await session('#card-op-academy', async ({ shot, gazeAt, p }) => {
  await gazeAt('briefing-panel');
  await shot('academy-briefing');
  await p.lookAt('GLOBE');
  await shot('academy-cockpit');
}, skip);

// Session 2: Fireline cockpit, cube inspection and the three debrief outcomes
await session('#card-op-fireline', async ({ page, p, shot, gazeAt }) => {
  const h = helpers(page, p);
  await gazeAt('briefing-panel');
  await shot('fireline-briefing');
  await gazeAt('telemetry-hud');
  await shot('fireline-telemetry');
  await p.lookAt('GLOBE');
  await shot('fireline-cockpit');

  await h.scan('b', 'THERMAL');
  await h.scan('c', 'OPTICAL');
  await h.scan('e', 'OPTICAL'); // wrong sensor for smoke-obscured Sector E

  await p.lookAt('CUBES_TRAY');
  await p.grabCube('hand-left', 'evidence-cube-1');
  await p.lookAt('NEUTRAL');
  await p.inspectCube('hand-left', 'evidence-cube-1', { x: 0.0, y: 1.2, z: -0.22 }); // in front of, not inside, the globe
  await shot('cube-inspection-thermal');
  await p.lookAt('CUBES_TRAY');
  await p.carryAndDropCube('hand-left', 'evidence-cube-1', 'PROCESS_CRADLE');
  await page.waitForTimeout(750);

  // Partial: B (compressed) + C raw staged, E never queued.
  await p.lookAt('DOWNLINK_BAY');
  await p.carryAndDropCube('hand-right', 'evidence-cube-1', 'DOWNLINK_SLOT_1');
  await h.dock(2, 2);
  await p.returnToNeutral();
  await p.lookAt('DOWNLINK_BAY');
  await shot('downlink-bay-staged');
  // Natural seated viewpoints for the same staged state (what a player glancing down at the bay would see).
  // A: neutral head, gaze 25 deg below horizontal toward the bay. B: small forward lean. C: neutral, gaze straight at the tray.
  await p.returnToNeutral();
  await p.lookAt({ x: 0.2, y: 0.9, z: -0.45 });
  await shot('downlink-bay-seated-glance');
  await p.lean({ x: 0, y: -0.04, z: -0.1 });
  await p.lookAt({ x: 0.2, y: 0.79, z: -0.45 });
  await shot('downlink-bay-seated-lean');
  await p.returnToNeutral();
  await h.commit();
  await gazeAt('debrief-panel');
  await shot('debrief-partial');

  // Failure: restart, scan only the wrong-sensor cube and send it.
  await p.pointAndPinch('hand-right', 'debrief-panel:Btn_RestartMission');
  await p.settle(8);
  await h.scan('e', 'OPTICAL');
  await h.dock(1, 1);
  await h.commit();
  await gazeAt('debrief-panel');
  await shot('debrief-failure');
  // Screenshot text is too small to proof-read, so read the XR panel string itself.
  const xrAdvice = await page.evaluate(() => window.__ORBIT_ZERO__.getPanelText('debrief-panel', 'DebriefAdviceText'));
  console.log('XR failure advice text:', xrAdvice);
  if (/[A-Z]{3,}_[A-Z_]{3,}/.test(String(xrAdvice))) throw new Error(`XR debrief exposes a raw internal code: ${xrAdvice}`);

  // Success: restart, optimal B+E thermal compressed, C optical raw.
  await p.pointAndPinch('hand-right', 'debrief-panel:Btn_RestartMission');
  await p.settle(8);
  await h.scan('b', 'THERMAL');
  await h.scan('c', 'OPTICAL');
  await h.scan('e', 'THERMAL');
  await h.compressAndDock(1, 1);
  await h.compressAndDock(3, 3);
  await h.dock(2, 2);
  await h.commit();
  await gazeAt('debrief-panel');
  await shot('debrief-success');
}, skip);
console.log('done ->', outDir);
