/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * High-Craft Procedural 3D Hardware Assets:
 * 1. Handheld Dual-Aperture Orbital Sensor Scanner (Optical Multispectral + SAR Radar Twin Barrel)
 * 2. Open-Frame Titanium Holographic Evidence Data Cube (with 6 purposeful faces & runtime display plates)
 * 3. Guarded Aerospace Tactile Console Push-Switch
 */

import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  TorusGeometry,
} from '@iwsdk/core';
import { bevelBox, mergeStaticMeshesByMaterial } from './lib/hardsurface';

export function createScannerToolAsset(): Object3D {
  const root = new Group();
  root.name = 'OrbitalScannerTool';

  const titaniumMat = new MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.25,
    metalness: 0.84,
  });
  const gunmetalHousingMat = new MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.34,
    metalness: 0.72,
  });
  const gripPolymerMat = new MeshStandardMaterial({
    color: 0x0b111d,
    roughness: 0.68,
    metalness: 0.25,
  });
  const emitterMat = new MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.95,
    roughness: 0.18,
    metalness: 0.4,
  });

  // 1. Ergonomic Angled Instrument Grip & Titanium Pommel Base
  const pommelBase = new Mesh(
    bevelBox(0.056, 0.014, 0.072, 0.003, 0.008, 2),
    titaniumMat,
  );
  pommelBase.name = 'ScannerPommelBase';
  pommelBase.position.set(0, 0.007, 0.012);
  root.add(pommelBase);

  const gripHandle = new Mesh(
    bevelBox(0.044, 0.074, 0.052, 0.006, 0.012, 3),
    gripPolymerMat,
  );
  gripHandle.name = 'ScannerGripHandle';
  gripHandle.position.set(0, 0.046, 0.014);
  gripHandle.rotation.set(0.22, 0, 0);
  root.add(gripHandle);

  const triggerGuard = new Mesh(
    bevelBox(0.014, 0.048, 0.036, 0.002, 0.005, 2),
    titaniumMat,
  );
  triggerGuard.name = 'ScannerTriggerGuard';
  triggerGuard.position.set(0, 0.044, -0.02);
  root.add(triggerGuard);

  // 2. Twin-Barrel Upper Sensor Receiver Chassis
  const headHousing = new Mesh(
    bevelBox(0.088, 0.044, 0.112, 0.006, 0.014, 3),
    gunmetalHousingMat,
  );
  headHousing.name = 'ScannerSensorHead';
  headHousing.position.set(0, 0.092, -0.008);
  root.add(headHousing);

  const topRail = new Mesh(
    bevelBox(0.048, 0.01, 0.088, 0.002, 0.004, 2),
    titaniumMat,
  );
  topRail.name = 'ScannerTopTelemetryRail';
  topRail.position.set(0, 0.117, -0.006);
  root.add(topRail);

  // 3. Dual Front Sensor Barrels (Left: Optical Lens, Right: SAR Radar Feed Horn)
  const barrelCollarGeo = new CylinderGeometry(0.019, 0.021, 0.022, 20);
  const leftBarrel = new Mesh(barrelCollarGeo, titaniumMat);
  leftBarrel.name = 'ScannerOpticalBarrel';
  leftBarrel.rotation.set(Math.PI / 2, 0, 0);
  leftBarrel.position.set(-0.022, 0.092, -0.068);
  root.add(leftBarrel);

  const rightBarrel = new Mesh(barrelCollarGeo, titaniumMat);
  rightBarrel.name = 'ScannerRadarBarrel';
  rightBarrel.rotation.set(Math.PI / 2, 0, 0);
  rightBarrel.position.set(0.022, 0.092, -0.068);
  root.add(rightBarrel);

  // Glowing Lens Cores & Emitter Rings (tinted dynamically for OPTICAL vs RADAR)
  const lensCoreGeo = new CylinderGeometry(0.014, 0.014, 0.024, 18);
  const leftLensCore = new Mesh(lensCoreGeo, emitterMat);
  leftLensCore.name = 'ScannerApertureCore';
  leftLensCore.rotation.set(Math.PI / 2, 0, 0);
  leftLensCore.position.set(-0.022, 0.092, -0.07);
  root.add(leftLensCore);

  const rightLensCore = new Mesh(lensCoreGeo, emitterMat);
  rightLensCore.name = 'ScannerRadarCore';
  rightLensCore.rotation.set(Math.PI / 2, 0, 0);
  rightLensCore.position.set(0.022, 0.092, -0.07);
  root.add(rightLensCore);

  const emitterRing = new Mesh(
    new TorusGeometry(0.018, 0.003, 10, 24),
    emitterMat,
  );
  emitterRing.name = 'ScannerApertureRing';
  emitterRing.position.set(-0.022, 0.092, -0.079);
  root.add(emitterRing);

  // Rear Operator Status Indicator Bar (visible from seated player camera)
  const rearVisor = new Mesh(
    bevelBox(0.062, 0.014, 0.008, 0.002, 0.003, 2),
    emitterMat,
  );
  rearVisor.name = 'ScannerOperatorVisor';
  rearVisor.position.set(0, 0.096, 0.049);
  root.add(rearVisor);

  // 4. Live Forward Proximity Aiming Laser (activated when player grabs the tool)
  const laserGeo = new CylinderGeometry(0.0018, 0.0035, 0.28, 12);
  const laserMat = new MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  laserMat.name = 'ScannerAimLaserMat';
  const aimLaser = new Mesh(laserGeo, laserMat);
  aimLaser.name = 'ScannerAimLaser';
  aimLaser.rotation.set(Math.PI / 2, 0, 0);
  aimLaser.position.set(0, 0.092, -0.21);
  aimLaser.visible = false;
  root.add(aimLaser);

  mergeStaticMeshesByMaterial(root, ['ScannerAimLaser']);
  return root;
}

export function createDataCubeAsset(accentHex = 0x45c9c0): Object3D {
  const root = new Group();
  root.name = 'EvidenceDataCube';

  // 1. Brushed Silver-Titanium Exoskeleton Frame & Collars (Child 0 uses frameMat)
  const frameMat = new MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.24,
    metalness: 0.85,
  });

  // Dedicated material for runtime CanvasTexture telemetry display plates
  const displayPlateMat = new MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.55,
    roughness: 0.3,
    metalness: 0.1,
  });
  displayPlateMat.name = 'CubeTelemetryDisplayMat';

  // Bottom & Top Titanium Frame Collars
  const bottomCollar = new Mesh(
    bevelBox(0.068, 0.012, 0.068, 0.003, 0.008, 2),
    frameMat,
  );
  bottomCollar.name = 'CubeOuterFrame';
  bottomCollar.position.set(0, 0.006, 0);
  root.add(bottomCollar);

  const topCollar = new Mesh(
    bevelBox(0.068, 0.01, 0.068, 0.0025, 0.008, 2),
    frameMat,
  );
  topCollar.name = 'CubeTopFrameCollar';
  topCollar.position.set(0, 0.063, 0);
  root.add(topCollar);

  // 4 Vertical Titanium Corner Pillars (creates open-frame holocube silhouette)
  const pillarGeo = bevelBox(0.011, 0.048, 0.011, 0.002, 0.003, 2);
  const corners: Array<[number, number]> = [
    [-0.027, -0.027],
    [0.027, -0.027],
    [-0.027, 0.027],
    [0.027, 0.027],
  ];
  for (let i = 0; i < corners.length; i++) {
    const [cx, cz] = corners[i];
    const pillar = new Mesh(pillarGeo, frameMat);
    pillar.name = `CubeCornerPillar_${i + 1}`;
    pillar.position.set(cx, 0.035, cz);
    root.add(pillar);
  }

  // 2. Transparent Acrylic Containment Shell (holographic vitrine matching concept art)
  const acrylicMat = new MeshStandardMaterial({
    color: 0x93c5fd,
    emissive: accentHex,
    emissiveIntensity: 0.18,
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  acrylicMat.name = 'CubeAcrylicMat';
  const acrylicShell = new Mesh(
    bevelBox(0.056, 0.050, 0.056, 0.003, 0.006, 2),
    acrylicMat,
  );
  acrylicShell.name = 'CubeAcrylicShell';
  acrylicShell.renderOrder = 6;
  acrylicShell.position.set(0, 0.035, 0);
  root.add(acrylicShell);

  // 3. Dark Slate Base Substrate Plinth (geological foundation)
  const substrateMat = new MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.72,
    metalness: 0.28,
  });
  substrateMat.name = 'CubeSubstrateMat';
  const baseSubstrate = new Mesh(
    bevelBox(0.050, 0.008, 0.050, 0.002, 0.004, 2),
    substrateMat,
  );
  baseSubstrate.name = 'CubeBaseSubstrate';
  baseSubstrate.position.set(0, 0.014, 0);
  root.add(baseSubstrate);

  // 4. Sculpted 3D Topographic Relief Core (tinted dynamically by confidence)
  const coreMat = new MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.92,
    roughness: 0.28,
    metalness: 0.25,
  });
  coreMat.name = 'CubeConfidenceCoreMat';
  const terrainCore = new Mesh(
    bevelBox(0.050, 0.022, 0.050, 0.003, 0.006, 2),
    coreMat,
  );
  terrainCore.name = 'CubeConfidenceCore';
  terrainCore.position.set(0, 0.026, 0);
  root.add(terrainCore);

  // 5. Glowing Indus Flood River Channel (recessed aquatic ribbon winding through relief)
  const waterMat = new MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1.25,
    roughness: 0.15,
    metalness: 0.4,
  });
  waterMat.name = 'CubeWaterMat';
  const floodChannel = new Mesh(
    bevelBox(0.052, 0.004, 0.014, 0.001, 0.002, 2),
    waterMat,
  );
  floodChannel.name = 'CubeFloodChannel';
  floodChannel.position.set(0, 0.036, 0);
  floodChannel.rotation.set(0, 0.45, 0);
  root.add(floodChannel);

  // 6. Holographic Elevation Contour Rings (hovering above the terrain inside the acrylic)
  const contourMat = new MeshStandardMaterial({
    color: 0x67e8f9,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.75,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    roughness: 0.2,
  });
  contourMat.name = 'CubeContourMat';

  const contourGroup = new Group();
  contourGroup.name = 'CubeContourGroup';
  const contour1 = new Mesh(
    bevelBox(0.046, 0.0015, 0.046, 0.001, 0.001, 1),
    contourMat,
  );
  contour1.name = 'CubeContourWireframe_1';
  contour1.position.set(0, 0.038, 0);
  contourGroup.add(contour1);

  const contour2 = new Mesh(
    bevelBox(0.038, 0.0015, 0.038, 0.001, 0.001, 1),
    contourMat,
  );
  contour2.name = 'CubeContourWireframe_2';
  contour2.position.set(0, 0.046, 0);
  contourGroup.add(contour2);
  mergeStaticMeshesByMaterial(contourGroup);
  root.add(contourGroup);

  // 7. Sector-Specific Features (pre-authored for dynamic runtime toggling)
  // Miniature Steel Truss Bridge spanning the flood channel (visible for Sectors C & D)
  const bridgeSpan = new Mesh(
    bevelBox(0.012, 0.005, 0.024, 0.001, 0.002, 2),
    frameMat.clone(),
  );
  bridgeSpan.name = 'CubeBridgeSpan';
  bridgeSpan.position.set(0, 0.039, 0);
  bridgeSpan.rotation.set(0, -1.12, 0);
  bridgeSpan.visible = false;
  root.add(bridgeSpan);

  // Milky Storm Cloud-Top Cap (visible ONLY when confidence === 'UNVERIFIED')
  const cloudCapMat = new MeshStandardMaterial({
    color: 0xe2e8f0,
    emissive: 0x94a3b8,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    roughness: 0.65,
  });
  cloudCapMat.name = 'CubeCloudCapMat';
  const cloudCap = new Mesh(
    bevelBox(0.048, 0.014, 0.048, 0.002, 0.004, 2),
    cloudCapMat,
  );
  cloudCap.name = 'CubeCloudObscurationCap';
  cloudCap.position.set(0, 0.048, 0);
  cloudCap.visible = false;
  root.add(cloudCap);

  // 8. Front & Top High-Contrast Telemetry Display Plates (bound to CanvasTexture at runtime)
  const frontDisplay = new Mesh(
    new PlaneGeometry(0.044, 0.04),
    displayPlateMat,
  );
  frontDisplay.name = 'CubeFrontDisplay';
  frontDisplay.position.set(0, 0.035, 0.0285);
  root.add(frontDisplay);

  const topDisplay = new Mesh(
    new PlaneGeometry(0.04, 0.04),
    displayPlateMat,
  );
  topDisplay.name = 'CubeTopDisplay';
  topDisplay.rotation.set(-Math.PI / 2, 0, 0);
  topDisplay.position.set(0, 0.069, 0);
  root.add(topDisplay);

  const particlePositions: number[] = [];
  for (let i = 0; i < 24; i++) {
    const angle = i * 2.39996323;
    const radius = 0.026 + (i % 3) * 0.004;
    particlePositions.push(Math.cos(angle) * radius, 0.015 + (i % 6) * 0.009, Math.sin(angle) * radius);
  }
  const particleGeometry = new BufferGeometry();
  particleGeometry.setAttribute('position', new Float32BufferAttribute(particlePositions, 3));
  const particles = new Points(particleGeometry, new PointsMaterial({
    color: accentHex, size: 0.003, transparent: true, opacity: 0.85, depthWrite: false,
  }));
  particles.name = 'CubeAssemblyParticles';
  particles.visible = false;
  particles.raycast = () => {};
  root.add(particles);

  mergeStaticMeshesByMaterial(root, [
    'CubeAcrylicShell', 'CubeConfidenceCore', 'CubeContourWireframe_1', 'CubeContourWireframe_2',
    'CubeBridgeSpan', 'CubeCloudObscurationCap',
  ]);
  return root;
}

export function createConsolePadAsset(accentHex = 0x45c9c0): Object3D {
  const root = new Group();
  root.name = 'ConsoleTactilePad';

  const bezelMat = new MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.3,
    metalness: 0.78,
  });
  const capMat = new MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.85,
    roughness: 0.25,
    metalness: 0.3,
  });

  const base = new Mesh(
    bevelBox(0.068, 0.014, 0.052, 0.003, 0.006, 2),
    bezelMat,
  );
  base.name = 'PadBezelBase';
  base.position.set(0, 0.007, 0);
  root.add(base);

  const cap = new Mesh(
    bevelBox(0.052, 0.012, 0.038, 0.0025, 0.005, 2),
    capMat,
  );
  cap.name = 'PadIlluminatedCap';
  cap.position.set(0, 0.016, 0);
  root.add(cap);

  return root;
}
