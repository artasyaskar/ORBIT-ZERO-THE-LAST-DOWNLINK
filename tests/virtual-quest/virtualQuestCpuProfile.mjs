/**
 * CPU sampling profile of the immersive cockpit via Chrome DevTools Profiler (unminified build
 * so function names are readable). Driver stays idle in Node while sampling.
 *   node tests/virtual-quest/virtualQuestCpuProfile.mjs [--skip-build] [--sec=6] [--top=30]
 * Output is printed and written to artifacts/virtual-quest/cpu-profile-summary.json.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { VirtualQuestPlayer } from './virtualQuestPlayer.mjs';
import { launchImmersiveGame, root } from './virtualQuestHarness.mjs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1];
const sec = Number(arg('sec', 6));
const top = Number(arg('top', 30));
const game = await launchImmersiveGame({ skipBuild: process.argv.includes('--skip-build'), unminified: true });
try {
  const { page, context } = game;
  const player = new VirtualQuestPlayer(page, { stereoEnabled: true });
  await player.initializeSession();
  await player.lookAt('GLOBE');
  await page.waitForTimeout(3500);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  const wantHeap = process.argv.includes('--heap');
  if (wantHeap) await cdp.send('HeapProfiler.startSampling', { samplingInterval: 2048, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  await page.waitForTimeout(sec * 1000);
  const { profile } = await cdp.send('Profiler.stop');
  if (wantHeap) {
    const { profile: hp } = await cdp.send('HeapProfiler.stopSampling');
    const agg = new Map();
    const aggCaller = new Map();
    const nodes = new Map();
    const par = new Map();
    const walk = (n, p) => {
      nodes.set(n.id, n);
      if (p) par.set(n.id, p.id);
      (n.children ?? []).forEach((c) => walk(c, n));
    };
    walk(hp.head, null);
    const nm = (n) => {
      const cf = n.callFrame;
      return `${cf.functionName || '(anon)'} ${(cf.url || '').split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
    };
    let total = 0;
    for (const smp of hp.samples ?? []) {
      const n = nodes.get(smp.nodeId);
      if (!n) continue;
      total += smp.size;
      const k = nm(n);
      agg.set(k, (agg.get(k) ?? 0) + smp.size);
      const pid = par.get(smp.nodeId);
      const kk = k + '  <-  ' + (pid ? nm(nodes.get(pid)) : '');
      aggCaller.set(kk, (aggCaller.get(kk) ?? 0) + smp.size);
    }    console.log('--- ALLOCATION SAMPLES (self bytes, ' + sec + 's window), total KB', (total / 1024).toFixed(0), '=> KB/s', (total / 1024 / sec).toFixed(0));
    [...aggCaller.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).forEach(([k, b]) => console.log(String((b / 1024).toFixed(0)).padStart(8) + ' KB  ' + k));
  }

  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const selfUs = new Map();
  profile.samples.forEach((id, i) => selfUs.set(id, (selfUs.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
  const totalUs = [...selfUs.values()].reduce((a, b) => a + b, 0);
  const key = (n) => {
    const cf = n.callFrame;
    const file = (cf.url || '').split('/').slice(-2).join('/');
    return `${cf.functionName || '(anon)'} ${file}:${cf.lineNumber + 1}`;
  };
  const self = new Map();
  const incl = new Map();
  for (const [id, us] of selfUs) {
    const n = byId.get(id);
    self.set(key(n), (self.get(key(n)) ?? 0) + us);
    const seen = new Set();
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
      const k = key(byId.get(cur));
      if (seen.has(k)) continue;
      seen.add(k);
      incl.set(k, (incl.get(k) ?? 0) + us);
    }
  }
  const fmt = (m) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([k, us]) => ({ fn: k, ms: Number((us / 1000).toFixed(1)), pct: Number(((us / totalUs) * 100).toFixed(1)) }));
  const out = { sec, totalSampledMs: Number((totalUs / 1000).toFixed(0)), topSelf: fmt(self), topInclusive: fmt(incl) };
  await mkdir(join(root, 'artifacts', 'virtual-quest'), { recursive: true });
  await writeFile(join(root, 'artifacts', 'virtual-quest', 'cpu-profile-summary.json'), JSON.stringify(out, null, 2));
  console.log('TOTAL sampled ms', out.totalSampledMs);
  console.log('--- TOP SELF');
  out.topSelf.forEach((r) => console.log(`${String(r.ms).padStart(8)}ms ${String(r.pct).padStart(5)}%  ${r.fn}`));
  // Caller chains (3 frames up) for the heaviest self-time non-"(program)" functions.
  const heavy = out.topSelf.filter((r) => !r.fn.startsWith('(program)')).slice(0, 3).map((r) => r.fn);
  for (const name of heavy) {
    const chains = new Map();
    for (const [id, us] of selfUs) {
      const n = byId.get(id);
      if (key(n) !== name) continue;
      const chain = [];
      for (let cur = parent.get(id); cur !== undefined && chain.length < 3; cur = parent.get(cur)) chain.push(key(byId.get(cur)));
      const k = chain.join(' <- ');
      chains.set(k, (chains.get(k) ?? 0) + us);
    }
    console.log(`--- CALLERS of ${name}`);
    [...chains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).forEach(([k, us]) => console.log(`${(us / 1000).toFixed(0).padStart(7)}ms  ${k}`));
  }
  console.log('--- TOP INCLUSIVE');
  out.topInclusive.forEach((r) => console.log(`${String(r.ms).padStart(8)}ms ${String(r.pct).padStart(5)}%  ${r.fn}`));
} catch (e) {
  console.error('[cpu-profile fatal]', e);
  process.exitCode = 1;
} finally {
  await game.cleanup();
}
