// Enter-VR paths (P0-6). Production build via vite preview, headless Chrome, IWER Meta Quest 3 emulator.
// This is an emulator check of the page logic. It says nothing about Meta Quest Browser itself
// (real user-activation rules, permission prompts, compositor hangs): see the headset checklist.
//
//  1. Quest browser: lobby instead of the landing, no landing downloads, ONE tap -> immersive.
//  2. Leaving VR brings the lobby back; one tap re-enters.
//  3. requestSession rejects (NotAllowedError): plain message + TRY AGAIN; the retry enters VR.
//  4. Session opens but setup fails (no reference space): message + TRY AGAIN; the retry enters VR.
//  5. No VR runtime (no IWER): "No VR headset was found." + PLAY ON THIS SCREEN -> flat game.
//  6. No navigator.xr at all: "This browser cannot open VR."
//  7. In-game Enter VR (briefing panel) with a NotSupportedError: message + TRY AGAIN works.
//  8. Desktop landing ENTER VR: immersive directly, or after one tap on the overlay.
//
// Usage: npm run build ; node tests/e2e-enter-vr.mjs
import { launchApp, openPage } from './_harness.mjs';

const QUEST_UA = 'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/39.2.0.0.56.754450099 Chrome/136.0.7103.177 VR Safari/537.36';
// IWSDK logs these itself when a request or setup fails; here the failures are induced on purpose.
const EXPECTED_XR_ERRORS = ['[XR] Failed to start XR session', '[XR] Failed to acquire reference space'];

/** Makes the next N requestSession() calls fail in a chosen way, then behaves normally. */
const failNextRequests = (kind, count = 1) => `
  (() => {
    const xr = navigator.xr;
    if (!xr) return;
    const real = xr.requestSession.bind(xr);
    let left = ${count};
    window.__XR_REQUESTS__ = 0;
    xr.requestSession = function (mode, init) {
      window.__XR_REQUESTS__++;
      if (left-- <= 0) return real(mode, init);
      if (${JSON.stringify(kind)} === 'no-reference-space') {
        return real(mode, init).then((session) => {
          session.requestReferenceSpace = () => Promise.reject(new DOMException('test: no reference space', 'NotSupportedError'));
          return session;
        });
      }
      return Promise.reject(new DOMException('test: induced ' + ${JSON.stringify(kind)}, ${JSON.stringify(kind)}));
    };
  })();`;

const app = await launchApp({ skipLanding: false, userAgent: QUEST_UA, ignoreErrors: EXPECTED_XR_ERRORS });
const { url, browser } = app;
const results = [];
const log = (...a) => console.log('[enter-vr]', ...a);
const check = (ok, name, detail = '') => {
  results.push({ ok: Boolean(ok), name, detail });
  log(ok ? 'PASS' : 'FAIL', name, detail);
};

const overlay = (page) => page.evaluate(() => {
  const root = document.querySelector('#oz-xr-entry');
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? '';
  const shown = (sel) => {
    const el = document.querySelector(sel);
    return Boolean(el && !el.hidden && el.getClientRects().length > 0);
  };
  return {
    exists: Boolean(root),
    visible: Boolean(root && !root.hidden),
    phase: root?.dataset.phase ?? 'none',
    status: text('#oz-xr-status'),
    button: text('#oz-xr-enter'),
    buttonEnabled: Boolean(document.querySelector('#oz-xr-enter') && !document.querySelector('#oz-xr-enter').disabled),
    problem: shown('#oz-xr-problem') ? text('#oz-xr-problem-message') : '',
    hint: text('#oz-xr-problem-hint'),
    detail: text('#oz-xr-problem-detail'),
    flatLink: shown('#oz-xr-flat'),
  };
});
const waitPhase = (page, phases, timeout = 90000) => page.waitForFunction(
  (list) => list.includes(document.querySelector('#oz-xr-entry')?.dataset.phase), phases, { timeout },
).then(() => true, () => false);
const immersive = (page) => page.evaluate(() => Boolean(window.__ORBIT_ZERO__?.getRuntimeStatus().immersive));
const waitImmersive = (page, timeout = 20000) => page.waitForFunction(
  () => Boolean(window.__ORBIT_ZERO__?.getRuntimeStatus().immersive), null, { timeout },
).then(() => true, () => false);
const tap = (page, selector) => page.click(selector, { timeout: 10000 });

async function scenario(name, opts, body) {
  log(`--- ${name}`);
  const { context, page, failures } = opts.reuse ?? await openPage(browser, { userAgent: QUEST_UA, ignoreErrors: EXPECTED_XR_ERRORS, ...opts });
  try {
    await body(page);
  } catch (err) {
    check(false, `${name}: no exception`, String(err?.stack ?? err).split('\n').slice(0, 3).join(' | '));
  }
  check(failures.length === 0, `${name}: no page errors`, failures.slice(0, 3).join(' | '));
  if (!opts.reuse) await context.close();
}

try {
  // 1 + 2. Quest browser lobby, one tap, leave and re-enter.
  await scenario('quest lobby', { reuse: { context: app.context, page: app.page, failures: app.failures } }, async (page) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    const first = await overlay(page);
    check(first.visible && first.phase === 'loading' && !first.buttonEnabled && /Loading/.test(first.status),
      'Quest browser opens the lobby (loading, button disabled) at once', JSON.stringify(first));
    const ready = await waitPhase(page, ['ready']);
    const atReady = await overlay(page);
    check(ready && atReady.button === 'ENTER VR' && atReady.buttonEnabled && !atReady.problem, 'when the game has loaded the lobby offers one ENTER VR button', JSON.stringify(atReady));
    const landingShown = await page.evaluate(() => Boolean(document.querySelector('#orbit-landing-root')));
    check(!landingShown, 'headset visitors skip the cinematic landing');
    const landingDownloads = requests.filter((u) => /milky_way_skybox|gemini_generated_video/.test(u));
    check(landingDownloads.length === 0, 'no landing skybox or voice-over download for headset visitors', landingDownloads.join(', '));
    const s = await page.evaluate(() => ({ state: window.__ORBIT_ZERO__.getState(), tutorial: window.__ORBIT_ZERO__.getTutorialState() }));
    check(s.state.scenarioId === 'ORBITAL_ACADEMY' && s.tutorial.active, 'a first-time visitor starts in the Academy (same default as the landing)', `${s.state.scenarioId} tutorial=${s.tutorial.active}`);

    // The opening ARIA line waits until the player is in VR: before the first tap a browser would block
    // speech, and it would be spoken over the lobby.
    await page.waitForTimeout(1500);
    const captionBefore = await page.evaluate(() => window.__ORBIT_ZERO__.getRuntimeStatus().caption ?? '');
    check(!/STR online/.test(captionBefore), 'while the lobby is up the opening line is held back', `caption="${captionBefore}"`);
    await tap(page, '#oz-xr-enter');
    const inVr = await waitImmersive(page);
    const afterTap = await overlay(page);
    check(inVr && !afterTap.visible, 'ONE tap on ENTER VR starts the immersive session and the lobby hides', JSON.stringify({ inVr, phase: afterTap.phase }));
    const spoke = await page.waitForFunction(() => /STR online/.test(window.__ORBIT_ZERO__.getRuntimeStatus().caption ?? ''), null, { timeout: 5000 }).then(() => true, () => false);
    check(spoke, 'the opening line plays right after the ENTER VR tap', await page.evaluate(() => window.__ORBIT_ZERO__.getRuntimeStatus().caption ?? ''));

    await page.evaluate(() => window.__ORBIT_IWER__.activeSession?.end());
    await page.waitForFunction(() => !window.__ORBIT_ZERO__.getRuntimeStatus().immersive, null, { timeout: 15000 });
    await waitPhase(page, ['ready'], 10000);
    const back = await overlay(page);
    check(back.visible && back.phase === 'ready' && /You left VR/.test(back.status) && back.buttonEnabled && back.flatLink,
      'leaving VR brings the lobby back with ENTER VR and a flat-screen option', JSON.stringify(back));
    await tap(page, '#oz-xr-enter');
    check(await waitImmersive(page), 'one tap re-enters VR');
  });

  // 3. requestSession rejects.
  await scenario('request rejected', { initScript: failNextRequests('NotAllowedError') }, async (page) => {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitPhase(page, ['ready']);
    await tap(page, '#oz-xr-enter');
    const shown = await waitPhase(page, ['problem'], 15000);
    const o = await overlay(page);
    check(shown && o.problem === 'The headset did not allow VR to start.' && /TRY AGAIN/.test(o.hint) && /NotAllowedError/.test(o.detail),
      'a rejected request shows a plain message, what to do, and the raw error', JSON.stringify(o));
    check(o.button === 'TRY AGAIN' && o.buttonEnabled && o.flatLink && !(await immersive(page)), 'the player gets TRY AGAIN (and a flat-screen option); still on the flat page', JSON.stringify(o));
    await tap(page, '#oz-xr-enter');
    const inVr = await waitImmersive(page);
    const n = await page.evaluate(() => window.__XR_REQUESTS__);
    check(inVr && !(await overlay(page)).visible && n === 2, 'TRY AGAIN enters VR (two requests in total, nothing else needed)', `immersive=${inVr} requests=${n}`);
  });

  // 4. Session opens, setup fails.
  await scenario('setup failed', { initScript: failNextRequests('no-reference-space') }, async (page) => {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitPhase(page, ['ready']);
    await tap(page, '#oz-xr-enter');
    const shown = await waitPhase(page, ['problem'], 15000);
    const o = await overlay(page);
    check(shown && o.problem === 'VR opened but could not finish setting up.' && o.button === 'TRY AGAIN' && !(await immersive(page)),
      'a session that cannot be set up ends cleanly and shows its own message + TRY AGAIN', JSON.stringify(o));
    await tap(page, '#oz-xr-enter');
    check(await waitImmersive(page), 'TRY AGAIN after a setup failure enters VR');
  });

  // 5. No VR runtime in this browser (headless Chrome without the emulator).
  await scenario('no headset', { iwer: false }, async (page) => {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const support = await page.evaluate(async () => (navigator.xr ? String(await navigator.xr.isSessionSupported('immersive-vr').catch((e) => e.name)) : 'no navigator.xr'));
    const settled = await waitPhase(page, ['unavailable', 'ready']);
    const o = await overlay(page);
    check(settled && o.phase === 'unavailable' && o.problem === 'No VR headset was found.' && o.button === 'PLAY ON THIS SCREEN',
      'feature detection without a VR runtime: plain message and PLAY ON THIS SCREEN', `isSessionSupported=${support} ${JSON.stringify(o)}`);
    await tap(page, '#oz-xr-enter');
    const after = await overlay(page);
    const phase = await page.evaluate(() => window.__ORBIT_ZERO__?.getState().phase);
    check(!after.visible && phase === 'OPERATIONS', 'PLAY ON THIS SCREEN hides the lobby; the flat game is running', `visible=${after.visible} phase=${phase}`);
  });

  // 6. No WebXR API at all.
  await scenario('no webxr', { iwer: false, initScript: "Object.defineProperty(Navigator.prototype, 'xr', { configurable: true, get: () => undefined });" }, async (page) => {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const settled = await waitPhase(page, ['unavailable', 'ready']);
    const o = await overlay(page);
    check(settled && o.phase === 'unavailable' && o.problem === 'This browser cannot open VR.' && /Meta Quest Browser/.test(o.hint),
      'without navigator.xr the lobby says this browser cannot open VR', JSON.stringify(o));
  });

  // 7. In-game Enter VR button (briefing panel) with a failing request, desktop browser.
  await scenario('in-game button', { userAgent: undefined, skipLanding: true, initScript: failNextRequests('NotSupportedError') }, async (page) => {
    await page.goto(`${url}?game`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__), null, { timeout: 90000 });
    const before = await overlay(page);
    check(!before.visible, 'desktop ?game shows no VR overlay until VR is asked for', JSON.stringify(before));
    await page.evaluate(() => window.__ORBIT_ZERO__.clickPanel('briefing-panel', 'xr-button'));
    const shown = await waitPhase(page, ['problem'], 15000);
    const o = await overlay(page);
    check(shown && o.problem === 'This browser cannot start VR for this game.' && o.button === 'TRY AGAIN',
      'the in-world Enter VR button reports a failed request the same way', JSON.stringify(o));
    await tap(page, '#oz-xr-enter');
    check(await waitImmersive(page), 'TRY AGAIN from the in-game failure enters VR');
  });

  // 8. Landing -> ENTER VR. IWER reports the Quest user agent, so ?landing forces the cinematic landing
  // (the path a desktop visitor with a PC headset takes).
  await scenario('landing enter vr', {}, async (page) => {
    await page.goto(`${url}?landing`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#oz-hero-screen', { state: 'visible', timeout: 20000 });
    await page.click('#btn-enter-experience');
    await page.waitForSelector('#oz-selection-screen', { state: 'visible', timeout: 10000 });
    await page.click('#card-op-fireline');
    await page.click('#btn-enter-vr');
    await page.waitForFunction(() => Boolean(window.__ORBIT_ZERO__), null, { timeout: 90000 });
    await page.waitForFunction(() => window.__ORBIT_ZERO__.getRuntimeStatus().immersive || document.querySelector('#oz-xr-entry')?.dataset.phase === 'ready', null, { timeout: 20000 });
    let taps = 0;
    if (!(await immersive(page))) {
      const o = await overlay(page);
      check(o.visible && o.button === 'ENTER VR' && o.buttonEnabled, 'when the landing tap has expired, the overlay asks for one fresh tap', JSON.stringify(o));
      await tap(page, '#oz-xr-enter');
      taps++;
    }
    check(await waitImmersive(page), `landing ENTER VR reaches the immersive session (${taps} extra tap)`);
  });
} finally {
  await app.close();
}

const failed = results.filter((r) => !r.ok);
log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  for (const f of failed) log('FAILED:', f.name, f.detail);
  process.exitCode = 1;
}
