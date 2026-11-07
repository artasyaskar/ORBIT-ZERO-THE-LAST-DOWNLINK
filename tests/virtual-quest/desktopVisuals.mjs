/**
 * Desktop visual evidence: landing, campaign selection (default + keyboard focus + narrow viewport)
 * and the three desktop debrief outcomes.
 *   node tests/virtual-quest/desktopVisuals.mjs --label=before [--skip-build]
 * Output: artifacts/virtual-quest/visual/desktop-<label>/*.png
 */
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launchApp, enterGame, playFirelineOptimal, root } from '../_harness.mjs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const label = arg('label', 'current');
const outDir = join(root, 'artifacts', 'virtual-quest', 'visual', `desktop-${label}`);
await mkdir(outDir, { recursive: true });
if (!process.argv.includes('--skip-build')) {
  spawnSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: root, stdio: 'ignore' });
}

let n = 0;
const app = await launchApp();
const { page } = app;
const shot = async (name) => {
  await page.waitForTimeout(600);
  const file = `${String(++n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: join(outDir, file) });
  console.log('shot', file);
};
try {
  // Landing + campaign selection
  await page.goto(app.url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#oz-hero-screen', { state: 'visible', timeout: 15000 });
  await shot('landing-hero');
  await page.click('#btn-enter-experience');
  await page.waitForTimeout(800);
  await shot('campaign-selection-default');
  await page.locator('#card-op-fireline').focus();
  await page.keyboard.press('ArrowRight');
  await shot('campaign-selection-keyboard-monsoon');
  await page.setViewportSize({ width: 820, height: 1100 });
  await shot('campaign-selection-narrow');
  await page.setViewportSize({ width: 1440, height: 960 });

  // Debriefs
  const debrief = async (name, play) => {
    await enterGame(page, app.url);
    await play();
    await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 40000 });
    await shot(name);
  };
  await debrief('desktop-debrief-success', () => playFirelineOptimal(page, { commit: true }));
  await debrief('desktop-debrief-partial', () =>
    page.evaluate(() => {
      const api = window.__ORBIT_ZERO__;
      const pick = (sec, mode) => { api.selectSector(sec); while (api.getState().activeSensorMode !== mode) api.toggleSensor(); api.scan(); api.queue(); };
      pick('B', 'THERMAL');
      pick('C', 'OPTICAL');
      api.simulateCubeDrop(0, 'PROCESS');
      api.commitDownlink();
    }));
  await debrief('desktop-debrief-failure', () =>
    page.evaluate(() => {
      const api = window.__ORBIT_ZERO__;
      api.selectSector('E');
      while (api.getState().activeSensorMode !== 'OPTICAL') api.toggleSensor();
      api.scan();
      api.queue();
      api.commitDownlink();
    }));
  console.log('failures:', JSON.stringify(app.failures));
} finally {
  await app.close();
}
