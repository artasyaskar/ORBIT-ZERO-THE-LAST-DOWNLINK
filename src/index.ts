/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Main Application Bootstrap & Entry Point
 *
 * Provides seamless routing between:
 * 1. Cinematic Landing Experience (3D Earth space environment, video briefing, audio, mode selection)
 * 2. Core Game Engine (Meta Immersive Web SDK 1.0.1, MissionControlSystem, spatial interactions)
 */

import { GrabSystem, VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import type { MissionScenarioId } from './mission/types';
import { MissionControlSystem } from './systems/missionControlSystem';
import { LandingController } from './landing/landingController';
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

  const world = await World.create(container, projectOptions);

  // Ensure hands-first pinch grabbing signal is enabled on IWSDK GrabSystem
  const grabSystem = world.getSystem(GrabSystem);
  if (grabSystem?.config?.useHandPinchForGrab) {
    grabSystem.config.useHandPinchForGrab.value = true;
  }

  world.registerSystem(MissionControlSystem);

  if (config.launchXR) {
    // requestSession() needs a live user gesture. World.create() above loads every critical asset first,
    // which can outlast Chromium's ~5 s activation window on a cold Quest cache. IWSDK's launchXR() also
    // swallows the async rejection, so a try/catch here never fires. Ask only while the gesture is live,
    // and offer a fresh tap target whenever no session exists shortly afterwards.
    const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    const gestureLive = activation ? activation.isActive : true;
    if (gestureLive) world.launchXR();
    window.setTimeout(() => {
      if (!world.session) showEnterVrButton(world);
    }, gestureLive ? 2500 : 0);
  }

  return world;
}

/** Full-width DOM button whose own click starts the immersive session (a fresh, valid user gesture). */
function showEnterVrButton(world: World): void {
  if (typeof document === 'undefined' || document.getElementById('oz-enter-vr-fallback')) return;
  const button = document.createElement('button');
  button.id = 'oz-enter-vr-fallback';
  button.type = 'button';
  button.textContent = 'TAP TO ENTER VR';
  button.style.cssText = 'position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:99999;min-width:320px;padding:22px 36px;background:#064e3b;color:#ecfeff;border:2px solid #34d399;border-radius:14px;font:800 22px/1 system-ui,sans-serif;letter-spacing:1px;cursor:pointer;';
  button.addEventListener('click', () => world.launchXR());
  document.body.appendChild(button);
  let unsubscribe: (() => void) | undefined;
  let done = false;
  unsubscribe = world.visibilityState.subscribe((state) => {
    if (state === VisibilityState.NonImmersive || done) return;
    done = true;
    button.remove();
    unsubscribe?.();
  });
  if (done) unsubscribe();
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
