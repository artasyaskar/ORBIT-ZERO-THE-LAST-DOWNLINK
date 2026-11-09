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
        engine.dispatch({ type: engine.getState().paused ? 'RESUME' : 'PAUSE' });
      }),
      reorderQueue: vi.fn(() => {}),
      playCue: vi.fn(() => {}),
      getSceneObject: vi.fn(() => undefined),
    };

    const manager = new DesktopControlsManager(host);
    // A fresh pass opens the Mission Card, which blocks gameplay keys until the player starts the pass.
    for (const fn of listeners['keydown'] || []) fn({ key: 'Enter', preventDefault: vi.fn() });
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

  it('blocks gameplay keys while the Mission Card is open so a stray key cannot spend battery', () => {
    const { engine, host, manager } = createTestHarness();
    engine.reset();
    (manager as any).briefingModalOpen = true;
    (manager as any).updateHud();
    dispatchKey(' ');
    expect(host.scan).not.toHaveBeenCalled();
    dispatchKey('Enter');
    dispatchKey(' ');
    expect(host.scan).toHaveBeenCalled();

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

  it('separates optical atmospheric profile from SAR microwave backscatter in recon HUD', () => {
    const { engine, manager } = createTestHarness();
    engine.selectSector('B');
    manager.updateHud();

    // In default minimized mode, renders clean 42px tactical badge
    let reconHtml = (manager as any).reconEl?.innerHTML || '';
    expect(reconHtml).toContain('📡 SEC-B');
    expect(reconHtml).toContain('+ EXPAND [V]');

    // Press 'V' to expand full telemetry
    manager.toggleHud();
    reconHtml = (manager as any).reconEl?.innerHTML || '';

    // Must contain Optical domain
    expect(reconHtml).toContain('ATMOSPHERIC PROFILE (VIS/NIR OPTICAL');
    expect(reconHtml).toContain('Sky over the sector');
    expect(reconHtml).toContain('Optical result');
    // Must contain Radar domain, read from this operation's sector data (Indus pass, Sector B: flooded road)
    expect(reconHtml).toContain('MICROWAVE BACKSCATTER (ACTIVE SAR');
    expect(reconHtml).toContain('Radar result');
    expect(reconHtml).toContain('dark specular flood sheet');
    // No fixed figures that every operation used to show
    expect(reconHtml).not.toContain('95% CONVECTIVE STORM');

    manager.dispose();
  });

  it('intelligently pairs observations of the same sector across sensor modes with forensic matrix', () => {
    const { engine, manager } = createTestHarness();
    // Scan Sector C Optical and Sector C Radar
    engine.scanSector('C', 'OPTICAL');
    engine.scanSector('C', 'RADAR');
    expect(engine.getState().packets.length).toBe(2);

    // Select Sector C Optical & expand HUD
    engine.selectPacket('PKT-1');
    manager.toggleHud();
    manager.updateHud();

    const compareHtml = (manager as any).compareEl?.innerHTML || '';
    expect(compareHtml).toContain('FORENSIC MATRIX (PKT-1 vs PKT-2)');
    expect(compareHtml).toContain('★ Same Sector Match');
    expect(compareHtml).toContain('✓ Physical Agreement:');
    expect(compareHtml).toContain('⚡ Sensor Delta:');
    // The delta quotes both sensors' findings from the sector data.
    expect(compareHtml).toContain('dry approaches and visible deck alignment');
    expect(compareHtml).toContain('dihedral multipath scattering');

    manager.dispose();
  });

  it('displays cross-sector triage comparison when different sectors are scanned', () => {
    const { engine, manager } = createTestHarness();
    // Scan Sector B Radar and Sector C Optical
    engine.scanSector('B', 'RADAR');
    engine.scanSector('C', 'OPTICAL');
    expect(engine.getState().packets.length).toBe(2);

    engine.selectPacket('PKT-1');
    manager.toggleHud();
    manager.updateHud();

    const compareHtml = (manager as any).compareEl?.innerHTML || '';
    expect(compareHtml).toContain('FORENSIC MATRIX (PKT-1 vs PKT-2)');
    expect(compareHtml).toContain('Cross-Sector Triage');
    expect(compareHtml).toContain('REQ 1 | ROAD INUNDATION');

    manager.dispose();
  });

  it('warns about horizon window overflow when queued packets exceed downlink duration', () => {
    const { engine, manager } = createTestHarness();
    // Scan 3 raw packets: B (4.5s) + C (4.0s) + E (4.5s) = 13.0s > 10.0s window
    engine.scanSector('B', 'RADAR');
    engine.scanSector('C', 'OPTICAL');
    engine.scanSector('E', 'RADAR');
    engine.queuePacket('PKT-1', 0);
    engine.queuePacket('PKT-2', 1);
    engine.queuePacket('PKT-3', 2);
    expect(engine.getState().queuePacketIds.length).toBe(3);

    manager.toggleHud();
    manager.updateHud();

    const compareHtml = (manager as any).compareEl?.innerHTML || '';
    expect(compareHtml).toContain('⚠️ OVERFLOW');
    expect(compareHtml).toContain('HORIZON CUTOFF: Packets beyond 10.0s will be lost');

    manager.dispose();
  });
});
