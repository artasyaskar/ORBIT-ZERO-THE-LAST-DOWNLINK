/**
 * VirtualQuestPlayer — High-Fidelity WebXR Player Simulator for Meta Quest
 *
 * Implements deterministic seated player emulation over Meta's Immersive Web Emulator (IWER 2.7.0).
 * Simulates head movement, stereoscopic view inspection, bimanual hand tracking,
 * natural pinch/grasp kinematics, cube manipulation, and tracking interruptions.
 *
 * IMPORTANT: This emulates WebXR inputs inside the browser engine; it does NOT
 * certify physical headset optical tracking noise, lens clarity, or Quest GPU thermals.
 */

export const CONSOLE_VIEW_TARGETS = {
  NEUTRAL: { x: 0.0, y: 1.05, z: -0.45 },
  GLOBE: { x: 0.0, y: 1.15, z: -0.42 },
  CUBES_TRAY: { x: -0.24, y: 0.79, z: -0.49 },
  PROCESS_CRADLE: { x: 0.0, y: 0.79, z: -0.48 },
  DOWNLINK_BAY: { x: 0.26, y: 0.79, z: -0.48 },
  TELEMETRY_HUD: { x: 0.86, y: 1.3, z: -0.86 },
  BRIEFING_PANEL: { x: -0.86, y: 1.3, z: -0.86 },
  DEBRIEF_PANEL: { x: 0.86, y: 1.3, z: -0.86 },
};

export class VirtualQuestPlayer {
  constructor(page, options = {}) {
    this.page = page;
    this.options = {
      deviceProfile: 'metaQuest3',
      defaultSeatedPosition: { x: 0, y: 1.25, z: 0 },
      stereoEnabled: options.stereoEnabled ?? true,
      ...options,
    };
    this.telemetryRecords = [];
  }

  /**
   * Helper that waits for 3 animation frames to allow IWER and Three.js ECS to process.
   */
  async settle(frames = 3) {
    await this.page.evaluate((count) => {
      return new Promise((resolve) => {
        let remaining = count;
        function step() {
          if (--remaining <= 0) resolve();
          else requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, frames);
  }

  /**
   * Initialize the Virtual Quest player: configure input mode, connect hands, and orient headset.
   */
  async initializeSession() {
    return this.page.evaluate(async (opts) => {
      const remote = window.__ORBIT_IWER__.remote;
      await remote.dispatch('set_input_mode', { mode: 'hand' });
      await remote.dispatch('set_connected', { device: 'hand-left', connected: true });
      await remote.dispatch('set_connected', { device: 'hand-right', connected: true });
      await remote.dispatch('set_hand_pose', { device: 'hand-left', poseId: 'default' });
      await remote.dispatch('set_hand_pose', { device: 'hand-right', poseId: 'point' });

      // Position headset at seated airplane-cockpit elevation
      await remote.dispatch('set_transform', {
        device: 'headset',
        position: opts.defaultSeatedPosition,
      });

      const left = await remote.dispatch('get_hand_state', { device: 'hand-left' });
      const right = await remote.dispatch('get_hand_state', { device: 'hand-right' });
      const headset = await remote.dispatch('get_transform', { device: 'headset' });

      return {
        immersive: window.__ORBIT_ZERO__?.getRuntimeStatus()?.immersive ?? false,
        headsetPosition: headset.position,
        leftConnected: left.connected,
        rightConnected: right.connected,
        rightPose: right.poseId,
      };
    }, this.options);
  }

  /**
   * Orient virtual player's gaze toward a console area or exact 3D point.
   */
  async lookAt(target) {
    const point = typeof target === 'string' ? (CONSOLE_VIEW_TARGETS[target] || CONSOLE_VIEW_TARGETS.NEUTRAL) : target;
    await this.page.evaluate(async (pt) => {
      const remote = window.__ORBIT_IWER__.remote;
      await remote.dispatch('look_at', { device: 'headset', target: pt });
    }, point);
    await this.settle(2);
  }

  /**
   * Simulate seated player leaning forward/sideways and returning to neutral.
   */
  async lean(offset = { x: 0, y: -0.05, z: -0.12 }, durationSec = 0.25) {
    const res = await this.page.evaluate(async ({ offset, dur, defaultPos }) => {
      const remote = window.__ORBIT_IWER__.remote;
      const targetPos = {
        x: defaultPos.x + (offset.x || 0),
        y: defaultPos.y + (offset.y || 0),
        z: defaultPos.z + (offset.z || 0),
      };
      await remote.dispatch('animate_to', {
        device: 'headset',
        position: targetPos,
        duration: dur,
      });
      return { targetPos };
    }, { offset, dur: durationSec, defaultPos: this.options.defaultSeatedPosition });
    await this.settle(4);
    return res;
  }

  /**
   * Return head to neutral seated posture.
   */
  async returnToNeutral() {
    await this.page.evaluate(async (defaultPos) => {
      const remote = window.__ORBIT_IWER__.remote;
      await remote.dispatch('animate_to', {
        device: 'headset',
        position: defaultPos,
        duration: 0.2,
      });
      await remote.dispatch('look_at', { device: 'headset', target: { x: 0, y: 1.05, z: -0.45 } });
    }, this.options.defaultSeatedPosition);
    await this.settle(3);
  }

  /**
   * Trigger WebXR recentering and verify station anchors remain consistent.
   */
  async recenter() {
    return this.page.evaluate(async () => {
      const device = window.__ORBIT_IWER__;
      // In IWER, recenter resets the local-floor reference origin
      if (typeof device.recenter === 'function') {
        device.recenter();
      }
      return {
        recenterCalled: true,
        reachEnvelope: window.__ORBIT_ZERO__?.verifySeatedReachEnvelope?.(),
      };
    });
  }

  /**
   * Report what the live XRFrame actually exposes (requires installPerfProbeInPage to have run
   * and a few frames to have elapsed). Nothing here is inferred or defaulted:
   *  - viewCount / eyes come from XRFrame.getViewerPose(...).views,
   *  - ipdMeasuredMeters is the distance between the two view origins in that pose,
   *  - ipdConfiguredMeters is the IWER device option (a setting, not a measurement),
   *  - hand joint counts come from XRInputSource.hand and XRFrame.getJointPose.
   * Optical comfort and lens clarity cannot be verified here.
   */
  async inspectStereoViews() {
    await this.settle(4);
    return this.page.evaluate(() => {
      const dev = window.__ORBIT_IWER__;
      const facts = window.__PERF__?.viewFacts?.();
      if (!facts || facts.count === null) {
        return { viewCount: 0, hasViewerPose: false, error: 'perf probe not installed or no XR frame observed yet' };
      }
      return {
        viewCount: facts.count,
        hasViewerPose: facts.count > 0,
        eyes: facts.eyes ?? [],
        ipdMeasuredMeters: facts.ipdFromPose,
        ipdConfiguredMeters: dev?.ipd ?? null,
        stereoEnabledOption: dev?.stereoEnabled ?? null,
        inputSources: facts.handedness,
        handJoints: facts.jointCounts ?? {},
      };
    });
  }
  /**
   * Hand gesture: Point index-tip at a 3D target and pinch to select.
   */
  async pointAndPinch(handDevice, targetId) {
    const res = await this.page.evaluate(
      async ({ handDevice, targetId }) => {
        const api = window.__ORBIT_ZERO__;
        const remote = window.__ORBIT_IWER__.remote;
        const pos = api.get3DTargetWorldPosition(targetId);
        if (!pos) throw new Error(`3D target not found: ${targetId}`);

        const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await remote.dispatch('set_hand_pose', { device: handDevice, poseId: 'point' });
        await remote.dispatch('set_select_value', { device: handDevice, value: 0.0 });
        await remote.dispatch('set_transform', {
          device: handDevice,
          position: pos,
          anchor: 'index-tip',
        });
        await settle();

        // Perform natural pinch transition: ramp 0 -> 1 -> 0
        await remote.dispatch('set_select_value', { device: handDevice, value: 1.0 });
        await settle();
        const pinchedHand = await remote.dispatch('get_hand_state', { device: handDevice });

        await remote.dispatch('set_select_value', { device: handDevice, value: 0.0 });
        await settle();
        const releasedHand = await remote.dispatch('get_hand_state', { device: handDevice });

        return {
          targetId,
          targetPos: pos,
          pinched: pinchedHand.pressed,
          released: !releasedHand.pressed,
          missionState: api.getState(),
          tutorialState: api.getTutorialState(),
        };
      },
      { handDevice, targetId },
    );
    return res;
  }

  /**
   * Hand gesture: Grab a 3D Data Cube with near-hand grasp anchor.
   */
  async grabCube(handDevice, cubeNodeId) {
    return this.page.evaluate(
      async ({ handDevice, cubeNodeId }) => {
        const api = window.__ORBIT_ZERO__;
        const remote = window.__ORBIT_IWER__.remote;
        const cubePos = api.get3DTargetWorldPosition(cubeNodeId);
        if (!cubePos) throw new Error(`Cube 3D coordinate missing: ${cubeNodeId}`);

        const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        // Position grasp point onto cube
        await remote.dispatch('set_hand_pose', { device: handDevice, poseId: 'point' });
        await remote.dispatch('set_select_value', { device: handDevice, value: 0.0 });
        await remote.dispatch('set_transform', { device: handDevice, position: cubePos, anchor: 'grasp' });
        const hand = await remote.dispatch('get_hand_state', { device: handDevice });
        const index = hand.anchors['index-tip'], thumb = hand.anchors['thumb-tip'];
        await remote.dispatch('set_transform', {
          device: handDevice,
          position: {
            x: hand.position.x + cubePos.x - (index.x + thumb.x) * 0.5,
            y: hand.position.y + cubePos.y - (index.y + thumb.y) * 0.5,
            z: hand.position.z + cubePos.z - (index.z + thumb.z) * 0.5,
          },
        });
        await settle();

        // Close grasp pinch
        await remote.dispatch('set_select_value', { device: handDevice, value: 1.0 });
        await settle();

        const activeGrabs = api.getActiveXRHandGrabs();
        return {
          cubeNodeId,
          acquired: activeGrabs.some((g) => g.handedness === (handDevice.includes('left') ? 'left' : 'right')),
          activeGrabs,
        };
      },
      { handDevice, cubeNodeId },
    );
  }

  /**
   * Hand gesture: Lift a grabbed cube to seated eye level to inspect its 3D hologram and caveats.
   */
  async inspectCube(handDevice, cubeNodeId, inspectionPoint = { x: -0.05, y: 1.15, z: -0.38 }) {
    return this.page.evaluate(
      async ({ handDevice, inspectionPoint }) => {
        const api = window.__ORBIT_ZERO__;
        const remote = window.__ORBIT_IWER__.remote;
        const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));

        // Move hand up to inspection point
        await remote.dispatch('animate_to', {
          device: handDevice,
          position: inspectionPoint,
          duration: 0.15,
        });
        await settle(5);

        return {
          inspectedPoint: inspectionPoint,
          activeGrabs: api.getActiveXRHandGrabs(),
          tutorialState: api.getTutorialState(),
        };
      },
      { handDevice, inspectionPoint },
    );
  }

  /**
   * Hand gesture: Grab a 3D Data Cube, carry it through space, and release inside target drop zone.
   */
  async carryAndDropCube(handDevice, cubeNodeId, dropZoneTargetId) {
    return this.page.evaluate(
      async ({ handDevice, cubeNodeId, dropZoneTargetId }) => {
        const api = window.__ORBIT_ZERO__;
        const remote = window.__ORBIT_IWER__.remote;
        const cubePos = api.get3DTargetWorldPosition(cubeNodeId);
        const dropPos = api.get3DTargetWorldPosition(dropZoneTargetId);
        if (!cubePos || !dropPos) {
          throw new Error(`Missing 3D coordinates for ${cubeNodeId} or ${dropZoneTargetId}`);
        }

        const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const moveGrasp = async (position) => {
          await remote.dispatch('set_transform', { device: handDevice, position, anchor: 'grasp' });
          const hand = await remote.dispatch('get_hand_state', { device: handDevice });
          const index = hand.anchors['index-tip'], thumb = hand.anchors['thumb-tip'];
          await remote.dispatch('set_transform', {
            device: handDevice,
            position: {
              x: hand.position.x + position.x - (index.x + thumb.x) * 0.5,
              y: hand.position.y + position.y - (index.y + thumb.y) * 0.5,
              z: hand.position.z + position.z - (index.z + thumb.z) * 0.5,
            },
          });
        };

        // 1. Check if already holding the cube. If not, acquire it.
        const activeGrabs = api.getActiveXRHandGrabs();
        const alreadyHolding = activeGrabs.some((g) => g.handedness === (handDevice.includes('left') ? 'left' : 'right'));
        if (!alreadyHolding) {
          await remote.dispatch('set_hand_pose', { device: handDevice, poseId: 'point' });
          await remote.dispatch('set_select_value', { device: handDevice, value: 0.0 });
          await moveGrasp(cubePos);
          await settle();
          await remote.dispatch('set_select_value', { device: handDevice, value: 1.0 });
          await settle();
        }

        // 2. Lift & carry through inspection / mid-transit waypoint
        const waypoint = {
          x: Number(((cubePos.x + dropPos.x) * 0.5).toFixed(3)),
          y: 0.89,
          z: -0.44,
        };
        await moveGrasp(waypoint);
        await settle();

        // 3. Move to drop zone
        await moveGrasp(dropPos);
        await settle();

        // 4. Release pinch inside drop zone
        await remote.dispatch('set_select_value', { device: handDevice, value: 0.0 });
        await settle();

        const activeGrabsAfterRelease = api.getActiveXRHandGrabs();
        return {
          cubeNodeId,
          dropZoneTargetId,
          released: activeGrabsAfterRelease.length === 0,
          missionState: api.getState(),
          tutorialState: api.getTutorialState(),
        };
      },
      { handDevice, cubeNodeId, dropZoneTargetId },
    );
  }

  /**
   * Adversarial: Simulate optical tracking loss while hand is holding a cube.
   */
  async injectTrackingLoss(handDevice) {
    return this.page.evaluate(async (device) => {
      const api = window.__ORBIT_ZERO__;
      const remote = window.__ORBIT_IWER__.remote;
      const grabsBefore = api.getActiveXRHandGrabs();

      // Disconnect hand mid-action
      await remote.dispatch('set_connected', { device, connected: false });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const grabsAfter = api.getActiveXRHandGrabs();
      const logs = api.getXRHandTelemetryLog().slice(-5);
      return {
        device,
        grabsBefore,
        grabsAfter,
        recoveryRecorded: logs.some((e) => e.eventType === 'tracking_lost_recovery' || e.eventType === 'grabrelease'),
      };
    }, handDevice);
  }

  /**
   * Adversarial: Reacquire hand tracking after drop/loss.
   */
  async reacquireTracking(handDevice, position = { x: 0.2, y: 0.95, z: -0.4 }) {
    return this.page.evaluate(async ({ device, pos }) => {
      const remote = window.__ORBIT_IWER__.remote;
      await remote.dispatch('set_transform', { device, position: pos });
      await remote.dispatch('set_connected', { device, connected: true });
      await remote.dispatch('set_select_value', { device, value: 0.0 });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const state = await remote.dispatch('get_hand_state', { device });
      return { connected: state.connected, poseId: state.poseId };
    }, { device: handDevice, pos: position });
  }

  /**
   * Adversarial: Simultaneous dual-hand grab contention on the exact same cube.
   */
  async attemptDualHandContention(cubeNodeId) {
    return this.page.evaluate(async (cubeId) => {
      const api = window.__ORBIT_ZERO__;
      const remote = window.__ORBIT_IWER__.remote;
      const pos = api.get3DTargetWorldPosition(cubeId);
      if (!pos) throw new Error(`Cube not found: ${cubeId}`);

      const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      // Move both hands to cube position
      await remote.dispatch('set_transform', { device: 'hand-left', position: pos, anchor: 'grasp' });
      await remote.dispatch('set_transform', { device: 'hand-right', position: pos, anchor: 'grasp' });
      await settle();

      // Pinch both hands simultaneously in the same frame
      await Promise.all([
        remote.dispatch('set_select_value', { device: 'hand-left', value: 1.0 }),
        remote.dispatch('set_select_value', { device: 'hand-right', value: 1.0 }),
      ]);
      await settle();

      const activeGrabs = api.getActiveXRHandGrabs();
      // Reset pinches
      await remote.dispatch('set_select_value', { device: 'hand-left', value: 0.0 });
      await remote.dispatch('set_select_value', { device: 'hand-right', value: 0.0 });
      await settle();

      return {
        cubeId,
        grabCount: activeGrabs.length,
        exclusiveWinner: activeGrabs[0]?.handedness ?? null,
        duplicateCubesDetected: activeGrabs.length > 1,
      };
    }, cubeNodeId);
  }

  /**
   * Synthetic stress: Inject high-frequency hand jitter to test grasp hysteresis.
   */
  async injectSyntheticJitter(handDevice, magnitude = 0.015, frames = 8) {
    return this.page.evaluate(async ({ device, mag, frameCount }) => {
      const remote = window.__ORBIT_IWER__.remote;
      const initial = await remote.dispatch('get_transform', { device });
      const pos = initial.position;

      for (let i = 0; i < frameCount; i++) {
        const jittered = {
          x: pos.x + (Math.random() - 0.5) * mag,
          y: pos.y + (Math.random() - 0.5) * mag,
          z: pos.z + (Math.random() - 0.5) * mag,
        };
        await remote.dispatch('set_transform', { device, position: jittered });
        await new Promise((r) => requestAnimationFrame(r));
      }

      await remote.dispatch('set_transform', { device, position: pos });
      return { jitterInjected: true, frames: frameCount, magnitude: mag };
    }, { device: handDevice, mag: magnitude, frameCount: frames });
  }

  /**
   * Collect real-time telemetry, reach envelope verification, and renderer statistics.
   */
  async collectRuntimeTelemetry() {
    return this.page.evaluate(() => {
      const api = window.__ORBIT_ZERO__;
      return {
        state: api.getState(),
        reachEnvelope: api.verifySeatedReachEnvelope?.(),
        rendererStats: api.getRendererStats?.(),
        handTelemetryLog: api.getXRHandTelemetryLog?.() || [],
        tutorialState: api.getTutorialState?.(),
        profile: api.getProfile?.(),
      };
    });
  }
}
