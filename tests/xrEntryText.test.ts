import { describe, expect, it } from 'vitest';
import {
  detectImmersiveVr,
  isStandaloneHeadsetBrowser,
  launchProblem,
  loadProblem,
  SETUP_PROBLEM,
  supportProblem,
  XR_ENTRY_TEXT,
} from '../src/ui/xrEntryText';

const QUEST_3_UA =
  'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/39.2.0.0.56.754450099 Chrome/136.0.7103.177 VR Safari/537.36';
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

const dom = (name: string, message = 'test') => Object.assign(new Error(message), { name });

describe('VR entry rules and messages', () => {
  it('routes standalone headset browsers to the lobby and desktop browsers to the landing', () => {
    expect(isStandaloneHeadsetBrowser(QUEST_3_UA)).toBe(true);
    expect(isStandaloneHeadsetBrowser('Mozilla/5.0 (X11; Linux x86_64; Quest 2) OculusBrowser/30.0 Chrome/120 VR Safari/537.36')).toBe(true);
    expect(isStandaloneHeadsetBrowser(DESKTOP_CHROME_UA)).toBe(false);
    expect(isStandaloneHeadsetBrowser('')).toBe(false);
    expect(isStandaloneHeadsetBrowser(undefined)).toBe(false);
  });

  it('feature detection: insecure page, missing navigator.xr, supported, unsupported, blocked, slow', async () => {
    const xr = (answer: boolean) => ({ isSessionSupported: async () => answer });
    expect(await detectImmersiveVr(xr(true), false)).toBe('insecure');
    expect(await detectImmersiveVr(undefined, true)).toBe('no-webxr');
    expect(await detectImmersiveVr({}, true)).toBe('no-webxr');
    expect(await detectImmersiveVr(xr(true), true)).toBe('supported');
    expect(await detectImmersiveVr(xr(false), true)).toBe('unsupported');
    expect(await detectImmersiveVr({ isSessionSupported: () => Promise.reject(dom('SecurityError')) }, true)).toBe('blocked');
    expect(await detectImmersiveVr({ isSessionSupported: () => Promise.reject(dom('UnknownError')) }, true)).toBe('unknown');
    expect(await detectImmersiveVr({ isSessionSupported: () => new Promise<boolean>(() => {}) }, true, 20)).toBe('unknown');
  });

  it('every rejected requestSession gets a plain message, an action and the raw error', () => {
    const cases: [string, RegExp][] = [
      ['NotAllowedError', /did not allow VR to start/],
      ['SecurityError', /not allowed to open VR/],
      ['NotSupportedError', /cannot start VR/],
      ['InvalidStateError', /Another VR session/],
      ['AbortError', /^VR did not start\.$/],
    ];
    for (const [name, message] of cases) {
      const p = launchProblem(dom(name, 'reason from the browser'));
      expect(p.message).toMatch(message);
      expect(p.hint.length).toBeGreaterThan(10);
      expect(p.detail).toBe(`${name}: reason from the browser`);
    }
    expect(launchProblem(dom('NotAllowedError')).hint).toMatch(/TRY AGAIN/);
    expect(launchProblem(undefined)).toMatchObject({ message: 'VR did not start.', detail: '' });
  });

  it('feature-detection, setup and load problems are plain sentences without WebXR jargon', () => {
    const all = [
      supportProblem('insecure'),
      supportProblem('blocked'),
      supportProblem('no-webxr'),
      supportProblem('unsupported'),
      SETUP_PROBLEM,
      loadProblem(dom('TypeError', 'Failed to fetch')),
    ];
    for (const p of all) {
      expect(p.message).toMatch(/^[A-Z].*\.$/);
      expect(`${p.message} ${p.hint}`).not.toMatch(/requestSession|XRSession|immersive-vr|WebXR|DOMException/);
    }
    expect(loadProblem(dom('TypeError', 'Failed to fetch')).detail).toBe('TypeError: Failed to fetch');
    expect(XR_ENTRY_TEXT.enter).toBe('ENTER VR');
    expect(XR_ENTRY_TEXT.retry).toBe('TRY AGAIN');
  });
});
