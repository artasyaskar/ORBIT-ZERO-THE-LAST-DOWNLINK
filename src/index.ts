/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Main Application Bootstrap & Entry Point
 *
 * Provides seamless routing between:
 * 1. Cinematic Landing Experience (3D Earth space environment, video briefing, audio, mode selection)
 * 2. Core Game Engine (Meta Immersive Web SDK 1.0.1, MissionControlSystem, spatial interactions)
 */

import { GrabSystem, World } from '@iwsdk/core';
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
    try {
      await world.launchXR();
    } catch (err) {
      console.warn('[ORBIT ZERO] WebXR launch failed or not supported in this session:', err);
    }
  }

  return world;
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
    await initOrbitZeroGame({
      launchXR: selection.launchXR,
      initialScenarioId: selection.scenarioId,
      startTutorial: selection.startTutorial,
    });
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
