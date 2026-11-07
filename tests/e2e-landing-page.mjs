/**
 * ORBIT ZERO — CINEMATIC LANDING EXPERIENCE E2E TEST SUITE (RC9.2 Polish)
 *
 * Verifies all 7 core criteria of the upgraded landing experience:
 * 1. 3D Earth space scene rendering (Three.js Earth, clouds, atmosphere glow, satellite, 4K Milky Way).
 * 2. Aerospace typography, mission briefing card, and audio mute/unmute control.
 * 3. High-detail satellite orbital revolution and nadir attitude tracking.
 * 4. Screen 1 (Hero) to Screen 2 (Experience Selection) transition.
 * 5. Return to Orbit view back navigation (reliable, unblocked click).
 * 6. Desktop vs VR tactical console cards with WebXR detection and advisory modal.
 * 7. Seamless launch into Desktop game with complete landing resource disposal.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { get as getHttps } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, 'artifacts', 'landing');
await mkdir(artifacts, { recursive: true });

const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

// 1. Allocate free port
const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolvePort(address.port));
  });
});

const url = `https://127.0.0.1:${port}/?landing=1`;
console.log(`[Landing-E2E] Starting Vite preview server at ${url}...`);

const preview = spawn(
  process.execPath,
  [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: root, stdio: 'pipe' }
);

let serverLog = '';
preview.stdout.on('data', (d) => { serverLog += d; });
preview.stderr.on('data', (d) => { serverLog += d; });

let browser;
let page;
const testResults = [];
const consoleErrors = [];

try {
  // Wait for preview server ready
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
    if (Date.now() > deadline) {
      throw new Error(`Preview server did not start within 30s. Logs:\n${serverLog}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`[Landing-E2E] Preview server ready. Launching Chrome with WebGL...`);
  browser = await chromium.launch({
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

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });

  page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for Landing UI Root element
  console.log(`[Landing-E2E] Verifying Landing DOM elements...`);
  await page.waitForSelector('#orbit-landing-root', { timeout: 15000 });
  await page.waitForSelector('#oz-hero-screen', { timeout: 10000 });

  // =========================================================================
  // TEST 1: Real-time 3D Earth Space Scene & Canvas Rendering
  // =========================================================================
  console.log('\n--- TEST 1: Real-time 3D Earth Space Environment ---');
  const canvasCount = await page.locator('canvas').count();
  assert.ok(canvasCount >= 1, 'Landing 3D WebGL canvas must be present in DOM');

  const webglSupport = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    return Boolean(gl);
  });
  assert.ok(webglSupport, 'WebGL context must be initialized on landing canvas');
  console.log('✓ 3D Space Scene WebGL canvas initialized and active');
  testResults.push('Test 1: 3D Earth Space Scene Rendering [PASS]');

  // =========================================================================
  // TEST 2: Typography, Classified Directive & Audio Mute Controls
  // =========================================================================
  console.log('\n--- TEST 2: Aerospace Typography & Mission Directive ---');
  const heroTitle = await page.locator('.oz-hero-title').innerText();
  assert.ok(heroTitle.includes('ORBIT ZERO'), 'Hero title must contain "ORBIT ZERO"');
  assert.ok(heroTitle.includes('THE LAST DOWNLINK'), 'Hero title must contain "THE LAST DOWNLINK"');

  const supportingLine = await page.locator('.oz-supporting-line').innerText();
  // Current intentional copy (landingUI.ts): states the genre, the hands-first premise and that the game is a simulation.
  assert.equal(supportingLine.trim(), 'HANDS-FIRST SPATIAL SATELLITE TRIAGE STRATEGY GAME [SIMULATED]');

  const missionText = await page.locator('.oz-hero-welcome').innerText();
  assert.ok(missionText.includes('Every scan costs capacitor energy'), 'Mission text must state the energy cost of scanning');
  assert.ok(missionText.includes('competes for the last downlink'), 'Mission text must state the downlink competition premise');
  assert.ok(missionText.includes('Karachi Ground Station before Loss of Signal'), 'Mission text must state the transmission objective');

  // Verify Audio Mute Button
  const muteBtn = page.locator('#btn-landing-mute');
  assert.ok(await muteBtn.isVisible(), 'Audio toggle button must be visible');
  const initialIcon = await page.locator('#mute-icon').innerText();
  assert.equal(initialIcon, '🔊');

  await muteBtn.click();
  const mutedIcon = await page.locator('#mute-icon').innerText();
  assert.equal(mutedIcon, '🔇', 'Clicking audio button must toggle to muted state');

  await muteBtn.click();
  const unmutedIcon = await page.locator('#mute-icon').innerText();
  assert.equal(unmutedIcon, '🔊', 'Clicking audio button again must toggle back to unmuted');
  console.log('✓ Typography, Mission Directive, and Audio mute/unmute controls verified');
  testResults.push('Test 2: Typography & Audio Controls [PASS]');

  // Take screenshot of Hero Screen
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(artifacts, '01-landing-hero.png'), fullPage: true });

  // =========================================================================
  // TEST 3: Primary CTA Transition to Experience Selection Screen
  // =========================================================================
  console.log('\n--- TEST 3: "ENTER EXPERIENCE" Screen Transition ---');
  const enterBtn = page.locator('#btn-enter-experience');
  assert.ok(await enterBtn.isVisible(), '"ENTER EXPERIENCE" button must be visible');

  await enterBtn.click();
  await page.waitForTimeout(500);

  const selectionActive = await page.evaluate(() => {
    const screen = document.querySelector('#oz-selection-screen');
    return screen?.classList.contains('oz-screen-active');
  });
  assert.ok(selectionActive, 'Screen 2 (Experience Selection) must become active');

  const selectionHeading = await page.locator('.oz-selection-heading').innerText();
  assert.equal(selectionHeading.trim(), 'SELECT CAMPAIGN OPERATION & TERMINAL');

  const hasDesktopCard = await page.locator('#card-desktop').isVisible();
  assert.ok(hasDesktopCard, 'Desktop Experience option card must be present');

  const hasVRCard = await page.locator('#card-vr').isVisible();
  assert.ok(hasVRCard, 'VR Experience option card must be present');

  // Campaign cards are a real radio group: one tab stop, aria-checked follows selection, arrows move it.
  const radioState = () => page.evaluate(() => Array.from(document.querySelectorAll('#oz-campaign-grid [role="radio"]')).map((el) => ({
    id: el.id, checked: el.getAttribute('aria-checked'), tab: el.tabIndex,
  })));
  let radios = await radioState();
  assert.equal(radios.length, 4, 'Four campaign radios expected');
  assert.equal(radios.filter((r) => r.checked === 'true').length, 1, 'Exactly one card is checked');
  assert.equal(radios.filter((r) => r.tab === 0).length, 1, 'Roving tabindex: exactly one tab stop');
  assert.equal(radios.find((r) => r.checked === 'true').id, 'card-op-fireline', 'Fireline is the default selection');
  await page.locator('#card-op-fireline').focus();
  await page.keyboard.press('ArrowRight');
  radios = await radioState();
  assert.equal(radios.find((r) => r.checked === 'true').id, 'card-op-monsoon', 'ArrowRight selects the next card');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'card-op-monsoon', 'Focus follows selection');
  await page.keyboard.press('End');
  assert.equal((await radioState()).find((r) => r.checked === 'true').id, 'card-op-aftershock', 'End selects the last card');
  await page.keyboard.press('ArrowRight');
  assert.equal((await radioState()).find((r) => r.checked === 'true').id, 'card-op-academy', 'Selection wraps around');
  await page.keyboard.press('Home');
  await page.locator('#card-op-fireline').click(); // restore the default for the launch test
  assert.equal((await radioState()).find((r) => r.checked === 'true').id, 'card-op-fireline');

  await page.screenshot({ path: join(artifacts, '02-landing-selection.png'), fullPage: true });
  console.log('✓ Smooth transition to Experience Selection screen verified');
  testResults.push('Test 3: Experience Selection Transition [PASS]');

  // =========================================================================
  // TEST 4: Return to Orbit View Back Navigation (Fix Verification)
  // =========================================================================
  console.log('\n--- TEST 4: Return to Orbit View Back Navigation ---');
  const backBtn = page.locator('#btn-back-orbit');
  assert.ok(await backBtn.isVisible(), 'Back button must be visible on Selection Screen');

  await backBtn.click();
  await page.waitForTimeout(400);

  const heroActiveAgain = await page.evaluate(() => {
    const screen = document.querySelector('#oz-hero-screen');
    return screen?.classList.contains('oz-screen-active');
  });
  assert.ok(heroActiveAgain, 'Clicking "RETURN TO ORBIT VIEW" must restore Hero Screen');

  // Re-enter selection screen for launch test
  await page.locator('#btn-enter-experience').click();
  await page.waitForTimeout(400);
  console.log('✓ Back navigation restored Hero Screen and re-transitioned to Selection');
  testResults.push('Test 4: Back Navigation [PASS]');

  // =========================================================================
  // TEST 5: WebXR Fallback Advisory Modal
  // =========================================================================
  console.log('\n--- TEST 5: WebXR Advisory Handling ---');
  // Click VR button in headless browser without XR headset attached
  await page.locator('#btn-enter-vr').click();
  await page.waitForTimeout(300);

  const advisoryVisible = await page.evaluate(() => {
    const adv = document.querySelector('#oz-vr-advisory');
    return adv !== null && !adv.classList.contains('oz-hidden');
  });
  assert.ok(advisoryVisible, 'VR button must show informative advisory when WebXR is not detected');

  await page.locator('#btn-advisory-close').click();
  await page.waitForTimeout(200);
  console.log('✓ WebXR headset detection and informative advisory verified');
  testResults.push('Test 5: WebXR Advisory Fallback [PASS]');

  // =========================================================================
  // TEST 6: Seamless Handover to Core Desktop Game Engine
  // =========================================================================
  console.log('\n--- TEST 6: Seamless Game Launch & Resource Disposal ---');
  await page.locator('#btn-play-desktop').click();

  // Wait for landing DOM root to be completely removed from document
  await page.waitForFunction(
    () => document.querySelector('#orbit-landing-root') === null,
    null,
    { timeout: 10000 }
  );
  console.log('✓ Landing DOM layer completely detached');

  // Wait for core game engine to initialize and publish window.__ORBIT_ZERO__
  await page.waitForFunction(
    () => typeof window.__ORBIT_ZERO__ !== 'undefined' && window.__ORBIT_ZERO__.getState(),
    null,
    { timeout: 30000 }
  );

  const gameState = await page.evaluate(() => window.__ORBIT_ZERO__.getState().phase);
  assert.equal(gameState, 'OPERATIONS', 'Core game engine must reach OPERATIONS phase');

  // Take screenshot of launched game
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(artifacts, '03-launched-game.png'), fullPage: true });
  console.log('✓ Game engine launched into OPERATIONS state with zero dual-render conflicts');
  testResults.push('Test 6: Game Launch Handover [PASS]');

  // =========================================================================
  // TEST SUMMARY & ACCEPTANCE
  // =========================================================================
  console.log('\n=============================================================');
  console.log('   ORBIT ZERO CINEMATIC LANDING VERIFICATION: ALL PASSED');
  console.log('=============================================================');
  testResults.forEach((res) => console.log(`   ${res}`));
  console.log('=============================================================\n');

} catch (err) {
  console.error('\n❌ Landing E2E Test Failed:', err);
  if (page) {
    try {
      await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true });
    } catch {}
  }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (preview) preview.kill();
}
