// Desktop smoke test for the gameplay redesign: mission card, next-step card, visible action bar,
// mouse-only scan/compress/load/transmit, pass clock and debrief. Runs the production build.
// Usage: npm run build ; node tests/e2e-redesign-desktop.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launchApp, root } from './_harness.mjs';

const out = join(root, 'artifacts', 'redesign');
await mkdir(out, { recursive: true });
// A desktop visitor: no WebXR emulator (IWER would also report a Meta Quest user agent).
const { url, page, failures, close } = await launchApp({ iwer: false });
const log = (...a) => console.log('[redesign]', ...a);
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const click = async (sel) => { await page.click(sel); await page.waitForTimeout(250); };
const state = () => page.evaluate(() => window.__ORBIT_ZERO__.getState());
let ok = true;
const check = (cond, msg) => { log(cond ? 'PASS' : 'FAIL', msg); if (!cond) ok = false; };

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#oz-hero-screen', { state: 'visible', timeout: 20000 });
  await click('#btn-enter-experience');
  await page.waitForTimeout(600);
  const briefing = await page.textContent('#oz-briefing-budget');
  check(/Wh battery/.test(briefing ?? ''), `landing budget line is config-driven: "${briefing}"`);
  await click('#card-op-fireline');
  await click('#btn-play-desktop');
  await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__), null, { timeout: 90000 });
  await page.waitForTimeout(2500);

  const card = await page.textContent('#orbit-zero-briefing-modal');
  check(/GROUND REQUESTS/.test(card ?? '') && /WIN: \d+\+ pts/.test(card ?? ''), 'mission card shows requests and win rule');
  check(!/Thermal IR on Sector|use THERMAL|\(RADAR rec\.\)/i.test(card ?? ''), 'mission card does not print the sensor answer');
  await shot('01-mission-card');

  await click('#btn-commence-pass');
  const banner = await page.textContent('#orbit-zero-hud-banner');
  check(/NEXT STEP/.test(banner ?? ''), 'next-step card visible after start');
  const toolbarVisible = await page.isVisible('#tb-scan');
  check(toolbarVisible, 'SCAN button visible in action bar');
  await shot('02-next-step');

  // Mouse-only pass on Fireline: B thermal, E thermal, C optical, compress B, load all, transmit.
  const playScan = async (sector, sensor) => {
    await page.evaluate((s) => window.__ORBIT_ZERO__.selectSector(s), sector);
    await page.waitForTimeout(200);
    await click(`button[data-action="sensor:${sensor}"]`);
    await click('#tb-scan');
  };
  await playScan('B', 'THERMAL');
  let s = await state();
  check(s.packets.length === 1 && s.packets[0].confidence === 'CONFIRMED', 'thermal through smoke gives CONFIRMED cube');
  check(s.passStarted === true && s.passRemainingSec < 150, `pass clock started (${s.passRemainingSec?.toFixed(1)}s left)`);
  await click('#tb-process');
  s = await state();
  check(s.packets[0].processed, 'compress button processed the selected cube');
  await click('#tb-queue');
  await playScan('C', 'OPTICAL');
  await click('#tb-queue');
  await playScan('E', 'THERMAL');
  await click('#tb-queue');
  s = await state();
  check(s.queuePacketIds.length === 3, `three cubes loaded (${s.downlinkCommittedSec}s of ${s.downlinkWindowSec}s)`);
  await shot('03-loaded');

  await click('#tb-transmit');
  s = await state();
  check(s.phase === 'DOWNLINK', 'transmit opens the live window');
  await shot('04-live-window');
  await page.waitForFunction(() => window.__ORBIT_ZERO__.getState().phase === 'DEBRIEF', null, { timeout: 20000 });
  s = await state();
  check(s.debrief.outcome === 'SUCCESS', `debrief outcome ${s.debrief.outcome} ${s.debrief.totalScore} pts`);
  const aar = await page.textContent('#orbit-zero-hud-banner');
  check(/best possible/.test(aar ?? ''), 'debrief shows score vs best possible');
  await shot('05-debrief');

  // Hint costs points and does not act.
  await click('#btn-aar-next');
  await page.waitForTimeout(800);
  await click('#btn-commence-pass');
  const before = await state();
  await click('#tb-aria-hint');
  const after = await state();
  check(after.hintsUsed === 1 && after.packets.length === before.packets.length, 'ARIA hint is paid and does not play a move');
  await shot('06-hint');
} catch (err) {
  ok = false;
  log('ERROR', err?.stack ?? err);
  await shot('error').catch(() => {});
} finally {
  if (failures.length) { log('page errors:', failures.slice(0, 5)); }
  await close();
}
log(ok && failures.length === 0 ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
process.exit(ok && failures.length === 0 ? 0 : 1);
