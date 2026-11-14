/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Rules and plain-language text for entering VR. Pure: no DOM, no Three.js, no IWSDK, so every
 * message a player can see when VR does not start is unit-tested (tests/xrEntryText.test.ts).
 */

/** Result of WebXR feature detection for an immersive VR session. */
export type XrSupport = 'supported' | 'unsupported' | 'no-webxr' | 'insecure' | 'blocked' | 'unknown';

/** What went wrong, what to do now, and the raw error for bug reports. */
export interface XrEntryProblem {
  message: string;
  hint: string;
  detail: string;
}

export const XR_ENTRY_TEXT = {
  title: 'ORBIT ZERO',
  subtitle: 'THE LAST DOWNLINK',
  lead: 'Seated VR. Your hands do everything. Controllers work too.',
  loading: 'Loading the mission...',
  ready: 'Ready. One tap to enter VR.',
  starting: 'Starting VR...',
  slow: 'Still waiting for the headset. If nothing happens, reload the page.',
  returned: 'You left VR. Tap ENTER VR to go back in.',
  enter: 'ENTER VR',
  retry: 'TRY AGAIN',
  loadingButton: 'LOADING...',
  startingButton: 'STARTING...',
  reload: 'RELOAD',
  playOnScreen: 'PLAY ON THIS SCREEN',
  playOnScreenLink: 'Play on this screen instead',
} as const;

/**
 * Standalone headset browsers (Meta Quest Browser, Pico, Wolvic). This only chooses the first screen
 * (skip the cinematic landing). Whether the VR button works is decided by feature detection.
 */
const HEADSET_BROWSER_UA = /OculusBrowser|\bQuest\b|PicoBrowser|Pico Neo|Wolvic/i;

export function isStandaloneHeadsetBrowser(userAgent: string | undefined): boolean {
  return Boolean(userAgent && HEADSET_BROWSER_UA.test(userAgent));
}

interface XrSystemLike {
  isSessionSupported?: (mode: 'immersive-vr') => Promise<boolean>;
}

/**
 * Feature detection: secure context, navigator.xr, isSessionSupported('immersive-vr'). A slow or
 * throwing check returns 'unknown' (let the player try; the request itself reports the real error).
 */
export async function detectImmersiveVr(
  xr: XrSystemLike | undefined,
  secureContext: boolean | undefined,
  timeoutMs = 4000,
): Promise<XrSupport> {
  if (secureContext === false) return 'insecure';
  if (!xr || typeof xr.isSessionSupported !== 'function') return 'no-webxr';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const answer = await Promise.race([
      xr.isSessionSupported('immersive-vr'),
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
      }),
    ]);
    if (answer === 'timeout') return 'unknown';
    return answer ? 'supported' : 'unsupported';
  } catch (error) {
    return errorName(error) === 'SecurityError' ? 'blocked' : 'unknown';
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : '';
}

function errorDetail(error: unknown): string {
  if (error === undefined || error === null) return '';
  if (typeof error === 'object' && 'message' in error) {
    const name = errorName(error) || 'Error';
    return `${name}: ${String((error as { message: unknown }).message)}`;
  }
  return String(error);
}

/** Message for a browser or page that cannot open VR at all (feature detection said no). */
export function supportProblem(support: Exclude<XrSupport, 'supported' | 'unknown'>): XrEntryProblem {
  switch (support) {
    case 'insecure':
      return { message: 'VR only works on a secure page.', hint: 'Open the https:// link of the game.', detail: 'window.isSecureContext is false' };
    case 'blocked':
      return { message: 'This page is not allowed to open VR.', hint: 'Open the game link directly, not inside another site.', detail: 'isSessionSupported rejected with SecurityError' };
    case 'no-webxr':
      return { message: 'This browser cannot open VR.', hint: 'On Meta Quest, open the link in the Meta Quest Browser. You can also play on this screen.', detail: 'navigator.xr is missing' };
    case 'unsupported':
      return { message: 'No VR headset was found.', hint: 'Open this link in the Meta Quest Browser, or play on this screen.', detail: "isSessionSupported('immersive-vr') is false" };
  }
}

/** Message for a rejected requestSession(), from the WebXR error name. */
export function launchProblem(error: unknown): XrEntryProblem {
  const detail = errorDetail(error);
  switch (errorName(error)) {
    case 'NotAllowedError':
      return { message: 'The headset did not allow VR to start.', hint: 'Tap TRY AGAIN and accept any prompt in the headset.', detail };
    case 'SecurityError':
      return { message: 'This page is not allowed to open VR.', hint: 'Open the game link directly (https), not inside another site.', detail };
    case 'NotSupportedError':
      return { message: 'This browser cannot start VR for this game.', hint: 'Update the browser, or play on this screen.', detail };
    case 'InvalidStateError':
      return { message: 'Another VR session is still open.', hint: 'Close it, then tap TRY AGAIN.', detail };
    case 'AbortError':
      return { message: 'VR did not start.', hint: 'Wake the headset or squeeze a controller trigger, then tap TRY AGAIN.', detail };
    default:
      return { message: 'VR did not start.', hint: 'Tap TRY AGAIN. If it fails again, reload the page.', detail };
  }
}

/** The session opened, but the game could not take it over (for example no usable floor space). */
export const SETUP_PROBLEM: XrEntryProblem = {
  message: 'VR opened but could not finish setting up.',
  hint: 'Tap TRY AGAIN. If it fails again, reload the page.',
  detail: 'The session ended before the game could use it.',
};

export function loadProblem(error: unknown): XrEntryProblem {
  return { message: 'The mission could not load.', hint: 'Check the connection, then reload the page.', detail: errorDetail(error) };
}
