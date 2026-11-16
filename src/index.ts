/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Main Application Bootstrap & Entry Point
 *
 * Provides seamless routing between:
 * 1. Cinematic Landing Experience (3D Earth space environment, video briefing, audio, mode selection)
 * 2. Headset lobby: headset browsers skip the landing (no 3D landing scene, no voice-over download) and
 *    get one ENTER VR button as soon as the game has loaded
 * 3. Core Game Engine (Meta Immersive Web SDK 1.0.1, MissionControlSystem, spatial interactions)
 */

import { GrabSystem, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import type { MissionScenarioId } from './mission/types';
import { MissionControlSystem } from './systems/missionControlSystem';
import { unlockOrbitalAudioGesture } from './systems/orbitalAudio';
import { loadMissionProfile } from './systems/missionProfile';
import { PerfMonitorSystem } from './systems/perfMonitor';
import { getXrEntryOverlay } from './ui/xrEntryOverlay';
import { detectImmersiveVr, isStandaloneHeadsetBrowser } from './ui/xrEntryText';

export interface OrbitZeroLaunchConfig {
  launchXR?: boolean;
  initialScenarioId?: MissionScenarioId;
  startTutorial?: boolean;
  onProgress?: (stage: string) => void;
}

/**
 * Lightweight desktop boot overlay shown while World.create() loads 3D scene textures & panels
 * so desktop players never stare at a blank black screen between Landing and Mission Control.
 */
function showDesktopBootLoader(initialStage: string): { setStage: (s: string) => void; remove: () => void } {
  if (typeof document === 'undefined') {
    return { setStage: () => {}, remove: () => {} };
  }
  const existing = document.getElementById('oz-desktop-boot-loader');
  if (existing) existing.remove();

  const styleId = 'oz-desktop-boot-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes ozBootSpin { to { transform: rotate(360deg); } }
      @keyframes ozBootPulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
    `;
    document.head.appendChild(style);
  }

  const root = document.createElement('div');
  root.id = 'oz-desktop-boot-loader';
  root.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99998', 'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:center', 'gap:14px',
    'background:radial-gradient(circle at 50% 42%, rgba(14,42,78,0.65), #040a17 72%)',
    'color:#f8fafc', 'font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    'pointer-events:auto', 'transition:opacity 0.22s ease',
  ].join(';');
  root.innerHTML = `
    <div style="position:relative;width:64px;height:64px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;inset:0;border-radius:50%;border:2px solid rgba(56,189,248,0.18);border-top-color:#38bdf8;border-right-color:#22d3ee;animation:ozBootSpin 1.1s linear infinite;"></div>
      <div style="position:absolute;inset:10px;border-radius:50%;border:1.5px solid rgba(251,191,36,0.22);border-bottom-color:#fbbf24;animation:ozBootSpin 1.8s linear infinite reverse;"></div>
      <div style="width:10px;height:10px;border-radius:50%;background:#38bdf8;box-shadow:0 0 14px #38bdf8;animation:ozBootPulse 1.4s ease-in-out infinite;"></div>
    </div>
    <div style="font-size:11px;font-weight:800;letter-spacing:2.4px;color:#38bdf8;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;">ORBIT ZERO // TELEMETRY INITIALIZATION</div>
    <div id="oz-desktop-boot-stage" style="font-size:14px;font-weight:600;color:#cbd5e1;"></div>
  `;
  const stageEl = root.querySelector('#oz-desktop-boot-stage') as HTMLDivElement;
  stageEl.textContent = initialStage;
  document.body.appendChild(root);

  let removed = false;
  return {
    setStage: (s: string) => {
      if (!removed) stageEl.textContent = s;
    },
    remove: () => {
      if (removed) return;
      removed = true;
      root.style.opacity = '0';
      setTimeout(() => root.remove(), 220);
    },
  };
}

/**
 * Initializes the core ORBIT ZERO WebXR / Desktop game world.
 * Isolates the game lifecycle from the landing experience.
 */
export async function initOrbitZeroGame(
  launchOrConfig: boolean | OrbitZeroLaunchConfig = false,
): Promise<World> {
  const config: OrbitZeroLaunchConfig =
    typeof launchOrConfig === 'boolean'
      ? { launchXR: launchOrConfig }
      : launchOrConfig;

  const container = document.getElementById('scene-container') as HTMLDivElement;
  if (!container) {
    throw new Error('[ORBIT ZERO] Missing #scene-container element in DOM');
  }

  // Pass initial scenario / tutorial intent via window globals read by MissionControlSystem.init()
  if (typeof window !== 'undefined') {
    (window as any).__ORBIT_INITIAL_SCENARIO__ = config.initialScenarioId;
    (window as any).__ORBIT_START_TUTORIAL__ = Boolean(config.startTutorial);
  }

  // Ensure container is clean and visible
  container.style.display = 'block';

  // When ENTER VR is clicked on the Landing Page, show the XR loading overlay immediately
  // while World.create() downloads and builds the 3D cockpit and UIKitML panels.
  const overlay = config.launchXR ? getXrEntryOverlay() : null;
  if (overlay) {
    unlockOrbitalAudioGesture();
    overlay.showLoading('Loading 3D cockpit & orbital globe...');
  }
  const desktopBoot = !overlay && !config.onProgress
    ? showDesktopBootLoader('Loading 3D cockpit & orbital globe...')
    : null;
  config.onProgress?.('Loading 3D cockpit & orbital globe...');

  try {
    let world: World;
    try {
      world = await World.create(container, projectOptions);
    } catch (err) {
      if (overlay) overlay.showLoadFailed(err);
      throw err;
    }

    const stageText = 'Initializing mission console & telemetry...';
    if (overlay) overlay.setLoadingStage(stageText);
    desktopBoot?.setStage(stageText);
    config.onProgress?.(stageText);

    // Ensure hands-first pinch grabbing signal is enabled on IWSDK GrabSystem
    const grabSystem = world.getSystem(GrabSystem);
    if (grabSystem?.config?.useHandPinchForGrab) {
      grabSystem.config.useHandPinchForGrab.value = true;
    }

    // Frame-time monitor + adaptive quality (refresh-rate fallback, lower resolution after a slow session).
    // Register before MissionControlSystem so window.__ORBIT_PERF__.setDiagnosticsProvider is available in init().
    // `?perf=1` adds the readout and the 60 s summary.
    world.registerSystem(PerfMonitorSystem);
    world.registerSystem(MissionControlSystem);

    if (overlay) {
      // requestSession() needs a live user gesture. World.create() above loads every critical asset first,
      // which can outlast Chromium's ~5 s activation window on a cold Quest cache. Ask only while the gesture
      // is live; otherwise (or if the request fails) the overlay offers a fresh tap with a plain message.
      overlay.attach(world, { promptOnReturn: true });
      const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
      const gestureLive = activation ? activation.isActive : true;
      if (gestureLive) overlay.enter();
      else overlay.showReady();
    }

    return world;
  } finally {
    desktopBoot?.remove();
  }
}

/**
 * Headset visitors: load the game at once behind a one-button lobby. The tap on ENTER VR is the user
 * gesture requestSession() needs, so entry is one tap; failures show a message and TRY AGAIN.
 */
function startHeadsetLobby(scenarioId: MissionScenarioId | null, tutorial: boolean): void {
  const overlay = getXrEntryOverlay();
  overlay.showLoading('Loading 3D cockpit & orbital globe...');
  const support = detectImmersiveVr(navigator.xr, window.isSecureContext);
  const tutorialComplete = loadMissionProfile().tutorialComplete;
  initOrbitZeroGame({
    launchXR: false,
    initialScenarioId: scenarioId ?? (tutorialComplete ? 'FIRELINE_PASS' : 'ORBITAL_ACADEMY'),
    startTutorial: scenarioId ? tutorial : !tutorialComplete,
    onProgress: (stage) => overlay.setLoadingStage(stage),
  })
    .then(async (world) => {
      overlay.attach(world, { promptOnReturn: true });
      if (world.session) return;
      const result = await support;
      if (world.session) return;
      if (result === 'supported' || result === 'unknown') overlay.showReady();
      else overlay.showUnavailable(result);
    })
    .catch((err) => {
      console.error('[ORBIT ZERO] Headset lobby: the game failed to load:', err);
      overlay.showLoadFailed(err);
    });
}

function showLaunchNotice(message: string): void {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.setAttribute('role', 'alert');
  el.textContent = message;
  el.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:99999;max-width:560px;padding:12px 18px;background:#1e293b;color:#f8fafc;border:1px solid #f59e0b;border-radius:8px;font:14px/1.4 system-ui,sans-serif;';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 9000);
}

// =============================================================================
// ROUTING & BOOTSTRAP LOGIC
// =============================================================================

function bootstrap(): void {
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const forceLanding = Boolean(urlParams?.has('landing'));
  const forceGame = Boolean(urlParams?.has('game') || urlParams?.has('skipLanding'));
  const urlScenario = urlParams?.get('scenario') as MissionScenarioId | null;
  const urlTutorial = Boolean(urlParams?.has('tutorial'));
  const isAutomatedTestWithoutLanding = Boolean(
    !forceLanding &&
    typeof window !== 'undefined' &&
    (window as any).__ORBIT_SKIP_LANDING__
  );

  // Fast-track directly to game when requested via query parameter or existing automated test runners
  if (forceGame || isAutomatedTestWithoutLanding) {
    initOrbitZeroGame({
      launchXR: false,
      initialScenarioId: urlScenario ?? undefined,
      startTutorial: urlTutorial,
    }).catch((err) => {
      console.error('[ORBIT ZERO] Direct game bootstrap failed:', err);
    });
    return;
  }

  // Headset browsers (or ?headset) skip the cinematic landing; ?landing shows it anyway.
  // Note: @iwsdk/vite-plugin-dev injects window.IWER_DEVICE in `vite dev`, which spoofs navigator.userAgent
  // to OculusBrowser/Quest 3 on a desktop PC. Scope that check to dev (`import.meta.env.DEV`) so the Landing Page
  // opens first during local desktop dev, while production Quest/emulator builds still open the headset lobby.
  const isDevInjectedIwer = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV)
    && typeof window !== 'undefined' && Boolean((window as any).IWER_DEVICE);
  const headsetVisit =
    !forceLanding &&
    Boolean(urlParams?.has('headset') || (!isDevInjectedIwer && isStandaloneHeadsetBrowser(navigator.userAgent)));
  if (headsetVisit) {
    startHeadsetLobby(urlScenario, urlTutorial);
    return;
  }

  // Standard user entry: Cinematic Landing Experience (lazy-loaded so Quest headset boots skip landing assets)
  void import('./landing/landing.css')
    .then(() => import('./landing/landingController'))
    .then(({ LandingController }) => {
      const landing = new LandingController(document.body, async (selection) => {
        try {
          await initOrbitZeroGame({
            launchXR: selection.launchXR,
            initialScenarioId: selection.scenarioId,
            startTutorial: selection.startTutorial,
          });
        } catch (err) {
          console.error('[ORBIT ZERO] Game launch failed:', err);
          showLaunchNotice('Mission launch failed. Reload the page to return to the menu.');
        }
      });

      (window as any).__ORBIT_LANDING_CONTROLLER__ = landing;
    })
    .catch((err) => {
      console.error('[ORBIT ZERO] Landing controller load failed:', err);
      showLaunchNotice('Landing screen failed to load. Reload the page or append ?headset to enter cockpit.');
    });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
}
