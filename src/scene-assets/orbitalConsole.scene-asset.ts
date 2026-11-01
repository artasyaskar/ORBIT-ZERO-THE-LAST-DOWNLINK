/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * High-Craft Procedural 3D Architecture: Seated Aerospace Orbital Command Console & Cupola Frame
 *
 * Engineered to match `docs/art-references/orbit-zero-hero-v01.png`:
 * - Brushed silver-titanium ergonomic deck bolster, dark anodized hull, and recessed carbon instrument bays
 * - Left Station: Contoured Dual-Aperture Scanner Dock & 3-Slot Illuminated Evidence Capture Tray
 * - Center Station: Recessed Turbine Globe Gimbal Pedestal & Lower-Hemisphere Emitter Calipers
 * - Right Station: Amber Induction Compression Cradle, 3-Slot Waveguide Downlink Bay & Jettison Chute
 * - Cupola Viewport: Curved Orbital Horizon Atmospheric Limb Arc & Structural Window Mullions
 */

import {
  BackSide,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Points,
  PointsMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import {
  alignSpan,
  bevelBox,
  mergeStaticMeshesByMaterial,
  taperPlate,
} from './lib/hardsurface';
import { TACTICAL_PALETTE, EMISSION_INTENSITIES } from './lib/tacticalPalette';

export function createOrbitalConsoleAsset(): Object3D {
  const root = new Group();
  root.name = 'OrbitalConsole';

  // RC10.0 Tactical Aerospace Material Library (Gen-Z color palette upgrade)
  const hullDarkMat = new MeshStandardMaterial({
    color: TACTICAL_PALETTE.voidObsidian,
    roughness: 0.38,
    metalness: 0.78,
  });
  const deskDeckMat = hullDarkMat;
  const titaniumRimMat = new MeshStandardMaterial({
    color: TACTICAL_PALETTE.titaniumGray,
    roughness: 0.18,
    metalness: 0.92,
  });
  const gunmetalBezelMat = titaniumRimMat;
  const carbonWellMat = hullDarkMat;
  const cyanAccentMat = new MeshStandardMaterial({
    color: TACTICAL_PALETTE.electricCyan,
    emissive: TACTICAL_PALETTE.electricCyan,
    emissiveIntensity: EMISSION_INTENSITIES.moderate,
    roughness: 0.25,
    metalness: 0.3,
  });
  const amberInductionMat = new MeshStandardMaterial({
    color: TACTICAL_PALETTE.tacticalAmber,
    emissive: TACTICAL_PALETTE.tacticalAmber,
    emissiveIntensity: EMISSION_INTENSITIES.strong,
    roughness: 0.25,
    metalness: 0.45,
  });
  const copperClampMat = new MeshStandardMaterial({
    color: TACTICAL_PALETTE.tacticalAmber,
    roughness: 0.28,
    metalness: 0.85,
  });
  const emeraldWaveguideMat = new MeshStandardMaterial({
    color: TACTICAL_PALETTE.sarEmerald,
    emissive: TACTICAL_PALETTE.sarEmerald,
    emissiveIntensity: EMISSION_INTENSITIES.moderate,
    roughness: 0.25,
    metalness: 0.35,
  });
  const coralHazardMat = new MeshStandardMaterial({
    color: TACTICAL_PALETTE.dangerCrimson,
    emissive: TACTICAL_PALETTE.dangerCrimson,
    emissiveIntensity: EMISSION_INTENSITIES.moderate,
    roughness: 0.3,
    metalness: 0.3,
  });
  const hazardStripeMat = new MeshStandardMaterial({
    color: TACTICAL_PALETTE.tacticalAmber,
    roughness: 0.42,
    metalness: 0.35,
  });
  const floodLightWarmMat = new MeshStandardMaterial({
    color: 0xffedd5,
    emissive: TACTICAL_PALETTE.tacticalAmber,
    emissiveIntensity: EMISSION_INTENSITIES.strong,
    roughness: 0.2,
    metalness: 0.1,
  });
  const conduitMat = new MeshStandardMaterial({
    color: TACTICAL_PALETTE.voidObsidian,
    roughness: 0.75,
    metalness: 0.2,
  });
  const deckPlateFloorMat = hullDarkMat;

  // 1. Pedestal Base & Hydraulic Support Architecture
  const baseGroup = new Group();
  baseGroup.name = 'PedestalBase';

  const floorPlate = new Mesh(
    bevelBox(1.36, 0.045, 0.74, 0.01, 0.035, 3),
    hullDarkMat,
  );
  floorPlate.name = 'FloorBasePlate';
  floorPlate.position.set(0, 0.022, 0.04);
  baseGroup.add(floorPlate);

  const centerCoreColumn = new Mesh(
    bevelBox(0.42, 0.72, 0.32, 0.016, 0.035, 3),
    hullDarkMat,
  );
  centerCoreColumn.name = 'CenterSupportColumn';
  centerCoreColumn.position.set(0, 0.38, -0.02);
  baseGroup.add(centerCoreColumn);

  const strutGeo = new CylinderGeometry(0.034, 0.046, 1, 16);
  const leftStrut = new Mesh(strutGeo, titaniumRimMat);
  leftStrut.name = 'LeftSupportStrut';
  const leftSpan = alignSpan(
    leftStrut,
    new Vector3(-0.52, 0.04, 0.12),
    new Vector3(-0.42, 0.74, 0.04),
  );
  leftStrut.scale.set(1, leftSpan, 1);
  baseGroup.add(leftStrut);

  const rightStrut = new Mesh(strutGeo, titaniumRimMat);
  rightStrut.name = 'RightSupportStrut';
  const rightSpan = alignSpan(
    rightStrut,
    new Vector3(0.52, 0.04, 0.12),
    new Vector3(0.42, 0.74, 0.04),
  );
  rightStrut.scale.set(1, rightSpan, 1);
  baseGroup.add(rightStrut);

  // 2. Wrap-Around Aerospace Console Deck (y = 0.75m - 0.78m)
  const deckGroup = new Group();
  deckGroup.name = 'ConsoleDeck';

  // Center Console Bridge & Front Silver-Titanium Bolster
  const centerBridgeHull = new Mesh(
    bevelBox(1.24, 0.056, 0.48, 0.012, 0.028, 3),
    deskDeckMat,
  );
  centerBridgeHull.name = 'CenterDeckHull';
  centerBridgeHull.position.set(0, 0.748, 0.05);
  deckGroup.add(centerBridgeHull);

  // Brushed Titanium Front Cowling Lip (catches overhead key light like reference)
  const frontTitaniumLip = new Mesh(
    bevelBox(1.26, 0.028, 0.048, 0.007, 0.014, 3),
    titaniumRimMat,
  );
  frontTitaniumLip.name = 'FrontTitaniumBolster';
  frontTitaniumLip.position.set(0, 0.768, 0.275);
  deckGroup.add(frontTitaniumLip);

  // Rear Cowling Rim behind console
  const rearTitaniumCowling = new Mesh(
    bevelBox(1.22, 0.036, 0.042, 0.008, 0.014, 3),
    gunmetalBezelMat,
  );
  rearTitaniumCowling.name = 'RearConsoleCowling';
  rearTitaniumCowling.position.set(0, 0.774, -0.175);
  deckGroup.add(rearTitaniumCowling);

  // Left Wing Extension (angled ergonomics for left hand)
  const leftWingSlab = new Mesh(
    taperPlate(0.44, 0.44, 0.38, 0.054, 0.01),
    deskDeckMat,
  );
  leftWingSlab.name = 'LeftWingSlab';
  leftWingSlab.position.set(-0.42, 0.752, 0.06);
  leftWingSlab.rotation.set(Math.PI / 2, 0, 0);
  deckGroup.add(leftWingSlab);

  const leftOuterRim = new Mesh(
    bevelBox(0.036, 0.034, 0.44, 0.006, 0.01, 2),
    titaniumRimMat,
  );
  leftOuterRim.name = 'LeftWingTitaniumRim';
  leftOuterRim.position.set(-0.63, 0.772, 0.06);
  deckGroup.add(leftOuterRim);

  // Right Wing Extension (angled ergonomics for right hand)
  const rightWingSlab = new Mesh(
    taperPlate(0.44, 0.38, 0.44, 0.054, 0.01),
    deskDeckMat,
  );
  rightWingSlab.name = 'RightWingSlab';
  rightWingSlab.position.set(0.42, 0.752, 0.06);
  rightWingSlab.rotation.set(Math.PI / 2, 0, 0);
  deckGroup.add(rightWingSlab);

  const rightOuterRim = new Mesh(
    bevelBox(0.036, 0.034, 0.44, 0.006, 0.01, 2),
    titaniumRimMat,
  );
  rightOuterRim.name = 'RightWingTitaniumRim';
  rightOuterRim.position.set(0.63, 0.772, 0.06);
  deckGroup.add(rightOuterRim);

  // 3. LEFT STATION: Handheld Dual-Aperture Scanner Dock & 3-Slot Evidence Cube Capture Tray
  // Scanner Holster Well at world [-0.48, 0.79, -0.54] -> local [-0.48, 0.778, +0.02]
  const scannerDockOuter = new Mesh(
    bevelBox(0.135, 0.018, 0.165, 0.004, 0.012, 3),
    titaniumRimMat,
  );
  scannerDockOuter.name = 'ScannerHolsterBezel';
  scannerDockOuter.position.set(-0.48, 0.778, 0.02);
  deckGroup.add(scannerDockOuter);

  const scannerDockWell = new Mesh(
    bevelBox(0.108, 0.016, 0.138, 0.003, 0.008, 2),
    carbonWellMat,
  );
  scannerDockWell.name = 'ScannerHolsterWell';
  scannerDockWell.position.set(-0.48, 0.782, 0.02);
  deckGroup.add(scannerDockWell);

  // 3-Slot Raw Evidence Cube Tray at world z = -0.43 -> local z = +0.13, x = [-0.46, -0.37, -0.28]
  const trayOuterBezel = new Mesh(
    bevelBox(0.31, 0.018, 0.125, 0.004, 0.014, 3),
    titaniumRimMat,
  );
  trayOuterBezel.name = 'RawCubeTrayBezel';
  trayOuterBezel.position.set(-0.37, 0.778, 0.13);
  deckGroup.add(trayOuterBezel);

  const trayDarkBed = new Mesh(
    bevelBox(0.286, 0.016, 0.102, 0.003, 0.01, 2),
    carbonWellMat,
  );
  trayDarkBed.name = 'RawCubeTrayBed';
  trayDarkBed.position.set(-0.37, 0.781, 0.13);
  deckGroup.add(trayDarkBed);

  const rawSlotX = [-0.46, -0.37, -0.28];
  const socketRingGeo = bevelBox(0.076, 0.006, 0.076, 0.0015, 0.006, 2);
  for (let i = 0; i < 3; i++) {
    const socketFrame = new Mesh(socketRingGeo, gunmetalBezelMat);
    socketFrame.name = `RawTraySocket_${i + 1}`;
    socketFrame.position.set(rawSlotX[i], 0.788, 0.13);
    deckGroup.add(socketFrame);
  }

  const trayAccentPipe = new Mesh(
    bevelBox(0.26, 0.005, 0.006, 0.001, 0.002, 2),
    cyanAccentMat,
  );
  trayAccentPipe.name = 'LeftTrayLedStrip';
  trayAccentPipe.position.set(-0.37, 0.788, 0.184);
  deckGroup.add(trayAccentPipe);

  // 4. CENTER STATION: Recessed Turbine Globe Gimbal Pedestal (local [0, 0.78, -0.02])
  const gimbalGroup = new Group();
  gimbalGroup.name = 'GlobeGimbalMount';
  gimbalGroup.position.set(0, 0.778, -0.02);

  const gimbalOuterCollar = new Mesh(
    new CylinderGeometry(0.215, 0.235, 0.026, 20), // Reduced from 28 segments to 20
    titaniumRimMat,
  );
  gimbalOuterCollar.name = 'GimbalOuterCollar';
  gimbalGroup.add(gimbalOuterCollar);

  const gimbalInnerWell = new Mesh(
    new CylinderGeometry(0.185, 0.175, 0.028, 18), // Reduced from 24 segments to 18
    carbonWellMat,
  );
  gimbalInnerWell.name = 'GimbalInnerWell';
  gimbalInnerWell.position.set(0, 0.002, 0);
  gimbalGroup.add(gimbalInnerWell);

  const gimbalEmitterRing = new Mesh(
    new TorusGeometry(0.196, 0.005, 8, 36),
    cyanAccentMat,
  );
  gimbalEmitterRing.name = 'GimbalAzimuthRing';
  gimbalEmitterRing.rotation.set(Math.PI / 2, 0, 0);
  gimbalEmitterRing.position.set(0, 0.015, 0);
  gimbalGroup.add(gimbalEmitterRing);

  // 4 Angled Lower-Hemisphere Projector Calipers (frames the globe base without blocking upper view)
  const caliperGeo = bevelBox(0.018, 0.065, 0.024, 0.003, 0.004, 2);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const r = 0.195;
    const caliper = new Mesh(caliperGeo, gunmetalBezelMat);
    caliper.name = `GimbalProjectorCaliper_${i + 1}`;
    caliper.position.set(Math.cos(angle) * r, 0.032, Math.sin(angle) * r);
    caliper.rotation.set(0, -angle + Math.PI / 2, 0.35);
    gimbalGroup.add(caliper);
  }

  deckGroup.add(gimbalGroup);

  // 5. RIGHT STATION: Amber Induction Processing Cradle, 3-Slot Downlink Bay & Jettison Chute
  // Amber Processing Cradle static socket at world [0.24, 0.78, -0.55] -> local [0.24, 0.78, +0.01]
  const cradleOuterHousing = new Mesh(
    bevelBox(0.112, 0.022, 0.118, 0.004, 0.012, 3),
    copperClampMat,
  );
  cradleOuterHousing.name = 'ProcessingCradleSocket';
  cradleOuterHousing.position.set(0.24, 0.78, 0.01);
  deckGroup.add(cradleOuterHousing);

  // Dynamic Processing Cradle Assembly (unmerged from static hull so clamps & core can animate)
  const cradleGroup = new Group();
  cradleGroup.name = 'ProcessingCradleAssembly';
  cradleGroup.position.set(0.24, 0.78, 0.01);

  const cradleInductionCore = new Mesh(
    bevelBox(0.084, 0.024, 0.088, 0.003, 0.008, 2),
    amberInductionMat,
  );
  cradleInductionCore.name = 'ProcessingCradleCore';
  cradleInductionCore.position.set(0, 0.002, 0);
  cradleGroup.add(cradleInductionCore);

  const inductionRingGeo = new TorusGeometry(0.038, 0.0035, 8, 28);
  const inductionRing = new Mesh(inductionRingGeo, amberInductionMat);
  inductionRing.name = 'CradleInductionRing';
  inductionRing.rotation.set(Math.PI / 2, 0, 0);
  inductionRing.position.set(0, 0.014, 0);
  cradleGroup.add(inductionRing);

  const telemetryHoodGeo = bevelBox(0.084, 0.022, 0.024, 0.003, 0.004, 2);
  const telemetryHood = new Mesh(telemetryHoodGeo, gunmetalBezelMat);
  telemetryHood.name = 'CradleTelemetryHood';
  telemetryHood.position.set(0.24, 0.804, -0.042);
  telemetryHood.rotation.set(-0.35, 0, 0);
  deckGroup.add(telemetryHood);

  // Raised copper induction clamp jaws on left and right of cradle (dynamic animation targets)
  const clampJawGeo = bevelBox(0.012, 0.028, 0.092, 0.002, 0.004, 2);
  const leftJaw = new Mesh(clampJawGeo, copperClampMat);
  leftJaw.name = 'CradleClampLeft';
  leftJaw.position.set(-0.048, 0.016, 0);
  cradleGroup.add(leftJaw);

  const rightJaw = new Mesh(clampJawGeo, copperClampMat);
  rightJaw.name = 'CradleClampRight';
  rightJaw.position.set(0.048, 0.016, 0);
  cradleGroup.add(rightJaw);
  mergeStaticMeshesByMaterial(cradleGroup, ['CradleClampLeft', 'CradleClampRight']);

  // Discard / Recycle Chute at world [0.45, 0.78, -0.44] -> local [0.45, 0.78, 0.12]
  const discardRim = new Mesh(
    new CylinderGeometry(0.052, 0.058, 0.022, 24),
    gunmetalBezelMat,
  );
  discardRim.name = 'DiscardChuteRim';
  discardRim.position.set(0.45, 0.78, 0.12);
  deckGroup.add(discardRim);

  const discardCore = new Mesh(
    new CylinderGeometry(0.038, 0.042, 0.025, 20),
    coralHazardMat,
  );
  discardCore.name = 'DiscardChuteSocket';
  discardCore.position.set(0.45, 0.781, 0.12);
  deckGroup.add(discardCore);

  // 3-Slot Downlink Transmission Bay at world [0.29, 0.39, 0.49], z = -0.46 -> local z = +0.10
  const downlinkBayBezel = new Mesh(
    bevelBox(0.315, 0.018, 0.118, 0.004, 0.014, 3),
    titaniumRimMat,
  );
  downlinkBayBezel.name = 'DownlinkBayOuterFrame';
  downlinkBayBezel.position.set(0.39, 0.778, 0.10);
  deckGroup.add(downlinkBayBezel);

  const downlinkBayBed = new Mesh(
    bevelBox(0.292, 0.016, 0.096, 0.003, 0.01, 2),
    carbonWellMat,
  );
  downlinkBayBed.name = 'DownlinkBayCarbonBed';
  downlinkBayBed.position.set(0.39, 0.781, 0.10);
  deckGroup.add(downlinkBayBed);

  const dlSlotX = [0.29, 0.39, 0.49];
  const dlSlotBezelGeo = bevelBox(0.078, 0.007, 0.08, 0.002, 0.006, 2);
  const dlWaveguideGeo = bevelBox(0.056, 0.008, 0.01, 0.001, 0.002, 2);

  const downlinkDynamicGroup = new Group();
  downlinkDynamicGroup.name = 'DownlinkBayDynamicGroup';

  const waveguideMat = new MeshStandardMaterial({
    color: 0x334155,
    emissive: 0x0f172a,
    emissiveIntensity: 0.2,
    roughness: 0.35,
    metalness: 0.45,
  });
  const progressMat = new MeshBasicMaterial({ color: 0x38bdf8 });

  for (let i = 0; i < 3; i++) {
    const slotBase = new Mesh(dlSlotBezelGeo, gunmetalBezelMat);
    slotBase.name = `DownlinkSlotBezel_${i + 1}`;
    slotBase.position.set(dlSlotX[i], 0.788, 0.10);
    deckGroup.add(slotBase);

    const waveguide = new Mesh(dlWaveguideGeo, waveguideMat);
    waveguide.name = `DownlinkSlotWaveguide_${i + 1}`;
    waveguide.position.set(dlSlotX[i], 0.789, 0.132);
    downlinkDynamicGroup.add(waveguide);
    const progressBar = new Mesh(dlWaveguideGeo, progressMat);
    progressBar.name = `DownlinkSlotProgress_${i + 1}`;
    progressBar.position.set(dlSlotX[i], 0.794, 0.132);
    progressBar.visible = false;
    progressBar.raycast = () => {};
    downlinkDynamicGroup.add(progressBar);
  }

  // S-Band phased-array transmitter mast at the rear edge of Downlink Bay angled up toward 3U CubeSat
  const transmitterMastGroup = new Group();
  transmitterMastGroup.name = 'DownlinkTransmitterHorn';
  transmitterMastGroup.position.set(0.39, 0.796, 0.035);
  transmitterMastGroup.rotation.set(-0.38, 0, 0);

  const mastBaseMesh = new Mesh(
    new CylinderGeometry(0.008, 0.012, 0.036, 12),
    titaniumRimMat,
  );
  mastBaseMesh.position.set(0, 0.018, 0);
  transmitterMastGroup.add(mastBaseMesh);

  const hornEmitterMesh = new Mesh(
    new CylinderGeometry(0.018, 0.009, 0.024, 12),
    gunmetalBezelMat,
  );
  hornEmitterMesh.position.set(0, 0.046, 0);
  transmitterMastGroup.add(hornEmitterMesh);

  const hornCapMesh = new Mesh(
    new CylinderGeometry(0.016, 0.016, 0.004, 12),
    cyanAccentMat,
  );
  hornCapMesh.position.set(0, 0.059, 0);
  transmitterMastGroup.add(hornCapMesh);

  deckGroup.add(transmitterMastGroup);

  // S-Band live microwave telemetry uplink beam and data pulse rings
  const uplinkGroup = new Group();
  uplinkGroup.name = 'DownlinkUplinkBeamGroup';

  const pA = new Vector3(0.39, 0.85, 0.035);
  const pB = new Vector3(0, 1.255, 0.01);

  const beamGeo = new CylinderGeometry(0.0035, 0.012, 1, 16, 1, true);
  const beamMat = new MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.0,
    side: DoubleSide,
    depthWrite: false,
  });
  beamMat.name = 'DownlinkUplinkBeamMat';
  const beamMesh = new Mesh(beamGeo, beamMat);
  beamMesh.name = 'DownlinkUplinkBeam';
  const beamLength = alignSpan(beamMesh, pA, pB);
  beamMesh.scale.set(1, beamLength, 1);
  beamMesh.visible = false;
  uplinkGroup.add(beamMesh);

  const ringGeo = new TorusGeometry(0.016, 0.0028, 8, 20);
  for (let i = 0; i < 3; i++) {
    const ringMat = new MeshBasicMaterial({
      color: 0x5eead4,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    ringMat.name = `DownlinkPulseRingMat_${i + 1}`;
    const ringMesh = new Mesh(ringGeo, ringMat);
    ringMesh.name = `DownlinkPulseRing_${i + 1}`;
    ringMesh.quaternion.copy(beamMesh.quaternion);
    ringMesh.position.copy(pA);
    ringMesh.visible = false;
    uplinkGroup.add(ringMesh);
  }

  downlinkDynamicGroup.add(uplinkGroup);

  // Dynamic visual drop-zone halo target rings (illuminated when operator holds an Evidence Cube)
  const cradleHaloGeo = new TorusGeometry(0.062, 0.0024, 8, 32);
  const cradleHaloMat = new MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  cradleHaloMat.name = 'CradleDropHaloMat';
  const cradleHalo = new Mesh(cradleHaloGeo, cradleHaloMat);
  cradleHalo.name = 'CradleDropHalo';
  cradleHalo.rotation.set(Math.PI / 2, 0, 0);
  cradleHalo.position.set(0.24, 0.787, 0.01);
  cradleHalo.visible = false;
  downlinkDynamicGroup.add(cradleHalo);

  const queueHaloGeo = new TorusGeometry(0.088, 0.0026, 8, 36);
  const queueHaloMat = new MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  queueHaloMat.name = 'QueueDropHaloMat';
  const queueHalo = new Mesh(queueHaloGeo, queueHaloMat);
  queueHalo.name = 'QueueDropHalo';
  queueHalo.rotation.set(Math.PI / 2, 0, 0);
  queueHalo.position.set(0.39, 0.787, 0.10);
  queueHalo.scale.set(1.68, 0.65, 1);
  queueHalo.visible = false;
  downlinkDynamicGroup.add(queueHalo);

  const discardHaloGeo = new TorusGeometry(0.052, 0.0024, 8, 28);
  const discardHaloMat = new MeshBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  discardHaloMat.name = 'DiscardDropHaloMat';
  const discardHalo = new Mesh(discardHaloGeo, discardHaloMat);
  discardHalo.name = 'DiscardDropHalo';
  discardHalo.rotation.set(Math.PI / 2, 0, 0);
  discardHalo.position.set(0.45, 0.787, 0.12);
  discardHalo.visible = false;
  downlinkDynamicGroup.add(discardHalo);
  mergeStaticMeshesByMaterial(downlinkDynamicGroup, [
    'DownlinkSlotProgress_1', 'DownlinkSlotProgress_2', 'DownlinkSlotProgress_3',
    'CradleDropHalo', 'QueueDropHalo', 'DiscardDropHalo',
  ]);

  // 6. Cockpit Architectural Interior: Heavy Anti-Slip Floor Deck & Forward Kickplate
  const cabinFloorGroup = new Group();
  cabinFloorGroup.name = 'CockpitCabinFloor';

  // Heavy anti-slip steel floor plate spanning beneath pilot seat, console, and side walls
  const mainDeckFloor = new Mesh(
    bevelBox(3.08, 0.042, 2.30, 0.008, 0.02, 2),
    deckPlateFloorMat,
  );
  mainDeckFloor.name = 'CockpitMainFloorDeck';
  mainDeckFloor.position.set(0, 0.021, 0.18);
  cabinFloorGroup.add(mainDeckFloor);

  // Left and Right Industrial Floor Perimeter Curbs
  const leftFloorCurb = new Mesh(
    bevelBox(0.048, 0.052, 2.26, 0.006, 0.012, 2),
    gunmetalBezelMat,
  );
  leftFloorCurb.name = 'PortFloorDeckCurb';
  leftFloorCurb.position.set(-1.48, 0.046, 0.18);
  cabinFloorGroup.add(leftFloorCurb);

  const rightFloorCurb = new Mesh(
    bevelBox(0.048, 0.052, 2.26, 0.006, 0.012, 2),
    gunmetalBezelMat,
  );
  rightFloorCurb.name = 'StarboardFloorDeckCurb';
  rightFloorCurb.position.set(1.48, 0.046, 0.18);
  cabinFloorGroup.add(rightFloorCurb);

  // Recessed Emergency Egress Guide Light Strips on Floor
  const leftFloorGuide = new Mesh(
    bevelBox(0.018, 0.012, 1.88, 0.002, 0.004, 2),
    cyanAccentMat,
  );
  leftFloorGuide.name = 'PortFloorGuideLight';
  leftFloorGuide.position.set(-1.42, 0.046, 0.18);
  cabinFloorGroup.add(leftFloorGuide);

  const rightFloorGuide = new Mesh(
    bevelBox(0.018, 0.012, 1.88, 0.002, 0.004, 2),
    cyanAccentMat,
  );
  rightFloorGuide.name = 'StarboardFloorGuideLight';
  rightFloorGuide.position.set(1.42, 0.046, 0.18);
  cabinFloorGroup.add(rightFloorGuide);

  // Lower Forward Pressure Bulkhead (Kick Plate Behind Console - Closes the void!)
  const lowerForwardBulkhead = new Mesh(
    bevelBox(2.96, 0.68, 0.048, 0.008, 0.016, 2),
    hullDarkMat,
  );
  lowerForwardBulkhead.name = 'ForwardLowerBulkheadPlate';
  lowerForwardBulkhead.position.set(0, 0.36, -0.88);
  cabinFloorGroup.add(lowerForwardBulkhead);

  // Vertical Reinforcement Stiffener Ribs on Lower Bulkhead
  for (let i = 0; i < 4; i++) {
    const rx = -1.05 + i * 0.70;
    const kickRib = new Mesh(
      bevelBox(0.038, 0.66, 0.036, 0.004, 0.008, 2),
      titaniumRimMat,
    );
    kickRib.name = `ForwardLowerBulkheadRib_${i + 1}`;
    kickRib.position.set(rx, 0.36, -0.85);
    cabinFloorGroup.add(kickRib);
  }

  // 7. Structural Cockpit Bulkhead Side Walls (Port & Starboard Cabin Enclosure)
  const cabinWallsGroup = new Group();
  cabinWallsGroup.name = 'CockpitCabinSideWalls';

  // Port (Left) Structural Bulkhead Wall
  const portWall = new Mesh(
    bevelBox(0.052, 2.18, 1.96, 0.008, 0.016, 2),
    hullDarkMat,
  );
  portWall.name = 'PortCabinBulkheadWall';
  portWall.position.set(-1.50, 1.12, 0.12);
  cabinWallsGroup.add(portWall);

  // Starboard (Right) Structural Bulkhead Wall
  const starboardWall = new Mesh(
    bevelBox(0.052, 2.18, 1.96, 0.008, 0.016, 2),
    hullDarkMat,
  );
  starboardWall.name = 'StarboardCabinBulkheadWall';
  starboardWall.position.set(1.50, 1.12, 0.12);
  cabinWallsGroup.add(starboardWall);

  // Vertical Wall Stiffener Columns & Armor Plates along both walls
  for (let i = 0; i < 4; i++) {
    const wz = -0.65 + i * 0.52;

    const portCol = new Mesh(
      bevelBox(0.046, 2.16, 0.062, 0.006, 0.01, 2),
      titaniumRimMat,
    );
    portCol.name = `PortWallStiffener_${i + 1}`;
    portCol.position.set(-1.47, 1.12, wz);
    cabinWallsGroup.add(portCol);

    const starCol = new Mesh(
      bevelBox(0.046, 2.16, 0.062, 0.006, 0.01, 2),
      titaniumRimMat,
    );
    starCol.name = `StarboardWallStiffener_${i + 1}`;
    starCol.position.set(1.47, 1.12, wz);
    cabinWallsGroup.add(starCol);

    if (i < 3) {
      const panelZ = wz + 0.26;
      const portArmor = new Mesh(
        bevelBox(0.018, 1.25, 0.44, 0.004, 0.008, 2),
        carbonWellMat,
      );
      portArmor.name = `PortArmorPanel_${i + 1}`;
      portArmor.position.set(-1.485, 1.18, panelZ);
      cabinWallsGroup.add(portArmor);

      const starArmor = new Mesh(
        bevelBox(0.018, 1.25, 0.44, 0.004, 0.008, 2),
        carbonWellMat,
      );
      starArmor.name = `StarboardArmorPanel_${i + 1}`;
      starArmor.position.set(1.485, 1.18, panelZ);
      cabinWallsGroup.add(starArmor);

      const portHazard = new Mesh(
        bevelBox(0.014, 0.038, 0.44, 0.002, 0.004, 2),
        hazardStripeMat,
      );
      portHazard.name = `PortHazardStripe_${i + 1}`;
      portHazard.position.set(-1.48, 0.52, panelZ);
      cabinWallsGroup.add(portHazard);

      const starHazard = new Mesh(
        bevelBox(0.014, 0.038, 0.44, 0.002, 0.004, 2),
        hazardStripeMat,
      );
      starHazard.name = `StarboardHazardStripe_${i + 1}`;
      starHazard.position.set(1.48, 0.52, panelZ);
      cabinWallsGroup.add(starHazard);
    }
  }

  // Horizontal Cable Conduits running along Port & Starboard Walls
  const portConduit = new Mesh(
    new CylinderGeometry(0.016, 0.016, 1.88, 12),
    conduitMat,
  );
  portConduit.name = 'PortCableConduit';
  portConduit.position.set(-1.46, 1.88, 0.12);
  portConduit.rotation.set(Math.PI / 2, 0, 0);
  cabinWallsGroup.add(portConduit);

  const starConduit = new Mesh(
    new CylinderGeometry(0.016, 0.016, 1.88, 12),
    conduitMat,
  );
  starConduit.name = 'StarboardCableConduit';
  starConduit.position.set(1.46, 1.88, 0.12);
  starConduit.rotation.set(Math.PI / 2, 0, 0);
  cabinWallsGroup.add(starConduit);

  // 8. Overhead Cockpit Ceiling Canopy, Avionics Housing & Indirect Lighting
  const cabinCeilingGroup = new Group();
  cabinCeilingGroup.name = 'CockpitOverheadCeiling';

  const mainCeilingPlate = new Mesh(
    bevelBox(3.08, 0.058, 1.96, 0.008, 0.018, 2),
    hullDarkMat,
  );
  mainCeilingPlate.name = 'CockpitCeilingSlab';
  mainCeilingPlate.position.set(0, 2.22, 0.12);
  cabinCeilingGroup.add(mainCeilingPlate);

  // Transverse Arch Beams across Ceiling
  for (let i = 0; i < 3; i++) {
    const az = -0.58 + i * 0.68;
    const archBeam = new Mesh(
      bevelBox(3.02, 0.062, 0.058, 0.006, 0.012, 2),
      titaniumRimMat,
    );
    archBeam.name = `CeilingStructuralArch_${i + 1}`;
    archBeam.position.set(0, 2.18, az);
    cabinCeilingGroup.add(archBeam);
  }

  // Central Overhead Avionics Housing
  const avionicsHousing = new Mesh(
    bevelBox(0.68, 0.11, 1.35, 0.008, 0.018, 2),
    gunmetalBezelMat,
  );
  avionicsHousing.name = 'OverheadAvionicsHousing';
  avionicsHousing.position.set(0, 2.14, 0.15);
  cabinCeilingGroup.add(avionicsHousing);

  const avionicsBreakerFace = new Mesh(
    bevelBox(0.58, 0.024, 1.22, 0.004, 0.008, 2),
    carbonWellMat,
  );
  avionicsBreakerFace.name = 'OverheadAvionicsFaceplate';
  avionicsBreakerFace.position.set(0, 2.08, 0.15);
  cabinCeilingGroup.add(avionicsBreakerFace);

  // Recessed Indirect Cockpit Floodlights (Warm Amber + Cool Cyan)
  const portFloodLight = new Mesh(
    bevelBox(0.48, 0.022, 0.14, 0.003, 0.006, 2),
    floodLightWarmMat,
  );
  portFloodLight.name = 'OverheadFloodLight_Port';
  portFloodLight.position.set(-0.76, 2.18, 0.15);
  cabinCeilingGroup.add(portFloodLight);

  const starFloodLight = new Mesh(
    bevelBox(0.48, 0.022, 0.14, 0.003, 0.006, 2),
    floodLightWarmMat,
  );
  starFloodLight.name = 'OverheadFloodLight_Starboard';
  starFloodLight.position.set(0.76, 2.18, 0.15);
  cabinCeilingGroup.add(starFloodLight);

  const ceilingBeacon = new Mesh(
    new CylinderGeometry(0.018, 0.018, 0.022, 16),
    cyanAccentMat,
  );
  ceilingBeacon.name = 'OverheadAvionicsStatusBeacon';
  ceilingBeacon.position.set(0, 2.06, -0.42);
  cabinCeilingGroup.add(ceilingBeacon);

  // 9. Heavy Multi-Pane Panoramic Cupola Window Frame & Atmospheric Planetary Limb
  const cupolaGroup = new Group();
  cupolaGroup.name = 'OrbitalCupolaFrame';

  // Subtle glowing atmospheric Earth-horizon limb arc in deep space behind the station
  const horizonGlowMat = new MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.38,
  });
  const horizonSubGlowMat = new MeshBasicMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.22,
  });

  const horizonArc = new Mesh(
    new TorusGeometry(3.4, 0.022, 12, 96, Math.PI * 0.52),
    horizonGlowMat,
  );
  horizonArc.name = 'PlanetaryHorizonLimbArc';
  horizonArc.position.set(0, -2.35, -1.65);
  horizonArc.rotation.set(0, 0, Math.PI * 0.24);
  cupolaGroup.add(horizonArc);

  const horizonHaloArc = new Mesh(
    new TorusGeometry(3.43, 0.065, 12, 96, Math.PI * 0.52),
    horizonSubGlowMat,
  );
  horizonHaloArc.name = 'PlanetaryHorizonHaloArc';
  horizonHaloArc.position.set(0, -2.35, -1.68);
  horizonHaloArc.rotation.set(0, 0, Math.PI * 0.24);
  cupolaGroup.add(horizonHaloArc);

  // Lower Forward Viewport Sill (Heavy Beveled Armor Beam with Double Trim)
  const sillBeam = new Mesh(
    bevelBox(2.98, 0.052, 0.078, 0.008, 0.016, 2),
    hullDarkMat,
  );
  sillBeam.name = 'CupolaForwardSill';
  sillBeam.position.set(0, 0.69, -0.88);
  cupolaGroup.add(sillBeam);

  const sillTrim = new Mesh(
    bevelBox(2.98, 0.018, 0.032, 0.003, 0.008, 2),
    titaniumRimMat,
  );
  sillTrim.name = 'CupolaForwardSillTrim';
  sillTrim.position.set(0, 0.72, -0.88);
  cupolaGroup.add(sillTrim);

  // Upper Canopy Header Arch connecting mullions to the ceiling
  const canopyHeaderBeam = new Mesh(
    bevelBox(2.98, 0.058, 0.072, 0.008, 0.016, 2),
    hullDarkMat,
  );
  canopyHeaderBeam.name = 'CupolaCanopyHeader';
  canopyHeaderBeam.position.set(0, 2.18, -0.92);
  cupolaGroup.add(canopyHeaderBeam);

  const headerTrim = new Mesh(
    bevelBox(2.98, 0.018, 0.028, 0.003, 0.006, 2),
    titaniumRimMat,
  );
  headerTrim.name = 'CupolaHeaderTrim';
  headerTrim.position.set(0, 2.15, -0.92);
  cupolaGroup.add(headerTrim);

  // 4 Arched Heavy Structural Window Mullions framing 5 Distinct Panoramic Panes!
  const mullionGeo = new CylinderGeometry(0.036, 0.046, 1, 16);

  // 1. Port Outer Mullion (Connecting Left Wall to Window Header)
  const portOuterMullion = new Mesh(mullionGeo, gunmetalBezelMat);
  portOuterMullion.name = 'LeftCupolaWindowMullion';
  const pOuterSpan = alignSpan(
    portOuterMullion,
    new Vector3(-1.46, 0.70, -0.52),
    new Vector3(-1.32, 2.16, -0.88),
  );
  portOuterMullion.scale.set(1, pOuterSpan, 1);
  cupolaGroup.add(portOuterMullion);

  // 2. Port Center Mullion (Framing Central Earth Viewport)
  const portCenterMullion = new Mesh(mullionGeo, titaniumRimMat);
  portCenterMullion.name = 'PortCenterWindowMullion';
  const pCenterSpan = alignSpan(
    portCenterMullion,
    new Vector3(-0.62, 0.70, -0.88),
    new Vector3(-0.54, 2.16, -0.92),
  );
  portCenterMullion.scale.set(1, pCenterSpan, 1);
  cupolaGroup.add(portCenterMullion);

  // 3. Starboard Center Mullion (Framing Central Earth Viewport)
  const starCenterMullion = new Mesh(mullionGeo, titaniumRimMat);
  starCenterMullion.name = 'StarboardCenterWindowMullion';
  const sCenterSpan = alignSpan(
    starCenterMullion,
    new Vector3(0.62, 0.70, -0.88),
    new Vector3(0.54, 2.16, -0.92),
  );
  starCenterMullion.scale.set(1, sCenterSpan, 1);
  cupolaGroup.add(starCenterMullion);

  // 4. Starboard Outer Mullion (Connecting Right Wall to Window Header)
  const starOuterMullion = new Mesh(mullionGeo, gunmetalBezelMat);
  starOuterMullion.name = 'RightCupolaWindowMullion';
  const sOuterSpan = alignSpan(
    starOuterMullion,
    new Vector3(1.46, 0.70, -0.52),
    new Vector3(1.32, 2.16, -0.88),
  );
  starOuterMullion.scale.set(1, sOuterSpan, 1);
  cupolaGroup.add(starOuterMullion);

  // Transverse Intermediate Horizontal Window Stiffeners (Creating Upper & Lower Bay Panes)
  const leftMidTransverse = new Mesh(
    bevelBox(0.82, 0.038, 0.046, 0.005, 0.01, 2),
    gunmetalBezelMat,
  );
  leftMidTransverse.name = 'LeftMidTransverseBeam';
  leftMidTransverse.position.set(-1.02, 1.48, -0.72);
  leftMidTransverse.rotation.set(0, 0.32, 0);
  cupolaGroup.add(leftMidTransverse);

  const rightMidTransverse = new Mesh(
    bevelBox(0.82, 0.038, 0.046, 0.005, 0.01, 2),
    gunmetalBezelMat,
  );
  rightMidTransverse.name = 'RightMidTransverseBeam';
  rightMidTransverse.position.set(1.02, 1.48, -0.72);
  rightMidTransverse.rotation.set(0, -0.32, 0);
  cupolaGroup.add(rightMidTransverse);

  // Heavy Structural Corner Gusset Plates (8 Total) with Embedded Status LEDs
  const gussetGeo = bevelBox(0.24, 0.14, 0.048, 0.006, 0.012, 2);

  // Upper Left Outer Gusset
  const leftGusset = new Mesh(gussetGeo, hullDarkMat);
  leftGusset.name = 'LeftCupolaGusset';
  leftGusset.position.set(-1.28, 2.08, -0.89);
  leftGusset.rotation.set(0, 0, -0.32);
  cupolaGroup.add(leftGusset);

  const leftGussetPip = new Mesh(
    new CylinderGeometry(0.008, 0.008, 0.014, 12),
    emeraldWaveguideMat,
  );
  leftGussetPip.name = 'LeftGussetStatusPip';
  leftGussetPip.position.set(-1.28, 2.09, -0.87);
  cupolaGroup.add(leftGussetPip);

  // Upper Right Outer Gusset
  const rightGusset = new Mesh(gussetGeo, hullDarkMat);
  rightGusset.name = 'RightCupolaGusset';
  rightGusset.position.set(1.28, 2.08, -0.89);
  rightGusset.rotation.set(0, 0, 0.32);
  cupolaGroup.add(rightGusset);

  const rightGussetPip = new Mesh(
    new CylinderGeometry(0.008, 0.008, 0.014, 12),
    cyanAccentMat,
  );
  rightGussetPip.name = 'RightGussetStatusPip';
  rightGussetPip.position.set(1.28, 2.09, -0.87);
  cupolaGroup.add(rightGussetPip);

  // Central Viewport Inner Gussets (Port & Starboard)
  const portInnerGusset = new Mesh(
    bevelBox(0.18, 0.10, 0.044, 0.004, 0.008, 2),
    hullDarkMat,
  );
  portInnerGusset.name = 'PortInnerCupolaGusset';
  portInnerGusset.position.set(-0.54, 2.10, -0.91);
  portInnerGusset.rotation.set(0, 0, -0.25);
  cupolaGroup.add(portInnerGusset);

  const starInnerGusset = new Mesh(
    bevelBox(0.18, 0.10, 0.044, 0.004, 0.008, 2),
    hullDarkMat,
  );
  starInnerGusset.name = 'StarboardInnerCupolaGusset';
  starInnerGusset.position.set(0.54, 2.10, -0.91);
  starInnerGusset.rotation.set(0, 0, 0.25);
  cupolaGroup.add(starInnerGusset);

  // Lower Corner Gussets (Base Reinforcement)
  const portLowerGusset = new Mesh(
    bevelBox(0.20, 0.12, 0.044, 0.005, 0.01, 2),
    hullDarkMat,
  );
  portLowerGusset.name = 'PortLowerCupolaGusset';
  portLowerGusset.position.set(-1.38, 0.74, -0.62);
  portLowerGusset.rotation.set(0, 0, 0.32);
  cupolaGroup.add(portLowerGusset);

  const starLowerGusset = new Mesh(
    bevelBox(0.20, 0.12, 0.044, 0.005, 0.01, 2),
    hullDarkMat,
  );
  starLowerGusset.name = 'StarboardLowerCupolaGusset';
  starLowerGusset.position.set(1.38, 0.74, -0.62);
  starLowerGusset.rotation.set(0, 0, -0.32);
  cupolaGroup.add(starLowerGusset);

  // 10. Heavy Aerodynamic Canopy Brow Arch & Anti-Reflective Viewport Glass Glare
  const canopyBrowBeam = new Mesh(
    bevelBox(2.96, 0.046, 0.088, 0.006, 0.014, 2),
    hullDarkMat,
  );
  canopyBrowBeam.name = 'CanopyBrowStrut';
  canopyBrowBeam.position.set(0, 1.96, -0.90);
  cupolaGroup.add(canopyBrowBeam);

  // Anti-reflective aerospace glass glare layer (subtle optical reflection)
  const canopyGlassMat = new MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.032,
    depthWrite: false,
    side: DoubleSide,
  });
  const canopyGlass = new Mesh(
    bevelBox(2.88, 1.35, 0.004, 0.001, 0.002, 1),
    canopyGlassMat,
  );
  canopyGlass.name = 'CanopyGlassGlare';
  canopyGlass.position.set(0, 1.44, -0.87);
  cupolaGroup.add(canopyGlass);

  // 11. Breathtaking 2,500-Star Procedural Deep-Space Celestial Sphere in 1 single draw call
  const starGeo = buildDeepSpaceStarfieldGeometry();
  const starMat = new PointsMaterial({
    vertexColors: true,
    size: 0.042,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const starfieldDome = new Points(starGeo, starMat);
  starfieldDome.name = 'CupolaStarfieldDome';
  cupolaGroup.add(starfieldDome);

  // 1. Merge console pedestal and deck together into a unified console desk assembly
  const consoleDesk = new Group();
  consoleDesk.name = 'ConsoleDeskAssembly';
  consoleDesk.add(baseGroup, deckGroup);
  mergeStaticMeshesByMaterial(consoleDesk);
  root.add(consoleDesk);

  // 2. Merge surrounding cockpit cabin interior and cupola frame
  const cabinEnclosureShell = new Group();
  cabinEnclosureShell.name = 'CockpitEnclosureShell';
  cabinEnclosureShell.add(cabinFloorGroup, cabinWallsGroup, cabinCeilingGroup, cupolaGroup);
  mergeStaticMeshesByMaterial(cabinEnclosureShell);
  root.add(cabinEnclosureShell);
  root.userData.hasCanopyBrowStrut = true;

  // Dynamic interactive stations added after static merge to preserve animation transforms & material states
  root.add(cradleGroup);
  root.add(downlinkDynamicGroup);

  // Dynamic Panoramic Deep-Space Milky Way Cosmic Dome (textured with milky-way-tex at runtime)
  const cosmicSkyGeo = new SphereGeometry(12.0, 28, 18);
  const cosmicSkyMat = new MeshBasicMaterial({
    side: BackSide,
    transparent: true,
    opacity: 0.90,
    depthWrite: false,
    color: 0x18243b,
  });
  cosmicSkyMat.name = 'MilkyWayCosmicDomeMat';
  const cosmicSkyDome = new Mesh(cosmicSkyGeo, cosmicSkyMat);
  cosmicSkyDome.name = 'MilkyWayCosmicDome';
  cosmicSkyDome.position.set(0, 1.25, -0.6);
  cosmicSkyDome.rotation.set(0.15, -0.4, 0.05);
  root.add(cosmicSkyDome);

  return root;
}

function buildDeepSpaceStarfieldGeometry(): BufferGeometry {
  const geo = new BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];

  // Deterministic LCG random generator (seed 42819)
  let seed = 42819;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const starCount = 2500;
  const radius = 18.5; // Outer deep-space celestial dome

  for (let i = 0; i < starCount; i++) {
    // Generate spherical points across forward and panoramic hemisphere
    const azimuth = (rand() - 0.5) * Math.PI * 1.85;
    const elevation = -0.35 + rand() * 1.55;

    const rDist = radius + (rand() - 0.5) * 6.0;
    const cx = Math.sin(azimuth) * Math.cos(elevation) * rDist;
    const cy = 1.25 + Math.sin(elevation) * rDist;
    const cz = -Math.cos(azimuth) * Math.cos(elevation) * rDist - 2.0;

    positions.push(cx, cy, cz);

    // Harvard Spectral Classification Color Palette
    const spectralType = rand();
    const brightness = 0.55 + rand() * 0.45;
    let r = brightness;
    let g = brightness;
    let b = brightness;

    if (spectralType < 0.58) {
      // Class M/K warm orange-amber dwarfs (58%)
      r = brightness * 1.0;
      g = brightness * 0.82;
      b = brightness * 0.62;
    } else if (spectralType < 0.82) {
      // Class G/F solar white-yellow stars (24%)
      r = brightness * 0.98;
      g = brightness * 0.98;
      b = brightness * 1.0;
    } else {
      // Class B/A bright electric cyan/blue stars (18%)
      r = brightness * 0.65;
      g = brightness * 0.88;
      b = brightness * 1.0;
    }

    colors.push(r, g, b);
  }

  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geo;
}
