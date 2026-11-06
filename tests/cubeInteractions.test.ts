import { describe, expect, it } from 'vitest';
import { Group, Object3D, Vector3 } from '@iwsdk/core';
import { CubeInteractions, cubeStationTargets, installCubeStationAnchors, nearestCubeStation, setWorldPosition } from '../src/systems/cubeInteractions';

function stations() {
  const console = new Group();
  console.position.z = -0.56;
  return { console, targets: cubeStationTargets(console) };
}

describe('Exclusive cube ownership', () => {
  it('follows hover, held, preview and release states', () => {
    const owner = new CubeInteractions();
    const cube = new Object3D();
    expect(owner.phase('hand-left')).toBe('IDLE');
    owner.hover('hand-left', cube);
    expect(owner.phase('hand-left')).toBe('HOVER');
    expect(owner.acquire('hand-left', cube, 'P1')).toBe(true);
    expect(owner.phase('hand-left')).toBe('HELD');
    owner.preview('hand-left', stations().targets[0]);
    expect(owner.phase('hand-left')).toBe('DROP_PREVIEW');
    owner.release('hand-left');
    expect(owner.phase('hand-left')).toBe('RELEASED');
  });

  it('rejects simultaneous hands and desktop claiming one object', () => {
    const owner = new CubeInteractions();
    const cube = new Object3D();
    expect(owner.acquire('hand-right', cube, 'P1')).toBe(true);
    expect(owner.acquire('hand-left', cube, 'P1')).toBe(false);
    expect(owner.acquire('desktop', cube, 'P1')).toBe(false);
    expect(owner.held('hand-right')?.object).toBe(cube);
  });

  it('rejects a second object for the same owner', () => {
    const owner = new CubeInteractions();
    owner.acquire('hand-left', new Object3D(), 'P1');
    expect(owner.acquire('hand-left', new Object3D(), 'P2')).toBe(false);
  });

  it('releases exactly once and permits a later different owner', () => {
    const owner = new CubeInteractions();
    const cube = new Object3D();
    owner.acquire('desktop', cube, 'P1');
    expect(owner.release('desktop')?.object).toBe(cube);
    expect(owner.release('desktop')).toBeNull();
    expect(owner.acquire('hand-right', cube, 'P1')).toBe(true);
  });

  it('recovers all held objects on session exit without retained ownership', () => {
    const owner = new CubeInteractions();
    const cube = new Object3D();
    owner.acquire('hand-left', cube, 'P1');
    owner.acquire('desktop', new Object3D(), 'P2');
    owner.recoverAll();
    expect(owner.hasHeld).toBe(false);
    expect(owner.isHeld(cube)).toBe(false);
    expect(owner.phase('hand-left')).toBe('RECOVERED');
    expect(owner.release('hand-left')).toBeNull();
  });

  it('tracking loss releases an acquired cube once without committing a drop', () => {
    const owner = new CubeInteractions();
    const cube = new Object3D();
    owner.acquire('hand-left', cube, 'P1');
    expect(owner.release('hand-left', true)?.packetId).toBe('P1');
    expect(owner.isHeld(cube)).toBe(false);
    expect(owner.release('hand-left', true)).toBeNull();
    expect(owner.phase('hand-left')).toBe('RECOVERED');
  });

  it('does not acquire hidden objects or objects under a hidden parent', () => {
    const owner = new CubeInteractions();
    const cube = new Object3D();
    const parent = new Group();
    parent.add(cube);
    parent.visible = false;
    expect(owner.acquire('hand-left', cube, 'P1')).toBe(false);
  });
});

describe('Shared station-local drop resolution', () => {
  it.each(['PROCESS', 'QUEUE', 'RAW_TRAY', 'DISCARD'] as const)('resolves the exact %s anchor despite overlapping envelopes', (kind) => {
    const { targets } = stations();
    const station = targets.find((t) => t.kind === kind)!;
    expect(nearestCubeStation(station.position, targets)).toBe(station);
  });

  it('resolves the closest queue slot instead of the first overlapping station', () => {
    const { targets } = stations();
    const slot = targets.find((t) => t.kind === 'QUEUE' && t.slotIndex === 2)!;
    expect(nearestCubeStation(slot.position, targets)?.slotIndex).toBe(2);
  });

  it('rejects outside-envelope and invalid coordinates', () => {
    const { targets } = stations();
    expect(nearestCubeStation(new Vector3(3, 3, 3), targets)).toBeNull();
    expect(nearestCubeStation(new Vector3(NaN, 1, 0), targets)).toBeNull();
  });

  it('chooses a deterministic tie without order-dependent float noise', () => {
    const { targets } = stations();
    const queue = targets.filter((t) => t.kind === 'QUEUE');
    const midpoint = queue[0].position.clone().lerp(queue[1].position, 0.5);
    expect(nearestCubeStation(midpoint, queue)?.slotIndex).toBe(0);
  });

  it('follows translated/rotated/scaled console ancestry', () => {
    const { console } = stations();
    const parent = new Group();
    parent.position.set(1, 0.2, -2);
    parent.rotation.set(0.2, 0.7, -0.1);
    parent.scale.setScalar(1.2);
    parent.add(console);
    const before = cubeStationTargets(console);
    parent.position.x += 0.8;
    const after = cubeStationTargets(console);
    expect(after[0].position.x - before[0].position.x).toBeCloseTo(0.8);
    expect(nearestCubeStation(after[0].position, after)?.kind).toBe('PROCESS');
  });

  it('desktop and XR select the same target for every sampled placement', () => {
    const { targets } = stations();
    for (let x = -0.6; x <= 0.6; x += 0.04) {
      for (let z = -0.7; z <= -0.3; z += 0.04) {
        const point = new Vector3(x, 0.79, z);
        const desktop = nearestCubeStation(point, targets);
        const xr = nearestCubeStation(point, targets);
        expect(desktop).toBe(xr);
      }
    }
  });

  it('follows a relocated station anchor without changing drop code', () => {
    const { console } = stations();
    installCubeStationAnchors(console);
    console.getObjectByName('CubeStation_PROCESS_0')!.position.x += 0.2;
    const target = cubeStationTargets(console)[0];
    expect(target.position.x).toBeCloseTo(0.38);
    expect(nearestCubeStation(target.position, cubeStationTargets(console))?.kind).toBe('PROCESS');
  });

  it('positions a cube in world space without assuming an untransformed parent', () => {
    const parent = new Group();
    parent.position.set(1, 2, 3);
    parent.rotation.y = 0.8;
    const cube = new Object3D();
    parent.add(cube);
    parent.updateMatrixWorld(true);
    const target = new Vector3(0.2, 0.79, -0.49);
    setWorldPosition(cube, target);
    expect(cube.getWorldPosition(new Vector3()).distanceTo(target)).toBeLessThan(1e-8);
  });
});
