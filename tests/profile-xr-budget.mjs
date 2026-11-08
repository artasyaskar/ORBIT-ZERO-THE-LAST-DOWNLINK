// XR render budget probe (P1). Enters VR like a judge (headset lobby, one tap, IWER Meta Quest 3, hands),
// puts the head at the seated eye point and samples renderer.info per frame, plus the top scene
// contributors, in three states (Mission Card, live play with three cubes, open downlink window) and
// three gaze directions (Mission HUD, globe, desk).
// IWER here has stereoEnabled:false, but three.js still renders its second (zero-width) view, so
// renderer.info counts each object twice. The summary halves that: draws and triangles per eye, which
// is what a Quest with multiview submits per frame (without multiview it is twice that).
//
// Usage: npm run build ; node tests/profile-xr-budget.mjs [label]
// Output: artifacts/profile/xr-budget-<label>.json
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchApp, root } from './_harness.mjs';

const label = process.argv[2] ?? 'current';
const out = join(root, 'artifacts', 'profile');
await mkdir(out, { recursive: true });
const app = await launchApp();
const { page, url } = app;

const sample = (frames = 60) => page.evaluate((n) => new Promise((resolve) => {
  const r = window.__ORBIT_ZERO__.getWebGLRenderer();
  const calls = [];
  const tris = [];
  let left = n;
  const session = r.xr.getSession();
  const tick = () => {
    calls.push(r.info.render.calls);
    tris.push(r.info.render.triangles);
    if (--left > 0) (session ?? window).requestAnimationFrame(tick);
    else {
      const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
      resolve({ callsMedian: med(calls), callsMax: Math.max(...calls), trisMedian: med(tris), trisMax: Math.max(...tris), programs: r.info.programs?.length ?? null, geometries: r.info.memory.geometries, textures: r.info.memory.textures });
    }
  };
  (session ?? window).requestAnimationFrame(tick);
}), frames);

let shotIndex = 0;
const state = async (name) => {
  await page.waitForTimeout(800);
  const stats = await sample();
  shotIndex += 1;
  await page.screenshot({ path: join(out, `xr-budget-${label}-${String(shotIndex).padStart(2, '0')}.png`) });
  const top = await page.evaluate(() => window.__ORBIT_ZERO__.getTopContributors(30));
  const profile = await page.evaluate(() => window.__ORBIT_ZERO__.getSceneProfile());
  console.log(`\n== ${name}: calls ${stats.callsMedian} (max ${stats.callsMax}), tris ${stats.trisMedian} (max ${stats.trisMax}), programs ${stats.programs}, textures ${stats.textures}, renderables ${profile.visibleRenderables}, transparent ${profile.transparentRenderables}`);
  for (const t of top.slice(0, 22)) console.log(String(t.tris).padStart(7), String(t.calls).padStart(4), t.name);
  return { stats, top, profile: { visibleRenderables: profile.visibleRenderables, transparent: profile.transparentRenderables, lights: profile.lights, uniqueMaterials: profile.uniqueMaterials, uniqueGeometries: profile.uniqueGeometries, textureBytes: profile.referencedTextureBytesApprox, topTextures: profile.topTextures } };
};

const report = { label, at: new Date().toISOString() };
try {
  await page.goto(`${url}?scenario=FIRELINE_PASS`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#oz-xr-entry')?.dataset.phase === 'ready', null, { timeout: 90000 });
  await page.click('#oz-xr-enter');
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 30000 });
  await page.evaluate(async () => {
    const remote = window.__ORBIT_IWER__.remote;
    await remote.dispatch('set_input_mode', { mode: 'hand' });
    for (const d of ['hand-left', 'hand-right']) await remote.dispatch('set_connected', { device: d, connected: true });
  });
  // Seated eye (the project's seated posture: 1.25 m eye height, 0.34 m behind the desk edge).
  const look = (target) => page.evaluate(async (t) => {
    const remote = window.__ORBIT_IWER__.remote;
    await remote.dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.25, z: 0.34 } });
    await remote.dispatch('look_at', { device: 'headset', target: t });
  }, target);
  const views = async (name) => {
    const r = {};
    await look({ x: 0, y: 1.32, z: -1.2 });
    r.forward = await state(`${name} | looking at the Mission HUD`);
    await look({ x: 0, y: 0.98, z: -0.48 });
    r.globe = await state(`${name} | looking at the globe`);
    await look({ x: 0, y: 0.8, z: -0.3 });
    r.desk = await state(`${name} | looking at the desk`);
    return r;
  };
  report.missionCard = await views('mission card');

  await page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    api.clickPanel('mission-hud', 'Btn_StartPass');
    for (const [s, m] of [['B', 'THERMAL'], ['C', 'OPTICAL'], ['E', 'THERMAL']]) {
      api.selectSector(s);
      api.setSensor(m);
      api.scan();
    }
  });
  report.livePlay = await views('live play, three cubes on board');

  await page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    api.simulateCubeDrop(0, 'QUEUE');
    api.simulateCubeDrop(1, 'QUEUE');
    api.commitDownlink();
  });
  report.downlink = await views('downlink window open');
  // Summary: worst view per state, per eye. IWER runs mono (stereoEnabled:false) but three.js still
  // draws its zero-width second view, so renderer.info counts every object twice; halve for per-eye.
  const rows = [];
  for (const [stateName, byView] of Object.entries({ missionCard: report.missionCard, livePlay: report.livePlay, downlink: report.downlink })) {
    for (const [viewName, v] of Object.entries(byView)) rows.push({ state: stateName, view: viewName, callsPerEye: v.stats.callsMedian / 2, trisPerEye: v.stats.trisMedian / 2 });
  }
  report.summary = rows;
  console.log('\n== per-eye summary (calls, tris)');
  for (const r of rows) console.log(`${r.state.padEnd(12)} ${r.view.padEnd(8)} ${String(r.callsPerEye).padStart(5)} ${String(r.trisPerEye).padStart(8)}`);
} finally {
  await writeFile(join(out, `xr-budget-${label}.json`), JSON.stringify(report, null, 2));
  await app.close();
}
