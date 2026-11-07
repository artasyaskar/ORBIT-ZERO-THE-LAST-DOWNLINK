/**
 * Shared launcher for Virtual Quest tools that need a running immersive IWER session
 * (performance profile, ablation experiments). The main lab keeps its own inline bootstrap.
 */
import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { get as getHttps } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { describe } from './virtualQuestPerfProbe.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

export const gitRevision = () => {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
  } catch {
    return 'UNKNOWN';
  }
};

const run = (script, args = []) =>
  new Promise((res, rej) => {
    const c = spawn(process.execPath, [script, ...args], { cwd: root, stdio: 'ignore' });
    c.once('error', rej);
    c.once('exit', (code) => (code === 0 ? res() : rej(new Error(`exit ${code}`))));
  });

/** Bare-page WebGL2 clear loop: the browser/host cadence ceiling without XR or the game. */
async function measureHostRefresh(context) {
  const p = await context.newPage();
  await p.goto('about:blank');
  const r = await p.evaluate(
    () =>
      new Promise((resolveBase) => {
        const ts = [];
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        document.body.appendChild(c);
        const gl = c.getContext('webgl2');
        const loop = (t) => {
          if (gl) {
            gl.clearColor(Math.random(), 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
          }
          ts.push(t);
          if (ts.length < 240) requestAnimationFrame(loop);
          else {
            const iv = [];
            for (let i = 1; i < ts.length; i++) iv.push(ts[i] - ts[i - 1]);
            resolveBase({ iv, renderer: gl ? gl.getParameter(gl.RENDERER) : null });
          }
        };
        requestAnimationFrame(loop);
      }),
  );
  await p.close();
  const iv = describe(r.iv.slice(10));
  return {
    description: 'Bare page, 64x64 WebGL2 clear per rAF, no XR, no game (browser/host cadence ceiling)',
    glRenderer: r.renderer,
    intervalMs: iv,
    impliedRefreshHz: Number((1000 / iv.median).toFixed(1)),
  };
}

/**
 * Build (optional), serve, launch Chromium with IWER Quest 3, enter the chosen operation in
 * immersive mode and return handles. Call `cleanup()` when done.
 */
export async function launchImmersiveGame({ skipBuild = false, headed = false, card = '#card-op-fireline', unminified = false } = {}) {
  const outDir = unminified ? join(root, 'node_modules', '.cache', 'orbit-prof') : join(root, 'dist');
  if (!skipBuild) await run(vite, unminified ? ['build', '--minify', 'false', '--outDir', outDir, '--emptyOutDir'] : ['build']);
  const port = await new Promise((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
  const baseUrl = `https://localhost:${port}/`;
  const preview = spawn(process.execPath, [vite, 'preview', '--outDir', outDir, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
  });
  const deadline = Date.now() + 30000;
  for (;;) {
    const ok = await new Promise((res) => {
      const req = getHttps(baseUrl, { rejectUnauthorized: false }, (r) => {
        r.resume();
        res(r.statusCode === 200);
      });
      req.on('error', () => res(false));
      req.setTimeout(1000, () => {
        req.destroy();
        res(false);
      });
    });
    if (ok) break;
    if (Date.now() > deadline) throw new Error('preview did not start');
    await new Promise((r) => setTimeout(r, 100));
  }

  const installed = existsSync(chromium.executablePath()) ? chromium.executablePath() : undefined;
  const browser = await chromium.launch({
    ...(installed ? { executablePath: installed } : { channel: process.platform === 'win32' ? 'chrome' : 'chromium' }),
    headless: !headed,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-precise-memory-info', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, ignoreHTTPSErrors: true });
  const hostReport = await measureHostRefresh(context);

  const iwerSource = await readFile(join(root, 'node_modules', 'iwer', 'build', 'iwer.js'), 'utf8');
  await context.addInitScript({
    content: `${iwerSource}\nconst device = new window.IWER.XRDevice(window.IWER.metaQuest3, { stereoEnabled: true }); device.installRuntime({forceInstall:true}); device.primaryInputMode = 'hand'; window.__ORBIT_IWER__ = device; window.IWER_DEVICE = device;`,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#oz-hero-screen', { state: 'visible', timeout: 15000 });
  await page.click('#btn-enter-experience');
  await page.waitForSelector('#oz-selection-screen', { state: 'visible', timeout: 10000 });
  await page.click(card);
  await page.waitForTimeout(200);
  await page.click('#btn-enter-vr');
  await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__), null, { timeout: 60000 });
  if (!(await page.evaluate(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive))) {
    await page.evaluate(() => window.__ORBIT_ZERO__.clickPanel('briefing-panel', 'xr-button'));
  }
  await page.waitForFunction(() => window.__ORBIT_ZERO__?.getRuntimeStatus().immersive, null, { timeout: 30000 });

  return {
    page,
    context,
    browser,
    hostReport,
    pageErrors,
    browserVersion: browser.version(),
    baseUrl,
    cleanup: async () => {
      await browser.close().catch(() => {});
      preview.kill();
    },
  };
}


