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
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
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
    color: 0x0284c7,
    emissive: 0x38bdf8,
    emissiveIntensity: 2.5,
    roughness: 0.15,
    metalness: 0.85,
    transparent: true,
    opacity: 0.85,
  });
  holoPrimaryMat.name = 'AriaHoloPrimaryMat';

  const holoEyeMat = new MeshBasicMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.98,
  });
  holoEyeMat.name = 'AriaHoloEyeMat';

  const holoWireMat = new MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.25,
    wireframe: false,
  });

  const holoCoreMat = new MeshStandardMaterial({
    color: 0x0369a1,
    emissive: 0x0ea5e9,
    emissiveIntensity: 2.0,
    roughness: 0.20,
    metalness: 0.80,
    transparent: true,
    opacity: 0.80,
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
  bustGroup.visible = false; // Legacy primitive mannequin hidden in favor of crisp holographic vector portrait plate

  // 2a. Natural Feminine Cranium & Hair Silhouette
  const skullGeo = new SphereGeometry(0.062, 32, 24);
  const cranium = new Mesh(skullGeo, holoPrimaryMat);
  cranium.name = 'AriaCranium';
  cranium.position.set(0, 0.046, -0.006);
  cranium.scale.set(0.82, 1.08, 0.90);
  bustGroup.add(cranium);

  // Ethereal Holographic Halo Ring framing AI cranium
  const craniumHalo = new Mesh(
    new TorusGeometry(0.064, 0.0022, 8, 36),
    new MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 })
  );
  craniumHalo.name = 'AriaHaloRing';
  craniumHalo.position.set(0, 0.092, -0.006);
  craniumHalo.rotation.set(Math.PI / 2, 0, 0);
  bustGroup.add(craniumHalo);

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

  // 1 InstancedMesh for all 20 bars (normalized unit height 1.0)
  const baseBarGeo = new BoxGeometry(0.0055, 1.0, 0.004);
  const instancedBars = new InstancedMesh(baseBarGeo, barMat, nBars);
  instancedBars.name = 'AriaWaveformInstancedBars';
  instancedBars.instanceMatrix.setUsage(DynamicDrawUsage);

  const dummy = new Object3D();
  for (let i = 0; i < nBars; i++) {
    const barHeight = 0.016 + 0.052 * Math.sin((i / (nBars - 1)) * Math.PI);
    dummy.position.set(i * 0.011, 0, 0);
    dummy.scale.set(1.0, barHeight, 1.0);
    dummy.updateMatrix();
    instancedBars.setMatrixAt(i, dummy.matrix);

    // Backward-compatible query proxy (Object3D prevents InputSystem BVH generation errors)
    const proxyMesh = new Object3D();
    proxyMesh.name = `AriaWaveBar_${i}`;
    proxyMesh.visible = false;
    waveformGroup.add(proxyMesh);
  }
  instancedBars.instanceMatrix.needsUpdate = true;
  waveformGroup.add(instancedBars);
  root.add(waveformGroup);

  // 4. High-Definition Ethereal Holographic AI Commander Visage Plate (Concept Images 1 & 2 Match)
  const portraitTex = createAriaPortraitTexture();
  if (portraitTex) {
    const portraitMat = new MeshBasicMaterial({
      map: portraitTex,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      forceSinglePass: true, // flat additive plate: one pass looks the same as three.js's back+front passes
    });
    portraitMat.name = 'AriaPortraitPlateMat';
    const portraitMesh = new Mesh(new PlaneGeometry(0.26, 0.26), portraitMat);
    portraitMesh.name = 'AriaPortraitPlate';
    portraitMesh.position.set(0, 0.02, 0.02);
    root.add(portraitMesh);

    // Tone down underlying primitive geometry so crisp holographic vector portrait takes focus
    holoPrimaryMat.opacity = 0.18;
    holoEyeMat.opacity = 0.25;
    holoCoreMat.opacity = 0.15;
  }

  return root;
}

function createAriaPortraitTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, 512, 512);

  // Soft cyan radial glow aura behind head
  const radGlow = ctx.createRadialGradient(256, 210, 40, 256, 210, 220);
  radGlow.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
  radGlow.addColorStop(0.5, 'rgba(14, 165, 233, 0.18)');
  radGlow.addColorStop(1, 'rgba(2, 132, 199, 0)');
  ctx.fillStyle = radGlow;
  ctx.fillRect(0, 0, 512, 512);

  // Outer HUD corner targeting brackets
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
  ctx.lineWidth = 3;
  const bLen = 28;
  const m = 36;
  ctx.beginPath(); ctx.moveTo(m, m + bLen); ctx.lineTo(m, m); ctx.lineTo(m + bLen, m); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(512 - m - bLen, m); ctx.lineTo(512 - m, m); ctx.lineTo(512 - m, m + bLen); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(m, 512 - m - bLen); ctx.lineTo(m, 512 - m); ctx.lineTo(m + bLen, 512 - m); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(512 - m - bLen, 512 - m); ctx.lineTo(512 - m, 512 - m); ctx.lineTo(512 - m, 512 - m - bLen); ctx.stroke();

  // Feminine AI Commander Portrait Paths
  ctx.save();
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 12;

  // Head contour & silhouette
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(256, 95);
  ctx.bezierCurveTo(200, 95, 175, 140, 178, 205);
  ctx.bezierCurveTo(180, 250, 195, 285, 220, 315);
  ctx.bezierCurveTo(235, 335, 248, 350, 256, 354);
  ctx.bezierCurveTo(264, 350, 277, 335, 292, 315);
  ctx.bezierCurveTo(317, 285, 332, 250, 334, 205);
  ctx.bezierCurveTo(337, 140, 312, 95, 256, 95);
  ctx.fillStyle = 'rgba(2, 132, 199, 0.35)';
  ctx.fill();
  ctx.stroke();

  // Swept-back aerospace hair locks
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.85)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(256, 96);
  ctx.quadraticCurveTo(210, 115, 172, 175);
  ctx.moveTo(256, 96);
  ctx.quadraticCurveTo(302, 115, 340, 175);
  ctx.moveTo(230, 105);
  ctx.quadraticCurveTo(185, 150, 168, 230);
  ctx.moveTo(282, 105);
  ctx.quadraticCurveTo(327, 150, 344, 230);
  ctx.stroke();

  // Eyebrows
  ctx.strokeStyle = '#bae6fd';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(215, 195);
  ctx.quadraticCurveTo(228, 190, 242, 195);
  ctx.moveTo(270, 195);
  ctx.quadraticCurveTo(284, 190, 297, 195);
  ctx.stroke();

  // Almond Cybernetic Eyes
  ctx.fillStyle = '#bae6fd';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(212, 212);
  ctx.quadraticCurveTo(228, 204, 244, 212);
  ctx.quadraticCurveTo(228, 222, 212, 212);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(228, 212, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(268, 212);
  ctx.quadraticCurveTo(284, 204, 300, 212);
  ctx.quadraticCurveTo(284, 222, 268, 212);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(284, 212, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // Nose Bridge & Tip
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(256, 210);
  ctx.lineTo(254, 252);
  ctx.quadraticCurveTo(256, 256, 260, 252);
  ctx.stroke();

  // Lips
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(238, 285);
  ctx.quadraticCurveTo(256, 280, 274, 285);
  ctx.quadraticCurveTo(256, 293, 238, 285);
  ctx.stroke();

  // Cheekbone contour lines
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(196, 240);
  ctx.quadraticCurveTo(210, 260, 224, 280);
  ctx.moveTo(316, 240);
  ctx.quadraticCurveTo(302, 260, 288, 280);
  ctx.stroke();

  // Neck & Aerospace Cybernetic Collar
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(236, 345);
  ctx.lineTo(230, 395);
  ctx.lineTo(165, 435);
  ctx.moveTo(276, 345);
  ctx.lineTo(282, 395);
  ctx.lineTo(347, 435);
  ctx.moveTo(230, 395);
  ctx.lineTo(256, 420);
  ctx.lineTo(282, 395);
  ctx.stroke();

  // Aerospace Shoulder Slopes
  ctx.beginPath();
  ctx.moveTo(165, 435);
  ctx.lineTo(120, 465);
  ctx.moveTo(347, 435);
  ctx.lineTo(392, 465);
  ctx.stroke();

  // Forehead Cybernetic Interface Node
  ctx.fillStyle = '#e0f2fe';
  ctx.beginPath();
  ctx.arc(256, 155, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(256, 155, 9, 0, Math.PI * 2);
  ctx.stroke();

  // Horizontal Holographic Scanlines
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
  ctx.lineWidth = 1.5;
  for (let y = 80; y < 470; y += 8) {
    ctx.beginPath();
    ctx.moveTo(80, y);
    ctx.lineTo(432, y);
    ctx.stroke();
  }

  // Label [ ARIA-7 ]
  ctx.font = 'bold 26px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#bae6fd';
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 14;
  ctx.fillText('ARIA-7', 256, 482);

  ctx.restore();

  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
