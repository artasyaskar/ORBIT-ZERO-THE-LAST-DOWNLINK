import { Object3D, Vector3 } from '@iwsdk/core';

export type HandSide = 'left' | 'right';

export interface LiveXRHandSample {
  device: 'hand-left' | 'hand-right';
  handedness: HandSide;
  connected: boolean;
  poseId: string;
  pinchValue: number;
  pressed: boolean;
  position: Vector3;
  indexTip: Vector3;
  thumbTip: Vector3;
  graspPoint: Vector3;
  fingerDir: Vector3;
}

export class NativeXRHands {
  private sources = new Map<HandSide, XRInputSource>();
  private lastSession: XRSession | null = null;
  private armed = new Set<HandSide>();
  private pinching = new Set<HandSide>();
  private selecting = new WeakMap<XRInputSource, boolean>();

  setSelect(source: XRInputSource, pressed: boolean): void {
    if (source.hand && (source.handedness === 'left' || source.handedness === 'right')) {
      this.selecting.set(source, pressed);
    }
  }

  reset(side?: HandSide): void {
    if (side === undefined) {
      this.reset('left');
      this.reset('right');
      return;
    }
    const source = this.sources.get(side);
    if (source) this.selecting.delete(source);
    this.sources.delete(side);
    this.armed.delete(side);
    this.pinching.delete(side);
  }

  sample(
    side: HandSide,
    session: XRSession | null,
    frame: XRFrame | null,
    referenceSpace: XRReferenceSpace | null,
    origin: Object3D,
  ): LiveXRHandSample | null {
    if (session !== this.lastSession) {
      this.reset();
      this.lastSession = session;
    }
    if (!session || !frame || frame.session !== session || !referenceSpace || session.visibilityState !== 'visible') {
      this.reset(side);
      return null;
    }
    const trackedSources = (session as XRSession & { trackedSources?: Iterable<XRInputSource> }).trackedSources;
    const inputs = [...session.inputSources, ...(trackedSources ?? [])];
    const source = inputs.find((input) => input.handedness === side && input.hand);
    if (!source?.hand) {
      this.reset(side);
      return null;
    }
    const previousSource = this.sources.get(side);
    if (previousSource && previousSource !== source) {
      this.reset(side);
      return null;
    }
    if (!previousSource) {
      this.sources.set(side, source);
    }

    const positions: Vector3[] = [];
    try {
      for (const joint of ['wrist', 'index-finger-metacarpal', 'index-finger-phalanx-distal', 'index-finger-tip', 'thumb-tip'] as const) {
        const space = source.hand.get(joint);
        const pose = space ? frame.getJointPose?.(space, referenceSpace) : null;
        const p = pose?.transform.position;
        if (!p || ![p.x, p.y, p.z].every(Number.isFinite)) {
          this.reset(side);
          return null;
        }
        positions.push(new Vector3(p.x, p.y, p.z));
      }
    } catch {
      this.reset(side);
      return null;
    }

    const [wrist, metacarpal, distal, indexTip, thumbTip] = positions;
    const distance = indexTip.distanceTo(thumbTip);
    const geometricPinch = distance < (this.pinching.has(side) ? 0.028 : 0.018);
    const pressed = source.gamepad?.buttons[0]?.pressed ?? this.selecting.get(source) ?? geometricPinch;
    if (pressed) this.pinching.add(side);
    else this.pinching.delete(side);
    // A held pinch at connection/recovery must open before it can acquire anything.
    if (!pressed) this.armed.add(side);
    const indexExtended = indexTip.distanceTo(metacarpal) >= 0.055;
    origin.updateWorldMatrix(true, false);
    for (const position of positions) position.applyMatrix4(origin.matrixWorld);
    const fingerDir = indexTip.clone().sub(distal);
    if (fingerDir.lengthSq() < 1e-8) {
      this.reset(side);
      return null;
    }
    return {
      device: side === 'left' ? 'hand-left' : 'hand-right',
      handedness: side,
      connected: true,
      poseId: pressed ? 'pinch' : indexExtended ? 'point' : 'default',
      pinchValue: Math.max(0, Math.min(1, (0.04 - distance) / 0.03)),
      pressed: pressed && this.armed.has(side),
      position: wrist,
      indexTip,
      thumbTip,
      graspPoint: indexTip.clone().add(thumbTip).multiplyScalar(0.5),
      fingerDir: fingerDir.normalize(),
    };
  }
}
