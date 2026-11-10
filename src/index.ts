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
import { PerfMonitorSystem } from './systems/perfMonitor';
import { LandingController } from './landing/landingController';
import { defaultCampaignCard } from './landing/landingUI';
import { getXrEntryOverlay } from './ui/xrEntryOverlay';
import { detectImmersiveVr, isStandaloneHeadsetBrowser } from './ui/xrEntryText';
import './landing/landing.css';

export interface OrbitZeroLaunchConfig {
  launchXR?: boolean;
  initialScenarioId?: MissionScenarioId;
  startTutorial?: boolean;
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
    overlay.showLoading();
  }

  let world: World;
  try {
    world = await World.create(container, projectOptions);
  } catch (err) {
    if (overlay) overlay.showLoadFailed(err);
    throw err;
  }

  // Ensure hands-first pinch grabbing signal is enabled on IWSDK GrabSystem
  const grabSystem = world.getSystem(GrabSystem);
  if (grabSystem?.config?.useHandPinchForGrab) {
    grabSystem.config.useHandPinchForGrab.value = true;
  }

  world.registerSystem(MissionControlSystem);
  // Frame-time monitor + adaptive quality (refresh-rate fallback, lower resolution after a slow session).
  // `?perf=1` adds the readout and the 60 s summary.
  world.registerSystem(PerfMonitorSystem);

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
}

/**
 * Headset visitors: load the game at once behind a one-button lobby. The tap on ENTER VR is the user
 * gesture requestSession() needs, so entry is one tap; failures show a message and TRY AGAIN.
 */
function startHeadsetLobby(scenarioId: MissionScenarioId | null, tutorial: boolean): void {
  const overlay = getXrEntryOverlay();
  overlay.showLoading();
  const support = detectImmersiveVr(navigator.xr, window.isSecureContext);
  const card = defaultCampaignCard();
  initOrbitZeroGame({
    launchXR: false,
    initialScenarioId: scenarioId ?? card.scenarioId,
    startTutorial: scenarioId ? tutorial : card.startTutorial,
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
  // Note: @iwsdk/vite-plugin-dev injects window.IWER_DEVICE in local dev, which spoofs navigator.userAgent
  // to OculusBrowser/Quest 3 on a desktop PC. Do not treat desktop IWER dev injection as a physical headset
  // unless ?headset is explicitly requested, so the Landing Page (Hero -> VR or Desktop selector) opens first.
  const isDevInjectedIwer = typeof window !== 'undefined' && Boolean((window as any).IWER_DEVICE);
  const headsetVisit =
    !forceLanding &&
    Boolean(urlParams?.has('headset') || (!isDevInjectedIwer && isStandaloneHeadsetBrowser(navigator.userAgent)));
  if (headsetVisit) {
    startHeadsetLobby(urlScenario, urlTutorial);
    return;
  }

  // Standard user entry: Cinematic Landing Experience
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
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
}
