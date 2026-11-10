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

interface HandScratch {
  wrist: Vector3;
  metacarpal: Vector3;
  distal: Vector3;
  indexTip: Vector3;
  thumbTip: Vector3;
  graspPoint: Vector3;
  fingerDir: Vector3;
  sample: LiveXRHandSample;
}

function createHandScratch(side: HandSide): HandScratch {
  const wrist = new Vector3();
  const metacarpal = new Vector3();
  const distal = new Vector3();
  const indexTip = new Vector3();
  const thumbTip = new Vector3();
  const graspPoint = new Vector3();
  const fingerDir = new Vector3();
  return {
    wrist,
    metacarpal,
    distal,
    indexTip,
    thumbTip,
    graspPoint,
    fingerDir,
    sample: {
      device: side === 'left' ? 'hand-left' : 'hand-right',
      handedness: side,
      connected: true,
      poseId: 'default',
      pinchValue: 0,
      pressed: false,
      position: wrist,
      indexTip,
      thumbTip,
      graspPoint,
      fingerDir,
    },
  };
}

const JOINT_NAMES = [
  'wrist',
  'index-finger-metacarpal',
  'index-finger-phalanx-distal',
  'index-finger-tip',
  'thumb-tip',
] as const;

export class NativeXRHands {
  private sources = new Map<HandSide, XRInputSource>();
  private lastSession: XRSession | null = null;
  private armed = new Set<HandSide>();
  private pinching = new Set<HandSide>();
  private selecting = new WeakMap<XRInputSource, boolean>();
  private readonly scratch: Record<HandSide, HandScratch> = {
    left: createHandScratch('left'),
    right: createHandScratch('right'),
  };

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

  private findHandSource(side: HandSide, session: XRSession): XRInputSource | undefined {
    for (const input of session.inputSources) {
      if (input.handedness === side && input.hand) return input;
    }
    const trackedSources = (session as XRSession & { trackedSources?: Iterable<XRInputSource> }).trackedSources;
    if (trackedSources) {
      for (const input of trackedSources) {
        if (input.handedness === side && input.hand) return input;
      }
    }
    return undefined;
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
    const source = this.findHandSource(side, session);
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

    const sc = this.scratch[side];
    const jointTargets = [sc.wrist, sc.metacarpal, sc.distal, sc.indexTip, sc.thumbTip];
    try {
      for (let i = 0; i < JOINT_NAMES.length; i++) {
        const space = source.hand.get(JOINT_NAMES[i]);
        const pose = space ? frame.getJointPose?.(space, referenceSpace) : null;
        const p = pose?.transform.position;
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
          this.reset(side);
          return null;
        }
        jointTargets[i].set(p.x, p.y, p.z);
      }
    } catch {
      this.reset(side);
      return null;
    }

    const { wrist, metacarpal, distal, indexTip, thumbTip, graspPoint, fingerDir, sample } = sc;
    const distance = indexTip.distanceTo(thumbTip);
    const geometricPinch = distance < (this.pinching.has(side) ? 0.028 : 0.018);
    const pressed = source.gamepad?.buttons[0]?.pressed ?? this.selecting.get(source) ?? geometricPinch;
    if (pressed) this.pinching.add(side);
    else this.pinching.delete(side);
    // A held pinch at connection/recovery must open before it can acquire anything.
    if (!pressed) this.armed.add(side);
    const indexExtended = indexTip.distanceTo(metacarpal) >= 0.055;
    origin.updateWorldMatrix(true, false);
    for (let i = 0; i < jointTargets.length; i++) jointTargets[i].applyMatrix4(origin.matrixWorld);
    fingerDir.copy(indexTip).sub(distal);
    if (fingerDir.lengthSq() < 1e-8) {
      this.reset(side);
      return null;
    }
    graspPoint.copy(indexTip).add(thumbTip).multiplyScalar(0.5);
    fingerDir.normalize();
    sample.connected = true;
    sample.poseId = pressed ? 'pinch' : indexExtended ? 'point' : 'default';
    sample.pinchValue = Math.max(0, Math.min(1, (0.04 - distance) / 0.03));
    sample.pressed = pressed && this.armed.has(side);
    return sample;
  }
}
