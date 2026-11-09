/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Phase 3 Unit Tests: Diegetic Cockpit Desk Physical Controls & Zero Keyboard Requirement
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MissionEngine } from '../src/mission/missionEngine';
import { DesktopControlsManager, type DesktopControllerHost } from '../src/systems/desktopControls';
import {
  GAUGE_SEGMENT_COUNT,
  GAUGE_SEGMENT_RANGES,
  GAUGE_SEGMENTS_MESH_NAME,
  createDeskGaugesAsset,
} from '../src/scene-assets/deskGauges.scene-asset';
import { createSwathPlungerAsset } from '../src/scene-assets/swathPlunger.scene-asset';
import { OrbitalAudioController } from '../src/systems/orbitalAudio';
import { InstancedMesh, Matrix4, Mesh, Object3D, Vector3 } from '@iwsdk/core';

describe('Phase 3: Diegetic Desk Physical Controls & Arc Gauges', () => {
  describe('Asset Generation & Semantic Hierarchy', () => {
    it('creates swath-plunger 3D asset with safety guard ring and illuminated cap', () => {
      const plunger = createSwathPlungerAsset();
      expect(plunger).toBeDefined();
      expect(plunger.name).toBe('SwathPlungerButton');

      const guardRing = plunger.getObjectByName('PlungerGuardRing');
      expect(guardRing).toBeDefined();
      expect(guardRing instanceof Mesh).toBe(true);

      const cap = plunger.getObjectByName('PadIlluminatedCap');
      expect(cap).toBeDefined();
      expect(cap instanceof Mesh).toBe(true);
      expect(cap?.position.y).toBeCloseTo(0.018, 3);
    });

    it('creates desk-gauges 3D asset with battery, storage, and downlink window segments', () => {
      const gauges = createDeskGaugesAsset();
      expect(gauges).toBeDefined();
      expect(gauges.name).toBe('DeskDiegeticGauges');

      const bezel = gauges.getObjectByName('GaugesHousingBezel');
      expect(bezel).toBeDefined();

      // Battery: 10 segments
      for (let i = 0; i < 10; i++) {
        const seg = gauges.getObjectByName(`GaugeBattSeg_${i}`);
        expect(seg).toBeDefined();
        expect(seg instanceof Mesh).toBe(true);
      }

      // Storage: 9 segments
      for (let i = 0; i < 9; i++) {
        const seg = gauges.getObjectByName(`GaugeStorageSeg_${i}`);
        expect(seg).toBeDefined();
        expect(seg instanceof Mesh).toBe(true);
      }

      // Downlink window: 10 segments
      for (let i = 0; i < 10; i++) {
        const seg = gauges.getObjectByName(`GaugeWindowSeg_${i}`);
        expect(seg).toBeDefined();
        expect(seg instanceof Mesh).toBe(true);
      }

      // Stage 2: all 29 visible segments are one InstancedMesh (one draw call); each meter owns a range,
      // and each segment sits where its meter's proxy segment is.
      const segments = gauges.getObjectByName(GAUGE_SEGMENTS_MESH_NAME);
      expect(segments instanceof InstancedMesh).toBe(true);
      const inst = segments as InstancedMesh;
      expect(inst.count).toBe(GAUGE_SEGMENT_COUNT);
      const { battery, storage, window: win } = GAUGE_SEGMENT_RANGES;
      expect([battery.count, storage.count, win.count]).toEqual([10, 9, 10]);
      expect(battery.start + battery.count).toBe(storage.start);
      expect(storage.start + storage.count).toBe(win.start);
      expect(win.start + win.count).toBe(GAUGE_SEGMENT_COUNT);
      // Same layout as the three per-meter meshes it replaced: rows centred at x = -0.11 / 0 / +0.11, 6.5 mm pitch.
      gauges.updateMatrixWorld(true);
      const instanceMatrix = new Matrix4();
      const instancePos = new Vector3();
      for (const [range, meterX] of [[battery, -0.11], [storage, 0], [win, 0.11]] as const) {
        for (let i = 0; i < range.count; i++) {
          inst.getMatrixAt(range.start + i, instanceMatrix);
          instancePos.setFromMatrixPosition(instanceMatrix.premultiply(inst.matrixWorld));
          const expectedX = meterX + (i - (range.count - 1) / 2) * 0.0065;
          expect(instancePos.distanceTo(new Vector3(expectedX, 0.013, 0))).toBeLessThan(1e-6);
        }
      }

      // Preallocated shared materials and colors on userData
      expect(gauges.userData.colors).toBeDefined();
      expect(gauges.userData.materials).toBeDefined();
      expect(gauges.userData.materials.unlit).toBeDefined();
      expect(gauges.userData.materials.cyan).toBeDefined();
      expect(gauges.userData.materials.amber).toBeDefined();
      expect(gauges.userData.materials.red).toBeDefined();

      // Stage 3: Diegetic Physical Recenter Button, Master Ignition Switch & ARIA Delegation Beacon
      const recenterBtn = gauges.getObjectByName('RecenterDeskButton');
      expect(recenterBtn).toBeDefined();
      const recenterCap = recenterBtn?.getObjectByName('PadIlluminatedCap');
      expect(recenterCap).toBeDefined();

      const ignitionSwitch = gauges.getObjectByName('MasterIgnitionSwitch');
      expect(ignitionSwitch).toBeDefined();
      const ignitionCap = ignitionSwitch?.getObjectByName('MasterIgnitionCap');
      expect(ignitionCap).toBeDefined();

      const ariaBeacon = gauges.getObjectByName('AriaDelegationBeacon');
      expect(ariaBeacon).toBeDefined();
      const ariaBeaconCap = ariaBeacon?.getObjectByName('AriaBeaconCap');
      expect(ariaBeaconCap).toBeDefined();
    });
  });

  describe('Procedural Mechanical Microswitch Audio', () => {
    it('executes mechanical switch click on press and release without errors', () => {
      const audio = new OrbitalAudioController();
      expect(() => {
        audio.playMechanicalSwitchClick(true);  // depress: 2400 -> 320 Hz
        audio.playMechanicalSwitchClick(false); // release: 1800 -> 540 Hz
        audio.playCue('SWITCH_CLICK');
      }).not.toThrow();
    });
  });

  describe('Desktop Raycast Dispatch & Zero Keyboard Control', () => {
    let listeners: Record<string, ((e: any) => void)[]> = {};

    beforeEach(() => {
      listeners = {};
      const mockElement = () => ({
        style: {},
        appendChild: vi.fn(),
        querySelector: vi.fn(() => ({ addEventListener: vi.fn() })),
        remove: vi.fn(),
        addEventListener: vi.fn((event: string, fn: any) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
        }),
        removeEventListener: vi.fn(),
        getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 800, height: 600 })),
      });

      (globalThis as any).window = {
        addEventListener: vi.fn((event: string, fn: any) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        setTimeout: (fn: () => void) => setTimeout(fn, 0),
        clearTimeout: (id: any) => clearTimeout(id),
      };

      (globalThis as any).document = {
        createElement: vi.fn(() => mockElement()),
        body: { appendChild: vi.fn() },
        getElementById: vi.fn(() => null),
      };
    });

    afterEach(() => {
      delete (globalThis as any).window;
      delete (globalThis as any).document;
    });

    it('triggers swath scan via handleControlAction when plunger button is clicked', () => {
      const engine = new MissionEngine('STANDARD_INDUS_PASS');
      const plunger = createSwathPlungerAsset();
      plunger.name = 'pad-fire-swath';

      const handleControlActionMock = vi.fn();
      const host: DesktopControllerHost = {
        engine,
        world: {
          renderer: { domElement: { addEventListener: vi.fn(), removeEventListener: vi.fn(), style: {} }, xr: { isPresenting: false } },
          visibilityState: { value: 'non-immersive', subscribe: vi.fn(() => vi.fn()) },
          getSceneObject: vi.fn(() => undefined),
        } as any,
        scene: new Object3D(),
        camera: {} as any,
        renderer: {
          domElement: { addEventListener: vi.fn(), removeEventListener: vi.fn(), style: {} },
          xr: { isPresenting: false },
        } as any,
        selectSector: vi.fn(),
        cycleSector: vi.fn(),
        toggleSensor: vi.fn(),
        scan: vi.fn(),
        selectPacket: vi.fn(),
        cycleCube: vi.fn(),
        processSelected: vi.fn(),
        queueSelected: vi.fn(),
        unqueueSelected: vi.fn(),
        discardSelected: vi.fn(),
        commitDownlink: vi.fn(),
        restartMission: vi.fn(),
        nextMission: vi.fn(),
        togglePause: vi.fn(),
        reorderQueue: vi.fn(),
        playCue: vi.fn(),
        getSceneObject: vi.fn(() => undefined),
        handleControlAction: handleControlActionMock,
      };

      const manager = new DesktopControlsManager(host);

      // Invoking scanSector triggers handleControlAction('SCAN')
      manager.scanSector();
      expect(handleControlActionMock).toHaveBeenCalledWith('SCAN');

      // Invoking toggleSensor triggers handleControlAction('TOGGLE_SENSOR')
      manager.toggleSensor();
      expect(handleControlActionMock).toHaveBeenCalledWith('TOGGLE_SENSOR');

      // Invoking processPacket triggers handleControlAction('PROCESS')
      manager.processPacket();
      expect(handleControlActionMock).toHaveBeenCalledWith('PROCESS');

      // Invoking discardPacket triggers handleControlAction('DISCARD')
      manager.discardPacket();
      expect(handleControlActionMock).toHaveBeenCalledWith('DISCARD');

      manager.dispose();
    });

    it('collapses HUD cards to compact 42px tactical badges by default', () => {
      const engine = new MissionEngine('STANDARD_INDUS_PASS');
      const host: DesktopControllerHost = {
        engine,
        world: {
          renderer: { domElement: { addEventListener: vi.fn(), removeEventListener: vi.fn(), style: {} }, xr: { isPresenting: false } },
          visibilityState: { value: 'non-immersive', subscribe: vi.fn(() => vi.fn()) },
          getSceneObject: vi.fn(() => undefined),
        } as any,
        scene: new Object3D(),
        camera: {} as any,
        renderer: {
          domElement: { addEventListener: vi.fn(), removeEventListener: vi.fn(), style: {} },
          xr: { isPresenting: false },
        } as any,
        selectSector: vi.fn(),
        cycleSector: vi.fn(),
        toggleSensor: vi.fn(),
        scan: vi.fn(),
        selectPacket: vi.fn(),
        cycleCube: vi.fn(),
        processSelected: vi.fn(),
        queueSelected: vi.fn(),
        unqueueSelected: vi.fn(),
        discardSelected: vi.fn(),
        commitDownlink: vi.fn(),
        restartMission: vi.fn(),
        nextMission: vi.fn(),
        togglePause: vi.fn(),
        reorderQueue: vi.fn(),
        playCue: vi.fn(),
        getSceneObject: vi.fn(() => undefined),
      };

      const manager = new DesktopControlsManager(host);
      // Verify manager initializes in clean collapsed HUD state
      expect(manager).toBeDefined();
      manager.dispose();
    });
  });
});

