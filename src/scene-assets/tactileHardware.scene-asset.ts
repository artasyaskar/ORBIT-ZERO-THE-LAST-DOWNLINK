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

  // 1. Sleek Aerospace Gunmetal-Titanium Exoskeleton Chassis
  const frameMat = new MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.24,
    metalness: 0.82,
  });

  const titaniumTrimMat = new MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.18,
    metalness: 0.90,
  });

  // Dedicated material for runtime CanvasTexture telemetry display plates
  const displayPlateMat = new MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.65,
    roughness: 0.25,
    metalness: 0.15,
  });
  displayPlateMat.name = 'CubeTelemetryDisplayMat';

  // Bottom Chamfered Docking Base & Top Housing Bezel
  const bottomCollar = new Mesh(
    bevelBox(0.068, 0.014, 0.068, 0.004, 0.008, 2),
    frameMat,
  );
  bottomCollar.name = 'CubeOuterFrame';
  bottomCollar.position.set(0, 0.007, 0);
  root.add(bottomCollar);

  const topCollar = new Mesh(
    bevelBox(0.068, 0.012, 0.068, 0.003, 0.008, 2),
    frameMat,
  );
  topCollar.name = 'CubeTopFrameCollar';
  topCollar.position.set(0, 0.064, 0);
  root.add(topCollar);

  // Brushed Titanium Bezel Trim Ribs
  const topTrim = new Mesh(
    bevelBox(0.064, 0.004, 0.064, 0.001, 0.003, 1),
    titaniumTrimMat,
  );
  topTrim.name = 'CubeTopTrim';
  topTrim.position.set(0, 0.071, 0);
  root.add(topTrim);

  // 4 Chamfered Titanium Corner Pillars (open-bay architecture)
  const pillarGeo = bevelBox(0.010, 0.050, 0.010, 0.002, 0.003, 2);
  const corners: Array<[number, number]> = [
    [-0.028, -0.028],
    [0.028, -0.028],
    [-0.028, 0.028],
    [0.028, 0.028],
  ];
  for (let i = 0; i < corners.length; i++) {
    const [cx, cz] = corners[i];
    const pillar = new Mesh(pillarGeo, titaniumTrimMat);
    pillar.name = `CubeCornerPillar_${i + 1}`;
    pillar.position.set(cx, 0.036, cz);
    root.add(pillar);
  }

  // 2. High-Luminance Glowing Optical Crystal Core (Intensely Radiant Neon)
  const coreMat = new MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 2.6,
    roughness: 0.12,
    metalness: 0.45,
  });
  coreMat.name = 'CubeConfidenceCoreMat';

  const terrainCore = new Mesh(
    bevelBox(0.048, 0.038, 0.048, 0.004, 0.008, 2),
    coreMat,
  );
  terrainCore.name = 'CubeConfidenceCore';
  terrainCore.position.set(0, 0.036, 0);
  root.add(terrainCore);

  // Horizontal Glowing Slit Emitter Bar (front and back aperture)
  const slitMat = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
  });
  const frontSlit = new Mesh(
    bevelBox(0.036, 0.006, 0.052, 0.001, 0.002, 1),
    slitMat,
  );
  frontSlit.name = 'CubeGlowSlit';
  frontSlit.position.set(0, 0.036, 0);
  root.add(frontSlit);

  // 3. Transparent Acrylic / Holographic Containment Vitrine
  const acrylicMat = new MeshStandardMaterial({
    color: 0xbae6fd,
    emissive: accentHex,
    emissiveIntensity: 0.35,
    roughness: 0.06,
    metalness: 0.2,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  acrylicMat.name = 'CubeAcrylicMat';
  const acrylicShell = new Mesh(
    bevelBox(0.058, 0.052, 0.058, 0.003, 0.006, 2),
    acrylicMat,
  );
  acrylicShell.name = 'CubeAcrylicShell';
  acrylicShell.renderOrder = 6;
  acrylicShell.position.set(0, 0.036, 0);
  root.add(acrylicShell);

  // 4. Dark Slate Base Substrate Plinth
  const baseSubstrate = new Mesh(
    bevelBox(0.052, 0.006, 0.052, 0.002, 0.004, 2),
    frameMat,
  );
  baseSubstrate.name = 'CubeBaseSubstrate';
  baseSubstrate.position.set(0, 0.014, 0);
  root.add(baseSubstrate);

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

  const contourCoords = [
    { size: 0.046, y: 0.038 },
    { size: 0.038, y: 0.046 },
  ];
  const posC: number[] = [];
  const normC: number[] = [];
  const idxC: number[] = [];
  let vOffC = 0;

  for (const c of contourCoords) {
    const geo = bevelBox(c.size, 0.0015, c.size, 0.001, 0.001, 1);
    const pos = geo.getAttribute('position');
    const norm = geo.getAttribute('normal');
    const idx = geo.getIndex();
    for (let i = 0; i < pos.count; i++) {
      posC.push(pos.getX(i), pos.getY(i) + c.y, pos.getZ(i));
      normC.push(norm.getX(i), norm.getY(i), norm.getZ(i));
    }
    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        idxC.push(vOffC + idx.getX(i));
      }
    }
    vOffC += pos.count;
  }
  const mergedContourGeo = new BufferGeometry();
  mergedContourGeo.setAttribute('position', new Float32BufferAttribute(posC, 3));
  mergedContourGeo.setAttribute('normal', new Float32BufferAttribute(normC, 3));
  if (idxC.length > 0) mergedContourGeo.setIndex(idxC);

  const contourWireframe = new Mesh(mergedContourGeo, contourMat);
  contourWireframe.name = 'CubeContourWireframe_1';
  root.add(contourWireframe);

  // 7. Sector-Specific Features (pre-authored for dynamic runtime toggling)
  // Miniature Steel Truss Bridge spanning the flood channel (visible for Sectors C & D)
  const bridgeSpan = new Mesh(
    bevelBox(0.012, 0.005, 0.024, 0.001, 0.002, 2),
    frameMat,
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

  // Phase 4: Jagged Radar Multipath Backscatter Spikes (visible when confidence === 'PROBABLE')
  const spikeMat = new MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xb45309,
    emissiveIntensity: 1.25,
    roughness: 0.22,
    metalness: 0.82,
  });
  spikeMat.name = 'CubeRadarSpikesMat';

  const spikeCoords = [
    [-0.010, 0.042, -0.006],
    [0.008, 0.044, 0.006],
    [-0.002, 0.048, 0.002],
    [0.010, 0.043, -0.008],
  ];
  const spikeBaseGeo = new CylinderGeometry(0.0006, 0.0034, 0.018, 5);
  const posArr: number[] = [];
  const normArr: number[] = [];
  const idxArr: number[] = [];
  const basePos = spikeBaseGeo.getAttribute('position');
  const baseNorm = spikeBaseGeo.getAttribute('normal');
  const baseIdx = spikeBaseGeo.getIndex();
  let vOffset = 0;

  for (const [sx, sy, sz] of spikeCoords) {
    for (let i = 0; i < basePos.count; i++) {
      posArr.push(basePos.getX(i) + sx, basePos.getY(i) + sy, basePos.getZ(i) + sz);
      normArr.push(baseNorm.getX(i), baseNorm.getY(i), baseNorm.getZ(i));
    }
    if (baseIdx) {
      for (let i = 0; i < baseIdx.count; i++) {
        idxArr.push(vOffset + baseIdx.getX(i));
      }
    }
    vOffset += basePos.count;
  }
  const mergedSpikesGeo = new BufferGeometry();
  mergedSpikesGeo.setAttribute('position', new Float32BufferAttribute(posArr, 3));
  mergedSpikesGeo.setAttribute('normal', new Float32BufferAttribute(normArr, 3));
  if (idxArr.length > 0) mergedSpikesGeo.setIndex(idxArr);

  const radarSpikesMesh = new Mesh(mergedSpikesGeo, spikeMat);
  radarSpikesMesh.name = 'CubeRadarSpikes';
  radarSpikesMesh.visible = false;
  root.add(radarSpikesMesh);

  // Phase 4: Glowing Highway Vector Line (visible when confidence === 'CONFIRMED' for safe convoy path)
  const highwayMat = new MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x059669,
    emissiveIntensity: 1.45,
    roughness: 0.2,
    metalness: 0.35,
  });
  highwayMat.name = 'CubeHighwayVectorMat';
  const highwayVector = new Mesh(
    bevelBox(0.044, 0.0024, 0.005, 0.0006, 0.001, 1),
    highwayMat,
  );
  highwayVector.name = 'CubeHighwayVector';
  highwayVector.position.set(0, 0.038, -0.006);
  highwayVector.rotation.set(0, -0.26, 0);
  highwayVector.visible = false;
  root.add(highwayVector);

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
    'CubeBridgeSpan', 'CubeCloudObscurationCap', 'CubeRadarSpikes', 'CubeHighwayVector',
  ]);
  return root;
}

// Preallocated shared pad bezel material across all console pads
const sharedPadBezelMat = new MeshStandardMaterial({
  color: 0x1e293b,
  roughness: 0.35,
  metalness: 0.88,
});

export function createConsolePadAsset(accentHex = 0x45c9c0): Object3D {
  const root = new Group();
  root.name = 'ConsoleTactilePad';

  const capMat = new MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.75,
    roughness: 0.25,
    metalness: 0.45,
  });

  const cap = new Mesh(
    bevelBox(0.044, 0.006, 0.032, 0.0015, 0.003, 1),
    capMat,
  );
  cap.name = 'PadIlluminatedCap';
  cap.position.set(0, 0.006, 0);
  root.add(cap);

  return root;
}
