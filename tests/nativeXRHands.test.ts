import { describe, expect, it } from 'vitest';
import { Group, Vector3 } from '@iwsdk/core';
import { NativeXRHands } from '../src/systems/nativeXRHands';

const joints = ['wrist', 'index-finger-metacarpal', 'index-finger-phalanx-distal', 'index-finger-tip', 'thumb-tip'];

function hand(side: XRHandedness, x = 0) {
  const poses = new Map<string, Vector3>([
    ['wrist', new Vector3(x, 1, 0)],
    ['index-finger-metacarpal', new Vector3(x, 1, -0.04)],
    ['index-finger-phalanx-distal', new Vector3(x, 1, -0.09)],
    ['index-finger-tip', new Vector3(x, 1, -0.12)],
    ['thumb-tip', new Vector3(x + 0.07, 1, -0.12)],
  ]);
  const source = { handedness: side, hand: new Map(joints.map((joint) => [joint, { jointName: joint }])) } as unknown as XRInputSource;
  return { source, poses };
}

function harness(sources = [hand('left'), hand('right', 0.3)]) {
  const session = { inputSources: sources.map((h) => h.source), visibilityState: 'visible' } as unknown as XRSession;
  const frame = {
    session,
    getJointPose(space: { jointName: string }, _ref: unknown) {
      const owner = sources.find((h) => Array.from(h.source.hand!.values()).includes(space as XRJointSpace));
      const position = owner?.poses.get(space.jointName);
      return position ? { transform: { position }, radius: 0.01 } : null;
    },
  } as unknown as XRFrame;
  const reference = {} as XRReferenceSpace;
  const origin = new Group();
  const adapter = new NativeXRHands();
  const sample = (side: 'left' | 'right') => adapter.sample(side, session, frame, reference, origin);
  return { sources, session, frame, reference, origin, adapter, sample };
}

function pinch(h: ReturnType<typeof hand>, pressed: boolean) {
  h.poses.set('thumb-tip', h.poses.get('index-finger-tip')!.clone().add(new Vector3(pressed ? 0.01 : 0.07, 0, 0)));
}

describe('Native WebXR hand contract', () => {
  it('reports no hands without active input sources', () => {
    const h = harness([]);
    expect(h.sample('left')).toBeNull();
    expect(h.sample('right')).toBeNull();
  });

  it.each([['left', 'right'], ['right', 'left']] as const)('resolves %s-first connection by handedness, not index', (first, second) => {
    const h = harness([hand(first, first === 'left' ? -0.3 : 0.3), hand(second, second === 'left' ? -0.3 : 0.3)]);
    expect(h.sample('left')?.position.x).toBe(-0.3);
    expect(h.sample('right')?.position.x).toBe(0.3);
  });

  it('uses handed trackedSources when a runtime exposes hands outside primary inputSources', () => {
    const h = harness();
    const session = h.session as unknown as { inputSources: XRInputSource[]; trackedSources: XRInputSource[] };
    session.trackedSources = session.inputSources;
    session.inputSources = [];
    expect(h.sample('left')?.handedness).toBe('left');
  });

  it('accepts only the present hand when the right hand connects alone', () => {
    const h = harness([hand('right', 0.3)]);
    expect(h.sample('left')).toBeNull();
    expect(h.sample('right')?.handedness).toBe('right');
  });

  it.each(joints)('does not reuse a missing %s joint pose', (joint) => {
    const h = harness();
    expect(h.sample('left')).not.toBeNull();
    h.sources[0].poses.delete(joint);
    expect(h.sample('left')).toBeNull();
  });

  it('rejects a partial joint map', () => {
    const h = harness();
    (h.sources[0].source.hand as unknown as Map<string, unknown>).delete('thumb-tip');
    expect(h.sample('left')).toBeNull();
  });

  it('rejects invalid positions and a stale frame/session contract', () => {
    const h = harness();
    h.sources[0].poses.set('wrist', new Vector3(NaN, 0, 0));
    expect(h.sample('left')).toBeNull();
    expect(h.adapter.sample('right', {} as XRSession, h.frame, h.reference, h.origin)).toBeNull();
  });

  it('rejects a frame outside its active lifecycle', () => {
    const h = harness();
    h.frame.getJointPose = () => { throw new DOMException('Inactive XRFrame', 'InvalidStateError'); };
    expect(h.sample('left')).toBeNull();
  });

  it('does not interact while the session is blurred', () => {
    const h = harness();
    (h.session as unknown as { visibilityState: string }).visibilityState = 'visible-blurred';
    expect(h.sample('left')).toBeNull();
  });

  it('emits tracking loss when a connected source is replaced, before accepting its new position', () => {
    const h = harness();
    h.sample('left');
    pinch(h.sources[0], true);
    expect(h.sample('left')?.pressed).toBe(true);
    const replacement = hand('left', 0.8);
    h.sources[0] = replacement;
    (h.session.inputSources as unknown as XRInputSource[])[0] = replacement.source;
    expect(h.sample('left')).toBeNull();
    expect(h.sample('left')?.position.x).toBe(0.8);
    expect(h.sample('left')?.pressed).toBe(false);
  });

  it('uses runtime hand selection when available even if an authored open pose has close fingertips', () => {
    const h = harness();
    const buttons = [{ pressed: false }];
    (h.sources[0].source as unknown as { gamepad: unknown }).gamepad = { buttons };
    pinch(h.sources[0], true);
    expect(h.sample('left')?.pressed).toBe(false);
    buttons[0].pressed = true;
    expect(h.sample('left')?.pressed).toBe(true);
    buttons[0].pressed = false;
    expect(h.sample('left')?.pressed).toBe(false);
  });

  it('requires an open hand after initial connection', () => {
    const h = harness();
    pinch(h.sources[0], true);
    expect(h.sample('left')?.pressed).toBe(false);
    pinch(h.sources[0], false);
    h.sample('left');
    pinch(h.sources[0], true);
    expect(h.sample('left')?.pressed).toBe(true);
  });

  it('requires an open hand after tracking loss and reacquisition', () => {
    const h = harness();
    h.sample('left');
    pinch(h.sources[0], true);
    expect(h.sample('left')?.pressed).toBe(true);
    const wrist = h.sources[0].poses.get('wrist')!;
    h.sources[0].poses.delete('wrist');
    expect(h.sample('left')).toBeNull();
    h.sources[0].poses.set('wrist', wrist);
    expect(h.sample('left')?.pressed).toBe(false);
    pinch(h.sources[0], false);
    h.sample('left');
    pinch(h.sources[0], true);
    expect(h.sample('left')?.pressed).toBe(true);
  });

  it('transforms reference-space joint positions through the complete origin matrix', () => {
    const h = harness();
    h.origin.position.set(2, 0.3, 1);
    h.origin.rotation.y = Math.PI / 2;
    h.origin.updateMatrixWorld(true);
    const expected = h.origin.localToWorld(h.sources[0].poses.get('index-finger-tip')!.clone());
    expect(h.sample('left')?.indexTip.distanceTo(expected)).toBeLessThan(1e-8);
  });

  it('requires rearm when the XR session changes even if the source object is reused', () => {
    const h = harness();
    h.sample('left');
    pinch(h.sources[0], true);
    expect(h.sample('left')?.pressed).toBe(true);
    const nextSession = { inputSources: h.session.inputSources, visibilityState: 'visible' } as XRSession;
    const nextFrame = { session: nextSession, getJointPose: h.frame.getJointPose } as XRFrame;
    expect(h.adapter.sample('left', nextSession, nextFrame, h.reference, h.origin)?.pressed).toBe(false);
  });

  it('ignores controller select events and clears selections on reset', () => {
    const h = harness();
    h.adapter.setSelect({ handedness: 'left' } as XRInputSource, true);
    expect(h.sample('left')?.pressed).toBe(false);
    h.adapter.setSelect(h.sources[0].source, true);
    expect(h.sample('left')?.pressed).toBe(true);
    h.adapter.reset();
    expect(h.sample('left')?.pressed).toBe(false);
  });

  it('holds an armed geometric pinch through brief 30mm boundary wobble but releases when clearly opened', () => {
    const h = harness();
    h.sample('left');
    const tip = h.sources[0].poses.get('index-finger-tip')!;
    h.sources[0].poses.set('thumb-tip', tip.clone().add(new Vector3(0.012, 0, 0))); // 12mm enter
    expect(h.sample('left')?.pressed).toBe(true);
    h.sources[0].poses.set('thumb-tip', tip.clone().add(new Vector3(0.031, 0, 0))); // 31mm boundary wobble < 45ms
    expect(h.sample('left')?.pressed).toBe(true);
    h.sources[0].poses.set('thumb-tip', tip.clone().add(new Vector3(0.05, 0, 0))); // 50mm clearly opened
    expect(h.sample('left')?.pressed).toBe(false);
  });
});
