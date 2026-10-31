/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Procedural 3D Scene Asset: COMMANDER ARIA-7 Holographic AI Avatar
 *
 * Diegetic tactical AI operator mounted on the cockpit console at [-0.42, 1.15, -0.48]:
 * - Icosahedron wireframe diamond core (AriaCore) with emerald/cyan emissive glow
 * - 3 concentric gyroscopic waveform rings (AriaRing1, AriaRing2, AriaRing3)
 *   tilted at authentic orbital angles (25 deg, -35 deg, 45 deg)
 * - Recessed console projector emitter with lens ring
 * - Audio-reactive animation: idle gyroscopic spin -> rapid pulse & expansion during active speech
 */

import {
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
} from '@iwsdk/core';
import { mergeStaticMeshesByMaterial } from './lib/hardsurface';

export function createAvatarAriaAsset(): Object3D {
  const root = new Group();
  root.name = 'AvatarAria';

  // Base materials (shared to minimize draw calls)
  const emitterLensMat = new MeshStandardMaterial({
    color: 0x0891b2,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.9,
    roughness: 0.2,
    metalness: 0.5,
  });

  const coreWireframeMat = new MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x0891b2,
    emissiveIntensity: 1.25,
    wireframe: true,
    roughness: 0.2,
    metalness: 0.7,
  });

  const ringMat = new MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x0284c7,
    emissiveIntensity: 1.05,
    roughness: 0.25,
    metalness: 0.8,
  });

  // 1. Recessed console mounting puck & Holographic projector emitter disc
  // Merged into 1 single draw call
  const mountGroup = new Group();
  mountGroup.name = 'AriaMount';

  const basePuck = new Mesh(
    new CylinderGeometry(0.06, 0.07, 0.018, 16),
    emitterLensMat,
  );
  basePuck.name = 'AriaBase';
  basePuck.position.set(0, -0.065, 0);
  mountGroup.add(basePuck);

  const emitterDisc = new Mesh(
    new CylinderGeometry(0.042, 0.045, 0.008, 16),
    emitterLensMat,
  );
  emitterDisc.name = 'AriaEmitter';
  emitterDisc.position.set(0, -0.055, 0);
  mountGroup.add(emitterDisc);

  mergeStaticMeshesByMaterial(mountGroup);
  // Ensure queryable by name for pulse animation in missionControlSystem
  mountGroup.children.forEach((c) => { c.name = 'AriaEmitter'; });
  root.add(mountGroup);

  // 3. Central Wireframe Visage Core (Icosahedron diamond)
  const coreMesh = new Mesh(
    new IcosahedronGeometry(0.042, 0),
    coreWireframeMat,
  );
  coreMesh.name = 'AriaCore';
  coreMesh.position.set(0, 0.015, 0);
  root.add(coreMesh);

  // 4. Concentric Waveform Audio-Reactive Rings
  // Ring 1: Inner ring (radius 0.062m, tilt 25 deg)
  const ring1 = new Mesh(
    new TorusGeometry(0.062, 0.0016, 12, 36),
    ringMat,
  );
  ring1.name = 'AriaRing1';
  ring1.position.set(0, 0.015, 0);
  ring1.rotation.set(0.436, 0, 0); // ~25 deg pitch
  root.add(ring1);

  // Ring 2: Mid ring (radius 0.082m, tilt -35 deg)
  const ring2 = new Mesh(
    new TorusGeometry(0.082, 0.0018, 12, 40),
    ringMat,
  );
  ring2.name = 'AriaRing2';
  ring2.position.set(0, 0.015, 0);
  ring2.rotation.set(-0.611, 0.35, 0); // ~-35 deg pitch, 20 deg yaw
  root.add(ring2);

  // Ring 3: Outer perimeter ring (radius 0.102m, tilt 45 deg)
  const ring3 = new Mesh(
    new TorusGeometry(0.102, 0.002, 12, 44),
    ringMat,
  );
  ring3.name = 'AriaRing3';
  ring3.position.set(0, 0.015, 0);
  ring3.rotation.set(0.785, -0.45, 0); // ~45 deg pitch, -26 deg yaw
  root.add(ring3);

  return root;
}
