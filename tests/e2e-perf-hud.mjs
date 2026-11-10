// ?perf=1 readout check (IWER Meta Quest 3, hands): the flat-page readout appears, ENTER VR adds the
// head-locked panel, the snapshot reports draws/tris per eye and fps, and the 60 s summary arrives.
// Usage: npm run build ; node tests/e2e-perf-hud.mjs   (set ORBIT_PERF_SUMMARY=0 to skip the 60 s wait)
import { launchApp } from './_harness.mjs';

const results = [];
const check = (ok, name, detail = '') => {
  results.push({ ok: Boolean(ok), name });
  console.log(`[perf-hud] ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`);
};
const app = await launchApp();
const { page, url, failures } = app;
try {
  await page.goto(`${url}?scenario=FIRELINE_PASS&perf=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#oz-xr-entry')?.dataset.phase === 'ready', null, { timeout: 120000 });
  await page.waitForFunction(() => Boolean(document.querySelector('#oz-perf-hud')?.textContent), null, { timeout: 10000 });
  const flat = await page.evaluate(() => document.querySelector('#oz-perf-hud').textContent);
  check(/FPS \d+ avg \| \d+ 1% low/.test(flat) && /PER EYE \d+ draws/.test(flat) && /HEAP/.test(flat) && /TEX \d+ MB/.test(flat) && /XR:/.test(flat) && /AUD:/.test(flat), 'flat page: readout shows fps avg + 1% low, draws/tris, heap, texture memory, XR + audio diagnostics', flat.replace(/\n/g, ' / '));
  await page.click('#oz-xr-enter');
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  const xr = await page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    let panel = null;
    let scene = api.getSceneObject('orbital-console');
    while (scene?.parent) scene = scene.parent;
    scene?.traverse((o) => { if (o.name === 'PerfHudPanel') panel = { visible: o.visible, parent: o.parent?.type }; });
    return { snap: window.__ORBIT_PERF__.snapshot(), panel };
  });
  check(xr.panel?.visible === true, 'headset: head-locked perf panel is shown', JSON.stringify(xr.panel));
  check(xr.snap.presenting && xr.snap.fpsAvg > 0 && xr.snap.drawsPerEye > 20 && xr.snap.trisPerEye > 10000 && Boolean(xr.snap.diagnostics?.xrRefSpace) && Boolean(xr.snap.diagnostics?.audioState), 'headset: snapshot reports fps, per-eye draws/tris, and XR/audio diagnostics', JSON.stringify(xr.snap));
  if (process.env.ORBIT_PERF_SUMMARY !== '0') {
    const summary = await page.waitForFunction(() => window.__ORBIT_PERF__.summary60(), null, { timeout: 75000, polling: 1000 }).then((h) => h.jsonValue(), () => null);
    check(summary && summary.frames > 100 && summary.fpsAvg > 0 && summary.fpsLow1 > 0, '60 s summary arrives with avg, 1% low and worst frame', JSON.stringify(summary));
  }
  check(failures.length === 0, 'no page errors', failures.join(' | '));
} finally {
  await app.close();
}
const passed = results.filter((r) => r.ok).length;
console.log(`[perf-hud] ${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
