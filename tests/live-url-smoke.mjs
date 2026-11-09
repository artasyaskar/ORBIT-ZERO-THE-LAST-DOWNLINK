// Smoke test of the DEPLOYED game, the way a judge's Quest Browser meets it: Meta Quest user agent, the IWER
// Meta Quest 3 emulator as navigator.xr (hand input), the headset lobby, one tap on ENTER VR.
// It checks that every request succeeds (no 404 from a wrong base path), that the lobby reaches READY, that
// one tap enters the immersive session, and that the page logs no errors. Desktop landing is checked too.
// Usage: node tests/live-url-smoke.mjs https://<user>.github.io/ORBIT-ZERO-THE-LAST-DOWNLINK/
// This is an emulator check of the live files. It does not replace the headset session checklist.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { openPage } from './_harness.mjs';

const base = process.argv[2];
if (!base || !/^https:\/\//.test(base)) {
  console.error('Usage: node tests/live-url-smoke.mjs https://<host>/<path>/   (the live game URL, https)');
  process.exit(2);
}
const QUEST_UA = 'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/37.0.0.0 SamsungBrowser/4.0 Chrome/132.0.0.0 VR Safari/537.36';
const results = [];
const check = (ok, name, detail = '') => {
  results.push(Boolean(ok));
  console.log(`[live] ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`);
};

const installed = process.env.ORBIT_BROWSER_PATH || (existsSync(chromium.executablePath()) ? chromium.executablePath() : undefined);
const browser = await chromium.launch({
  ...(installed ? { executablePath: installed } : { channel: process.platform === 'win32' ? 'chrome' : 'chromium' }),
  headless: process.env.ORBIT_HEADED !== '1',
  args: ['--enable-webgl', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])],
});
try {
  // 1. Headset visitor: lobby, one tap, immersive.
  const quest = await openPage(browser, { userAgent: QUEST_UA });
  const failed = [];
  quest.page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  quest.page.on('requestfailed', (r) => { if (!/ERR_ABORTED/.test(r.failure()?.errorText ?? '')) failed.push(`${r.failure()?.errorText} ${r.url()}`); });
  const t0 = Date.now();
  await quest.page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const ready = await quest.page.waitForFunction(() => document.querySelector('#oz-xr-entry')?.dataset.phase === 'ready', null, { timeout: 120000 }).then(() => true, () => false);
  check(ready, 'headset lobby reaches READY', `${((Date.now() - t0) / 1000).toFixed(1)} s on this connection`);
  if (ready) {
    await quest.page.click('#oz-xr-enter');
    const inVr = await quest.page.waitForFunction(() => window.__ORBIT_ZERO__?.getRuntimeStatus().immersive, null, { timeout: 30000 }).then(() => true, () => false);
    check(inVr, 'one tap on ENTER VR enters the immersive session');
  }
  check(failed.length === 0, 'every request of the headset visit succeeds (base path, cache, CDN)', failed.slice(0, 5).join(' | '));
  check(quest.failures.length === 0, 'headset visit logs no page errors', quest.failures.slice(0, 3).join(' | '));
  await quest.context.close();

  // 2. Desktop visitor: the cinematic landing loads.
  const desk = await openPage(browser, { iwer: false });
  await desk.page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const landing = await desk.page.waitForSelector('#btn-enter-experience', { timeout: 60000 }).then(() => true, () => false);
  check(landing, 'desktop landing shows its start button');
  check(desk.failures.length === 0, 'desktop visit logs no page errors', desk.failures.slice(0, 3).join(' | '));
  await desk.context.close();
} finally {
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`[live] ${passed}/${results.length} checks passed for ${base}`);
process.exit(passed === results.length ? 0 : 1);
