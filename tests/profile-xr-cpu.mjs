// XR CPU + allocation profile (P1). Enters VR like a judge (headset lobby, one tap, IWER Quest 3), starts
// a pass with three cubes on board, then records a Chrome CPU profile and an allocation-sampling profile
// for a few seconds of live play. Prints the top self-time functions, time inside three.js render(), GC
// share, and the top allocation sites. Desktop CPU (not a Quest): use it to rank hotspots, not as fps.
//
// Usage (readable names need an unminified build):
//   npx vite build --minify false --outDir dist-profile
//   $env:ORBIT_PREVIEW_OUTDIR='dist-profile'; node tests/profile-xr-cpu.mjs [label] [seconds]
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchApp, root } from './_harness.mjs';

const label = process.argv[2] ?? 'current';
const seconds = Number(process.argv[3] ?? 6);
const out = join(root, 'artifacts', 'profile');
await mkdir(out, { recursive: true });
const app = await launchApp();
const { page, url, context } = app;

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
    const api = window.__ORBIT_ZERO__;
    api.clickPanel('mission-hud', 'Btn_StartPass');
    for (const [s, m] of [['B', 'THERMAL'], ['C', 'OPTICAL'], ['E', 'THERMAL']]) {
      api.selectSector(s);
      api.setSensor(m);
      api.scan();
    }
  });
  await page.waitForTimeout(2500);

  // Keep a hand ray sweeping across the globe so hover/laser code runs as it would in play.
  await page.evaluate(() => {
    const remote = window.__ORBIT_IWER__.remote;
    let t = 0;
    window.__SWEEP__ = setInterval(() => {
      t += 0.05;
      remote.dispatch('set_transform', { device: 'hand-right', position: { x: 0.2, y: 1.02, z: -0.12 } });
      remote.dispatch('look_at', { device: 'hand-right', target: { x: Math.sin(t) * 0.15, y: 1.07 + Math.cos(t * 0.7) * 0.1, z: -0.4 } });
    }, 50);
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('HeapProfiler.enable');
  const frames0 = await page.evaluate(() => window.__ORBIT_ZERO__.getWebGLRenderer().info.render.frame);
  await cdp.send('Profiler.start');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 2048 });
  await page.waitForTimeout(seconds * 1000);
  const { profile: heap } = await cdp.send('HeapProfiler.stopSampling');
  const { profile } = await cdp.send('Profiler.stop');
  const frames1 = await page.evaluate(() => window.__ORBIT_ZERO__.getWebGLRenderer().info.render.frame);
  await page.evaluate(() => clearInterval(window.__SWEEP__));
  const frames = Math.max(1, frames1 - frames0);

  // ---- CPU: self time per function, inclusive time of chosen roots ----
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0));
  }
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
  const agg = new Map();
  let total = 0;
  for (const [id, us] of self) {
    total += us;
    const k = key(byId.get(id));
    agg.set(k, (agg.get(k) ?? 0) + us);
  }
  const inclusive = (pred) => {
    let t = 0;
    for (const [id, us] of self) {
      for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
        if (pred(byId.get(cur))) { t += us; break; }
      }
    }
    return t;
  };
  const fn = (name) => (n) => n.callFrame.functionName === name;
  const ms = (us) => (us / 1000).toFixed(1);
  const perFrame = (us) => (us / 1000 / frames).toFixed(2);
  const idle = agg.get('(idle) :0') ?? 0;
  const busy = total - idle;
  const report = {
    label, seconds, frames,
    busyMsPerFrame: perFrame(busy),
    renderMsPerFrame: perFrame(inclusive(fn('render'))),
    gcMsPerFrame: perFrame(agg.get('(garbage collector) :0') ?? 0),
    top: [...agg.entries()].filter(([k]) => !k.startsWith('(idle)') && !k.startsWith('(program)')).sort((a, b) => b[1] - a[1]).slice(0, 45).map(([k, us]) => ({ fn: k, msPerFrame: perFrame(us), pct: ((us / busy) * 100).toFixed(1) })),
  };

  // ---- Allocations: bytes per allocation site over the window ----
  const allocs = new Map();
  const walk = (node) => {
    if (node.selfSize) {
      const k = `${node.callFrame.functionName || '(anon)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber + 1}`;
      allocs.set(k, (allocs.get(k) ?? 0) + node.selfSize);
    }
    for (const c of node.children ?? []) walk(c);
  };
  walk(heap.head);
  const allocTotal = [...allocs.values()].reduce((a, b) => a + b, 0);
  report.allocKBPerFrame = (allocTotal / 1024 / frames).toFixed(1);
  report.allocTop = [...allocs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, b]) => ({ site: k, KBPerFrame: (b / 1024 / frames).toFixed(2) }));

  // ---- Who calls the expensive leaves: inclusive time attributed to 1..4-deep caller chains ----
  const callersOf = (name, depth = 4) => {
    const chains = new Map();
    for (const [id, us] of self) {
      const n = byId.get(id);
      if (n.callFrame.functionName !== name) continue;
      const chain = [];
      for (let cur = parent.get(id), d = 0; cur !== undefined && d < depth; cur = parent.get(cur), d++) chain.push(key(byId.get(cur)));
      const k = chain.join(' < ');
      chains.set(k, (chains.get(k) ?? 0) + us);
    }
    return [...chains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([chain, us]) => ({ chain, msPerFrame: perFrame(us) }));
  };
  report.callers = Object.fromEntries(['getParameter', 'intersectPointerEventTargets', 'updateMatrixWorld', 'updateWorldMatrix', 'setProgram', 'getObjectByProperty', 'traverse', 'needsUpdate'].map((n) => [n, callersOf(n)]));
  // Inclusive time of the app's own per-frame systems vs the frame.
  const fileOf = (n) => n.callFrame.url.split('/').pop();
  report.inclusive = Object.fromEntries(['update', 'render', 'intersectPointerEventTargets', 'updateMatrixWorld'].map((n) => [n, perFrame(inclusive(fn(n)))]));
  // Inclusive time per distinct function (each sample counted once per function on its stack).
  const incl = new Map();
  for (const [id, us] of self) {
    const seen = new Set();
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
      const k = key(byId.get(cur));
      if (seen.has(k)) continue;
      seen.add(k);
      incl.set(k, (incl.get(k) ?? 0) + us);
    }
  }
  report.inclusiveTop = [...incl.entries()].filter(([k]) => !/^\((root|program|idle)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, us]) => ({ fn: k, msPerFrame: perFrame(us) }));

  console.log(`frames ${frames} in ${seconds}s | busy ${report.busyMsPerFrame} ms/frame | inside render() ${report.renderMsPerFrame} | GC ${report.gcMsPerFrame} | sampled allocations ${report.allocKBPerFrame} KB/frame`);
  console.log('\n-- top inclusive (ms/frame)');
  for (const t of report.inclusiveTop) console.log(t.msPerFrame.padStart(6), t.fn);
  console.log('\n-- callers (ms/frame)');
  for (const [name, list] of Object.entries(report.callers)) {
    console.log(`  ${name}:`);
    for (const c of list) console.log(`    ${c.msPerFrame.padStart(6)}  ${c.chain}`);
  }
  void fileOf;
  console.log('\n-- top self time (ms/frame, % of busy)');
  for (const t of report.top) console.log(t.msPerFrame.padStart(6), `${t.pct}%`.padStart(6), t.fn);
  console.log('\n-- top allocation sites (KB/frame)');
  for (const a of report.allocTop) console.log(a.KBPerFrame.padStart(7), a.site);
  await writeFile(join(out, `xr-cpu-${label}.json`), JSON.stringify(report, null, 2));
} finally {
  await app.close();
}
