/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * One-tap VR entry with a visible failure path.
 *
 * IWSDK 1.0.1 world.launchXR() logs and swallows a rejected requestSession() (dist/init/xr.js), which
 * would leave the player on the flat page with no feedback. startImmersiveSession() observes how the
 * request ends; XrEntryOverlay shows a plain message and a retry button. Used by the headset lobby, the
 * landing's ENTER VR path and the briefing panel's Enter VR button.
 */
import { VisibilityState, type World } from '@iwsdk/core';
import {
  launchProblem,
  loadProblem,
  SETUP_PROBLEM,
  supportProblem,
  XR_ENTRY_TEXT,
  type XrEntryProblem,
  type XrSupport,
} from './xrEntryText';

export type XrEntryResult = { ok: true } | { ok: false; problem: XrEntryProblem };
type LaunchOptions = Parameters<World['launchXR']>[0];

const OK: XrEntryResult = { ok: true };
const fail = (problem: XrEntryProblem): XrEntryResult => ({ ok: false, problem });
const inFlight = new WeakMap<World, Promise<XrEntryResult>>();

/**
 * Starts the immersive session through IWSDK and resolves with how it ended (never rejects).
 * Call it synchronously from a tap handler: requestSession() needs a live user gesture.
 */
export function startImmersiveSession(world: World, options?: LaunchOptions): Promise<XrEntryResult> {
  if (world.session) return Promise.resolve(OK);
  const running = inFlight.get(world);
  if (running) return running;
  let attempt: Promise<XrEntryResult>;
  try {
    attempt = launchAndObserve(world, options);
  } catch (error) {
    attempt = Promise.resolve(fail(launchProblem(error)));
  }
  inFlight.set(world, attempt);
  void attempt.then(() => {
    if (inFlight.get(world) === attempt) inFlight.delete(world);
  });
  return attempt;
}

function launchAndObserve(world: World, options?: LaunchOptions): Promise<XrEntryResult> {
  const xr = typeof navigator !== 'undefined' ? navigator.xr : undefined;
  if (typeof window !== 'undefined' && window.isSecureContext === false) return Promise.resolve(fail(supportProblem('insecure')));
  if (!xr || typeof xr.requestSession !== 'function') return Promise.resolve(fail(supportProblem('no-webxr')));
  let request: Promise<XRSession> | undefined;
  const restore = observeRequestSession(xr, (p) => {
    request = p;
  });
  try {
    world.launchXR(options);
  } catch (error) {
    return Promise.resolve(fail(launchProblem(error)));
  } finally {
    restore();
  }
  if (world.session) return Promise.resolve(OK);
  if (!request) return waitForPendingRequest(world);
  return request.then(
    (session) => waitForAdoption(world, session),
    (error: unknown) => fail(launchProblem(error)),
  );
}

/**
 * Wraps navigator.xr.requestSession for the duration of one synchronous world.launchXR() call, so the
 * promise IWSDK swallows can be observed. The wrapper forwards the call unchanged; restore() puts the
 * original back before launchXR() returns. If the property cannot be redefined, nothing is observed and
 * the caller falls back to watching the world's session state.
 */
function observeRequestSession(xr: XRSystem, onRequest: (request: Promise<XRSession>) => void): () => void {
  const original = xr.requestSession;
  const hadOwn = Object.prototype.hasOwnProperty.call(xr, 'requestSession');
  try {
    Object.defineProperty(xr, 'requestSession', {
      configurable: true,
      writable: true,
      value: function observedRequestSession(this: XRSystem, ...args: Parameters<XRSystem['requestSession']>) {
        try {
          const request = original.apply(this, args);
          onRequest(Promise.resolve(request));
          return request;
        } catch (error) {
          onRequest(Promise.reject(error));
          throw error;
        }
      },
    });
  } catch {
    return () => {};
  }
  return () => {
    try {
      if (hadOwn) Object.defineProperty(xr, 'requestSession', { configurable: true, writable: true, value: original });
      else delete (xr as { requestSession?: unknown }).requestSession;
    } catch {
      // The wrapper stays in place; it forwards every call unchanged.
    }
  };
}

/** requestSession() resolved: wait until IWSDK has adopted the session (reference space, renderer). */
function waitForAdoption(world: World, session: XRSession): Promise<XrEntryResult> {
  return new Promise((resolve) => {
    let done = false;
    let timer = 0;
    const finish = (result: XrEntryResult) => {
      if (done) return;
      done = true;
      window.clearInterval(timer);
      session.removeEventListener('end', onEnd);
      resolve(result);
    };
    const onEnd = () => finish(world.session ? OK : fail(SETUP_PROBLEM));
    const check = () => {
      if (world.session) finish(OK);
      else if (!world.sessionRequestPending) finish(fail(SETUP_PROBLEM));
    };
    session.addEventListener('end', onEnd);
    timer = window.setInterval(check, 50);
    check();
  });
}

/** The request could not be observed: watch IWSDK's pending flag until it settles. */
function waitForPendingRequest(world: World): Promise<XrEntryResult> {
  return new Promise((resolve) => {
    const timer = window.setInterval(() => {
      if (world.session) {
        window.clearInterval(timer);
        resolve(OK);
      } else if (!world.sessionRequestPending) {
        window.clearInterval(timer);
        resolve(fail(launchProblem(undefined)));
      }
    }, 50);
  });
}

// =============================================================================
// Overlay
// =============================================================================

export type XrEntryPhase = 'hidden' | 'loading' | 'ready' | 'starting' | 'problem' | 'unavailable' | 'load-failed';

const STYLE_ID = 'oz-xr-entry-style';
const STYLE = `
#oz-xr-entry{position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;background:rgba(7,11,20,.94);color:#F1F5F9;font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
#oz-xr-entry[hidden]{display:none}
#oz-xr-entry .oz-xr-card{box-sizing:border-box;width:min(560px,92vw);padding:34px 40px;background:#161F30;border:1px solid #26354D;border-radius:18px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)}
#oz-xr-entry h1{margin:0;font-size:34px;font-weight:800;letter-spacing:4px}
#oz-xr-entry .oz-xr-subtitle{margin:4px 0 16px;color:#94A3B8;font-size:13px;font-weight:700;letter-spacing:6px}
#oz-xr-entry .oz-xr-lead{margin:0 0 20px;font-size:17px}
#oz-xr-entry .oz-xr-status{min-height:1.45em;margin:0 0 14px;color:#94A3B8}
#oz-xr-entry .oz-xr-progress{height:4px;margin:0 0 18px;border-radius:2px;background:#26354D;overflow:hidden}
#oz-xr-entry .oz-xr-progress span{display:block;width:30%;height:100%;background:#00E5FF;animation:oz-xr-slide 1.2s ease-in-out infinite}
#oz-xr-entry .oz-xr-progress[hidden]{display:none}
#oz-xr-entry .oz-xr-enter{width:100%;min-height:88px;padding:20px;background:#064E3B;color:#ECFEFF;border:2px solid #10B981;border-radius:14px;font:800 26px/1 system-ui,sans-serif;letter-spacing:2px;cursor:pointer}
#oz-xr-entry .oz-xr-enter:hover:not(:disabled),#oz-xr-entry .oz-xr-enter:focus-visible{background:#065F46;border-color:#00E5FF;outline:none}
#oz-xr-entry .oz-xr-enter:disabled{opacity:.55;cursor:progress}
#oz-xr-entry .oz-xr-problem{margin:18px 0 0;padding:14px 16px;text-align:left;background:rgba(239,68,68,.12);border:1px solid #EF4444;border-radius:10px}
#oz-xr-entry .oz-xr-problem strong{display:block;color:#FCA5A5;font-size:17px}
#oz-xr-entry .oz-xr-problem p{margin:6px 0 0}
#oz-xr-entry .oz-xr-detail{color:#94A3B8;font:12px/1.4 ui-monospace,Consolas,monospace;word-break:break-word}
#oz-xr-entry .oz-xr-flat{margin-top:14px;padding:10px;background:none;border:none;color:#38BDF8;font-size:16px;text-decoration:underline;cursor:pointer}
#oz-xr-entry [hidden]{display:none}
@keyframes oz-xr-slide{from{transform:translateX(-100%)}to{transform:translateX(340%)}}
@media (prefers-reduced-motion:reduce){#oz-xr-entry .oz-xr-progress span{animation:none;width:100%;opacity:.5}}
`;

/** Shows after this long in 'starting' (the request has not settled yet). */
const SLOW_START_MS = 15000;

export class XrEntryOverlay {
  private readonly root: HTMLDivElement;
  private readonly statusEl: HTMLParagraphElement;
  private readonly progressEl: HTMLDivElement;
  private readonly enterButton: HTMLButtonElement;
  private readonly problemEl: HTMLDivElement;
  private readonly problemMessageEl: HTMLElement;
  private readonly problemHintEl: HTMLParagraphElement;
  private readonly problemDetailEl: HTMLParagraphElement;
  private readonly flatButton: HTMLButtonElement;
  private world: World | null = null;
  private unsubscribe: (() => void) | null = null;
  private wasImmersive = false;
  private slowTimer = 0;
  private buttonAction: 'enter' | 'reload' | 'flat' = 'enter';
  private launchOptions: LaunchOptions | undefined;
  /** Show the overlay again when the player leaves VR (lobby and landing VR paths). */
  private promptOnReturn = false;
  private phase: XrEntryPhase = 'hidden';

  constructor(parent: HTMLElement = document.body) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = STYLE;
      document.head.appendChild(style);
    }
    this.root = document.createElement('div');
    this.root.id = 'oz-xr-entry';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'oz-xr-title');
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="oz-xr-card">
        <h1 id="oz-xr-title"></h1>
        <div class="oz-xr-subtitle"></div>
        <p class="oz-xr-lead"></p>
        <p class="oz-xr-status" id="oz-xr-status" aria-live="polite"></p>
        <div class="oz-xr-progress" aria-hidden="true"><span></span></div>
        <button type="button" class="oz-xr-enter" id="oz-xr-enter"></button>
        <div class="oz-xr-problem" id="oz-xr-problem" role="alert" hidden>
          <strong id="oz-xr-problem-message"></strong>
          <p id="oz-xr-problem-hint"></p>
          <p class="oz-xr-detail" id="oz-xr-problem-detail"></p>
        </div>
        <button type="button" class="oz-xr-flat" id="oz-xr-flat" hidden></button>
      </div>`;
    const q = <T extends HTMLElement>(selector: string) => this.root.querySelector(selector) as T;
    q<HTMLElement>('#oz-xr-title').textContent = XR_ENTRY_TEXT.title;
    q<HTMLElement>('.oz-xr-subtitle').textContent = XR_ENTRY_TEXT.subtitle;
    q<HTMLElement>('.oz-xr-lead').textContent = XR_ENTRY_TEXT.lead;
    this.statusEl = q('#oz-xr-status');
    this.progressEl = q('.oz-xr-progress');
    this.enterButton = q('#oz-xr-enter');
    this.problemEl = q('#oz-xr-problem');
    this.problemMessageEl = q('#oz-xr-problem-message');
    this.problemHintEl = q('#oz-xr-problem-hint');
    this.problemDetailEl = q('#oz-xr-problem-detail');
    this.flatButton = q('#oz-xr-flat');
    this.flatButton.textContent = XR_ENTRY_TEXT.playOnScreenLink;
    this.enterButton.addEventListener('click', () => this.onButton());
    this.flatButton.addEventListener('click', () => this.hide());
    parent.appendChild(this.root);
  }

  /** Follows the world's session: hides in VR, and (if asked) offers re-entry after the player leaves. */
  attach(world: World, { promptOnReturn = false }: { promptOnReturn?: boolean } = {}): void {
    if (promptOnReturn) this.promptOnReturn = true;
    if (this.world === world) return;
    this.unsubscribe?.();
    this.world = world;
    this.unsubscribe = world.visibilityState.subscribe((state) => {
      if (state !== VisibilityState.NonImmersive) {
        this.wasImmersive = true;
        if (this.phase !== 'hidden') this.hide();
      } else if (this.wasImmersive) {
        this.wasImmersive = false;
        if (this.promptOnReturn) this.showReady(XR_ENTRY_TEXT.returned);
      }
    });
  }

  getPhase(): XrEntryPhase {
    return this.phase;
  }

  showLoading(): void {
    this.render('loading', { status: XR_ENTRY_TEXT.loading, button: XR_ENTRY_TEXT.loadingButton, enabled: false, progress: true });
  }

  showReady(status: string = XR_ENTRY_TEXT.ready): void {
    this.render('ready', { status, button: XR_ENTRY_TEXT.enter, enabled: Boolean(this.world), action: 'enter', flat: status === XR_ENTRY_TEXT.returned });
    if (this.world) this.enterButton.focus({ preventScroll: true });
  }

  showProblem(problem: XrEntryProblem): void {
    this.render('problem', { status: '', button: XR_ENTRY_TEXT.retry, enabled: Boolean(this.world), action: 'enter', problem, flat: true });
  }

  /** Feature detection said this browser or page cannot open VR: offer the flat game instead. */
  showUnavailable(support: Exclude<XrSupport, 'supported' | 'unknown'>): void {
    this.render('unavailable', { status: '', button: XR_ENTRY_TEXT.playOnScreen, enabled: true, action: 'flat', problem: supportProblem(support) });
  }

  showLoadFailed(error: unknown): void {
    this.render('load-failed', { status: '', button: XR_ENTRY_TEXT.reload, enabled: true, action: 'reload', problem: loadProblem(error) });
  }

  hide(): void {
    window.clearTimeout(this.slowTimer);
    this.phase = 'hidden';
    this.root.hidden = true;
  }

  /**
   * Starts VR now. Must run inside a tap handler, or while the page's user activation is still live.
   * The options are kept for the retry button.
   */
  enter(options?: LaunchOptions): void {
    if (options !== undefined) this.launchOptions = options;
    const world = this.world;
    if (!world) return;
    this.render('starting', { status: XR_ENTRY_TEXT.starting, button: XR_ENTRY_TEXT.startingButton, enabled: false, progress: true });
    this.slowTimer = window.setTimeout(() => {
      if (this.phase === 'starting') this.statusEl.textContent = XR_ENTRY_TEXT.slow;
    }, SLOW_START_MS);
    void startImmersiveSession(world, this.launchOptions).then((result) => {
      window.clearTimeout(this.slowTimer);
      if (result.ok) {
        if (this.phase === 'starting') this.hide();
      } else {
        console.warn('[ORBIT ZERO] VR did not start:', result.problem.detail || result.problem.message);
        this.showProblem(result.problem);
      }
    });
  }

  private onButton(): void {
    if (this.buttonAction === 'reload') window.location.reload();
    else if (this.buttonAction === 'flat') this.hide();
    else this.enter();
  }

  private render(
    phase: XrEntryPhase,
    view: { status: string; button: string; enabled: boolean; action?: 'enter' | 'reload' | 'flat'; progress?: boolean; problem?: XrEntryProblem; flat?: boolean },
  ): void {
    window.clearTimeout(this.slowTimer);
    this.phase = phase;
    this.root.dataset.phase = phase;
    this.statusEl.textContent = view.status;
    this.statusEl.hidden = !view.status;
    this.progressEl.hidden = !view.progress;
    this.enterButton.textContent = view.button;
    this.enterButton.disabled = !view.enabled;
    this.buttonAction = view.action ?? 'enter';
    this.problemEl.hidden = !view.problem;
    this.problemMessageEl.textContent = view.problem?.message ?? '';
    this.problemHintEl.textContent = view.problem?.hint ?? '';
    this.problemDetailEl.textContent = view.problem?.detail ?? '';
    this.problemDetailEl.hidden = !view.problem?.detail;
    this.flatButton.hidden = !view.flat;
    this.root.hidden = false;
  }
}

let shared: XrEntryOverlay | null = null;

/** The page's single VR entry overlay (created on first use). */
export function getXrEntryOverlay(): XrEntryOverlay {
  if (!shared) shared = new XrEntryOverlay();
  return shared;
}

/** True while the overlay covers the page (loading, ready, starting, a problem). Never creates it. */
export function isXrEntryOverlayShowing(): boolean {
  return shared !== null && shared.getPhase() !== 'hidden';
}
