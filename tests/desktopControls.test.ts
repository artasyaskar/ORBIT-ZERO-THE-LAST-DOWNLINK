/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Automated Verification for Desktop Controls & First-Time Player Experience
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MissionEngine } from '../src/mission/missionEngine';
import { DesktopControlsManager, type DesktopControllerHost } from '../src/systems/desktopControls';
import { Object3D } from '@iwsdk/core';

describe('Desktop Controls & First-Time Player Experience', () => {
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
      dispatchEvent: vi.fn((e: any) => {
        for (const fn of listeners[e.type] || []) fn(e);
      }),
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

  function createTestHarness() {
    const engine = new MissionEngine('STANDARD_INDUS_PASS');
    const scene = new Object3D();
    const camera = { position: { set: vi.fn() }, lookAt: vi.fn(), updateProjectionMatrix: vi.fn() } as any;
    const renderer = {
      domElement: {
        addEventListener: vi.fn((event: string, fn: any) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
        }),
        removeEventListener: vi.fn(),
        getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 800, height: 600 })),
        style: {},
      },
      xr: { isPresenting: false },
    } as any;

    const world = {
      renderer,
      visibilityState: {
        value: 'non-immersive',
        subscribe: vi.fn(() => vi.fn()),
      },
      getSceneObject: vi.fn(() => undefined),
    } as any;

    const host: DesktopControllerHost = {
      engine,
      world,
      scene,
      camera,
      renderer,
      selectSector: vi.fn((id) => {
        engine.selectSector(id);
      }),
      cycleSector: vi.fn(() => {
        const order = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
        const cur = engine.getState().selectedSectorId;
        const next = order[(order.indexOf(cur as any) + 1) % order.length];
        engine.selectSector(next);
      }),
      toggleSensor: vi.fn(() => {
        engine.toggleSensorMode();
      }),
      scan: vi.fn(() => {
        const st = engine.getState();
        engine.scanSector(st.selectedSectorId, st.activeSensorMode);
      }),
      selectPacket: vi.fn((id) => {
        engine.selectPacket(id);
      }),
      cycleCube: vi.fn(() => {
        const packets = engine.getState().packets;
        if (packets.length > 0) {
          engine.selectPacket(packets[0].id);
        }
      }),
      processSelected: vi.fn(() => {
        const sel = engine.getState().selectedPacketId;
        if (sel) engine.processPacket(sel);
      }),
      queueSelected: vi.fn((id, slot) => {
        const sel = id ?? engine.getState().selectedPacketId;
        if (sel) engine.queuePacket(sel, slot);
      }),
      unqueueSelected: vi.fn((id) => {
        const sel = id ?? engine.getState().selectedPacketId;
        if (sel) engine.unqueuePacket(sel);
      }),
      discardSelected: vi.fn((id) => {
        const sel = id ?? engine.getState().selectedPacketId;
        if (sel) engine.discardPacket(sel);
      }),
      commitDownlink: vi.fn(() => {
        engine.startDownlink();
      }),
      restartMission: vi.fn(() => {
        engine.reset();
      }),
      nextMission: vi.fn(() => {
        engine.cycleScenario();
      }),
      togglePause: vi.fn(() => {
        engine.togglePause();
      }),
      reorderQueue: vi.fn(() => {}),
      playCue: vi.fn(() => {}),
      getSceneObject: vi.fn(() => undefined),
    };

    const manager = new DesktopControlsManager(host);
    return { engine, host, manager };
  }

  function dispatchKey(key: string) {
    for (const fn of listeners['keydown'] || []) {
      fn({ key, preventDefault: vi.fn() });
    }
  }

  it('initializes Desktop Operator DOM Overlay and tutorial banner', () => {
    const { manager } = createTestHarness();
    expect(document.createElement).toHaveBeenCalled();
    manager.dispose();
  });

  it('responds to keyboard shortcuts [1-5] for sector selection', () => {
    const { host, manager } = createTestHarness();
    dispatchKey('2');
    expect(host.selectSector).toHaveBeenCalledWith('B');

    dispatchKey('3');
    expect(host.selectSector).toHaveBeenCalledWith('C');
    manager.dispose();
  });

  it('responds to keyboard shortcut [M] to toggle sensor mode', () => {
    const { host, manager } = createTestHarness();
    dispatchKey('m');
    expect(host.toggleSensor).toHaveBeenCalled();
    manager.dispose();
  });

  it('responds to keyboard shortcut [Space] to scan sector', () => {
    const { host, manager } = createTestHarness();
    dispatchKey(' ');
    expect(host.scan).toHaveBeenCalled();
    manager.dispose();
  });

  it('responds to keyboard shortcut [P] to process evidence in cradle', () => {
    const { host, manager } = createTestHarness();
    dispatchKey('p');
    expect(host.processSelected).toHaveBeenCalled();
    manager.dispose();
  });

  it('responds to keyboard shortcut [Q] to queue packet to downlink bay', () => {
    const { host, manager } = createTestHarness();
    dispatchKey('q');
    expect(host.queueSelected).toHaveBeenCalled();
    manager.dispose();
  });

  it('responds to keyboard shortcut [T] to commit downlink transmission', () => {
    const { host, engine, manager } = createTestHarness();
    engine.scanSector('B', 'RADAR');
    const pkt = engine.getState().packets[0];
    engine.selectPacket(pkt.id);
    engine.queuePacket(pkt.id);

    dispatchKey('t');
    expect(host.commitDownlink).toHaveBeenCalled();
    manager.dispose();
  });

  it('completes a full end-to-end mission exclusively through desktop controls', () => {
    const { engine, manager } = createTestHarness();

    // 1. Select Sector B via hotkey [2]
    dispatchKey('2');
    expect(engine.getState().selectedSectorId).toBe('B');

    // 2. Initial sensor mode is already RADAR (penetrates clouds)
    expect(engine.getState().activeSensorMode).toBe('RADAR');

    // 3. Scan Sector B via [Space]
    dispatchKey(' ');
    expect(engine.getState().packets.length).toBe(1);
    const pktB = engine.getState().packets[0];
    expect(pktB.confidence).toBe('CONFIRMED');

    // 4. Select the acquired packet & Compress in cradle via [P]
    engine.selectPacket(pktB.id);
    dispatchKey('p');
    expect(engine.getState().packets[0].processingState).toBe('PROCESSED');
    expect(engine.getState().packets[0].storageCost).toBe(1);

    // 5. Queue compressed packet to bay via [Q]
    dispatchKey('q');
    expect(engine.getState().queuePacketIds).toContain(pktB.id);

    // 6. Select Sector C (clear sky) via [3], toggle to OPTICAL via [M], and Scan via [Space]
    dispatchKey('3');
    dispatchKey('m'); // toggles RADAR -> OPTICAL
    expect(engine.getState().activeSensorMode).toBe('OPTICAL');
    dispatchKey(' ');
    expect(engine.getState().packets.length).toBe(2);
    const pktC = engine.getState().packets[1];

    // 7. Queue Sector C raw via [Q]
    engine.selectPacket(pktC.id);
    dispatchKey('q');
    expect(engine.getState().queuePacketIds).toContain(pktC.id);

    // 8. Commit Downlink via [T]
    dispatchKey('t');
    expect(engine.getState().phase).toBe('DOWNLINK');

    // 9. Tick downlink until completion
    engine.tickDownlink(15);
    expect(engine.getState().phase).toBe('DEBRIEF');
    expect(engine.getState().debrief).toBeDefined();
    expect(engine.getState().debrief?.totalScore).toBeGreaterThanOrEqual(60);

    manager.dispose();
  });

  it('unqueues a queued packet and recovers storage tray slot via [U]', () => {
    const { host, engine, manager } = createTestHarness();
    engine.scanSector('B', 'RADAR');
    const pkt = engine.getState().packets[0];
    engine.selectPacket(pkt.id);
    engine.queuePacket(pkt.id);
    expect(engine.getState().queuePacketIds).toContain(pkt.id);

    // Press [U] to unqueue
    dispatchKey('u');
    expect(host.unqueueSelected).toHaveBeenCalledWith(pkt.id);
    expect(engine.getState().queuePacketIds).not.toContain(pkt.id);
    expect(engine.getState().packets[0].queued).toBe(false);

    manager.dispose();
  });

  it('smart-toggles queue/unqueue via [Q] without throwing ALREADY_QUEUED', () => {
    const { host, engine, manager } = createTestHarness();
    engine.scanSector('B', 'RADAR');
    const pkt = engine.getState().packets[0];
    engine.selectPacket(pkt.id);

    // First [Q] queues it
    dispatchKey('q');
    expect(engine.getState().queuePacketIds).toContain(pkt.id);

    // Second [Q] on already-queued packet smartly unqueues it!
    dispatchKey('q');
    expect(host.unqueueSelected).toHaveBeenCalledWith(pkt.id);
    expect(engine.getState().queuePacketIds).not.toContain(pkt.id);

    manager.dispose();
  });
});
