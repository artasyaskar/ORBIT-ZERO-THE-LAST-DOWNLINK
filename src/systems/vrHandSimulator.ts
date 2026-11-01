/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Phase 5: In-Engine VR Hand & Ergonomic Simulator
 *
 * Provides a desktop developer harness and runtime seated ergonomics verifier:
 * 1. Visualizes translucent Meta Quest 3 hand proxies directly in the Three.js viewport.
 * 2. Emulates natural pinch gestures (Right-Click) and index poke gestures (Left-Click).
 * 3. Renders a diegetic seated ergonomic dome displaying exact reach zones:
 *    - Green Zone: r <= 0.45m (Primary Reach Zone: buttons, swath plunger, triage tray)
 *    - Yellow Zone: 0.45m < r <= 0.60m (Secondary Reach Zone: Earth globe, Downlink Bay)
 *    - Red Limit: r = 0.65m (Maximum Seated Boundary: Zero interactive objects permitted beyond 0.65m)
 * 4. Provides deterministic programmatic verification of the 0.35m - 0.65m airplane-seat envelope.
 */

import {
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { bevelBox, mergeStaticMeshesByMaterial } from '../scene-assets/lib/hardsurface';

export interface ReachObjectAudit {
  name: string;
  worldPosition: [number, number, number];
  distance: number;
  zone: 'PRIMARY' | 'SECONDARY' | 'STRETCH' | 'UNACCEPTABLE';
}

export interface ReachVerificationReport {
  pass: boolean;
  minDistance: number;
  maxDistance: number;
  objects: ReachObjectAudit[];
  violations: string[];
}

export class VRHandSimulator {
  public root: Group;
  public leftHand: Group;
  public rightHand: Group;
  public reachDome: Group;

  private isEnabled = false;
  private isPinching = false;
  private isPoking = false;
  private pinchProgress = 0;
  private pokeProgress = 0;

  private rightIndexTip: Object3D | null = null;
  private rightThumbTip: Object3D | null = null;

  private readonly headPosition = new Vector3(0, 1.25, 0);

  constructor() {
    this.root = new Group();
    this.root.name = 'VRHandSimulatorRoot';

    // 1. Build Seated Ergonomic Reach Dome
    this.reachDome = this.buildReachDome();
    this.root.add(this.reachDome);

    // 2. Build Left and Right Hand Proxies
    this.leftHand = this.buildHandProxy(true);
    this.leftHand.position.set(-0.24, 0.87, -0.36);
    this.leftHand.rotation.set(-0.2, 0.25, -0.1);
    this.root.add(this.leftHand);

    this.rightHand = this.buildHandProxy(false);
    this.rightHand.position.set(0.24, 0.87, -0.36);
    this.rightHand.rotation.set(-0.2, -0.25, 0.1);
    this.root.add(this.rightHand);

    this.rightIndexTip = this.rightHand.getObjectByName('IndexTip');
    this.rightThumbTip = this.rightHand.getObjectByName('ThumbTip');

    // Never intercept mouse or controller raycasts
    this.root.traverse((o) => {
      o.raycast = () => {};
    });

    // Default to invisible until explicitly activated
    this.setVisible(false);

    // Auto-enable if ?vrSim=1 is present in browser query params
    if (typeof window !== 'undefined' && window.location?.search?.includes('vrSim=1')) {
      this.setEnabled(true);
    }
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    this.setVisible(enabled);
  }

  public toggle(): boolean {
    this.setEnabled(!this.isEnabled);
    return this.isEnabled;
  }

  public isActive(): boolean {
    return this.isEnabled;
  }

  public setPinching(pinching: boolean): void {
    this.isPinching = pinching;
  }

  public setPoking(poking: boolean): void {
    this.isPoking = poking;
  }

  private setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  /**
   * Updates hand positions, pinch interpolation, and poke gestures each frame.
   */
  public update(delta: number, mouseWorldPos: Vector3 | null = null): void {
    if (!this.isEnabled) return;

    // Smooth pinch animation (0 -> 1)
    const targetPinch = this.isPinching ? 1.0 : 0.0;
    this.pinchProgress += (targetPinch - this.pinchProgress) * Math.min(1.0, delta * 18);

    // Smooth poke animation (0 -> 1)
    const targetPoke = this.isPoking ? 1.0 : 0.0;
    this.pokeProgress += (targetPoke - this.pokeProgress) * Math.min(1.0, delta * 22);

    // Right hand tracks mouse raycast on the 3D console desk plane
    if (mouseWorldPos) {
      const clampedX = Math.max(-0.62, Math.min(0.62, mouseWorldPos.x));
      const clampedY = Math.max(0.82, Math.min(0.98, mouseWorldPos.y + (this.isPoking ? 0.015 : 0.035)));
      const clampedZ = Math.max(-0.68, Math.min(-0.32, mouseWorldPos.z));

      this.rightHand.position.set(clampedX, clampedY, clampedZ);

      // Pitch slightly downward toward console surface
      this.rightHand.rotation.set(-0.25 + this.pokeProgress * 0.15, -0.15, 0.05);
    }

    // Apply pinch gesture (thumb and index fingertips meet)
    if (this.rightIndexTip && this.rightThumbTip) {
      this.rightIndexTip.position.x = 0.008 - this.pinchProgress * 0.012;
      this.rightIndexTip.position.z = 0.045 + this.pokeProgress * 0.025 - this.pinchProgress * 0.008;

      this.rightThumbTip.position.x = -0.016 + this.pinchProgress * 0.012;
      this.rightThumbTip.position.z = 0.032 + this.pinchProgress * 0.005;
    }
  }

  /**
   * Evaluates the seated reach envelope of all interactive scene targets from the seated operator origin.
   */
  public verifySeatedReachEnvelope(
    scene: Object3D,
    getSceneObject?: (id: string) => Object3D | undefined,
  ): ReachVerificationReport {
    const targetsToAudit = [
      'pad-fire-swath',
      'earth-globe',
      'desk-gauges',
      'evidence-cube-1',
      'evidence-cube-2',
      'evidence-cube-3',
      'ProcessingCradleSocket',
      'ProcessingCradleAssembly',
      'DownlinkBayOuterFrame',
      'RawCubeTrayBezel',
      'DiscardChuteRim',
      'pad-toggle-sensor',
      'pad-process-cradle',
      'pad-queue-downlink',
      'pad-commit-downlink',
      'pad-discard-chute',
    ];

    const objects: ReachObjectAudit[] = [];
    const violations: string[] = [];
    let minDistance = Infinity;
    let maxDistance = -Infinity;
    const seatedOrigin = new Vector3(0, 0.83, 0);

    for (const name of targetsToAudit) {
      const obj = (getSceneObject ? getSceneObject(name) : null) ?? scene.getObjectByName(name);
      if (!obj) continue;

      const worldPos = new Vector3();
      obj.getWorldPosition(worldPos);
      const d = worldPos.distanceTo(seatedOrigin);

      if (d < minDistance) minDistance = d;
      if (d > maxDistance) maxDistance = d;

      let zone: 'PRIMARY' | 'SECONDARY' | 'STRETCH' | 'UNACCEPTABLE' = 'PRIMARY';
      if (d <= 0.45) {
        zone = 'PRIMARY';
      } else if (d <= 0.60) {
        zone = 'SECONDARY';
      } else if (d <= 0.65) {
        zone = 'STRETCH';
      } else {
        zone = 'UNACCEPTABLE';
        violations.push(`${name} at ${d.toFixed(3)}m exceeds maximum reach envelope limit (0.65m)`);
      }

      if (d < 0.35) {
        violations.push(`${name} at ${d.toFixed(3)}m is too close to player chest/head (<0.35m)`);
      }

      objects.push({
        name,
        worldPosition: [Number(worldPos.x.toFixed(3)), Number(worldPos.y.toFixed(3)), Number(worldPos.z.toFixed(3))],
        distance: Number(d.toFixed(3)),
        zone,
      });
    }

    return {
      pass: violations.length === 0,
      minDistance: Number(minDistance.toFixed(3)),
      maxDistance: Number(maxDistance.toFixed(3)),
      objects,
      violations,
    };
  }

  /**
   * Static helper for evaluating the seated reach envelope without keeping an instance.
   */
  public static verifySeatedReachEnvelope(
    scene: Object3D,
    getSceneObject?: (id: string) => Object3D | undefined,
  ): ReachVerificationReport {
    return new VRHandSimulator().verifySeatedReachEnvelope(scene, getSceneObject);
  }

  /**
   * Constructs an articulated translucent VR hand proxy mesh (palm + 5 fingers).
   */
  private buildHandProxy(isLeft: boolean): Group {
    const handGroup = new Group();
    handGroup.name = isLeft ? 'LeftHandProxy' : 'RightHandProxy';

    const handMat = new MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.65,
      transparent: true,
      opacity: 0.48,
      roughness: 0.25,
      metalness: 0.55,
      depthWrite: false,
    });
    handMat.name = 'VRHandProxyMat';

    // 1. Palm Core Block
    const palmMesh = new Mesh(
      bevelBox(0.046, 0.014, 0.052, 0.003, 0.005, 2),
      handMat,
    );
    palmMesh.name = 'PalmBlock';
    palmMesh.position.set(0, 0, 0);
    handGroup.add(palmMesh);

    // 2. Wrist Ring Cuff
    const cuffMesh = new Mesh(
      new TorusGeometry(0.022, 0.0028, 6, 20),
      handMat,
    );
    cuffMesh.name = 'WristCuff';
    cuffMesh.rotation.set(Math.PI / 2, 0, 0);
    cuffMesh.position.set(0, 0, -0.032);
    handGroup.add(cuffMesh);

    // 3. Fingers (Thumb, Index, Middle, Ring, Pinky)
    const fingerDefs = [
      { name: 'Thumb', x: isLeft ? 0.026 : -0.026, y: -0.002, z: 0.012, len: 0.028, angle: isLeft ? 0.45 : -0.45 },
      { name: 'Index', x: isLeft ? 0.014 : -0.014, y: 0.002, z: 0.038, len: 0.036, angle: 0.05 },
      { name: 'Middle', x: 0.0, y: 0.003, z: 0.040, len: 0.038, angle: 0.0 },
      { name: 'Ring', x: isLeft ? -0.012 : 0.012, y: 0.002, z: 0.036, len: 0.034, angle: -0.05 },
      { name: 'Pinky', x: isLeft ? -0.024 : 0.024, y: 0.0, z: 0.030, len: 0.028, angle: isLeft ? -0.15 : 0.15 },
    ];

    for (const f of fingerDefs) {
      const fGeo = new CylinderGeometry(0.0035, 0.0042, f.len, 6);
      const fMesh = new Mesh(fGeo, handMat);
      fMesh.name = `${f.name}Tip`;
      fMesh.rotation.set(Math.PI / 2 + 0.1, 0, f.angle);
      fMesh.position.set(f.x, f.y, f.z);
      handGroup.add(fMesh);
    }

    mergeStaticMeshesByMaterial(handGroup, ['IndexTip', 'ThumbTip']);
    return handGroup;
  }

  /**
   * Constructs the concentric 3D reach zone arcs and head-centered coordinate guide shell.
   */
  private buildReachDome(): Group {
    const domeGroup = new Group();
    domeGroup.name = 'ErgonomicReachDome';
    domeGroup.position.copy(this.headPosition);

    const segments = 48;
    const addZoneArc = (radius: number, colorHex: number, name: string) => {
      const pts: number[] = [];
      // Draw forward-facing horizontal arc spanning the seated reach envelope
      const minAngle = -Math.PI * 0.45;
      const maxAngle = Math.PI * 0.45;
      for (let i = 0; i <= segments; i++) {
        const theta = minAngle + (maxAngle - minAngle) * (i / segments);
        const x = radius * Math.sin(theta);
        const z = -radius * Math.cos(theta);
        const y = -0.42; // Interaction table level relative to head
        pts.push(x, y, z);
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
      const mat = new LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.55 });
      mat.name = `${name}Mat`;
      const line = new LineSegments(geo, mat);
      line.name = name;
      domeGroup.add(line);
    };

    // Green Primary Zone (r = 0.45m)
    addZoneArc(0.45, 0x10b981, 'PrimaryReachRing_0.45m');

    // Yellow Secondary Zone (r = 0.60m)
    addZoneArc(0.60, 0xf59e0b, 'SecondaryReachRing_0.60m');

    // Red Maximum Envelope Boundary (r = 0.65m)
    addZoneArc(0.65, 0xef4444, 'MaxReachEnvelopeRing_0.65m');

    return domeGroup;
  }
}

