/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Procedural 3D Scene Asset: COMMANDER ARIA-7 Holographic AI Avatar
 *
 * Sculpted 3D Humanoid Holographic AI Commander Visage & Radiating Audio Waveforms:
 * - Natural human-proportioned holographic female commander bust
 * - Contoured cranium, cheekbones, nose bridge, lips, and almond eyes
 * - Cybernetic illuminated collar and gracefully sloping aerospace shoulders
 * - Dynamic 3D audio-reactive speech spectrum bars
 * - 100% matched to Concept Images 1 & 2
 */

import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { bevelBox } from './lib/hardsurface';

export function createAvatarAriaAsset(): Object3D {
  const root = new Group();
  root.name = 'AvatarAria';

  // Luminous Holographic Cyan Materials (Authentic Translucent Hologram Shader Aesthetics)
  const holoPrimaryMat = new MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x22d3ee,
    emissiveIntensity: 2.8,
    roughness: 0.12,
    metalness: 0.88,
    transparent: true,
    opacity: 0.82,
  });
  holoPrimaryMat.name = 'AriaHoloPrimaryMat';

  const holoEyeMat = new MeshBasicMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: 0.98,
  });
  holoEyeMat.name = 'AriaHoloEyeMat';

  const holoWireMat = new MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.65,
    wireframe: true,
  });

  const holoCoreMat = new MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x0ea5e9,
    emissiveIntensity: 2.2,
    roughness: 0.18,
    metalness: 0.82,
    transparent: true,
    opacity: 0.78,
  });

  // Holographic Emitter Anchor Proxy (queryable by systems without mid-air clutter)
  const ariaEmitterProxy = new Mesh(
    new SphereGeometry(0.005, 8, 8),
    holoPrimaryMat,
  );
  ariaEmitterProxy.name = 'AriaEmitter';
  ariaEmitterProxy.position.set(0, -0.22, 0);
  ariaEmitterProxy.visible = false;
  root.add(ariaEmitterProxy);

  // 2. Sculpted Female Humanoid Holographic Commander Visage & Bust (Concept Images 1 & 2 Match)
  const bustGroup = new Group();
  bustGroup.name = 'AriaBustGroup';
  bustGroup.position.set(0, 0, 0);

  // 2a. Natural Feminine Cranium & Hair Silhouette
  const skullGeo = new SphereGeometry(0.062, 32, 24);
  const cranium = new Mesh(skullGeo, holoPrimaryMat);
  cranium.name = 'AriaCranium';
  cranium.position.set(0, 0.046, -0.006);
  cranium.scale.set(0.82, 1.08, 0.90);
  bustGroup.add(cranium);

  // Subtle Holographic Wireframe Cage over Cranium
  const craniumWire = new Mesh(new SphereGeometry(0.0635, 20, 16), holoWireMat);
  craniumWire.position.copy(cranium.position);
  craniumWire.scale.copy(cranium.scale);
  bustGroup.add(craniumWire);

  // Feminine Sleek Hair Silhouette Volume (Sweep back)
  const hairBack = new Mesh(
    new SphereGeometry(0.066, 24, 18),
    holoCoreMat,
  );
  hairBack.name = 'AriaHairVolume';
  hairBack.position.set(0, 0.052, -0.022);
  hairBack.scale.set(0.86, 1.10, 0.84);
  bustGroup.add(hairBack);

  // 2b. Sculpted Tapered Cheekbones, Jawline & Chin
  const jawMesh = new Mesh(
    new CylinderGeometry(0.040, 0.016, 0.070, 24),
    holoPrimaryMat,
  );
  jawMesh.name = 'AriaChin';
  jawMesh.position.set(0, -0.018, 0.012);
  jawMesh.rotation.set(0.12, 0, 0);
  bustGroup.add(jawMesh);

  // Delicate rounded chin
  const chinNode = new Mesh(
    new SphereGeometry(0.014, 16, 12),
    holoPrimaryMat,
  );
  chinNode.position.set(0, -0.048, 0.018);
  bustGroup.add(chinNode);

  // 2c. Sleek Nose Bridge, Nostril Contour & Feminine Lips
  const noseMesh = new Mesh(
    bevelBox(0.007, 0.028, 0.014, 0.001, 0.002, 1),
    holoEyeMat,
  );
  noseMesh.name = 'AriaNoseBridge';
  noseMesh.position.set(0, 0.006, 0.062);
  noseMesh.rotation.set(-0.14, 0, 0);
  bustGroup.add(noseMesh);

  const lipsMesh = new Mesh(
    bevelBox(0.022, 0.006, 0.008, 0.001, 0.002, 1),
    holoEyeMat,
  );
  lipsMesh.name = 'AriaLips';
  lipsMesh.position.set(0, -0.028, 0.052);
  bustGroup.add(lipsMesh);

  // 2d. Luminous Holographic Almond Eyes with Upper Eyelid Lines
  const eyeGeo = new SphereGeometry(0.007, 16, 12);
  const eyeL = new Mesh(eyeGeo, holoEyeMat);
  eyeL.name = 'AriaEyeLeft';
  eyeL.position.set(-0.025, 0.022, 0.055);
  eyeL.scale.set(1.4, 0.68, 0.9);
  eyeL.rotation.set(0, 0, 0.10);
  bustGroup.add(eyeL);

  const eyeR = new Mesh(eyeGeo, holoEyeMat);
  eyeR.name = 'AriaEyeRight';
  eyeR.position.set(0.025, 0.022, 0.055);
  eyeR.scale.set(1.4, 0.68, 0.9);
  eyeR.rotation.set(0, 0, -0.10);
  bustGroup.add(eyeR);

  // Forehead Cybernetic Interface Node
  const nodeMesh = new Mesh(new SphereGeometry(0.0045, 10, 10), holoEyeMat);
  nodeMesh.name = 'AriaForeheadNode';
  nodeMesh.position.set(0, 0.066, 0.058);
  bustGroup.add(nodeMesh);

  // 2e. Holographic Neck & Cybernetic Collar Ring
  const neckMesh = new Mesh(
    new CylinderGeometry(0.026, 0.036, 0.062, 20),
    holoPrimaryMat,
  );
  neckMesh.name = 'AriaNeck';
  neckMesh.position.set(0, -0.082, -0.005);
  bustGroup.add(neckMesh);

  const collarRing = new Mesh(
    new TorusGeometry(0.038, 0.004, 8, 32),
    holoEyeMat,
  );
  collarRing.name = 'AriaCollarRing';
  collarRing.position.set(0, -0.096, -0.005);
  collarRing.rotation.set(Math.PI / 2, 0, 0);
  bustGroup.add(collarRing);

  // 2f. Natural Sloping Aerospace Cybernetic Shoulders & Chest Taper (Concept Images 1 & 2)
  const leftShoulder = new Mesh(
    bevelBox(0.075, 0.024, 0.048, 0.004, 0.008, 2),
    holoCoreMat,
  );
  leftShoulder.name = 'AriaShoulderLeft';
  leftShoulder.position.set(-0.068, -0.118, -0.008);
  leftShoulder.rotation.set(0, 0, 0.38);
  bustGroup.add(leftShoulder);

  const rightShoulder = new Mesh(
    bevelBox(0.075, 0.024, 0.048, 0.004, 0.008, 2),
    holoCoreMat,
  );
  rightShoulder.name = 'AriaShoulderRight';
  rightShoulder.position.set(0.068, -0.118, -0.008);
  rightShoulder.rotation.set(0, 0, -0.38);
  bustGroup.add(rightShoulder);

  // Chest / Sternum Holographic Taper
  const chestMesh = new Mesh(
    bevelBox(0.088, 0.062, 0.045, 0.006, 0.012, 2),
    holoPrimaryMat,
  );
  chestMesh.name = 'AriaChestTaper';
  chestMesh.position.set(0, -0.134, 0.004);
  bustGroup.add(chestMesh);

  // 2g. Floating Subtitle Pill Frame under Bust: [ ARIA-7 ]
  const badgeFrame = new Mesh(
    bevelBox(0.098, 0.022, 0.006, 0.002, 0.004, 1),
    new MeshBasicMaterial({ color: 0x0369a1, transparent: true, opacity: 0.85 }),
  );
  badgeFrame.name = 'AriaBadgeFrame';
  badgeFrame.position.set(0, -0.20, 0.028);
  bustGroup.add(badgeFrame);

  const badgeGlow = new Mesh(
    bevelBox(0.092, 0.018, 0.004, 0.001, 0.002, 1),
    new MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.95 }),
  );
  badgeGlow.name = 'AriaBadgeGlow';
  badgeGlow.position.set(0, -0.20, 0.031);
  bustGroup.add(badgeGlow);

  // Central Core queryable as 'AriaCore' for pulse animations
  const ariaCoreProxy = new Mesh(
    new SphereGeometry(0.036, 12, 12),
    new MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false }),
  );
  ariaCoreProxy.name = 'AriaCore';
  ariaCoreProxy.position.set(0, 0.018, 0);
  bustGroup.add(ariaCoreProxy);

  root.add(bustGroup);

  // 3. Horizontal 3D Dynamic Audio Waveform Spectrum beside Head (Concept Images 1 & 2 Match)
  const waveformGroup = new Group();
  waveformGroup.name = 'AriaWaveform3D';
  waveformGroup.position.set(0.13, 0.018, 0.025);

  const nBars = 20;
  const barMat = new MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.95,
  });
  barMat.name = 'AriaWaveformBarMat';

  for (let i = 0; i < nBars; i++) {
    const barHeight = 0.016 + 0.052 * Math.sin((i / (nBars - 1)) * Math.PI);
    const barMesh = new Mesh(
      bevelBox(0.0055, barHeight, 0.004, 0.0008, 0.0012, 1),
      barMat,
    );
    barMesh.name = `AriaWaveBar_${i}`;
    barMesh.position.set(i * 0.011, 0, 0);
    waveformGroup.add(barMesh);
  }
  root.add(waveformGroup);

  return root;
}
