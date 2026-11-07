/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Phase 4 Unit Tests: 3D Physical Drag-and-Drop Data Cubes & Inside-Cube Aerospace Holograms
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MissionEngine } from '../src/mission/missionEngine';
import { DesktopControlsManager, type DesktopControllerHost } from '../src/systems/desktopControls';
import { createDataCubeAsset } from '../src/scene-assets/tactileHardware.scene-asset';
import { OrbitalAudioController } from '../src/systems/orbitalAudio';
import { Mesh, Object3D, Vector3 } from '@iwsdk/core';

describe('Phase 4: 3D Physical Drag-and-Drop Data Cubes & Holograms', () => {
  describe('Aerospace Micro-Hologram Cube Hierarchy', () => {
    it('creates data-cube asset containing CubeRadarSpikes and CubeHighwayVector submeshes', () => {
      const cube = createDataCubeAsset(0x45c9c0);
      expect(cube).toBeDefined();

      // Outer Acrylic Shell
      const shell = cube.getObjectByName('CubeAcrylicShell');
      expect(shell).toBeDefined();
      expect(shell instanceof Mesh).toBe(true);

      // Topographic Relief Core
      const core = cube.getObjectByName('CubeConfidenceCore');
      expect(core).toBeDefined();
      expect(core instanceof Mesh).toBe(true);

      // Cloud Obscuration Cap (UNVERIFIED)
      const cloud = cube.getObjectByName('CubeCloudObscurationCap');
      expect(cloud).toBeDefined();

      // Radar Multipath Backscatter Spikes (PROBABLE)
      const spikes = cube.getObjectByName('CubeRadarSpikes');
      expect(spikes).toBeDefined();

      // Glowing Highway Vector Line (CONFIRMED)
      const highway = cube.getObjectByName('CubeHighwayVector');
      expect(highway).toBeDefined();
      expect(highway instanceof Mesh).toBe(true);
    });
  });

  describe('Procedural Web Audio DSP (Chirp & Magnetic Hover)', () => {
    it('plays compression chirp and magnetic hover buzz without throwing errors', () => {
      const audio = new OrbitalAudioController();
      expect(() => {
        audio.playCompressionChirp();
        audio.playMagneticHoverBuzz();
        audio.playCue('COMPRESSION_CHIRP');
        audio.playCue('MAGNETIC_HOVER');
      }).not.toThrow();
    });
  });

  describe('Quick Double-Click Auto-Routing Logic', () => {
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

    it('double click only selects the cube (no hidden auto-route)', () => {
      const engine = new MissionEngine('STANDARD_INDUS_PASS');
      // Scan Sector B to spawn an uncompressed packet
      engine.scanSector('B');
      const state = engine.getState();
      expect(state.packets.length).toBeGreaterThan(0);
      const packet = state.packets[0];
      expect(packet.processed).toBe(false);

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
        selectPacket: vi.fn((id: string) => engine.selectPacket(id)),
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

      // Simulate double-click on cube candidate
      const cubeObj = new Object3D();
      cubeObj.name = 'evidence-cube-1';

      // First click: sets drag candidate and selects packet
      (manager as any).dragCandidate = {
        cubeRoot: cubeObj,
        slotIndex: 0,
        packetId: packet.id,
        startPos: new Vector3(),
        pointerDownPos: { x: 100, y: 100 },
      };
      (manager as any).isDragging = false;
      (manager as any).handlePointerUp({ clientX: 100, clientY: 100 } as PointerEvent);

      expect((manager as any).lastClickedCubePacketId).toBe(packet.id);

      // Second click within 380ms no longer auto-routes: every action must be visible and deliberate.
      (manager as any).dragCandidate = {
        cubeRoot: cubeObj,
        slotIndex: 0,
        packetId: packet.id,
        startPos: new Vector3(),
        pointerDownPos: { x: 100, y: 100 },
      };
      (manager as any).isDragging = false;
      (manager as any).handlePointerUp({ clientX: 100, clientY: 100 } as PointerEvent);

      expect(handleControlActionMock).not.toHaveBeenCalled();
      expect(engine.getState().selectedPacketId).toBe(packet.id);

      manager.dispose();
    });
  });
});

