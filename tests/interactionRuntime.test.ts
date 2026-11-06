import { afterEach, describe, expect, it, vi } from 'vitest';
import { Group, Object3D, Vector2, Vector3 } from '@iwsdk/core';
import { MissionEngine } from '../src/mission/missionEngine';
import { MissionControlSystem } from '../src/systems/missionControlSystem';
import { DesktopControlsManager } from '../src/systems/desktopControls';
import { CubeInteractions, cubeStationTargets, setWorldPosition } from '../src/systems/cubeInteractions';

function runtime() {
  const engine = new MissionEngine('FIRELINE_PASS');
  engine.scanSector('B', 'THERMAL');
  const cube = new Object3D();
  const console = new Group();
  console.position.z = -0.56;
  const interactions = new CubeInteractions();
  const entity = {
    object3D: cube,
    getValue: () => 0,
    hasComponent: () => false,
  };
  const system = Object.create(MissionControlSystem.prototype) as any;
  Object.assign(system, {
    engine, cubeInteractions: interactions, handHoverTargets: new Map(),
    queries: { cubes: { entities: [entity] }, controls: { entities: [] } },
    profile: { preferences: { oneHanded: false } },
    world: { getSceneObject: (id: string) => id === 'orbital-console' ? console : undefined },
    tempVec: new Vector3(), currentInputSource: 'xr-hand', suppressReleaseActions: false,
    tutorial: { notifyCradleRelease: vi.fn(), notifyDownlinkBayRelease: vi.fn() },
    playCue: vi.fn(),
    applyAction: (action: any) => engine.dispatch(action),
    handleProcessSelected: vi.fn(() => engine.processPacket(engine.getState().selectedPacketId!)),
    handleDiscardSelected: vi.fn(() => engine.discardPacket(engine.getState().selectedPacketId!)),
    syncAll: vi.fn(() => {
      const pkt = engine.getState().packets[0];
      const targets = cubeStationTargets(console);
      const target = targets.find((t) => t.kind === (pkt?.queued ? 'QUEUE' : 'RAW_TRAY') && t.slotIndex === (pkt?.queueIndex ?? 0))!;
      setWorldPosition(cube, target.position);
    }),
  });
  return { system, engine, cube, interactions, console };
}

function desktop(h: ReturnType<typeof runtime>) {
  const manager = Object.create(DesktopControlsManager.prototype) as any;
  const packetId = h.engine.getState().packets[0].id;
  Object.assign(manager, {
    host: {
      engine: h.engine, world: { renderer: { xr: { isPresenting: false } } },
      highlightDropZones: vi.fn(), syncAll: h.system.syncAll,
      releaseCube: (object: Object3D) => h.system.releaseCube(object),
    },
    cubeInteractions: h.interactions,
    dragCandidate: { cubeRoot: h.cube, packetId, pointerDownPos: new Vector2() },
    isDragging: true, notifyAction: vi.fn(), updateHud: vi.fn(),
  });
  h.interactions.acquire('desktop', h.cube, packetId);
  return manager;
}

afterEach(() => vi.unstubAllGlobals());

describe('Runtime interaction wiring', () => {
  it.each(['PROCESS', 'QUEUE', 'RAW_TRAY', 'DISCARD'] as const)('desktop and XR releases commit the same %s outcome', (kind) => {
    const xr = runtime();
    const mouse = runtime();
    const target = cubeStationTargets(xr.console).find((t) => t.kind === kind)!;
    setWorldPosition(xr.cube, target.position);
    setWorldPosition(mouse.cube, target.position);
    xr.system.releaseCube(xr.cube);
    const manager = desktop(mouse);
    manager.handlePointerUp({} as PointerEvent);
    const a = xr.engine.getState();
    const b = mouse.engine.getState();
    expect(b.packets).toEqual(a.packets);
    expect(b.power).toBe(a.power);
    expect(b.queuePacketIds).toEqual(a.queuePacketIds);
    expect(mouse.interactions.hasHeld).toBe(false);
  });

  it('keeps the pointed sensor pad at pinch onset instead of a nearby tray cube', () => {
    const h = runtime();
    const openSample = { position: new Vector3(), indexTip: new Vector3(), graspPoint: new Vector3() };
    h.system.handHoverTargets.set('right', { targetId: 'pad-toggle-sensor', sample: openSample, time: performance.now() });
    h.system.resolve3DTargetForHand = vi.fn(() => ({ targetType: 'CONTROL_PAD', targetId: 'pad-toggle-sensor', controlAction: 'TOGGLE_SENSOR' }));
    h.system.recordXRHandEvent = vi.fn();
    h.system.toVec3Tuple = (v: Vector3) => v.toArray();
    h.system.handleControlAction = vi.fn();
    h.system.tutorial = { notifyPinchScan: vi.fn() };
    h.system.handleXRHandPressStart({
      handedness: 'right', device: 'hand-right', connected: true, poseId: 'pinch', pinchValue: 1,
      position: new Vector3(), indexTip: new Vector3(), graspPoint: new Vector3(0.01, 0, 0),
    }, 'pinch_threshold');
    expect(h.system.resolve3DTargetForHand).toHaveBeenCalledWith(expect.anything(), 'pad-toggle-sensor');
    expect(h.system.handleControlAction).toHaveBeenCalledWith('TOGGLE_SENSOR');
    expect(h.interactions.hasHeld).toBe(false);
  });

  it('desktop scene identity resolves composed cube names for picking', () => {
    const h = runtime();
    const manager = desktop(h);
    h.cube.name = 'Evidence Cube 1';
    const mesh = new Object3D();
    h.cube.add(mesh);
    manager.host.getSceneObject = (id: string) => id === 'evidence-cube-1' ? h.cube : undefined;
    expect(manager.findCubeRoot(mesh)).toBe(h.cube);
    expect(manager.cubeSlot(h.cube)).toBe(0);
  });

  it('exactly one pointer release processes the packet', () => {
    const h = runtime();
    setWorldPosition(h.cube, cubeStationTargets(h.console)[0].position);
    const manager = desktop(h);
    manager.handlePointerUp({} as PointerEvent);
    manager.handlePointerUp({} as PointerEvent);
    expect(h.system.handleProcessSelected).toHaveBeenCalledTimes(1);
    expect(h.engine.getState().packets[0].processed).toBe(true);
  });

  it('invalid drop preserves evidence and recovers its canonical position', () => {
    const h = runtime();
    setWorldPosition(h.cube, new Vector3(3, 3, 3));
    const before = h.engine.getState().power;
    expect(h.system.releaseCube(h.cube)).toBe(false);
    expect(h.engine.getState().power).toBe(before);
    expect(h.engine.getState().packets[0].queued).toBe(false);
    expect(h.cube.getWorldPosition(new Vector3()).distanceTo(cubeStationTargets(h.console)[4].position)).toBeLessThan(1e-6);
  });

  it('uses recentered/rotated station anchors through the actual runtime release', () => {
    const h = runtime();
    h.console.position.set(1, 0.2, -1);
    h.console.rotation.y = 0.9;
    setWorldPosition(h.cube, cubeStationTargets(h.console).find((t) => t.kind === 'QUEUE' && t.slotIndex === 2)!.position);
    expect(h.system.releaseCube(h.cube)).toBe(true);
    expect(h.engine.getState().packets[0].queued).toBe(true);
  });

  it('null samples recover held cubes and release ownership exactly once', () => {
    const h = runtime();
    const packetId = h.engine.getState().packets[0].id;
    h.interactions.acquire('hand-left', h.cube, packetId);
    Object.assign(h.system, {
      lastHandConnected: { left: true, right: false }, lastHandPressed: { left: true, right: false },
      lastHandGlobeTouchPos: new Map(),
      nativeHands: { reset: vi.fn() },
      activeXRHandGrabs: new Map([['left', { cubeEntity: h.system.queries.cubes.entities[0], packetId }]]),
      recordXRHandEvent: vi.fn(), highlightDropZones: vi.fn(),
      syncCubeTransforms: h.system.syncAll,
    });
    h.system.handleXRHandTrackingLost('left');
    h.system.handleXRHandTrackingLost('left');
    expect(h.system.activeXRHandGrabs.size).toBe(0);
    expect(h.interactions.hasHeld).toBe(false);
    expect(h.system.recordXRHandEvent).toHaveBeenCalledTimes(1);
    expect(h.engine.getState().packets[0].processed).toBe(false);
  });
});
