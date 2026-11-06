import { Object3D, Vector3 } from '@iwsdk/core';

export type CubeOwner = 'hand-left' | 'hand-right' | 'desktop';
export type CubeInteractionPhase = 'IDLE' | 'HOVER' | 'HELD' | 'DROP_PREVIEW' | 'RELEASED' | 'RECOVERED';
export type DropKind = 'PROCESS' | 'QUEUE' | 'RAW_TRAY' | 'DISCARD';

export interface CubeDropTarget {
  kind: DropKind;
  slotIndex?: number;
  position: Vector3;
  radius: number;
}

export class CubeInteractions {
  private states = new Map<CubeOwner, {
    phase: CubeInteractionPhase;
    object?: Object3D;
    packetId?: string;
    preview: CubeDropTarget | null;
  }>();

  hover(owner: CubeOwner, object?: Object3D): void {
    if (this.held(owner)) return;
    this.states.set(owner, { phase: object ? 'HOVER' : 'IDLE', object, preview: null });
  }

  acquire(owner: CubeOwner, object: Object3D, packetId: string): boolean {
    if (!packetId || this.held(owner) || this.isHeld(object) || !isVisible(object)) return false;
    this.states.set(owner, { phase: 'HELD', object, packetId, preview: null });
    return true;
  }

  preview(owner: CubeOwner, target: CubeDropTarget | null): void {
    const state = this.held(owner);
    if (!state) return;
    state.phase = 'DROP_PREVIEW';
    state.preview = target;
  }

  release(owner: CubeOwner, recovered = false): { object: Object3D; packetId: string } | null {
    const state = this.held(owner);
    if (!state?.object || !state.packetId) return null;
    this.states.set(owner, { phase: recovered ? 'RECOVERED' : 'RELEASED', preview: null });
    return { object: state.object, packetId: state.packetId };
  }

  held(owner: CubeOwner) {
    const state = this.states.get(owner);
    return state?.phase === 'HELD' || state?.phase === 'DROP_PREVIEW' ? state : undefined;
  }

  isHeld(object: Object3D): boolean {
    return [...this.states.keys()].some((owner) => this.held(owner)?.object === object);
  }

  get hasHeld(): boolean {
    return [...this.states.keys()].some((owner) => Boolean(this.held(owner)));
  }

  phase(owner: CubeOwner): CubeInteractionPhase {
    return this.states.get(owner)?.phase ?? 'IDLE';
  }

  recoverAll(): void {
    for (const owner of this.states.keys()) this.release(owner, true);
  }
}

export function isVisible(object: Object3D): boolean {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

export function setWorldPosition(object: Object3D, position: Vector3): void {
  object.position.copy(object.parent ? object.parent.worldToLocal(position.clone()) : position);
  object.updateWorldMatrix(false, true);
}

interface StationAnchorSpec {
  kind: DropKind;
  slotIndex?: number;
  local: [number, number, number];
  radius: number;
}

const STATION_ANCHORS: StationAnchorSpec[] = [
  { kind: 'PROCESS', local: [0.18, 0.79, 0.07], radius: 0.15 },
  ...[0.25, 0.32, 0.39].map((x, slotIndex) => ({ kind: 'QUEUE' as const, slotIndex, local: [x, 0.79, 0.13] as [number, number, number], radius: 0.18 })),
  ...[-0.38, -0.31, -0.24].map((x, slotIndex) => ({ kind: 'RAW_TRAY' as const, slotIndex, local: [x, 0.792, 0.14] as [number, number, number], radius: 0.20 })),
  { kind: 'DISCARD', local: [0.44, 0.79, 0.22], radius: 0.15 },
];

const anchorName = (spec: StationAnchorSpec) => `CubeStation_${spec.kind}_${spec.slotIndex ?? 0}`;

export function installCubeStationAnchors(console: Object3D): void {
  for (const spec of STATION_ANCHORS) {
    const anchor = new Object3D();
    anchor.name = anchorName(spec);
    anchor.position.set(...spec.local);
    console.add(anchor);
  }
}

export function cubeStationTargets(console: Object3D, assistance = 1): CubeDropTarget[] {
  console.updateWorldMatrix(true, false);
  return STATION_ANCHORS.map((spec) => ({
    kind: spec.kind,
    slotIndex: spec.slotIndex,
    position: console.getObjectByName(anchorName(spec))?.getWorldPosition(new Vector3()) ?? console.localToWorld(new Vector3(...spec.local)),
    radius: spec.radius * assistance,
  }));
}

export function nearestCubeStation(position: Vector3, targets: CubeDropTarget[]): CubeDropTarget | null {
  if (![position.x, position.y, position.z].every(Number.isFinite)) return null;
  let best: CubeDropTarget | null = null;
  let distance = Infinity;
  for (const target of targets) {
    const candidate = position.distanceTo(target.position);
    if (candidate <= target.radius && candidate < distance - 1e-6) {
      best = target;
      distance = candidate;
    }
  }
  return best;
}
