// Explains the 172-324 call / 184k-229k tri readings: same sampler, but with VR hand simulator and emulated XR session.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchApp, root, playFirelineOptimal } from './_harness.mjs';

const app = await launchApp({ skipLanding: true });
const { page } = app;
await page.goto(app.url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__), null, { timeout: 60000 });
await page.waitForTimeout(1000);
const res = {};
const sample = async (key) => {
  await page.waitForTimeout(700);
  const frames = await Promise.race([
    page.evaluate(() => window.__ORBIT_ZERO__.sampleFrameStats(40)),
    new Promise((r) => setTimeout(() => r({ error: 'rAF sampling timed out' }), 15000)),
  ]);
  const prof = await page.evaluate(() => window.__ORBIT_ZERO__.getSceneProfile());
  const stats = await page.evaluate(() => window.__ORBIT_ZERO__.getRendererStats());
  res[key] = { frames, renderables: prof.visibleRenderables, geoms: prof.uniqueGeometries, mats: prof.uniqueMaterials, transparent: prof.transparentRenderables, xrPresenting: prof.xrPresenting, camera: stats.cameraWorldPosition };
  console.log(key, JSON.stringify(res[key].frames), 'renderables', prof.visibleRenderables, 'xr', prof.xrPresenting);
};
await page.evaluate(() => window.__ORBIT_ZERO__.setScenario('FIRELINE_PASS'));
await sample('desktop_baseline');
await playFirelineOptimal(page);
await sample('desktop_active');
const hasSim = await page.evaluate(() => typeof window.__ORBIT_ZERO__.toggleVrHandSimulator);
res.simApi = hasSim;
if (hasSim === 'function') {
  await page.evaluate(() => window.__ORBIT_ZERO__.toggleVrHandSimulator());
  await sample('desktop_active_with_vr_hand_simulator');
  await page.evaluate(() => window.__ORBIT_ZERO__.toggleVrHandSimulator());
}
await page.evaluate(() => window.__ORBIT_ZERO__.clickPanel('briefing-panel', 'xr-button'));
await page.waitForFunction(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 20000 }).catch(() => {});
await sample('emulated_xr_session_active_scene');
await writeFile(join(root, 'artifacts', 'profile', 'xr-state-profile.json'), JSON.stringify(res, null, 2));
await app.close();

