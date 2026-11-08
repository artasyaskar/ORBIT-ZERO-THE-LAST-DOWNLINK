/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Canonical IWSDK 1.0.1 Asset Manifest (Evaluated in both runtime and editor realms).
 * NASA Blue Marble 2K Earth textures, procedural console/globe/CubeSat/hardware models, and spatial
 * UIKitML panels. No GLB model is loaded in the headset scene.
 */

import { AssetType, defineAssets } from '@iwsdk/core';
import {
  createEarthGlobeAsset,
  createOrbitZeroCubeSatAsset,
  createSectorMarkerAsset,
} from './scene-assets/earthGlobe.scene-asset';
import { createOrbitalConsoleAsset } from './scene-assets/orbitalConsole.scene-asset';
import {
  createConsolePadAsset,
  createDataCubeAsset,
  createScannerToolAsset,
} from './scene-assets/tactileHardware.scene-asset';
import { createAvatarAriaAsset } from './scene-assets/avatarAria.scene-asset';
import { createDeskGaugesAsset } from './scene-assets/deskGauges.scene-asset';
import { createSwathPlungerAsset } from './scene-assets/swathPlunger.scene-asset';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  'avatar-aria': createAvatarAriaAsset(),
  'desk-gauges': createDeskGaugesAsset(),
  'swath-plunger': createSwathPlungerAsset(),
  'orbital-console': createOrbitalConsoleAsset(),
  'earth-globe': createEarthGlobeAsset(),
  'nasa-cubesat': createOrbitZeroCubeSatAsset(),
  'earth-albedo-tex': {
    url: publicAssetUrl('assets/textures/earth_atmos_2048.jpg'),
    type: AssetType.Texture,
    priority: 'critical',
    name: 'NASA Blue Marble Albedo 2K',
  },
  'earth-normal-tex': {
    url: publicAssetUrl('assets/textures/earth_normal_2048.jpg'),
    type: AssetType.Texture,
    priority: 'critical',
    name: 'NASA Earth Topographic Normal Map 2K',
  },
  'earth-specular-tex': {
    url: publicAssetUrl('assets/textures/earth_specular_2048.jpg'),
    type: AssetType.Texture,
    priority: 'critical',
    name: 'NASA Earth Specular Water Mask 2K',
  },
  'earth-clouds-tex': {
    url: publicAssetUrl('assets/textures/earth_clouds_1024.png'),
    type: AssetType.Texture,
    priority: 'critical',
    name: 'NASA Earth Cloud Cover 1K',
  },
  'sector-beacon-clear': createSectorMarkerAsset(false, 0x38bdf8),
  'sector-beacon-cloudy': createSectorMarkerAsset(true, 0xf59e0b),
  'scanner-tool': createScannerToolAsset(),
  'evidence-cube-cyan': createDataCubeAsset(0x38bdf8),
  'evidence-cube-amber': createDataCubeAsset(0xf59e0b),
  'evidence-cube-emerald': createDataCubeAsset(0x10b981),
  'console-pad-cyan': createConsolePadAsset(0x38bdf8),
  'console-pad-amber': createConsolePadAsset(0xf59e0b),
  'console-pad-emerald': createConsolePadAsset(0x10b981),
  'console-pad-mint': createConsolePadAsset(0x34d399),
  'console-pad-coral': createConsolePadAsset(0xef4444),
  'briefing-panel': {
    url: publicAssetUrl('ui/briefing-panel.uikitml'),
    type: AssetType.UIKitML,
    name: 'Briefing Panel',
  },
  'telemetry-hud': {
    url: publicAssetUrl('ui/telemetry-hud.uikitml'),
    type: AssetType.UIKitML,
    name: 'Telemetry HUD',
  },
  'debrief-panel': {
    url: publicAssetUrl('ui/debrief-panel.uikitml'),
    type: AssetType.UIKitML,
    name: 'Debrief Panel',
  },
  'mission-hud': {
    url: publicAssetUrl('ui/mission-hud.uikitml'),
    type: AssetType.UIKitML,
    name: 'Forward Mission HUD',
  },
});
