import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { get as getHttps } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactsDir = 'C:/Users/DELL/.gemini/antigravity/brain/42f86843-55c9-4d1e-81b6-dc28fa54a640';
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const port = await new Promise((res, rej) => {
  const s = createServer();
  s.once('error', rej);
  s.listen(0, '127.0.0.1', () => {
    const a = s.address();
    s.close(() => res(a.port));
  });
});

const url = `https://127.0.0.1:${port}/?skipLanding=1`;
console.log(`Starting Vite preview server at ${url}...`);

const preview = spawn(
  process.execPath,
  [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: root, stdio: 'pipe' }
);

try {
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      const ready = await new Promise((res) => {
        const req = getHttps(url, { rejectUnauthorized: false }, (r) => {
          r.resume();
          res(r.statusCode === 200);
        });
        req.on('error', () => res(false));
        req.setTimeout(1000, () => { req.destroy(); res(false); });
      });
      if (ready) break;
    } catch {}
    if (Date.now() > deadline) throw new Error('Preview timeout');
    await new Promise((r) => setTimeout(r, 250));
  }

  const browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'chrome' : 'chromium',
    headless: true,
    args: [
      '--ignore-certificate-errors',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
      '--no-sandbox',
    ],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  await page.waitForFunction(() => typeof window.__ORBIT_ZERO__ !== 'undefined', null, { timeout: 30000 });
  await page.waitForTimeout(2000);

  // Capture 1: Initial Briefing Modal
  await page.screenshot({ path: join(artifactsDir, 'cockpit-01-briefing-modal.png') });
  console.log('Saved cockpit-01-briefing-modal.png');

  // Dismiss modal by clicking COMMENCE PASS or Skip
  const commenceBtn = await page.$('#btn-commence-pass') || await page.$('#btn-modal-skip');
  if (commenceBtn) {
    await commenceBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(1500);

  // Capture 2: Clean Canopy (Concept Image 1 Match)
  await page.screenshot({ path: join(artifactsDir, 'cockpit-02-clean-canopy.png') });
  console.log('Saved cockpit-02-clean-canopy.png');

  // Switch to Sector B and engage SAR Radar
  await page.evaluate(() => {
    window.__ORBIT_ZERO__.selectSector('B');
  });
  await page.waitForTimeout(1000);

  // Capture 3: Tactical Targeting Mode (Concept Image 2 Match)
  await page.screenshot({ path: join(artifactsDir, 'cockpit-03-tactical-reticle.png') });
  console.log('Saved cockpit-03-tactical-reticle.png');

  await browser.close();
} finally {
  preview.kill();
}

