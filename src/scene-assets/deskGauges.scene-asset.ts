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
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from '@iwsdk/core';
import { bevelBox } from './lib/hardsurface';

export function createDeskGaugesAsset(): Object3D {
  const root = new Group();
  root.name = 'DeskDiegeticGauges';

  // Base Housing Bezel Material
  const housingMat = new MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.35,
    metalness: 0.85,
  });

  // Dynamic Segment Materials
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

  // 2. Battery Meter: Left Segmented Arc (10 segments, 55 Wh)
  const battGroup = new Group();
  battGroup.name = 'BatteryGaugeGroup';
  battGroup.position.set(-0.11, 0.013, 0);

  const segGeo = new CylinderGeometry(0.0022, 0.0022, 0.018, 6);
  for (let i = 0; i < 10; i++) {
    const seg = new Mesh(segGeo, i < 10 ? cyanLitMat : unlitMat);
    seg.name = `GaugeBattSeg_${i}`;
    seg.rotation.set(Math.PI / 2, 0, 0);
    seg.position.set((i - 4.5) * 0.0065, 0, 0);
    battGroup.add(seg);
  }
  root.add(battGroup);

  // 3. Storage Buffer Meter: Center Segmented Arc (9 segments, 9 MB)
  const storageGroup = new Group();
  storageGroup.name = 'StorageGaugeGroup';
  storageGroup.position.set(0, 0.013, 0);

  for (let i = 0; i < 9; i++) {
    const seg = new Mesh(segGeo, unlitMat);
    seg.name = `GaugeStorageSeg_${i}`;
    seg.rotation.set(Math.PI / 2, 0, 0);
    seg.position.set((i - 4) * 0.0065, 0, 0);
    storageGroup.add(seg);
  }
  root.add(storageGroup);

  // 4. Downlink Window Meter: Right Segmented Arc (10 segments, 10.0s window)
  const windowGroup = new Group();
  windowGroup.name = 'WindowGaugeGroup';
  windowGroup.position.set(0.11, 0.013, 0);

  for (let i = 0; i < 10; i++) {
    const seg = new Mesh(segGeo, unlitMat);
    seg.name = `GaugeWindowSeg_${i}`;
    seg.rotation.set(Math.PI / 2, 0, 0);
    seg.position.set((i - 4.5) * 0.0065, 0, 0);
    windowGroup.add(seg);
  }
  root.add(windowGroup);

  // Store material palette on userData for zero-allocation runtime updates in missionControlSystem
  root.userData.materials = {
    unlit: unlitMat,
    cyan: cyanLitMat,
    amber: amberLitMat,
    red: redLitMat,
  };

  return root;
}

