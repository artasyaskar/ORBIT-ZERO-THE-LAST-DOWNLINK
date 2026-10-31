/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Canonical IWSDK 1.0.1 Asset Manifest (Evaluated in both runtime and editor realms).
 * Includes real NASA 3U CubeSat GLB spacecraft, NASA Blue Marble 2K Earth textures,
 * procedural hard-surface console/globe/hardware prototypes, and spatial UIKitML panels.
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

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  'avatar-aria': createAvatarAriaAsset(),
  'orbital-console': createOrbitalConsoleAsset(),
  'earth-globe': createEarthGlobeAsset(),
  'nasa-cubesat': createOrbitZeroCubeSatAsset(),
  'nasa-acrimsat': {
    url: publicAssetUrl('assets/models/nasa_acrimsat.glb'),
    type: AssetType.GLTF,
    priority: 'critical',
    name: 'NASA AcrimSAT Spacecraft',
  },
  'milky-way-tex': {
    url: publicAssetUrl('assets/textures/milky_way_skybox_4096.jpg'),
    type: AssetType.Texture,
    priority: 'critical',
    name: 'Milky Way Deep Space Cosmic Skybox',
  },
  'earth-albedo-tex': {
    url: publicAssetUrl('assets/textures/earth_atmos_4096.jpg'),
    type: AssetType.Texture,
    priority: 'critical',
    name: 'NASA Blue Marble Albedo 4K',
  },
  'earth-normal-tex': {
    url: publicAssetUrl('assets/textures/earth_normal_4096.jpg'),
    type: AssetType.Texture,
    priority: 'critical',
    name: 'NASA Earth Topographic Normal Map 4K',
  },
  'earth-specular-tex': {
    url: publicAssetUrl('assets/textures/earth_specular_4096.jpg'),
    type: AssetType.Texture,
    priority: 'critical',
    name: 'NASA Earth Specular Water Mask 4K',
  },
  'earth-clouds-tex': {
    url: publicAssetUrl('assets/textures/earth_clouds_1024.png'),
    type: AssetType.Texture,
    priority: 'critical',
    name: 'NASA Earth Cloud Cover 1K',
  },
  'earth-night-tex': {
    url: publicAssetUrl('assets/textures/earth_lights_4096.png'),
    type: AssetType.Texture,
    priority: 'critical',
    name: 'NASA Earth Night Lights 4K',
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
});
