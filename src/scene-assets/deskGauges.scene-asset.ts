/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Procedural 3D Scene Asset: Diegetic Console Desk Arc Gauges
 *
 * Implements physical glowing curved/segmented bar meters embedded into the
 * cockpit console desk directly below the Earth Globe at [0.0, 0.788, -0.48]:
 * 1. Battery Bus Gauge (10 curved segments, 55 Wh total capacity)
 *    - Healthy (>44 Wh): Electric Cyan (0x06b6d4)
 *    - Nominal (20-44 Wh): Tactical Amber (0xf59e0b)
 *    - Critical (<20 Wh): Pulsing Hazard Red (0xef4444)
 * 2. Solid-State Buffer Storage Gauge (9 segments, 9 MB solid-state capacity)
 * 3. Karachi Contact Window Gauge (10 segments, 10.0s cutoff)
 *    - Warns and flashes red if queued downlink exceeds 10.0s window.
 */

import {
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
} from '@iwsdk/core';
import { bevelBox, mergeStaticMeshesByMaterial } from './lib/hardsurface';

export interface GaugeSegmentRange {
  start: number;
  count: number;
}

/** Instance ranges of the three meters inside the one gauge-segment InstancedMesh. */
export const GAUGE_SEGMENT_RANGES = {
  battery: { start: 0, count: 10 },
  storage: { start: 10, count: 9 },
  window: { start: 19, count: 10 },
} as const satisfies Record<string, GaugeSegmentRange>;
export const GAUGE_SEGMENT_COUNT = 29;
export const GAUGE_SEGMENTS_MESH_NAME = 'DeskGaugeSegmentsInstanced';

export function createDeskGaugesAsset(): Object3D {
  const root = new Group();
  root.name = 'DeskDiegeticGauges';

  // Base Housing Bezel Material
  const housingMat = new MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.35,
    metalness: 0.85,
  });

  // Dynamic Segment Palette Colors (used for InstancedMesh.setColorAt)
  const COLOR_UNLIT = new Color(0x1e293b);
  const COLOR_CYAN = new Color(0x38bdf8);
  const COLOR_AMBER = new Color(0xf59e0b);
  const COLOR_RED = new Color(0xef4444);

  // Dynamic Segment Materials (retained for backward compatibility on userData)
  const unlitMat = new MeshStandardMaterial({
    color: 0x1e293b,
    emissive: 0x0f172a,
    emissiveIntensity: 0.15,
    roughness: 0.6,
    metalness: 0.4,
  });

  const cyanLitMat = new MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1.25,
    roughness: 0.2,
    metalness: 0.5,
  });

  const amberLitMat = new MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xb45309,
    emissiveIntensity: 1.2,
    roughness: 0.2,
    metalness: 0.5,
  });

  const redLitMat = new MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0x991b1b,
    emissiveIntensity: 1.35,
    roughness: 0.2,
    metalness: 0.5,
  });

  // 1. Recessed Titanium Instrument Well Bed
  const bezelPlate = new Mesh(
    bevelBox(0.36, 0.012, 0.088, 0.003, 0.006, 2),
    housingMat,
  );
  bezelPlate.name = 'GaugesHousingBezel';
  bezelPlate.position.set(0, 0.006, 0);
  root.add(bezelPlate);

  const segGeo = new CylinderGeometry(0.0022, 0.0022, 0.018, 6);
  const gaugeSharedMat = new MeshBasicMaterial({ color: 0xffffff });
  const dummy = new Object3D();

  // All 29 segments of the three meters are one InstancedMesh (one draw call); each meter owns a range of
  // instances (GAUGE_SEGMENT_RANGES) whose colours the mission system rewrites when the readings change.
  const segments = new InstancedMesh(segGeo, gaugeSharedMat, GAUGE_SEGMENT_COUNT);
  segments.name = GAUGE_SEGMENTS_MESH_NAME;
  const meters: Array<{ group: string; x: number; range: GaugeSegmentRange; proxy: string; mat: MeshStandardMaterial; color: Color }> = [
    // 2. Battery Meter: left (10 segments)
    { group: 'BatteryGaugeGroup', x: -0.11, range: GAUGE_SEGMENT_RANGES.battery, proxy: 'GaugeBattSeg', mat: cyanLitMat, color: COLOR_CYAN },
    // 3. Storage Buffer Meter: centre (9 segments)
    { group: 'StorageGaugeGroup', x: 0, range: GAUGE_SEGMENT_RANGES.storage, proxy: 'GaugeStorageSeg', mat: unlitMat, color: COLOR_UNLIT },
    // 4. Downlink Window Meter: right (10 segments)
    { group: 'WindowGaugeGroup', x: 0.11, range: GAUGE_SEGMENT_RANGES.window, proxy: 'GaugeWindowSeg', mat: unlitMat, color: COLOR_UNLIT },
  ];
  for (const meter of meters) {
    const group = new Group();
    group.name = meter.group;
    group.position.set(meter.x, 0.013, 0);
    const centre = (meter.range.count - 1) / 2;
    for (let i = 0; i < meter.range.count; i++) {
      dummy.position.set(meter.x + (i - centre) * 0.0065, 0.013, 0);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      segments.setMatrixAt(meter.range.start + i, dummy.matrix);
      segments.setColorAt(meter.range.start + i, meter.color);

      // Backward-compatible query proxy (hidden from rendering, 0 draw calls)
      const segProxy = new Mesh(segGeo, meter.mat);
      segProxy.name = `${meter.proxy}_${i}`;
      segProxy.visible = false;
      group.add(segProxy);
    }
    root.add(group);
  }
  segments.instanceMatrix.needsUpdate = true;
  if (segments.instanceColor) segments.instanceColor.needsUpdate = true;
  root.add(segments);

  // 5. Tactile Recenter Button (The Airplane Seat Test)
  // Mounted directly at the center front bezel lip [0.0, 0.010, 0.034] within 40cm reach
  const recenterGroup = new Group();
  recenterGroup.name = 'RecenterDeskButton';
  recenterGroup.position.set(0.0, 0.010, 0.034);

  // Reusing housingMat for button base flanges allows static merge with GaugesHousingBezel
  const buttonBaseMat = housingMat;

  const recenterCapMat = new MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x059669,
    emissiveIntensity: 0.95,
    roughness: 0.25,
    metalness: 0.5,
  });
  recenterCapMat.name = 'RecenterCapMat';

  const recenterBase = new Mesh(
    new CylinderGeometry(0.018, 0.020, 0.006, 10),
    buttonBaseMat,
  );
  recenterBase.name = 'RecenterBaseFlange';
  recenterBase.position.set(0, 0.003, 0);
  recenterGroup.add(recenterBase);

  const recenterCap = new Mesh(
    new CylinderGeometry(0.014, 0.015, 0.008, 10),
    recenterCapMat,
  );
  recenterCap.name = 'PadIlluminatedCap'; // Matches existing press stroke logic!
  recenterCap.position.set(0, 0.008, 0);
  recenterGroup.add(recenterCap);
  root.add(recenterGroup);

  // 6. Master Power Ignition Breaker (60-Second Cold-Start Hook)
  // Mounted at [-0.14, 0.010, 0.034]
  const ignitionGroup = new Group();
  ignitionGroup.name = 'MasterIgnitionSwitch';
  ignitionGroup.position.set(-0.14, 0.010, 0.034);

  const ignitionCapMat = new MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 1.1,
    roughness: 0.25,
    metalness: 0.6,
  });
  ignitionCapMat.name = 'MasterIgnitionCapMat';

  const ignitionBase = new Mesh(
    new CylinderGeometry(0.016, 0.018, 0.006, 10),
    buttonBaseMat,
  );
  ignitionBase.name = 'MasterIgnitionBase';
  ignitionBase.position.set(0, 0.003, 0);
  ignitionGroup.add(ignitionBase);

  const ignitionCap = new Mesh(
    new CylinderGeometry(0.012, 0.013, 0.010, 10),
    ignitionCapMat,
  );
  ignitionCap.name = 'MasterIgnitionCap';
  ignitionCap.position.set(0, 0.009, 0);
  ignitionGroup.add(ignitionCap);
  root.add(ignitionGroup);

  // 7. ARIA Tactical Co-Pilot Delegation Beacon (Deep Agentic Interaction)
  // Mounted at [0.14, 0.010, 0.034]
  const beaconGroup = new Group();
  beaconGroup.name = 'AriaDelegationBeacon';
  beaconGroup.position.set(0.14, 0.010, 0.034);

  const beaconCapMat = new MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1.25,
    roughness: 0.20,
    metalness: 0.7,
  });
  beaconCapMat.name = 'AriaBeaconCapMat';

  const beaconBase = new Mesh(
    new CylinderGeometry(0.016, 0.018, 0.006, 10),
    buttonBaseMat,
  );
  beaconBase.name = 'AriaBeaconBase';
  beaconBase.position.set(0, 0.003, 0);
  beaconGroup.add(beaconBase);

  const beaconCap = new Mesh(
    new CylinderGeometry(0.012, 0.013, 0.009, 10),
    beaconCapMat,
  );
  beaconCap.name = 'AriaBeaconCap';
  beaconCap.position.set(0, 0.008, 0);
  beaconGroup.add(beaconCap);
  root.add(beaconGroup);

  // The bezel and the three button flanges share housingMat: one static mesh, named GaugesHousingBezel
  // (the bezel comes first). The button caps move and light up, so they stay separate.
  mergeStaticMeshesByMaterial(root, [
    'PadIlluminatedCap',
    'MasterIgnitionCap',
    'AriaBeaconCap',
    GAUGE_SEGMENTS_MESH_NAME,
  ]);

  // Store preallocated color palette and material references on userData
  root.userData.colors = {
    unlit: COLOR_UNLIT,
    cyan: COLOR_CYAN,
    amber: COLOR_AMBER,
    red: COLOR_RED,
  };

  root.userData.materials = {
    unlit: unlitMat,
    cyan: cyanLitMat,
    amber: amberLitMat,
    red: redLitMat,
  };

  return root;
}

