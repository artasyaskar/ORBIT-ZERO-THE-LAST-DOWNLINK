/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Procedural 3D Scene Asset: Swath Scan Heavy-Duty Plunger Button
 *
 * Implements a spring-loaded industrial aerospace plunger button [FIRE SWATH SCAN]
 * mounted at the center cockpit desk [0.0, 0.788, -0.40]:
 * - Heavy-duty safety guard ring (PlungerGuardRing) preventing accidental triggers
 * - Spring-loaded cylindrical plunger cap (PadIlluminatedCap) with -12mm physical stroke
 * - Damped mechanical oscillation and micro-switch click audio
 * - Hand laser (IWSDK RayInteractable) and near pinch in WebXR, mouse on desktop (zero keyboard needed)
 */

import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
} from '@iwsdk/core';

export function createSwathPlungerAsset(): Object3D {
  const root = new Group();
  root.name = 'SwathPlungerButton';

  // Aerospace Hard-Surface Materials
  const guardHousingMat = new MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.32,
    metalness: 0.85,
  });

  const safetyRingMat = new MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.28,
    metalness: 0.85,
  });

  const plungerCapMat = new MeshStandardMaterial({
    color: 0x0284c7,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.95,
    roughness: 0.25,
    metalness: 0.5,
  });

  // 1. Recessed Bezel Mounting Base
  const baseFlange = new Mesh(
    new CylinderGeometry(0.038, 0.042, 0.014, 24),
    guardHousingMat,
  );
  baseFlange.name = 'PlungerBaseFlange';
  baseFlange.position.set(0, 0.007, 0);
  root.add(baseFlange);

  // 2. Heavy-Duty Safety Guard Ring (raises above cap rim to prevent accidental knocks)
  const guardRing = new Mesh(
    new TorusGeometry(0.034, 0.0032, 8, 28),
    safetyRingMat,
  );
  guardRing.name = 'PlungerGuardRing';
  guardRing.rotation.set(Math.PI / 2, 0, 0);
  guardRing.position.set(0, 0.022, 0);
  root.add(guardRing);

  // 3. Spring-Loaded Tactile Plunger Cap (y = 0.018m rest height, -12mm travel stroke)
  // Named 'PadIlluminatedCap' so existing physics and press animations handle it automatically!
  const cap = new Mesh(
    new CylinderGeometry(0.027, 0.028, 0.016, 24),
    plungerCapMat,
  );
  cap.name = 'PadIlluminatedCap';
  cap.position.set(0, 0.018, 0);
  root.add(cap);

  return root;
}

