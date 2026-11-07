/**
 * ORBIT ZERO: Virtual Quest performance profile (EMULATED WebXR on the HOST GPU).
 *
 * Usage:
 *   node tests/virtual-quest/virtualQuestPerf.mjs [--label=before] [--skip-build] [--headed] [--idle=6]
 *
 * Writes artifacts/virtual-quest/performance-<label>.json (+ .raw.json). It never touches
 * screenshots or virtual-quest-report.json. Numbers are desktop-emulator numbers and say
 * nothing about Quest hardware.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { VirtualQuestPlayer } from './virtualQuestPlayer.mjs';
import { installPerfProbeInPage, summarizeRecording } from './virtualQuestPerfProbe.mjs';
import { launchImmersiveGame, gitRevision, root } from './virtualQuestHarness.mjs';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);
const label = arg('label', 'current');
const idleSec = Number(arg('idle', '6'));
const artifactsDir = join(root, 'artifacts', 'virtual-quest');
await mkdir(artifactsDir, { recursive: true });

const game = await launchImmersiveGame({ skipBuild: flag('skip-build'), headed: flag('headed') });
const { page } = game;
try {
  const player = new VirtualQuestPlayer(page, { stereoEnabled: true });
  await player.initializeSession();
  const probeInfo = await page.evaluate(installPerfProbeInPage);

  const windows = [];
  const raw = {};
  const record = async (name, { driverActive, durationSec, warmupSec = 2, action }) => {
    if (!driverActive && warmupSec > 0) await page.waitForTimeout(warmupSec * 1000); // discarded warm-up
    await page.evaluate(([n, d]) => window.__PERF__.begin(n, d), [name, driverActive]);
    if (action) await action();
    else await page.waitForTimeout(durationSec * 1000);
    const rec = await page.evaluate(() => window.__PERF__.end());
    raw[name] = rec;
    const summary = summarizeRecording(rec, driverActive ? 0 : 5);
    windows.push(summary);
    const x = summary.xrFrameInterval_ms;
    console.log(
      `  [${name}${driverActive ? ' | driver-active' : ''}] xrFrames=${x.n + 1} median=${x.median}ms p95=${x.p95}ms max=${x.max}ms ` +
        `js=${summary.xrCallbackJs_ms.median}ms gpu=${summary.gpuTime_ms ? summary.gpuTime_ms.median + 'ms' : 'n/a'} glDraws/frame=${summary.perXrFrame.glDrawCommands}`,
    );
  };

  await player.lookAt('GLOBE');
  await page.waitForTimeout(3000); // shader compile / texture upload settles before any window

  console.log('Recording windows (Fireline, emulated WebXR)...');
  await record('1_static_cockpit_idle', { driverActive: false, durationSec: idleSec });

  const ensureSensor = async (target) => {
    for (let i = 0; i < 8; i++) {
      const mode = await page.evaluate(() => window.__ORBIT_ZERO__.getState().activeSensorMode);
      if (mode === target) return;
      await player.lookAt('PROCESS_CRADLE');
      await player.pointAndPinch('hand-right', 'pad-toggle-sensor');
      await player.settle(4);
    }
  };
  await record('2_gameplay_scanning_driver_active', {
    driverActive: true,
    action: async () => {
      for (const [mode, sector] of [['THERMAL', 'sector-b'], ['OPTICAL', 'sector-c'], ['THERMAL', 'sector-e']]) {
        await ensureSensor(mode);
        await player.lookAt('GLOBE');
        await player.pointAndPinch('hand-right', sector);
        await player.pointAndPinch('hand-right', 'pad-fire-swath');
        await player.settle(5);
      }
    },
  });

  await player.lookAt('CUBES_TRAY');
  await record('3_three_raw_cubes_in_tray_idle', { driverActive: false, durationSec: idleSec });

  await player.grabCube('hand-left', 'evidence-cube-1');
  await player.lookAt('NEUTRAL');
  await player.inspectCube('hand-left', 'evidence-cube-1');
  await record('4_holographic_inspection_idle', { driverActive: false, durationSec: idleSec });

  await player.lookAt('PROCESS_CRADLE');
  await player.carryAndDropCube('hand-left', 'evidence-cube-1', 'PROCESS_CRADLE');
  await page.waitForTimeout(800);
  await player.lookAt('DOWNLINK_BAY');
  await player.carryAndDropCube('hand-right', 'evidence-cube-1', 'DOWNLINK_SLOT_1');
  await player.lookAt('CUBES_TRAY');
  await player.carryAndDropCube('hand-left', 'evidence-cube-3', 'PROCESS_CRADLE');
  await page.waitForTimeout(800);
  await player.lookAt('DOWNLINK_BAY');
  await player.carryAndDropCube('hand-right', 'evidence-cube-3', 'DOWNLINK_SLOT_3');
  await player.lookAt('CUBES_TRAY');
  await player.carryAndDropCube('hand-right', 'evidence-cube-2', 'DOWNLINK_SLOT_2');
  await player.lookAt('DOWNLINK_BAY');
  const staged = await page.evaluate(() => window.__ORBIT_ZERO__.getState().queuePacketIds.length);
  await record('5_three_staged_cubes_idle', { driverActive: false, durationSec: idleSec });

  await player.pointAndPinch('hand-right', 'pad-commit-downlink');
  await record('6_live_downlink', {
    driverActive: false,
    warmupSec: 0,
    action: () =>
      page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, {
        timeout: 25000,
        polling: 250, // Node-side poll, not per frame
      }),
  });
  await player.lookAt('DEBRIEF_PANEL');
  await record('7_debrief_idle', { driverActive: false, durationSec: Math.min(idleSec, 4) });

  const report = {
    label,
    revision: gitRevision(),
    timestamp: new Date().toISOString(),
    classification: 'VERIFIED IN EMULATED WEBXR (desktop host GPU). NOT VERIFIED: PHYSICAL QUEST REQUIRED.',
    browser: { version: game.browserVersion, userAgent: probeInfo.userAgent },
    hostBrowserRefresh: game.hostReport,
    xrSession: {
      supportedFrameRates: probeInfo.sessionSupportedFrameRates,
      frameRate: probeInfo.sessionFrameRate,
      note: 'IWER drives XRSession frames from globalThis.requestAnimationFrame, so XR cadence is capped by host display cadence.',
    },
    gpuTimerQuery: await page.evaluate(() => window.__PERF__.gpuInfo()),
    xrFacts: await page.evaluate(() => window.__PERF__.viewFacts()),
    framebuffer: await page.evaluate(() => {
      const r = window.__ORBIT_ZERO__.getWebGLRenderer();
      const bl = r.xr.getSession()?.renderState?.baseLayer;
      return {
        baseLayerWidth: bl?.framebufferWidth ?? null,
        baseLayerHeight: bl?.framebufferHeight ?? null,
        pixelRatio: r.getPixelRatio(),
        xrFramebufferScaleFactor: r.xr.getFramebufferScaleFactor?.() ?? null,
        foveation: r.xr.getFoveation?.() ?? null,
      };
    }),
    stagedCubesAtMeasurement: staged,
    windows,
    pageErrors: game.pageErrors,
  };
  await writeFile(join(artifactsDir, `performance-${label}.json`), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(artifactsDir, `performance-${label}.raw.json`), JSON.stringify(raw), 'utf8');
  console.log(`Wrote artifacts/virtual-quest/performance-${label}.json`);
  console.log('Host bare-page refresh:', JSON.stringify(game.hostReport.intervalMs), `=${game.hostReport.impliedRefreshHz} Hz`);
  console.log('xrFacts:', JSON.stringify(report.xrFacts));
  console.log('framebuffer:', JSON.stringify(report.framebuffer));
} catch (e) {
  console.error('[perf fatal]', e);
  process.exitCode = 1;
} finally {
  await game.cleanup();
}
