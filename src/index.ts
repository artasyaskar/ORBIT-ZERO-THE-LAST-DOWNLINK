/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Main application bootstrap via Meta Immersive Web SDK (IWSDK 1.0.1).
 */

import { GrabSystem, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { MissionControlSystem } from './systems/missionControlSystem';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // Ensure hands-first pinch grabbing signal is enabled on IWSDK GrabSystem
  const grabSystem = world.getSystem(GrabSystem);
  if (grabSystem?.config?.useHandPinchForGrab) {
    grabSystem.config.useHandPinchForGrab.value = true;
  }

  world.registerSystem(MissionControlSystem);
});
