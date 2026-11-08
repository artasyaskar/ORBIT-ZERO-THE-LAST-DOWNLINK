// Consistent per-scene renderer profile of the PRODUCTION build (desktop Chromium, not Quest).
// Usage: $env:ORBIT_SKIP_BUILD='1'; node tests/profile-scenes.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchApp, root, playFirelineOptimal } from './_harness.mjs';

const out = join(root, 'artifacts', 'profile');
await mkdir(out, { recursive: true });
const report = { tier: 'Desktop Chromium d3d11, 1440x960, production build. NOT Quest frame time.', scenes: {}, startup: {} };

// ---------- Part A: startup / bundle (landing, fresh load) ----------
{
  const app = await launchApp({ skipLanding: false });
  const { page } = app;
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  const t0 = Date.now();
  // IWER reports the Meta Quest user agent (headset lobby); ?landing profiles the desktop landing.
  await page.goto(`${app.url}?landing`, { waitUntil: 'domcontentloaded' });
  const domMs = Date.now() - t0;
  await page.waitForSelector('#oz-hero-screen', { state: 'visible', timeout: 30000 });
  const heroMs = Date.now() - t0;
  await page.waitForTimeout(1500);
  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((r) => ({ name: r.name.split('/').slice(-2).join('/'), transfer: r.transferSize, encoded: r.encodedBodySize, decoded: r.decodedBodySize, ms: Math.round(r.responseEnd) })),
  );
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return { domContentLoadedMs: Math.round(n.domContentLoadedEventEnd), loadMs: Math.round(n.loadEventEnd) };
  });
  const cov = await page.coverage.stopJSCoverage();
  const js = cov
    .filter((c) => c.url.includes('/assets/'))
    .map((c) => {
      const used = c.functions.flatMap((f) => f.ranges).filter((r) => r.count > 0).reduce((a, r) => a + (r.endOffset - r.startOffset), 0);
      return { file: c.url.split('/').pop(), bytes: c.source?.length ?? 0, usedApprox: Math.min(used, c.source?.length ?? 0) };
    })
    .sort((a, b) => b.bytes - a.bytes);

  // Landing scene census (separate WebGL renderer owned by LandingScene).
  const landing = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const ls = window.__ORBIT_LANDING_CONTROLLER__?.scene;
        if (!ls) return resolve(null);
        const r = ls.renderer;
        const orig = r.render.bind(r);
        let inv = 0;
        r.render = (...a) => {
          inv++;
          return orig(...a);
        };
        const calls = [];
        const tris = [];
        let n = 0;
        const geoms = new Set();
        const mats = new Set();
        const lights = {};
        ls.scene.traverse((o) => {
          if (o.isLight) lights[o.type] = (lights[o.type] ?? 0) + 1;
          if (o.isMesh || o.isPoints || o.isLine) {
            if (o.geometry) geoms.add(o.geometry);
            (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m && mats.add(m));
          }
        });
        const step = () => {
          calls.push(r.info.render.calls);
          tris.push(r.info.render.triangles);
          if (++n >= 40) {
            r.render = orig;
            const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
            resolve({ callsMedian: med(calls), callsMax: Math.max(...calls), trisMedian: med(tris), trisMax: Math.max(...tris), textures: r.info.memory.textures, geometries: r.info.memory.geometries, uniqueGeometries: geoms.size, uniqueMaterials: mats.size, lights, renderInvocationsPerFrame: inv / n, pixelRatio: r.getPixelRatio() });
          } else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
  report.startup = {
    domMs,
    heroVisibleMs: heroMs,
    navigation: nav,
    jsAssetsLoaded: js,
    totalJsBytes: js.reduce((a, j) => a + j.bytes, 0),
    totalJsUsedApprox: js.reduce((a, j) => a + j.usedApprox, 0),
    resourceCount: resources.length,
    transferBytesTotal: resources.reduce((a, r) => a + (r.transfer || 0), 0),
    largestResources: resources.sort((a, b) => b.decoded - a.decoded).slice(0, 8),
  };
  report.scenes.landing = landing;
  report.failuresStartup = app.failures;
  await app.close();
}

// ---------- Part B: game scenes (identical camera/viewport, skip-landing) ----------
{
  const app = await launchApp({ skipLanding: true });
  const { page } = app;
  const t0 = Date.now();
  await page.goto(app.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__), null, { timeout: 60000 });
  report.startup.gameReadyMs = Date.now() - t0;
  await page.waitForTimeout(800);

  const measure = async (key, label) => {
    await page.waitForTimeout(700);
    const prof = await page.evaluate(() => window.__ORBIT_ZERO__.getSceneProfile());
    const frames = await page.evaluate(() => window.__ORBIT_ZERO__.sampleFrameStats(40));
    const stats = await page.evaluate(() => window.__ORBIT_ZERO__.getRendererStats());
    const st = await page.evaluate(() => {
      const s = window.__ORBIT_ZERO__.getState();
      return { scenarioId: s.scenarioId, phase: s.phase, packets: s.packets.length, queued: s.queuePacketIds.length, committedSec: s.downlinkCommittedSec };
    });
    report.scenes[key] = { label, state: st, scene: prof, frames, memory: { geometries: stats.geometries, textures: stats.textures }, camera: stats.cameraWorldPosition };
    console.log(key, st.scenarioId, st.phase, 'calls median', frames.callsMedian, 'tris median', frames.trisMedian, 'render()/frame', frames.renderInvocationsPerFrame);
  };

  const setScn = async (id) => {
    await page.evaluate((i) => window.__ORBIT_ZERO__.setScenario(i), id);
    await page.waitForTimeout(500);
  };

  await setScn('ORBITAL_ACADEMY');
  await measure('academy_static', 'Orbital Academy (static, tutorial overlay)');
  await setScn('FIRELINE_PASS');
  await measure('fireline_static', 'Fireline (static, no packets)');
  await playFirelineOptimal(page);
  await measure('fireline_active', 'Fireline (active: 3 cubes queued, B+E compressed)');
  await page.evaluate(() => window.__ORBIT_ZERO__.commitDownlink());
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DOWNLINK', null, { timeout: 10000 });
  await measure('fireline_downlink', 'Fireline live transmission');
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 20000 });
  await measure('fireline_debrief', 'Fireline victory/debrief');
  await setScn('STANDARD_INDUS_PASS');
  await measure('monsoon_static', 'Monsoon Shield (static)');
  await setScn('AFTERSHOCK_PASS');
  await measure('aftershock_static', 'Aftershock (static)');
  report.failuresGame = app.failures;
  await app.close();
}

await writeFile(join(out, 'scene-profile.json'), JSON.stringify(report, null, 2));
console.log('WROTE', join(out, 'scene-profile.json'));

