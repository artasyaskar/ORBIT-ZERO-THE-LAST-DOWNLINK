// Pointer hit-test census (P1): how many mesh ray-casts and world-matrix updates the hand pointers cost per
// frame in live XR play. Counts calls instead of timing them, so the result does not depend on machine load.
// Enters VR like a judge (headset lobby, one tap, IWER Quest 3, hands), starts a pass with three cubes, then
// counts for 120 frames while the right-hand ray sweeps across the globe and the left hand rests near the cubes.
//
// Usage: npm run build ; node tests/profile-pointer-tests.mjs   (ORBIT_PREVIEW_OUTDIR=dist-profile for that build)
import { launchApp } from './_harness.mjs';

const app = await launchApp();
const { page, url } = app;
try {
  await page.goto(`${url}?scenario=FIRELINE_PASS`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#oz-xr-entry')?.dataset.phase === 'ready', null, { timeout: 120000 });
  await page.click('#oz-xr-enter');
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 30000 });
  await page.evaluate(async () => {
    const remote = window.__ORBIT_IWER__.remote;
    await remote.dispatch('set_input_mode', { mode: 'hand' });
    for (const d of ['hand-left', 'hand-right']) await remote.dispatch('set_connected', { device: d, connected: true });
    await remote.dispatch('set_transform', { device: 'headset', position: { x: 0, y: 1.25, z: 0.34 } });
    await remote.dispatch('look_at', { device: 'headset', target: { x: 0, y: 0.98, z: -0.48 } });
    await remote.dispatch('set_transform', { device: 'hand-left', position: { x: -0.3, y: 0.86, z: -0.36 } });
    const api = window.__ORBIT_ZERO__;
    api.clickPanel('mission-hud', 'Btn_StartPass');
    for (const [s, m] of [['B', 'THERMAL'], ['C', 'OPTICAL'], ['E', 'THERMAL']]) {
      api.selectSector(s);
      api.setSensor(m);
      api.scan();
    }
  });
  await page.waitForTimeout(2000);
  const result = await page.evaluate(() => new Promise((resolve) => {
    const api = window.__ORBIT_ZERO__;
    const remote = window.__ORBIT_IWER__.remote;
    let mesh = null;
    api.getSceneObject('orbital-console').traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
    let meshProto = Object.getPrototypeOf(mesh);
    while (meshProto && !Object.prototype.hasOwnProperty.call(meshProto, 'raycast')) meshProto = Object.getPrototypeOf(meshProto);
    let objProto = meshProto;
    while (objProto && !Object.prototype.hasOwnProperty.call(objProto, 'updateWorldMatrix')) objProto = Object.getPrototypeOf(objProto);
    const counts = { raycast: 0, updateWorldMatrix: 0 };
    const callers = new Map();
    let depth = 0;
    const origRaycast = meshProto.raycast;
    const origUWM = objProto.updateWorldMatrix;
    meshProto.raycast = function (...a) { counts.raycast++; return origRaycast.apply(this, a); };
    objProto.updateWorldMatrix = function (...a) {
      counts.updateWorldMatrix++;
      // One full stack for a UIKit text node, to see which pointer path reaches the panels.
      if (depth === 0 && !window.__UIKIT_STACK__ && this.constructor?.name === 'Text') {
        window.__UIKIT_STACK__ = (new Error().stack ?? '').split('\n').slice(2, 16).map((l) => l.trim().replace(/\(?https?:\/\/[^/]+\/assets\//, '')).join('\n      ');
      }
      // Attribute top-level calls (not the recursive parent walk) to the first non-three.js frame.
      if (depth === 0 && counts.updateWorldMatrix % 7 === 0) {
        const frames = (new Error().stack ?? '').split('\n').slice(2, 9).map((l) => l.trim().replace(/^at /, '').replace(/\(?https?:\/\/[^/]+\/assets\//, '').replace(/\)$/, ''));
        const key = frames.filter((f) => !/^(getWorldPosition|getWorldQuaternion|getWorldScale|getWorldDirection|updateWorldMatrix|Object\.updateWorldMatrix)/.test(f)).slice(0, 2).join(' < ');
        callers.set(key, (callers.get(key) ?? 0) + 7);
      }
      depth++;
      try { return origUWM.apply(this, a); } finally { depth--; }
    };
    const session = api.getWebGLRenderer().xr.getSession();
    let frames = 0;
    let t = 0;
    const tick = () => {
      frames++;
      t += 0.05;
      remote.dispatch('set_transform', { device: 'hand-right', position: { x: 0.2, y: 1.02, z: -0.12 } });
      remote.dispatch('look_at', { device: 'hand-right', target: { x: Math.sin(t) * 0.15, y: 1.07 + Math.cos(t * 0.7) * 0.1, z: -0.4 } });
      if (frames < 120) session.requestAnimationFrame(tick);
      else {
        meshProto.raycast = origRaycast;
        objProto.updateWorldMatrix = origUWM;
        const top = [...callers.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, n]) => `${(n / frames).toFixed(1).padStart(6)}  ${k}`);
        resolve({ frames, raycastPerFrame: counts.raycast / frames, updateWorldMatrixPerFrame: counts.updateWorldMatrix / frames, topLevelCallers: top, uikitStack: window.__UIKIT_STACK__ ?? null });
      }
    };
    session.requestAnimationFrame(tick);
  }));
  const { topLevelCallers, uikitStack, ...totals } = result;
  console.log(JSON.stringify(totals));
  for (const line of topLevelCallers) console.log(line);
  if (uikitStack) console.log(`first UIKit Text world-matrix update came from:\n      ${uikitStack}`);
} finally {
  await app.close();
}
