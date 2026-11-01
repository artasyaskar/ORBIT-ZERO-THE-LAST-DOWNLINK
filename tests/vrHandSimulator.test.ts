/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Phase 5 Unit Tests: Cinematic Downlink Laser & In-Engine VR Hand Simulator Harness
 */

import { describe, expect, it } from 'vitest';
import { Group, Mesh, Object3D, Vector3 } from '@iwsdk/core';
import { VRHandSimulator } from '../src/systems/vrHandSimulator';
import { OrbitalAudioController } from '../src/systems/orbitalAudio';
import { createEarthGlobeAsset } from '../src/scene-assets/earthGlobe.scene-asset';

describe('Phase 5: Cinematic Downlink Laser & VR Hand Simulator Harness', () => {
  describe('VRHandSimulator Hierarchy & Reach Dome', () => {
    it('creates root group with reach rings and articulated hand proxies', () => {
      const sim = new VRHandSimulator();
      expect(sim.root).toBeDefined();
      expect(sim.root.name).toBe('VRHandSimulatorRoot');

      // Check reach dome rings
      const primaryRing = sim.root.getObjectByName('PrimaryReachRing_0.45m');
      expect(primaryRing).toBeDefined();

      const secondaryRing = sim.root.getObjectByName('SecondaryReachRing_0.60m');
      expect(secondaryRing).toBeDefined();

      const maxLimitRing = sim.root.getObjectByName('MaxReachEnvelopeRing_0.65m');
      expect(maxLimitRing).toBeDefined();

      // Check hand proxies
      const leftHand = sim.root.getObjectByName('LeftHandProxy');
      expect(leftHand).toBeDefined();

      const rightHand = sim.root.getObjectByName('RightHandProxy');
      expect(rightHand).toBeDefined();

      // Fingertip joint hierarchy for pinch/poke
      const indexTip = rightHand?.getObjectByName('IndexTip');
      const thumbTip = rightHand?.getObjectByName('ThumbTip');
      expect(indexTip).toBeDefined();
      expect(thumbTip).toBeDefined();

      // Raycasts should be disabled on simulator proxies
      let anyRaycastable = false;
      sim.root.traverse((o) => {
        if (typeof o.raycast === 'function') {
          const hits: any[] = [];
          o.raycast(null as any, hits);
          if (hits.length > 0) anyRaycastable = true;
        }
      });
      expect(anyRaycastable).toBe(false);
    });

    it('toggles visibility and active state accurately', () => {
      const sim = new VRHandSimulator();
      expect(sim.isActive()).toBe(false);
      expect(sim.root.visible).toBe(false);

      const turnedOn = sim.toggle();
      expect(turnedOn).toBe(true);
      expect(sim.isActive()).toBe(true);
      expect(sim.root.visible).toBe(true);

      sim.setEnabled(false);
      expect(sim.isActive()).toBe(false);
      expect(sim.root.visible).toBe(false);
    });

    it('interpolates pinch and poke gestures on update', () => {
      const sim = new VRHandSimulator();
      sim.setEnabled(true);

      const rightHand = sim.root.getObjectByName('RightHandProxy');
      const indexTip = rightHand?.getObjectByName('IndexTip');
      const initialZ = indexTip?.position.z ?? 0;

      // Simulate mouse world position tracking
      sim.update(0.1, new Vector3(0.15, 0.85, -0.45));
      expect(rightHand?.position.x).toBeCloseTo(0.15, 2);
      expect(rightHand?.position.z).toBeCloseTo(-0.45, 2);

      // Simulate poke
      sim.setPoking(true);
      for (let i = 0; i < 10; i++) sim.update(0.05, new Vector3(0.15, 0.85, -0.45));
      expect(indexTip!.position.z).toBeGreaterThan(initialZ);

      // Simulate pinch
      sim.setPoking(false);
      sim.setPinching(true);
      for (let i = 0; i < 10; i++) sim.update(0.05, new Vector3(0.15, 0.85, -0.45));
      expect(indexTip!.position.x).toBeLessThan(0.008);
    });
  });

  describe('Programmatic Seated Reach Envelope Verification', () => {
    it('passes when all interactive targets reside in the 0.35m - 0.65m airplane-seat envelope', () => {
      const mockScene = new Group();

      // Add mock targets at valid ergonomic distances from seated interaction origin (0, 0.83, 0)
      const targets = [
        { name: 'pad-fire-swath', pos: [0.0, 0.788, -0.38] },
        { name: 'earth-globe', pos: [0.0, 0.99, -0.58] },
        { name: 'desk-gauges', pos: [0.0, 0.788, -0.47] },
        { name: 'evidence-cube-1', pos: [-0.37, 0.79, -0.43] },
        { name: 'pad-commit-downlink', pos: [0.46, 0.786, -0.37] },
      ];

      for (const t of targets) {
        const obj = new Object3D();
        obj.name = t.name;
        obj.position.set(t.pos[0], t.pos[1], t.pos[2]);
        mockScene.add(obj);
      }

      const report = VRHandSimulator.verifySeatedReachEnvelope(mockScene);
      expect(report.pass).toBe(true);
      expect(report.violations.length).toBe(0);
      expect(report.minDistance).toBeGreaterThanOrEqual(0.35);
      expect(report.maxDistance).toBeLessThanOrEqual(0.65);
      expect(report.objects.length).toBe(targets.length);
    });

    it('detects and flags violations when interactive objects exceed 0.65m or fall below 0.35m', () => {
      const mockScene = new Group();

      const tooFar = new Object3D();
      tooFar.name = 'pad-fire-swath';
      tooFar.position.set(0, 0.83, -0.85); // 0.85m distance
      mockScene.add(tooFar);

      const tooClose = new Object3D();
      tooClose.name = 'earth-globe';
      tooClose.position.set(0, 0.83, -0.20); // 0.20m distance
      mockScene.add(tooClose);

      const report = VRHandSimulator.verifySeatedReachEnvelope(mockScene);
      expect(report.pass).toBe(false);
      expect(report.violations.length).toBe(2);
      expect(report.violations[0]).toContain('exceeds maximum reach envelope limit');
      expect(report.violations[1]).toContain('too close to player chest/head');
    });
  });

  describe('Procedural Telemetry Laser & Handshake Audio DSP', () => {
    it('executes Bell 202 FSK bursts, Solenoid Latch, and Handshake chimes without error', () => {
      const audio = new OrbitalAudioController();
      expect(() => {
        audio.playBell202FskBurst();
        audio.playHeavySolenoidLatch();
        audio.playHandshakeConfirm();
        audio.playCue('FSK_BURST');
        audio.playCue('SOLENOID_LATCH');
        audio.playCue('HANDSHAKE_CONFIRM');
      }).not.toThrow();
    });
  });

  describe('Karachi Ground Station & Downlink Laser Mesh Asset Verification', () => {
    it('verifies earthGlobe asset contains KarachiGroundStation and DownlinkLaserBeamGroup', () => {
      const globe = createEarthGlobeAsset();
      expect(globe).toBeDefined();

      const karachi = globe.getObjectByName('KarachiGroundStation');
      expect(karachi).toBeDefined();

      const shockwave = karachi?.getObjectByName('KarachiDishShockwave');
      expect(shockwave).toBeDefined();
      expect(shockwave?.visible).toBe(false);

      const laserGroup = globe.getObjectByName('DownlinkLaserBeamGroup');
      expect(laserGroup).toBeDefined();
      expect(laserGroup?.visible).toBe(false);

      const laserCore = laserGroup?.getObjectByName('DownlinkLaserCore');
      const laserSheath = laserGroup?.getObjectByName('DownlinkLaserSheath');
      expect(laserCore).toBeDefined();
      expect(laserSheath).toBeDefined();
    });
  });
});

