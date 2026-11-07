/**
 * Production-hosting check: serves dist/ from a plain static server (no Vite plugin, no IWER emulator)
 * at the site root and at a subpath, then verifies that the landing page, assets and desktop game load,
 * that a reload works, and that a failed VR entry falls back to the desktop game.
 *
 *   node tests/deploy-static-check.mjs            (requires an existing dist/ build)
 *
 * Result: desktop Chrome, headless. It says nothing about Meta Quest Browser.
 */
import assert from 'node:assert/strict';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
assert.ok(existsSync(join(dist, 'index.html')), 'dist/ is missing: run the production build first');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.mp4': 'video/mp4',
  '.md': 'text/markdown', '.uikitml': 'text/plain', '.wasm': 'application/wasm',
};

function serve(prefix) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith(prefix)) { res.writeHead(404); res.end('outside mount'); return; }
    let rel = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(dist, rel));
    if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
    const size = statSync(file).size;
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Number(range[2]) : size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
      createReadStream(file).pipe(res);
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port })));
}

const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'chrome' : 'chromium',
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), '--no-sandbox'],
});

const report = [];
try {
  for (const prefix of ['/', '/orbit-zero/']) {
    const { server, port } = await serve(prefix);
    const base = `http://localhost:${port}${prefix}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const bad = [];
    const seen = [];
    const consoleErrors = [];
    page.on('response', (r) => {
      seen.push({ url: r.url(), status: r.status() });
      if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
    });
    page.on('requestfailed', (r) => bad.push(`FAILED ${r.url()} ${r.failure()?.errorText ?? ''}`));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

    const step = (s) => console.error(`[${prefix}] ${s}`);
    step('cold load');
    // 1. Cold load of the landing page.
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#orbit-landing-root', { timeout: 20000 });
    await page.waitForSelector('#btn-enter-experience', { timeout: 10000 });
    await page.waitForTimeout(4000); // let textures and the voice-over file be requested
    const got = (needle) => seen.some((s) => s.url.includes(needle) && (s.status === 200 || s.status === 206));
    assert.ok(got('earth_atmos'), `[${prefix}] Earth texture must load under this mount`);
    assert.ok(got('milky_way_skybox'), `[${prefix}] skybox must load under this mount`);
    assert.ok(got('gemini_generated_video'), `[${prefix}] landing voice-over must load under this mount`);

    step('landing to desktop');
    // 2. Landing to desktop game.
    await page.locator('#btn-enter-experience').click();
    await page.waitForTimeout(500);
    await page.locator('#btn-play-desktop').click();
    await page.waitForFunction(() => window.__ORBIT_ZERO__?.getState?.(), null, { timeout: 45000 });
    const phase = await page.evaluate(() => window.__ORBIT_ZERO__.getState().phase);
    assert.equal(phase, 'OPERATIONS', `[${prefix}] game must reach OPERATIONS`);
    await page.waitForTimeout(3000);
    assert.ok(got('main.iwsdk.scene.json') || got('.glb') || got('earth_'), `[${prefix}] scene assets must be requested`);

    step('reload and ?game');
    // 3. Reload, then a direct ?game launch (no landing).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#orbit-landing-root', { timeout: 20000 });
    await page.goto(`${base}?game`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ORBIT_ZERO__?.getState?.(), null, { timeout: 45000 });

    step('vr fallback');
    // 4. VR entry without a headset must recover to the desktop game.
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#btn-enter-experience', { timeout: 20000 });
    await page.locator('#btn-enter-experience').click();
    await page.waitForTimeout(500);
    const xr = await page.evaluate(async () => {
      if (!navigator.xr) return { api: false, supported: false };
      try { return { api: true, supported: await Promise.race([navigator.xr.isSessionSupported('immersive-vr'), new Promise((r) => setTimeout(() => r('timeout'), 3000))]) }; } catch { return { api: true, supported: false }; }
    });
    await page.locator('#btn-enter-vr').click();
    await page.waitForTimeout(400);
    const advisory = await page.evaluate(() => {
      const a = document.querySelector('#oz-vr-advisory');
      return a !== null && !a.classList.contains('oz-hidden');
    });
    assert.ok(advisory, `[${prefix}] VR entry without a headset must show the advisory`);
    await page.locator('#btn-advisory-play-desktop').click();
    await page.waitForFunction(() => window.__ORBIT_ZERO__?.getState?.()?.phase === 'OPERATIONS', null, { timeout: 45000 });

    step('incoming check');
    // 5. Source-only models must not be served.
    const incoming = await page.evaluate(async () => (await fetch('assets/models/incoming/')).status);

    const ignorable = (s) => /favicon|\/incoming\/|status of 404/i.test(s); // 404 on the deliberate incoming/ probe is the expected result
    // Chrome cancels in-flight media fetches when the page navigates away. Accept that only for the voice-over file, and only if it also loaded (200/206).
    const navAbort = (b) => /ERR_ABORTED/.test(b) && /\.mp4/.test(b) && got('gemini_generated_video');
    const failures = bad.filter((b) => !ignorable(b) && !navAbort(b));
    report.push({ mount: prefix, xr, failedRequests: failures, consoleErrors: consoleErrors.filter((e) => !ignorable(e)), incomingStatus: incoming });
    assert.deepEqual(failures, [], `[${prefix}] no request may fail`);
    assert.ok(incoming >= 400, `[${prefix}] incoming source models must not be deployed`);
    await context.close();
    server.close();
  }
  console.log(JSON.stringify({ status: 'PASS', report }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ status: 'FAIL', report, error: String(err?.stack ?? err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
