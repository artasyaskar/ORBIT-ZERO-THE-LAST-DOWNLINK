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
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
} from '@iwsdk/core';
import { bevelBox, mergeStaticMeshesByMaterial } from './lib/hardsurface';

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

  // 2. Battery Meter: Left Segmented Arc (10 segments into 1 InstancedMesh)
  const battGroup = new Group();
  battGroup.name = 'BatteryGaugeGroup';
  battGroup.position.set(-0.11, 0.013, 0);

  const battInstanced = new InstancedMesh(segGeo, gaugeSharedMat, 10);
  battInstanced.name = 'BatteryGaugeInstanced';
  battInstanced.instanceMatrix.setUsage(DynamicDrawUsage);

  for (let i = 0; i < 10; i++) {
    dummy.position.set((i - 4.5) * 0.0065, 0, 0);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    battInstanced.setMatrixAt(i, dummy.matrix);
    battInstanced.setColorAt(i, COLOR_CYAN);

    // Backward-compatible query proxy (hidden from rendering, 0 draw calls)
    const segProxy = new Mesh(segGeo, cyanLitMat);
    segProxy.name = `GaugeBattSeg_${i}`;
    segProxy.visible = false;
    battGroup.add(segProxy);
  }
  battInstanced.instanceMatrix.needsUpdate = true;
  if (battInstanced.instanceColor) battInstanced.instanceColor.needsUpdate = true;
  battGroup.add(battInstanced);
  root.add(battGroup);

  // 3. Storage Buffer Meter: Center Segmented Arc (9 segments into 1 InstancedMesh)
  const storageGroup = new Group();
  storageGroup.name = 'StorageGaugeGroup';
  storageGroup.position.set(0, 0.013, 0);

  const storageInstanced = new InstancedMesh(segGeo, gaugeSharedMat, 9);
  storageInstanced.name = 'StorageGaugeInstanced';
  storageInstanced.instanceMatrix.setUsage(DynamicDrawUsage);

  for (let i = 0; i < 9; i++) {
    dummy.position.set((i - 4) * 0.0065, 0, 0);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    storageInstanced.setMatrixAt(i, dummy.matrix);
    storageInstanced.setColorAt(i, COLOR_UNLIT);

    // Backward-compatible query proxy (hidden from rendering, 0 draw calls)
    const segProxy = new Mesh(segGeo, unlitMat);
    segProxy.name = `GaugeStorageSeg_${i}`;
    segProxy.visible = false;
    storageGroup.add(segProxy);
  }
  storageInstanced.instanceMatrix.needsUpdate = true;
  if (storageInstanced.instanceColor) storageInstanced.instanceColor.needsUpdate = true;
  storageGroup.add(storageInstanced);
  root.add(storageGroup);

  // 4. Downlink Window Meter: Right Segmented Arc (10 segments into 1 InstancedMesh)
  const windowGroup = new Group();
  windowGroup.name = 'WindowGaugeGroup';
  windowGroup.position.set(0.11, 0.013, 0);

  const windowInstanced = new InstancedMesh(segGeo, gaugeSharedMat, 10);
  windowInstanced.name = 'WindowGaugeInstanced';
  windowInstanced.instanceMatrix.setUsage(DynamicDrawUsage);

  for (let i = 0; i < 10; i++) {
    dummy.position.set((i - 4.5) * 0.0065, 0, 0);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    windowInstanced.setMatrixAt(i, dummy.matrix);
    windowInstanced.setColorAt(i, COLOR_UNLIT);

    // Backward-compatible query proxy (hidden from rendering, 0 draw calls)
    const segProxy = new Mesh(segGeo, unlitMat);
    segProxy.name = `GaugeWindowSeg_${i}`;
    segProxy.visible = false;
    windowGroup.add(segProxy);
  }
  windowInstanced.instanceMatrix.needsUpdate = true;
  if (windowInstanced.instanceColor) windowInstanced.instanceColor.needsUpdate = true;
  windowGroup.add(windowInstanced);
  root.add(windowGroup);

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
    new CylinderGeometry(0.018, 0.020, 0.006, 20),
    buttonBaseMat,
  );
  recenterBase.name = 'RecenterBaseFlange';
  recenterBase.position.set(0, 0.003, 0);
  recenterGroup.add(recenterBase);

  const recenterCap = new Mesh(
    new CylinderGeometry(0.014, 0.015, 0.008, 20),
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
    new CylinderGeometry(0.016, 0.018, 0.006, 18),
    buttonBaseMat,
  );
  ignitionBase.name = 'MasterIgnitionBase';
  ignitionBase.position.set(0, 0.003, 0);
  ignitionGroup.add(ignitionBase);

  const ignitionCap = new Mesh(
    new CylinderGeometry(0.012, 0.013, 0.010, 18),
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
    new CylinderGeometry(0.016, 0.018, 0.006, 18),
    buttonBaseMat,
  );
  beaconBase.name = 'AriaBeaconBase';
  beaconBase.position.set(0, 0.003, 0);
  beaconGroup.add(beaconBase);

  const beaconCap = new Mesh(
    new CylinderGeometry(0.012, 0.013, 0.009, 18),
    beaconCapMat,
  );
  beaconCap.name = 'AriaBeaconCap';
  beaconCap.position.set(0, 0.008, 0);
  beaconGroup.add(beaconCap);
  root.add(beaconGroup);

  // Consolidate static button bases by shared material to eliminate redundant draw calls
  mergeStaticMeshesByMaterial(root, [
    'PadIlluminatedCap',
    'MasterIgnitionCap',
    'AriaBeaconCap',
    'GaugesHousingBezel',
    'BatteryGaugeInstanced',
    'StorageGaugeInstanced',
    'WindowGaugeInstanced',
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

