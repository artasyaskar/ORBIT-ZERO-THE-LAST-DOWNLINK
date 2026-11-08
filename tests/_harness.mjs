// Shared Playwright harness for profiling / gallery scripts (production build via vite preview).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { get as getHttps } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

/** Console errors every harness page ignores (offline font/CDN lookups). Extra patterns per page via `ignoreErrors`. */
const OFFLINE_NOISE = ['ERR_NAME_NOT_RESOLVED', 'ERR_INTERNET_DISCONNECTED'];

/**
 * Opens a page in a fresh browser context.
 * - iwer: install the IWER Meta Quest 3 emulator (hand input) as navigator.xr (default true)
 * - userAgent: override the browser's user agent (e.g. Meta Quest Browser)
 * - initScript: extra script that runs after IWER in every document
 */
export async function openPage(browser, { skipLanding = false, viewport = { width: 1440, height: 960 }, userAgent, iwer = true, initScript = '', ignoreErrors = [] } = {}) {
  const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true, ...(userAgent ? { userAgent } : {}) });
  if (iwer) {
    const iwerSource = await readFile(join(root, 'node_modules', 'iwer', 'build', 'iwer.js'), 'utf8');
    await context.addInitScript({
      content: `${iwerSource}\nconst device = new window.IWER.XRDevice(window.IWER.metaQuest3, { stereoEnabled: false }); device.installRuntime({forceInstall:true}); device.primaryInputMode = 'hand'; window.__ORBIT_IWER__ = device;`,
    });
  }
  const extra = `${skipLanding ? 'window.__ORBIT_SKIP_LANDING__ = true;' : ''}${initScript}`;
  if (extra) await context.addInitScript({ content: extra });
  const page = await context.newPage();
  const failures = [];
  const ignored = [...OFFLINE_NOISE, ...ignoreErrors];
  page.on('pageerror', (e) => failures.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      if (!ignored.some((needle) => t.includes(needle))) failures.push(t);
    }
  });
  return { context, page, failures };
}

export async function launchApp({ skipLanding = false, viewport = { width: 1440, height: 960 }, userAgent, iwer = true, initScript = '', ignoreErrors = [] } = {}) {
  const port = await new Promise((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
  const url = `https://localhost:${port}/`;
  // ORBIT_PREVIEW_OUTDIR serves another build (e.g. an unminified profiling build) instead of dist/.
  const outDirArgs = process.env.ORBIT_PREVIEW_OUTDIR ? ['--outDir', process.env.ORBIT_PREVIEW_OUTDIR] : [];
  const preview = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort', ...outDirArgs], {
    cwd: root,
    stdio: 'pipe',
  });
  const deadline = Date.now() + 30000;
  for (;;) {
    const ok = await new Promise((r) => {
      const q = getHttps(url, { rejectUnauthorized: false }, (resp) => {
        resp.resume();
        r(resp.statusCode === 200);
      });
      q.on('error', () => r(false));
      q.setTimeout(1000, () => {
        q.destroy();
        r(false);
      });
    });
    if (ok) break;
    if (Date.now() > deadline) throw new Error('preview did not start');
    await new Promise((r) => setTimeout(r, 150));
  }
  const installed = process.env.ORBIT_BROWSER_PATH || (existsSync(chromium.executablePath()) ? chromium.executablePath() : undefined);
  const browser = await chromium.launch({
    ...(installed ? { executablePath: installed } : { channel: process.env.ORBIT_BROWSER_CHANNEL || (process.platform === 'win32' ? 'chrome' : 'chromium') }),
    headless: process.env.ORBIT_HEADED !== '1',
    args: ['--enable-webgl', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])],
  });
  const { context, page, failures } = await openPage(browser, { skipLanding, viewport, userAgent, iwer, initScript, ignoreErrors });
  const close = async () => {
    await browser.close().catch(() => {});
    preview.kill();
  };
  return { url, page, context, browser, failures, close };
}

/** Drive the desktop landing flow to the game with the given campaign card id. */
export async function enterGame(page, url, cardId = 'card-op-fireline') {
  // IWER reports the Meta Quest user agent, which routes to the headset lobby; ?landing forces the landing.
  await page.goto(`${url}?landing`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#oz-hero-screen', { state: 'visible', timeout: 15000 });
  await page.click('#btn-enter-experience');
  await page.waitForTimeout(700);
  await page.click(`#${cardId}`);
  await page.click('#btn-play-desktop');
  await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__), null, { timeout: 60000 });
  await page.waitForTimeout(900);
  const commence = await page.locator('#btn-commence-pass').isVisible().catch(() => false);
  if (commence) await page.click('#btn-commence-pass');
  await page.waitForTimeout(300);
}

/** Optimal Fireline plan (B thermal, C optical, E thermal; compress B+E; queue all). */
export async function playFirelineOptimal(page, { commit = false } = {}) {
  await page.evaluate(() => {
    const api = window.__ORBIT_ZERO__;
    const pick = (sec, mode) => {
      api.selectSector(sec);
      while (api.getState().activeSensorMode !== mode) api.toggleSensor();
      api.scan();
    };
    pick('B', 'THERMAL');
    api.queue();
    pick('C', 'OPTICAL');
    api.queue();
    pick('E', 'THERMAL');
    api.queue();
  });
  await page.evaluate(() => {
    window.__ORBIT_ZERO__.simulateCubeDrop(0, 'PROCESS');
    window.__ORBIT_ZERO__.simulateCubeDrop(2, 'PROCESS');
  });
  if (commit) await page.evaluate(() => window.__ORBIT_ZERO__.commitDownlink());
}

