/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Primary IWSDK ECS System bridging the deterministic MissionEngine with:
 * - NASA Blue Marble 2K Textured 3D Earth Globe & 6 Indus Basin Sector Beacons (A-F)
 * - NASA 3U Earth-Observation CubeSat GLB Spacecraft
 * - Handheld Dual-Aperture Orbital Scanner Tool & 3 Holographic Evidence Data Cubes
 *   with live CanvasTexture observation swath & telemetry faces
 * - Console Tactile Pads (Sensor Toggle, Processing Cradle, Downlink Queue, Downlink Commit, Discard Chute)
 * - 3 UIKitML Spatial Panels (Briefing Panel, Overhead Telemetry HUD, Debrief Panel)
 */

import {
  AssetManager,
  CanvasTexture,
  Color,
  createSystem,
  Entity,
  Euler,
  Grabbed,
  GrabSystem,
  InputSystem,
  Line,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Pressed,
  Quaternion,
  Raycaster,
  SphereGeometry,
  SRGBColorSpace,
  SessionMode,
  UIKit,
  UIKitMLAsset,
  Vector2,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import {
  ConsoleControlNode,
  EvidenceCubeNode,
  OrbitSectorNode,
} from '../components';
import { DesktopControlsManager } from './desktopControls';
import {
  getScenarioSector,
  getRecommendedSensor,
  GROUND_REQUEST_ORDER,
  GROUND_REQUESTS,
  MISSION_BUDGET,
  MISSION_SCENARIOS,
  SECTOR_ORDER,
  SECTORS,
} from '../mission/missionConfig';
import { MissionEngine, replayMission } from '../mission/missionEngine';
import { describeMissionPlan, getMissionBenchmark, getNextPlanAction, getQueueSchedule, solveMission } from '../mission/missionPlanner';
import type { DataPacket, MissionScenarioId, MissionState, SectorId, SensorMode } from '../mission/types';
import {
  GLOBE_RADIUS,
  SECTOR_GEO_DEFINITIONS,
  latLonToGlobePoint,
} from '../scene-assets/earthGlobe.scene-asset';
import { alignSpan } from '../scene-assets/lib/hardsurface';
import { VRHandSimulator } from './vrHandSimulator';
import { OrbitalAudioController, type OrbitalSoundCue } from './orbitalAudio';
import { VoiceCommander, type VoiceDialogueId } from './voiceCommander';
import {
  getDailyPass, loadMissionProfile, recordDailyPass, recordMissionMastery, saveMissionProfile,
  type MissionPreferences,
} from './missionProfile';
import type { ActionResult, MissionAction, MissionSolution } from '../mission/types';

const RAW_TRAY_POSITIONS: [number, number, number][] = [
  [-0.46, 0.79, -0.43],
  [-0.37, 0.79, -0.43],
  [-0.28, 0.79, -0.43],
];

const DOWNLINK_BAY_POSITIONS: [number, number, number][] = [
  [0.29, 0.79, -0.46],
  [0.39, 0.79, -0.46],
  [0.49, 0.79, -0.46],
];

const STANDBY_CUBE_COLORS = [0x38bdf8, 0xf59e0b, 0x10b981];

const SCANNER_HOME_POSITION = new Vector3(-0.48, 0.79, -0.54);
const GLOBE_CENTER_WORLD = new Vector3(0, 0.98, -0.58);
const PROCESS_CRADLE_WORLD = new Vector3(0.24, 0.79, -0.55);
const DISCARD_CHUTE_WORLD = new Vector3(0.45, 0.79, -0.44);
const DOWNLINK_BAY_CENTER_WORLD = new Vector3(0.39, 0.79, -0.46);
const RAW_TRAY_CENTER_WORLD = new Vector3(-0.37, 0.79, -0.43);

// Target seated eye position in world space (0.32m back from origin, 1.25m seated eye height)
const SEATED_TARGET_HEAD_WORLD = new Vector3(0, 1.25, 0.32);

interface CubeCanvasBinding {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  signature: string;
}

export class MissionControlSystem extends createSystem({
  sectors: { required: [OrbitSectorNode] },
  sectorActivated: { required: [OrbitSectorNode, Pressed] },
  cubes: { required: [EvidenceCubeNode] },
  cubeActivated: { required: [EvidenceCubeNode, Pressed] },
  cubeGrabbed: { required: [EvidenceCubeNode, Grabbed] },
  controls: { required: [ConsoleControlNode] },
  controlActivated: { required: [ConsoleControlNode, Pressed] },
  controlGrabbed: { required: [ConsoleControlNode, Grabbed] },
}) {
  private engine = new MissionEngine();
  private audio = new OrbitalAudioController();
  private materialCache = new WeakMap<Object3D, MeshStandardMaterial[]>();
  private cubeCanvasMap = new Map<number, CubeCanvasBinding>();
  private tempVec = new Vector3();
  private lastTransmittedCount = 0;
  private downlinkUiSyncAccumulator = 0;
  private missionElapsedTime = 0;
  private elapsedTime = 0;
  private cradlePulseTimer = 0;
  private scanBeamPulseTimer = 0;
  private scanBeamSectorId: SectorId = 'B';
  private scanBeamMode: SensorMode = 'OPTICAL';
  private padPressTimers = new Map<string, number>();
  private lastDownlinkTickSecond = -1;
  private profile = loadMissionProfile();
  private settingsOpen = false;
  private recordedDebrief = false;
  private earnedMedals: string[] = [];
  private dailyDate: string | null = null;
  private replayIndex = -1;
  private caption = '';
  private solverSignature = '';
  private cachedSolution?: MissionSolution;
  private panelValues = new WeakMap<UIKitMLAsset, Map<string, string>>();
  private panelFontSizes = new WeakMap<object, number>();
  private frameSnapshot?: MissionState;
  private reviewState?: MissionState;
  private suppressReleaseActions = false;
  private readonly beamStart = new Vector3(0.39, 0.85, 0.035);
  private readonly beamEnd = new Vector3(0, 1.255, 0.01);
  private readonly worldUp = new Vector3(0, 1, 0);
  private scannerEntity?: Entity;
  private objectCache = new Map<string, Object3D>();
  private tempDirection = new Vector3();
  private tempTarget = new Vector3();
  private tempColor = new Color();
  private cubeTransitions = new Map<string, { kind: 'SCAN' | 'PROCESS'; remaining: number }>();
  private gazeSectorId: SectorId | null = null;
  private gazeDwellSec = 0;
  private isArSupported = false;

  // UIKitML references
  private briefingPanel?: UIKitMLAsset;
  private telemetryPanel?: UIKitMLAsset;
  private debriefPanel?: UIKitMLAsset;

  // Desktop Controls & First-Time Player Experience
  private desktopControls?: DesktopControlsManager;

  // Phase 5: In-Engine VR Hand & Ergonomic Simulator
  private vrHandSimulator!: VRHandSimulator;

  // Phase 2: Commander ARIA-7 Holographic Voice Handler & Radio DSP
  private voiceCommander?: VoiceCommander;

  // Phase 1: 3D Gimbal Globe Interactive Rotation & Focal Zoom
  private globeAngularVelocity = new Vector2(0, 0);
  private globeTargetQuaternion = new Quaternion();
  private globeCurrentQuaternion = new Quaternion();
  private globeFocalDistance = -0.58;
  private targetFocalDistance = -0.58;
  private isSlerpingToSector = false;
  private slerpProgress = 1.0;
  private slerpDuration = 0.65;

  init(): void {
    const inputSystem = this.world.getSystem(InputSystem);
    if (inputSystem) inputSystem.config.maintainScenePointers.value = true;
    this.scene.traverse((object) => {
      if (object instanceof Points || object instanceof Line ||
        /^(ScannerAimLaser|OrbitalScanSwathCone|DownlinkUplinkBeam|DownlinkPulseRing|DownlinkLaserCore|DownlinkLaserSheath|KarachiDishShockwave|.*DropHalo)/.test(object.name)) {
        object.raycast = () => {};
      }
    });
    this.audio.setVolume(this.profile.preferences.audioLevel);
    this.cleanupFuncs.push(() => this.audio.dispose());

    // Phase 5: Initialize In-Engine VR Hand & Seated Ergonomic Simulator
    this.vrHandSimulator = new VRHandSimulator();
    this.scene.add(this.vrHandSimulator.root);
    this.cleanupFuncs.push(() => {
      this.scene.remove(this.vrHandSimulator.root);
    });

    // Phase 2: Initialize Commander ARIA-7 Tactical Voice Handler & Subtitle Ribbon
    this.voiceCommander = new VoiceCommander({
      audio: this.audio,
      subtitlesEnabled: true,
      voiceEnabled: true,
    });
    this.cleanupFuncs.push(() => this.voiceCommander?.dispose());
    if (typeof navigator !== 'undefined' && 'xr' in navigator) {
      (navigator as any).xr?.isSessionSupported?.('immersive-ar').then((supported: boolean) => {
        this.isArSupported = Boolean(supported);
        this.syncSettings();
      }).catch(() => {
        this.isArSupported = false;
      });
    }
    const pauseWhenHidden = () => {
      if (document.hidden && !this.engine.getState().paused) this.togglePause();
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    this.cleanupFuncs.push(() => document.removeEventListener('visibilitychange', pauseWhenHidden));
    // 1. Bind NASA Blue Marble 4K textures onto the 3D Earth Globe & Cloud Layer
    this.bindEarthPlanetTextures();

    // 1b. Bind Deep-Space Milky Way Cosmic Skybox Dome
    this.bindCosmicEnvironmentAndTextures();

    // 2. Subscribe to 3D Sector Beacon activations (poke or ray-click)
    this.queries.sectorActivated.subscribe('qualify', (entity) => {
      if (this.isAnyObjectGrabbed()) return;
      const sectorId = (entity.getValue(OrbitSectorNode, 'sectorId') || 'B') as SectorId;
      this.handleSelectSector(sectorId);
    });

    // 3. Subscribe to 3D Evidence Cube activations (poke/click selects cube)
    this.queries.cubeActivated.subscribe('qualify', (entity) => {
      const slotIndex = entity.getValue(EvidenceCubeNode, 'slotIndex') ?? 0;
      const state = this.engine.getState();
      const pkt = state.packets[slotIndex];
      if (pkt) {
        this.applyAction({ type: 'SELECT_PACKET', packetId: pkt.id });
        this.playCue('SELECT_SECTOR');
        this.syncAll();
      }
    });

    // 4. Subscribe to 3D Evidence Cube grab start & release -> physical drop zone triage!
    this.queries.cubeGrabbed.subscribe('qualify', (entity) => {
      if (this.suppressReleaseActions || this.engine.getState().phase !== 'OPERATIONS' || this.engine.getState().paused) {
        this.world.getSystem(GrabSystem)?.forceRelease(entity);
        return;
      }
      const slotIndex = entity.getValue(EvidenceCubeNode, 'slotIndex') ?? 0;
      const pkt = this.engine.getState().packets[slotIndex];
      if (pkt) {
        this.applyAction({ type: 'SELECT_PACKET', packetId: pkt.id });
      }
      this.playCue('CUBE_GRAB');
      this.highlightDropZones(true);
      this.syncAll();
    });

    this.queries.cubeGrabbed.subscribe('disqualify', (entity) => {
      this.highlightDropZones(false);
      this.handleCubeReleased(entity);
    });

    // 5. Subscribe to 3D Console Control Pads & Scanner Tool
    this.queries.controlActivated.subscribe('qualify', (entity) => {
      if (this.isAnyObjectGrabbed()) return;
      const action = entity.getValue(ConsoleControlNode, 'action') || 'SCAN';
      if (action === 'SCAN' && entity.hasComponent(Grabbed)) {
        return;
      }
      this.handleControlAction(action);
    });

    // 6. Subscribe to Scanner Tool grab start & release -> if released near the Globe or a Sector, scan it!
    this.queries.controlGrabbed.subscribe('qualify', (entity) => {
      const action = entity.getValue(ConsoleControlNode, 'action') || '';
      if (action === 'SCAN') {
        this.playCue('CUBE_GRAB');
      }
    });

    this.queries.controlGrabbed.subscribe('disqualify', (entity) => {
      const action = entity.getValue(ConsoleControlNode, 'action') || '';
      if (action === 'SCAN') {
        this.handleScannerToolReleased(entity);
      }
    });

    // 7. Seated XR calibration: keep player origin at (0,0,0) for physical Quest local-floor,
    // configure IWER emulator device to seated pose when present, and clean up on XR exit.
    this.configureIwerSeatedPoseIfPresent();
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((visibilityState) => {
        const is2D = visibilityState === VisibilityState.NonImmersive;
        if (is2D) {
          this.forceReleaseAllGrabs();
          this.player.position.set(0, 0, 0);
          this.player.rotation.set(0, 0, 0);
          this.syncAll();
        } else {
          // On physical Quest hardware in local-floor space, restore persisted seated calibration
          const [ox, oy, oz] = this.profile.preferences.seatOffset;
          this.player.position.set(ox, oy, oz);
          this.configureIwerSeatedPoseIfPresent();
        }
      }),
    );

    // 8. Bind UIKitML Spatial Panels & Buttons
    this.bindSpatialPanels();

    // 9. Clone per-instance materials so whole-body emissive state tints never leak across shared prototypes
    this.prepareEntityMaterials();

    // 9b. Initialize Desktop Controls & Guided First-Time Player Experience
    this.desktopControls = new DesktopControlsManager({
      engine: this.engine,
      world: this.world,
      scene: this.scene,
      camera: this.camera,
      renderer: this.world.renderer,
      selectSector: (id) => this.handleSelectSector(id),
      cycleSector: () => this.handleCycleSector(),
      toggleSensor: () => this.handleToggleSensor(),
      scan: () => this.handleScan(),
      selectPacket: (id) => {
        this.applyAction({ type: 'SELECT_PACKET', packetId: id });
        this.syncAll();
      },
      cycleCube: () => this.cycleEvidence(),
      processSelected: (packetId) => {
        if (packetId && this.engine.getState().selectedPacketId !== packetId) {
          this.applyAction({ type: 'SELECT_PACKET', packetId });
        }
        return this.handleProcessSelected();
      },
      queueSelected: (packetId, slotIndex) => {
        if (packetId && this.engine.getState().selectedPacketId !== packetId) {
          this.applyAction({ type: 'SELECT_PACKET', packetId });
        }
        return this.handleQueueSelected(slotIndex);
      },
      unqueueSelected: (packetId) => {
        const state = this.engine.getState();
        const id = packetId ?? state.selectedPacketId;
        if (!id) return;
        const res = this.applyAction({ type: 'UNQUEUE', packetId: id });
        this.playCue(res.ok ? 'QUEUE_SLOT' : 'ERROR_REJECT');
        this.syncAll();
        return res;
      },
      discardSelected: (packetId) => {
        if (packetId && this.engine.getState().selectedPacketId !== packetId) {
          this.applyAction({ type: 'SELECT_PACKET', packetId });
        }
        return this.handleDiscardSelected();
      },
      commitDownlink: () => this.handleCommitDownlinkButton(),
      restartMission: () => this.handleRestartMission(),
      nextMission: () => this.nextMission(),
      togglePause: () => this.togglePause(),
      reorderQueue: () => this.handleReorderQueue(),
      rotateGlobe: (yaw, pitch) => this.rotateGlobe(yaw, pitch),
      zoomGlobe: (delta) => this.zoomGlobe(delta),
      playCue: (cue) => this.playCue(cue as never),
      getSceneObject: (id) => this.world.getSceneObject(id),
      highlightDropZones: (active) => this.highlightDropZones(active),
      toggleVrHandSimulator: (active?: boolean) => {
        if (typeof active === 'boolean') {
          this.vrHandSimulator.setEnabled(active);
          return active;
        }
        return this.vrHandSimulator.toggle();
      },
      setPinching: (pinching: boolean) => this.vrHandSimulator.setPinching(pinching),
      setPoking: (poking: boolean) => this.vrHandSimulator.setPoking(poking),
      getInteractionTargetPoint: () => this.desktopControls?.getInteractionTargetPoint() ?? null,
      syncAll: () => this.syncAll(),
    });
    this.cleanupFuncs.push(() => this.desktopControls?.dispose());

    // 10. Expose deterministic runtime API on window for automated E2E / XR verification
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__ORBIT_ZERO__ = {
        getState: () => this.engine.getState(),
        getJournal: () => this.engine.getJournal(),
        getStateHash: () => this.engine.getStateHash(),
        verifyReplay: () => replayMission(this.engine.getState().scenarioId, this.engine.getJournal()).getStateHash(),
        getMissionBenchmark: () => getMissionBenchmark(this.engine.getState().scenarioId),
        getReachablePlan: () => this.getSolution(this.engine.getState()),
        getProfile: () => structuredClone(this.profile),
        togglePreference: (key: keyof MissionPreferences) => this.cyclePreference(key),
        toggleTabletopMode: () => { this.cyclePreference('tabletopMode'); return this.profile.preferences.tabletopMode; },
        getGazeState: () => ({ sectorId: this.gazeSectorId, dwellProgress: Math.min(1, this.gazeDwellSec / 1.35), gazeAssist: this.profile.preferences.gazeAssist, tabletopMode: this.profile.preferences.tabletopMode }),
        setCameraPreset: (preset: 'HERO' | 'GLOBE' | 'CUBES' | 'CRADLE' | 'DOWNLINK' | 'DEBRIEF') => this.setCameraPreset(preset),
        pause: () => this.togglePause(),
        selectPacket: (id: string) => { this.applyAction({ type: 'SELECT_PACKET', packetId: id }); this.syncAll(); },
        getRuntimeStatus: () => ({ immersive: this.world.renderer.xr.isPresenting, phase: this.engine.getState().phase, caption: this.caption }),
        getControlScreenPosition: (panelId: string, elementId: string) => {
          if (this.world.renderer.xr.isPresenting) return null;
          const panel = this.world.getSceneObject<UIKitMLAsset>(panelId);
          const element = panel?.getElementById<UIKit.Container>(elementId);
          const matrix = element?.globalMatrix.value;
          if (!matrix || !element?.size.value || !element.isVisible.value) return null;
          const root = element.root.value.component;
          root.parent?.updateWorldMatrix(true, false);
          root.updateMatrix();
          this.camera.updateWorldMatrix(true, false);
          const point = new Vector3().setFromMatrixPosition(matrix).applyMatrix4(root.matrix);
          if (root.parent) point.applyMatrix4(root.parent.matrixWorld);
          point.project(this.camera);
          if (Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || point.z < -1 || point.z > 1) return null;
          const bounds = this.world.renderer.domElement.getBoundingClientRect();
          return { x: bounds.left + (point.x + 1) * bounds.width / 2, y: bounds.top + (1 - point.y) * bounds.height / 2 };
        },
        probePointer: (x: number, y: number) => {
          const bounds = this.renderer.domElement.getBoundingClientRect();
          const ray = new Raycaster();
          ray.setFromCamera(new Vector2((x - bounds.left) / bounds.width * 2 - 1, 1 - (y - bounds.top) / bounds.height * 2), this.camera);
          return ray.intersectObjects([this.scene], true).slice(0, 12).map((hit) => ({ name: hit.object.name, distance: hit.distance, parents: [hit.object.parent?.name, hit.object.parent?.parent?.name], visible: hit.object.visible }));
        },
        getPanelText: (panelId: string, elementId: string) => this.world.getSceneObject<UIKitMLAsset>(panelId)?.getElementById<UIKit.Text>(elementId)?.properties.value.text,
        clickPanel: (panelId: string, elementId: string) => {
          const panel = this.world.getSceneObject<UIKitMLAsset>(panelId);
          const element = panel?.getElementById(elementId);
          if (!element) return false;
          element.dispatchEvent({ type: 'click' } as never);
          return true;
        },
        selectSector: (id: SectorId) => this.handleSelectSector(id),
        toggleSensor: () => this.handleToggleSensor(),
        scan: () => this.handleScan(),
        process: () => this.handleProcessSelected(),
        queue: () => this.handleQueueSelected(),
        reorderQueue: () => this.handleReorderQueue(),
        discard: () => this.handleDiscardSelected(),
        startDownlink: () => this.handleStartDownlink(),
        tickDownlink: (sec: number) => {
          const st = this.engine.dispatch({ type: 'TICK', seconds: sec }) as MissionState;
          this.syncAll();
          return st;
        },
        commitDownlink: () => {
          this.handleCommitDownlinkButton();
          return this.engine.getState();
        },
        restart: () => this.handleRestartMission(),
        calibrateSeatedView: () => this.calibrateSeatedView(),
        getSceneObject: (id: string) => this.world.getSceneObject(id),
        trigger3DNode: (nodeId: string) => this.handleTrigger3DNodeById(nodeId),
        highlightDropZones: (active: boolean) => this.highlightDropZones(active),
        handleControlAction: (action: string) => this.handleControlAction(action),
        rotateGlobe: (yaw: number, pitch: number) => this.rotateGlobe(yaw, pitch),
        zoomGlobe: (delta: number) => this.zoomGlobe(delta),
        getGlobeRotationDelta: () => {
          const globe = this.world.getSceneObject('earth-globe');
          if (!globe) return 0;
          return 2 * Math.acos(Math.min(1, Math.max(-1, globe.quaternion.w)));
        },
        getGlobeFocalDistance: () => {
          const globe = this.world.getSceneObject('earth-globe');
          return globe ? globe.position.z : -0.58;
        },
        resetGlobeFocalDistance: () => {
          this.targetFocalDistance = -0.58;
          this.globeFocalDistance = -0.58;
          const globe = this.world.getSceneObject('earth-globe');
          if (globe) {
            globe.position.z = -0.58;
          }
        },
        getDrawCalls: () => this.world.renderer.info.render.calls,
        getTriangles: () => this.world.renderer.info.render.triangles,
        setScenario: (id: MissionScenarioId) => {
          this.dailyDate = null;
          this.engine.setScenario(id);
          this.handleRestartMission();
          return this.engine.getState();
        },
        cycleScenario: () => {
          this.nextMission();
          return this.engine.getState();
        },
        simulateCubeDrop: (
          slotIndex: number,
          targetZone: 'PROCESS' | 'QUEUE' | 'RAW_TRAY' | 'DISCARD' | 'INVALID',
        ) => this.handleSimulateCubeDrop(slotIndex, targetZone),
        getRendererStats: () => ({
          calls: this.renderer.info.render.calls,
          triangles: this.renderer.info.render.triangles,
          geometries: this.renderer.info.memory.geometries,
          textures: this.renderer.info.memory.textures,
          visibilityState: this.world.visibilityState.value,
          playerPosition: this.player.position.toArray(),
          cameraWorldPosition: this.camera.getWorldPosition(new Vector3()).toArray(),
        }),
        setCameraView: (
          pos: [number, number, number],
          target: [number, number, number],
          fov?: number,
        ) => {
          if (this.world.renderer.xr.isPresenting) return;
          this.camera.position.set(pos[0], pos[1], pos[2]);
          this.camera.lookAt(target[0], target[1], target[2]);
          if (typeof fov === 'number' && 'fov' in this.camera) {
            (this.camera as any).fov = fov;
            (this.camera as any).updateProjectionMatrix?.();
          }
          this.camera.updateMatrixWorld(true);
        },
        desktopControls: this.desktopControls,
        vrHandSimulator: this.vrHandSimulator,
        verifySeatedReachEnvelope: () =>
          VRHandSimulator.verifySeatedReachEnvelope(this.scene, (id) => this.world.getSceneObject(id)),
        toggleVrHandSimulator: (active?: boolean) => {
          if (typeof active === 'boolean') {
            this.vrHandSimulator.setEnabled(active);
            return active;
          }
          return this.vrHandSimulator.toggle();
        },
        setPinching: (pinching: boolean) => this.vrHandSimulator.setPinching(pinching),
        setPoking: (poking: boolean) => this.vrHandSimulator.setPoking(poking),
        voiceCommander: this.voiceCommander,
        triggerVoice: (dialogueId: VoiceDialogueId) => this.voiceCommander?.trigger(dialogueId),
        getAvatarMetrics: () => this.voiceCommander?.getAvatarMetrics(0.016),
        toggleVoiceMute: () => this.voiceCommander?.toggleMute(),
        triggerDesktopKey: (key: string) => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key }));
        },
      };
    }

    // Trigger Commander ARIA-7 Opening Tactical Pass Briefing
    window.setTimeout(() => {
      this.voiceCommander?.trigger('PASS_START');
    }, 600);

    this.syncAll();
  }

  update(delta: number): void {
    this.frameSnapshot = this.engine.getState();
    if (this.frameSnapshot.paused) return;
    const simulationDelta = Math.max(0, delta);
    if (this.frameSnapshot.phase !== 'DEBRIEF') this.missionElapsedTime += simulationDelta;
    delta = Math.min(simulationDelta, 0.1);
    const reducedMotion = this.profile.preferences.reducedMotion;
    if (!reducedMotion && !this.reviewState) this.elapsedTime += delta;
    this.animateCubeTransitions(delta);

    // Phase 5: In-Engine VR Hand & Ergonomic Simulator
    this.vrHandSimulator.update(delta, this.desktopControls?.getInteractionTargetPoint() ?? null);

    // Gaze-assisted target acquisition & hands-free dwell selection
    if (this.profile.preferences.gazeAssist && this.frameSnapshot.phase === 'OPERATIONS' && !this.isAnyObjectGrabbed()) {
      const headPos = this.camera.getWorldPosition(this.tempVec);
      const headDir = this.camera.getWorldDirection(this.tempDirection);
      let closestGazedSector: SectorId | null = null;
      let minAngle = 0.22; // ~12.6 degrees cone

      for (const sectorEntity of this.queries.sectors.entities) {
        const sObj = sectorEntity.object3D;
        if (!sObj) continue;
        sObj.updateWorldMatrix(true, false);
        const sPos = new Vector3().setFromMatrixPosition(sObj.matrixWorld);
        const toSector = sPos.sub(headPos).normalize();
        const angle = headDir.angleTo(toSector);
        if (angle < minAngle) {
          minAngle = angle;
          closestGazedSector = (sectorEntity.getValue(OrbitSectorNode, 'sectorId') || 'B') as SectorId;
        }
      }

      if (closestGazedSector) {
        if (this.gazeSectorId !== closestGazedSector) {
          this.gazeSectorId = closestGazedSector;
          this.gazeDwellSec = 0;
          this.syncAll();
        } else {
          this.gazeDwellSec += delta;
          if (this.profile.preferences.oneHanded) {
            const dwellProgress = Math.min(1, this.gazeDwellSec / 1.35);
            const sectorEntity = [...this.queries.sectors.entities].find(
              (e) => (e.getValue(OrbitSectorNode, 'sectorId') || 'B') === closestGazedSector
            );
            if (sectorEntity?.object3D) {
              const isSelected = closestGazedSector === this.engine.getState().selectedSectorId;
              const baseScale = isSelected ? 1.32 : 1.18;
              const dwellScale = baseScale + dwellProgress * 0.16;
              sectorEntity.object3D.scale.set(dwellScale, dwellScale, dwellScale);
            }
          }
          if (this.profile.preferences.oneHanded && this.gazeDwellSec >= 1.35) {
            if (this.engine.getState().selectedSectorId !== closestGazedSector) {
              this.handleSelectSector(closestGazedSector);
            }
            this.gazeDwellSec = 0;
          }
        }
      } else if (this.gazeSectorId !== null) {
        this.gazeSectorId = null;
        this.gazeDwellSec = 0;
        this.syncAll();
      }
    } else if (this.gazeSectorId !== null) {
      this.gazeSectorId = null;
      this.gazeDwellSec = 0;
      this.syncAll();
    }

    // Phase 3: Tactile 3D button mechanical spring-loaded depression & recoil physics (-12mm travel)
    for (const [padId, timer] of this.padPressTimers.entries()) {
      const newTimer = Math.max(0, timer - delta);
      const padObj = this.world.getSceneObject(padId);
      const cap = padObj?.getObjectByName('PadIlluminatedCap');
      const restY = padId === 'pad-fire-swath' ? 0.018 : 0.016;
      const stroke = padId === 'pad-fire-swath' ? 0.012 : 0.009; // -12mm stroke for plunger, -9mm for pads
      if (cap) {
        if (newTimer > 0) {
          this.padPressTimers.set(padId, newTimer);
          const progress = 1.0 - newTimer / 0.18;
          const depression = reducedMotion ? 0 : Math.sin(progress * Math.PI) * Math.exp(-1.8 * progress);
          cap.position.y = restY - depression * stroke;
        } else {
          cap.position.y = restY;
          this.padPressTimers.delete(padId);
          this.audio.playMechanicalSwitchClick(false);
        }
      } else if (newTimer <= 0) {
        this.padPressTimers.delete(padId);
      }
    }

    // Phase 3: Diegetic 3D Segmented Arc Gauges Update (Battery, Storage, Karachi Window)
    const deskGauges = this.world.getSceneObject('desk-gauges');
    if (deskGauges && this.frameSnapshot) {
      const state = this.frameSnapshot;
      const mats = deskGauges.userData.materials;
      if (mats) {
        // 1. Battery Gauge (10 segments, 55 Wh total capacity)
        const litBattSegs = Math.max(0, Math.min(10, Math.ceil((state.power / 55) * 10)));
        const battMat = state.power > 44 ? mats.cyan : state.power >= 20 ? mats.amber : mats.red;
        for (let i = 0; i < 10; i++) {
          const seg = deskGauges.getObjectByName(`GaugeBattSeg_${i}`);
          if (seg instanceof Mesh) {
            seg.material = i < litBattSegs ? battMat : mats.unlit;
          }
        }

        // 2. Solid-State Storage Buffer Gauge (9 segments, 9 MB total capacity)
        const litStorageSegs = Math.max(0, Math.min(9, Math.ceil(state.storageUsed)));
        for (let i = 0; i < 9; i++) {
          const seg = deskGauges.getObjectByName(`GaugeStorageSeg_${i}`);
          if (seg instanceof Mesh) {
            seg.material = i < litStorageSegs ? mats.amber : mats.unlit;
          }
        }

        // 3. Karachi Contact Window Gauge (10 segments, 10.0s window)
        const queuedPackets = state.packets.filter((p) => state.queuePacketIds.includes(p.id));
        const totalTxSec = queuedPackets.reduce((acc, p) => acc + p.transmitSec, 0);
        const isOverflow = totalTxSec > state.downlinkWindowSec;
        const litWinSegs = Math.max(0, Math.min(10, Math.ceil(totalTxSec)));
        const flashRed = isOverflow && Math.sin(this.elapsedTime * 14) > 0;
        const winMat = flashRed ? mats.red : totalTxSec <= 8 ? mats.cyan : mats.amber;

        for (let i = 0; i < 10; i++) {
          const seg = deskGauges.getObjectByName(`GaugeWindowSeg_${i}`);
          if (seg instanceof Mesh) {
            seg.material = i < litWinSegs ? winMat : mats.unlit;
          }
        }
      }
    }

    // Phase 3: Swath Plunger Safety Guard Ring Pulse
    const plunger = this.world.getSceneObject('pad-fire-swath');
    if (plunger && this.frameSnapshot) {
      const guardRing = plunger.getObjectByName('PlungerGuardRing');
      if (guardRing instanceof Mesh && guardRing.material instanceof MeshStandardMaterial) {
        const hasTarget = Boolean(this.frameSnapshot.selectedSectorId);
        guardRing.material.emissiveIntensity = hasTarget ? 0.75 + 0.35 * Math.sin(this.elapsedTime * 4) : 0.2;
      }
    }

    // Phase 4: Dynamic 5Hz pulse on radar multipath backscatter spikes & highway route pulse
    for (const cubeEntity of this.queries.cubes.entities) {
      const obj = cubeEntity.object3D;
      const spikes = obj?.getObjectByName('CubeRadarSpikes');
      if (spikes && spikes.visible) {
        const pulse = 1.0 + 0.35 * Math.sin(this.elapsedTime * 31.4); // 5Hz pulse
        spikes.scale.set(1, pulse, 1);
      }
      const hVec = obj?.getObjectByName('CubeHighwayVector');
      if (hVec instanceof Mesh && hVec.visible && hVec.material instanceof MeshStandardMaterial) {
        hVec.material.emissiveIntensity = 1.25 + 0.35 * Math.sin(this.elapsedTime * 4.0);
      }
    }

    const orbitalConsole = this.world.getSceneObject('orbital-console');
    if (orbitalConsole) {
      const skyDome = orbitalConsole.getObjectByName('MilkyWayCosmicDome');
      if (skyDome) {
        skyDome.rotation.y += (reducedMotion ? 0 : delta) * 0.0018;
      }
      // Phase 1: 2,500 Starfield Scintillation & Cosmic Drift
      const starfield = orbitalConsole.getObjectByName('CupolaStarfieldDome');
      if (starfield instanceof Points && starfield.material instanceof PointsMaterial) {
        starfield.rotation.y += (reducedMotion ? 0 : delta) * 0.0012;
        starfield.material.opacity = 0.90 + 0.07 * Math.sin(this.elapsedTime * 2.5);
      }
    }

    // Phase 2: Commander ARIA-7 Voice Handler Tick & 3D Holographic AI Avatar Dynamic Animation
    this.voiceCommander?.tick(delta);
    const avatarObj = this.world.getSceneObject('avatar-aria');
    if (avatarObj && this.voiceCommander) {
      const metrics = this.voiceCommander.getAvatarMetrics(delta);
      const core = avatarObj.getObjectByName('AriaCore');
      const ring1 = avatarObj.getObjectByName('AriaRing1');
      const ring2 = avatarObj.getObjectByName('AriaRing2');
      const ring3 = avatarObj.getObjectByName('AriaRing3');
      const emitter = avatarObj.getObjectByName('AriaEmitter');

      if (core) {
        core.rotation.y += (reducedMotion ? 0 : delta) * (metrics.isSpeaking ? 1.8 : 0.45);
        core.rotation.x += (reducedMotion ? 0 : delta) * (metrics.isSpeaking ? 1.2 : 0.25);
        const s = metrics.coreScale;
        core.scale.set(s, s, s);
      }

      const ringMult = metrics.ringSpeedMultiplier;
      const exp = 1.0 + metrics.ringExpansion;

      if (ring1) {
        ring1.rotation.z += (reducedMotion ? 0 : delta) * 0.85 * ringMult;
        ring1.scale.set(exp, exp, exp);
      }
      if (ring2) {
        ring2.rotation.y += (reducedMotion ? 0 : delta) * 1.15 * ringMult;
        ring2.scale.set(exp, exp, exp);
      }
      if (ring3) {
        ring3.rotation.x += (reducedMotion ? 0 : delta) * 0.95 * ringMult;
        ring3.scale.set(exp, exp, exp);
      }
      if (emitter instanceof Mesh && emitter.material instanceof MeshStandardMaterial) {
        emitter.material.emissiveIntensity = 0.9 + (metrics.isSpeaking ? 0.8 * metrics.intensity : 0.12 * Math.sin(this.elapsedTime * 3));
      }
    }

    const globe = this.world.getSceneObject('earth-globe');
    if (globe) {
      // Phase 1: Interactive Globe Gimbal Slerp or Damped Angular Momentum
      if (this.isSlerpingToSector) {
        this.slerpProgress += delta / this.slerpDuration;
        globe.quaternion.slerp(this.globeTargetQuaternion, 1.0 - Math.exp(-8.0 * delta));
        if (this.slerpProgress >= 1.0 || globe.quaternion.dot(this.globeTargetQuaternion) > 0.9995) {
          globe.quaternion.copy(this.globeTargetQuaternion);
          this.isSlerpingToSector = false;
        }
      } else if (this.globeAngularVelocity.lengthSq() > 0.000001) {
        this.globeAngularVelocity.multiplyScalar(0.92);
        const qYaw = new Quaternion().setFromAxisAngle(this.worldUp, this.globeAngularVelocity.x);
        const rightAxis = new Vector3(1, 0, 0);
        const qPitch = new Quaternion().setFromAxisAngle(rightAxis, this.globeAngularVelocity.y);
        const qDelta = new Quaternion().multiplyQuaternions(qYaw, qPitch);
        globe.quaternion.premultiply(qDelta);
      }

      // Phase 1: Smooth Focal Zoom Distance Interpolation
      if (Math.abs(globe.position.z - this.targetFocalDistance) > 0.0005) {
        this.globeFocalDistance += (this.targetFocalDistance - this.globeFocalDistance) * (1.0 - Math.exp(-12.0 * delta));
        globe.position.z = this.globeFocalDistance;
      }
      const cloudSphere = globe.getObjectByName('GlobeCloudSphere');
      if (cloudSphere) {
        cloudSphere.rotation.y += (reducedMotion ? 0 : delta) * 0.018;
      }
      const ring = globe.getObjectByName('EquatorTelemetryRing');
      if (ring) {
        ring.rotation.z += (reducedMotion ? 0 : delta) * 0.14;
      }
      const outerBand = globe.getObjectByName('OuterAzimuthRingGroup');
      if (outerBand) {
        outerBand.rotation.z -= (reducedMotion ? 0 : delta) * 0.09;
      }
      // Glowing atmosphere rim halo pulse
      const atmoRim = globe.getObjectByName('GlobeAtmosphereRim');
      if (atmoRim instanceof Mesh && atmoRim.material instanceof MeshBasicMaterial) {
        atmoRim.material.opacity = 0.20 + 0.08 * Math.sin(this.elapsedTime * 2.2);
      }
      const horizonHalo = globe.getObjectByName('GlobeHorizonHalo');
      if (horizonHalo instanceof Mesh && horizonHalo.material instanceof MeshBasicMaterial) {
        horizonHalo.material.opacity = 0.28 + 0.06 * Math.sin(this.elapsedTime * 1.8);
      }

      // Dynamic breathing pulse on active target sector ribbon
      const selectedId = this.engine.getState().selectedSectorId;
      const selectedRibbon = globe.getObjectByName(`SectorPoly_${selectedId}`);
      if (
        selectedRibbon instanceof Mesh &&
        selectedRibbon.material instanceof MeshStandardMaterial
      ) {
        selectedRibbon.material.emissiveIntensity =
          1.45 + 0.45 * Math.sin(this.elapsedTime * 4.5);
      }

      // Animate Sub-Satellite Nadir Pip gliding along ground track over the Indus Basin
      const nadirPip = globe.getObjectByName('SubSatelliteNadirPip');
      if (nadirPip) {
        const cycleProgress = (this.elapsedTime * 0.045) % 1.0;
        const currentPhase = this.engine.getState().phase;
        const progress =
          currentPhase === 'DOWNLINK'
            ? 0.72 +
              0.24 *
                Math.min(
                  1,
                  (this.frameSnapshot.downlinkWindowSec - this.frameSnapshot.downlinkRemainingSec) / this.frameSnapshot.downlinkWindowSec,
                )
            : cycleProgress;

        const curLat = 40.0 + (14.0 - 40.0) * progress;
        const curLon = 77.0 + (66.0 - 77.0) * progress;
        const p = latLonToGlobePoint(curLat, curLon, GLOBE_RADIUS * 1.019, this.tempTarget);
        nadirPip.position.copy(p);
        nadirPip.quaternion.setFromUnitVectors(
          this.worldUp,
          this.tempDirection.copy(p).normalize(),
        );

        if (
          nadirPip instanceof Mesh &&
          nadirPip.material instanceof MeshStandardMaterial
        ) {
          if (currentPhase === 'DOWNLINK') {
            nadirPip.material.color.setHex(0xf59e0b);
            nadirPip.material.emissive.setHex(0xf59e0b);
            nadirPip.material.emissiveIntensity =
              1.6 + 0.6 * Math.sin(this.elapsedTime * 12);
          } else {
            nadirPip.material.color.setHex(0x5eead4);
            nadirPip.material.emissive.setHex(0x14b8a6);
            nadirPip.material.emissiveIntensity =
              1.5 + 0.4 * Math.sin(this.elapsedTime * 4);
          }
        }
      }

      // Dynamic 3D Volumetric Orbital Observation Swath Cone (pulses from CubeSat down to target sector)
      const swathCone = globe.getObjectByName('OrbitalScanSwathCone');
      if (
        swathCone instanceof Mesh &&
        swathCone.material instanceof MeshBasicMaterial
      ) {
        const cubesat = this.world.getSceneObject('cubesat-spacecraft');
        const activeSectorId = this.scanBeamPulseTimer > 0 ? this.scanBeamSectorId : this.engine.getState().selectedSectorId;
        const sectorDef = SECTOR_GEO_DEFINITIONS[activeSectorId];

        if (cubesat && sectorDef) {
          const satWorld = new Vector3();
          cubesat.getWorldPosition(satWorld);
          const pSatLocal = globe.worldToLocal(satWorld);
          const pSectorLocal = latLonToGlobePoint(
            sectorDef.centerLatLon[0],
            sectorDef.centerLatLon[1],
            GLOBE_RADIUS,
          );
          const len = alignSpan(swathCone, pSatLocal, pSectorLocal);
          swathCone.scale.set(1, len, 1);

          if (this.scanBeamPulseTimer > 0) {
            this.scanBeamPulseTimer = Math.max(0, this.scanBeamPulseTimer - delta);
            const progress = 1.0 - this.scanBeamPulseTimer / 0.85;
            const opacity = Math.sin(progress * Math.PI) * 0.75;
            const beamHex = this.scanBeamMode === 'OPTICAL' ? 0x38bdf8 : 0xf59e0b;

            swathCone.material.color.setHex(beamHex);
            swathCone.material.opacity = opacity;
            swathCone.visible = true;
          } else {
            // Ambient observation swath cone gently tracking the active sector
            const isOptical = this.engine.getState().activeSensorMode === 'OPTICAL';
            const beamHex = isOptical ? 0x0284c7 : 0xd97706;
            swathCone.material.color.setHex(beamHex);
            swathCone.material.opacity = 0.12 + 0.05 * Math.sin(this.elapsedTime * 2.8);
            swathCone.visible = true;
          }
        } else {
          swathCone.visible = false;
        }
      }
    }

    // Dynamic 3D Low-Earth-Orbit (LEO) Spacecraft Motion & Active ADCS Ground Tracking
    const cubesat = this.world.getSceneObject('cubesat-spacecraft');
    if (cubesat) {
      this.initSpacecraftTelemetryLEDs(cubesat);

      // Spacecraft Avionics Bus Telemetry Indicators
      const attitudeLock = cubesat.getObjectByName('AdcsAttitudeLockLED');
      if (attitudeLock instanceof Mesh && attitudeLock.material instanceof MeshStandardMaterial) {
        attitudeLock.material.emissiveIntensity = 0.8 + 0.2 * Math.sin(this.elapsedTime * 2.0);
      }
      const epsHeartbeat = cubesat.getObjectByName('PowerTelemetryHeartbeatLED');
      if (epsHeartbeat instanceof Mesh && epsHeartbeat.material instanceof MeshStandardMaterial) {
        const isLowPower = this.frameSnapshot.power < 15;
        epsHeartbeat.material.color.setHex(isLowPower ? 0xf59e0b : 0x38bdf8);
        epsHeartbeat.material.emissive.setHex(isLowPower ? 0xd97706 : 0x0284c7);
        epsHeartbeat.material.emissiveIntensity = 0.5 + 0.3 * Math.sin(this.elapsedTime * 3.14);
      }

      // Continuous 3D Low-Earth-Orbit Trajectory around Tactical Earth Globe (R = 0.285m, ~52° inclination pass)
      const orbitSpeed = reducedMotion ? 0.03 : 0.12;
      const orbitAngle = (this.elapsedTime * orbitSpeed) % (Math.PI * 2);
      const cosA = Math.cos(orbitAngle);
      const sinA = Math.sin(orbitAngle);
      const rOrbit = 0.285;

      // Ascending orbital trajectory over Pakistan / Indus Basin theater:
      const satX = GLOBE_CENTER_WORLD.x + rOrbit * cosA * 0.94;
      const satY = GLOBE_CENTER_WORLD.y + 0.10 + rOrbit * sinA * 0.45; // [0.95m to 1.23m], clear of desk
      const satZ = GLOBE_CENTER_WORLD.z + rOrbit * sinA * 0.78;
      cubesat.position.set(satX, satY, satZ);

      // Active ADCS Attitude: Nadir instruments (+Z bulkhead) target Earth Globe center
      const awayFromGlobe = this.tempVec.copy(cubesat.position).sub(GLOBE_CENTER_WORLD).multiplyScalar(2).add(cubesat.position);
      cubesat.lookAt(awayFromGlobe);

      // Add dynamic ADCS slewing bias toward the currently active target sector
      const sectorCfg = getScenarioSector(this.frameSnapshot.scenarioId, this.frameSnapshot.selectedSectorId);
      if (sectorCfg) {
        const [nx, ny] = sectorCfg.globeNormalizedPosition;
        cubesat.rotation.z += (nx * 0.12);
        cubesat.rotation.x += (ny * 0.08);
      }
    }

    // Live Proximity Aiming Laser & Target Reticle Lock when scanner wand is held
    const scannerObj = this.world.getSceneObject('scanner-tool');
    if (scannerObj) {
      const currentPhase = this.frameSnapshot.phase;
      const scannerEntity = this.scannerEntity ??= [...this.queries.controls.entities].find((e) => e.getValue(ConsoleControlNode, 'action') === 'SCAN');
      const isGrabbed = currentPhase === 'OPERATIONS' && (scannerEntity?.hasComponent(Grabbed) ?? false);
      const aimLaser = scannerObj.getObjectByName('ScannerAimLaser');
      if (
        aimLaser instanceof Mesh &&
        aimLaser.material instanceof MeshBasicMaterial
      ) {
        if (isGrabbed) {
          const hex =
            this.engine.getState().activeSensorMode === 'OPTICAL'
              ? 0x38bdf8
              : 0xf59e0b;
          aimLaser.material.color.setHex(hex);
          aimLaser.material.opacity = 0.68;
          aimLaser.visible = true;

          // Proximity Aiming Sweep against sector entities:
          scannerObj.updateWorldMatrix(true, false);
          const laserTipWorld = scannerObj.localToWorld(
            new Vector3(0, 0.092, -0.35),
          );
          let closestSectorId: SectorId | null = null;
          let bestDist = 0.3;
          for (const sectorEntity of this.queries.sectors.entities) {
            const sObj = sectorEntity.object3D;
            if (!sObj) continue;
            sObj.updateWorldMatrix(true, false);
            const sPos = new Vector3().setFromMatrixPosition(sObj.matrixWorld);
            const dist = laserTipWorld.distanceTo(sPos);
            if (dist < bestDist) {
              bestDist = dist;
              closestSectorId = (sectorEntity.getValue(OrbitSectorNode, 'sectorId') ||
                'B') as SectorId;
            }
          }
          if (
            closestSectorId &&
            closestSectorId !== this.engine.getState().selectedSectorId
          ) {
            this.applyAction({ type: 'SELECT_SECTOR', sectorId: closestSectorId });
            this.playCue('WAND_LOCK');
            this.syncAll();
          }
        } else {
          aimLaser.material.opacity = 0.0;
          aimLaser.visible = false;
        }
      }
    }

    // Animated processing cradle pneumatic clamps & status induction flash
    if (this.cradlePulseTimer > 0) {
      this.cradlePulseTimer = Math.max(0, this.cradlePulseTimer - delta);
      const consoleObj = this.world.getSceneObject('orbital-console');
      if (consoleObj) {
        const clampLeft = consoleObj.getObjectByName('CradleClampLeft');
        const clampRight = consoleObj.getObjectByName('CradleClampRight');
        const cradleCore = consoleObj.getObjectByName('ProcessingCradleCore');
        const ring = consoleObj.getObjectByName('CradleInductionRing');
        const progress = 1.0 - this.cradlePulseTimer / 0.65;
        const squeeze = reducedMotion ? 0 : Math.sin(progress * Math.PI); // 0 -> 1 -> 0

        if (clampLeft) {
          clampLeft.position.x = -0.048 + squeeze * 0.012; // -0.048 to -0.036
        }
        if (clampRight) {
          clampRight.position.x = 0.048 - squeeze * 0.012; // +0.048 to +0.036
        }
        if (
          cradleCore instanceof Mesh &&
          cradleCore.material instanceof MeshStandardMaterial
        ) {
          if (progress < 0.6) {
            cradleCore.material.emissive.setHex(0x10b981);
            cradleCore.material.emissiveIntensity = 1.2 + squeeze * 1.5;
          } else {
            cradleCore.material.emissive.setHex(0xf59e0b);
            cradleCore.material.emissiveIntensity = 0.95 + (1.0 - progress) * 0.6;
          }
        }
        if (ring instanceof Mesh && ring.material instanceof MeshStandardMaterial) {
          ring.material.emissiveIntensity = 0.6 + squeeze * 1.4;
        }
      }
    }

    // Live animated downlink window progression during DOWNLINK phase
    let currentPhase = this.frameSnapshot.phase;
    if (currentPhase === 'DOWNLINK') {
      const nextState = this.engine.dispatch({ type: 'TICK', seconds: simulationDelta }, this.missionElapsedTime) as MissionState;
      this.frameSnapshot = nextState;
      currentPhase = nextState.phase;
      const currentSec = Math.floor(nextState.downlinkElapsedSec);
      if (currentSec !== this.lastDownlinkTickSecond) {
        this.lastDownlinkTickSecond = currentSec;
        this.playCue('DOWNLINK_TICK');
      }
      const txCount = nextState.packets.filter((p) => p.transmitted).length;
      this.downlinkUiSyncAccumulator += delta;

      if (
        txCount !== this.lastTransmittedCount ||
        nextState.phase === 'DEBRIEF' ||
        this.downlinkUiSyncAccumulator >= 0.15
      ) {
        if (txCount > this.lastTransmittedCount) {
          this.playCue('PACKET_RECEIVED');
        }
        if (nextState.phase === 'DEBRIEF') {
          this.playCue('HANDSHAKE_CONFIRM');
          if (nextState.debrief && nextState.debrief.totalScore >= nextState.debrief.achievableScore) {
            this.playCue('OPTIMAL_VICTORY');
            this.voiceCommander?.trigger('DEBRIEF_VICTORY');
          } else {
            this.playCue('LINK_CUTOFF');
            this.voiceCommander?.trigger('DEBRIEF_RETRY');
          }
        }
        this.lastTransmittedCount = txCount;
        this.downlinkUiSyncAccumulator = 0;
        this.syncAll();
      }
    }

    // Live S-Band Microwave Uplink Beam, Traveling Data Pulse Rings & Transmitting Cube Levitation
    const consoleObj = this.world.getSceneObject('orbital-console');
    if (consoleObj) {
      const uplinkBeam = consoleObj.getObjectByName('DownlinkUplinkBeam');
      if (
        uplinkBeam instanceof Mesh &&
        uplinkBeam.material instanceof MeshBasicMaterial
      ) {
        if (currentPhase === 'DOWNLINK') {
          uplinkBeam.visible = true;
          uplinkBeam.material.opacity = reducedMotion ? 0.5 : 0.42 + 0.22 * Math.sin(this.elapsedTime * 18);

          const pA = this.beamStart;
          const pB = this.beamEnd;
          for (let i = 0; i < 3; i++) {
            const ring = consoleObj.getObjectByName(`DownlinkPulseRing_${i + 1}`);
            if (
              ring instanceof Mesh &&
              ring.material instanceof MeshBasicMaterial
            ) {
              const t = (this.elapsedTime * 1.8 + i * 0.333) % 1.0;
              ring.position.lerpVectors(pA, pB, t);
              ring.material.opacity = Math.sin(t * Math.PI) * 0.85;
              ring.visible = !reducedMotion;
            }
          }

          // Elevate currently transmitting evidence cube in its slot (+18mm) with active transmission spin
          const state = this.frameSnapshot;
          const activePkt = state.packets.find((p) => p.id === state.activeDownlinkPacketId);
          if (activePkt) {
            const activeCubeEntity = Array.from(this.queries.cubes.entities).find(
              (e) => e.getValue(EvidenceCubeNode, 'packetId') === activePkt.id,
            );
            if (
              activeCubeEntity?.object3D &&
              !activeCubeEntity.hasComponent(Grabbed)
            ) {
              const obj = activeCubeEntity.object3D;
              const basePos =
                activePkt.queueIndex !== null
                  ? DOWNLINK_BAY_POSITIONS[activePkt.queueIndex]
                  : null;
              if (basePos) {
                obj.position.set(basePos[0], basePos[1] + (reducedMotion ? 0 : 0.018), basePos[2]);
                obj.rotation.y += reducedMotion ? 0 : delta * 3.5;
                const particles = obj.getObjectByName('CubeAssemblyParticles');
                if (particles instanceof Points && particles.material instanceof PointsMaterial) {
                  particles.visible = !reducedMotion;
                  particles.rotation.y += delta * 4.0;
                  particles.material.color.setHex(0xf59e0b);
                  particles.material.opacity = 0.5 + 0.4 * Math.sin(this.elapsedTime * 12);
                }
              }
            }
          }

          // Phase 5: Space-to-Ground Volumetric Downlink Laser & Karachi Ground Station Lock
          const globe = this.world.getSceneObject('earth-globe');
          const cubesat = this.world.getSceneObject('cubesat-spacecraft');
          if (globe && cubesat) {
            const downlinkLaserGroup = globe.getObjectByName('DownlinkLaserBeamGroup');
            const karachiTerminal = globe.getObjectByName('KarachiGroundStation');
            if (downlinkLaserGroup && karachiTerminal) {
              downlinkLaserGroup.visible = true;
              const satWorld = cubesat.getWorldPosition(new Vector3());
              const pSatLocal = globe.worldToLocal(satWorld);
              const pKarachiLocal = karachiTerminal.position;

              const laserCore = downlinkLaserGroup.getObjectByName('DownlinkLaserCore');
              const laserSheath = downlinkLaserGroup.getObjectByName('DownlinkLaserSheath');

              if (laserCore instanceof Mesh && laserCore.material instanceof MeshBasicMaterial) {
                laserCore.visible = true;
                const len = alignSpan(laserCore, pSatLocal, pKarachiLocal);
                laserCore.scale.set(1, len, 1);
                laserCore.material.opacity = reducedMotion ? 0.8 : 0.85 + 0.15 * Math.sin(this.elapsedTime * 32);
              }
              if (laserSheath instanceof Mesh && laserSheath.material instanceof MeshBasicMaterial) {
                laserSheath.visible = true;
                const len = alignSpan(laserSheath, pSatLocal, pKarachiLocal);
                laserSheath.scale.set(1, len, 1);
                laserSheath.material.opacity = reducedMotion ? 0.45 : 0.42 + 0.22 * Math.sin(this.elapsedTime * 18);
              }

              // ADCS Attitude Slew: Point CubeSat optical downlink aperture toward Karachi Ground Station
              const karachiWorld = karachiTerminal.getWorldPosition(new Vector3());
              cubesat.lookAt(karachiWorld);

              // Pulsing Karachi demodulation footprint shockwave
              const shockwave = karachiTerminal.getObjectByName('KarachiDishShockwave');
              if (shockwave instanceof Mesh && shockwave.material instanceof MeshBasicMaterial) {
                shockwave.visible = true;
                const swT = (this.elapsedTime * 3.2) % 1.0;
                shockwave.scale.set(1.0 + swT * 1.8, 1.0 + swT * 1.8, 1.0);
                shockwave.material.opacity = (1.0 - swT) * 0.85;
              }

              // Bell 202 FSK audio bursts every 240ms during transmission
              if (!reducedMotion && Math.floor(this.elapsedTime * 4.2) !== Math.floor((this.elapsedTime - delta) * 4.2)) {
                this.audio.playBell202FskBurst();
              }
            }
          }
        } else {
          uplinkBeam.visible = false;
          uplinkBeam.material.opacity = 0.0;
          for (let i = 0; i < 3; i++) {
            const ring = consoleObj.getObjectByName(`DownlinkPulseRing_${i + 1}`);
            if (
              ring instanceof Mesh &&
              ring.material instanceof MeshBasicMaterial
            ) {
              ring.visible = false;
              ring.material.opacity = 0.0;
            }
          }
          const globe = this.world.getSceneObject('earth-globe');
          if (globe) {
            const downlinkLaserGroup = globe.getObjectByName('DownlinkLaserBeamGroup');
            if (downlinkLaserGroup) {
              downlinkLaserGroup.visible = false;
              const laserCore = downlinkLaserGroup.getObjectByName('DownlinkLaserCore');
              if (laserCore) laserCore.visible = false;
              const laserSheath = downlinkLaserGroup.getObjectByName('DownlinkLaserSheath');
              if (laserSheath) laserSheath.visible = false;
            }
            const karachiTerminal = globe.getObjectByName('KarachiGroundStation');
            const shockwave = karachiTerminal?.getObjectByName('KarachiDishShockwave');
            if (shockwave) shockwave.visible = false;
          }
        }
      }
    }

    if (currentPhase === 'OPERATIONS' && this.profile.preferences.guidance === 'GUIDED' && !this.isAnyObjectGrabbed()) {
      const state = this.frameSnapshot;
      const solution = this.getSolution(state);
      const next = getNextPlanAction(state, solution);
      const intensity = reducedMotion ? 1.15 : 0.9 + 0.25 * Math.sin(this.elapsedTime * 4);
      let targetId = 'pad-commit-downlink';
      let color = 0x34d399;
      if (next?.type === 'SCAN') {
        targetId = state.activeSensorMode !== next.sensorMode ? 'pad-toggle-sensor'
          : state.selectedSectorId !== next.sectorId ? `sector-${next.sectorId.toLowerCase()}` : 'scanner-tool';
        color = next.sensorMode === 'RADAR' ? 0xfbbf24 : 0x38bdf8;
      } else if (next?.type === 'PROCESS') { targetId = 'pad-process-cradle'; color = 0xfbbf24; }
      else if (next?.type === 'DISCARD') { targetId = 'pad-discard-chute'; color = 0xf87171; }
      else if (next?.type === 'QUEUE' || next?.type === 'UNQUEUE') { targetId = 'pad-queue-downlink'; color = 0x38bdf8; }
      const target = this.world.getSceneObject(targetId);
      if (target) this.setObjectTint(target, color, intensity);
    }
  }

  private bindEarthPlanetTextures(): void {
    const globe = this.world.getSceneObject('earth-globe');
    if (!globe) return;

    this.globeCurrentQuaternion.copy(globe.quaternion);
    this.globeTargetQuaternion.copy(globe.quaternion);
    this.globeFocalDistance = globe.position.z;
    this.targetFocalDistance = globe.position.z;

    const albedoTex = AssetManager.getTexture('earth-albedo-tex');
    const normalTex = AssetManager.getTexture('earth-normal-tex');
    const specTex = AssetManager.getTexture('earth-specular-tex');
    const cloudsTex = AssetManager.getTexture('earth-clouds-tex');
    const nightTex = AssetManager.getTexture('earth-night-tex');

    if (albedoTex) {
      albedoTex.colorSpace = SRGBColorSpace;
      albedoTex.needsUpdate = true;
    }
    if (nightTex) {
      nightTex.colorSpace = SRGBColorSpace;
      nightTex.needsUpdate = true;
    }
    if (cloudsTex) {
      cloudsTex.colorSpace = SRGBColorSpace;
      cloudsTex.needsUpdate = true;
    }

    const enhancedMaps = this.buildSouthAsiaEnhancedPlanetMaps(
      albedoTex?.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap | undefined,
      specTex?.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap | undefined,
      cloudsTex?.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap | undefined,
    );

    const coreSphere = globe.getObjectByName('GlobeCoreSphere');
    if (coreSphere instanceof Mesh && coreSphere.material instanceof MeshStandardMaterial) {
      const mat = coreSphere.material;
      if (enhancedMaps?.albedo) {
        mat.map = enhancedMaps.albedo;
      } else if (albedoTex) {
        mat.map = albedoTex;
      }
      if (normalTex) {
        mat.normalMap = normalTex;
        mat.normalScale = new Vector2(2.8, 2.8);
      }
      mat.roughnessMap = mat.map;
      mat.roughness = 0.95;
      mat.emissiveMap = mat.map;
      mat.emissive = new Color(0xffffff);
      mat.emissiveIntensity = 0.035;
      mat.metalness = 0.05;
      mat.needsUpdate = true;
    }

    const cloudSphere = globe.getObjectByName('GlobeCloudSphere');
    if (cloudSphere instanceof Mesh && cloudSphere.material instanceof MeshStandardMaterial) {
      const cMat = cloudSphere.material;
      const finalCloudTex = enhancedMaps?.clouds ?? cloudsTex;
      if (finalCloudTex) {
        cMat.map = finalCloudTex;
        cMat.alphaMap = finalCloudTex;
      }
      cMat.transparent = true;
      cMat.opacity = 0.40;
      cMat.needsUpdate = true;
    }
  }

  private bindCosmicEnvironmentAndTextures(): void {
    const consoleObj = this.world.getSceneObject('orbital-console');
    if (!consoleObj) return;

    const milkyWayTex = AssetManager.getTexture('milky-way-tex');
    const skyDome = consoleObj.getObjectByName('MilkyWayCosmicDome');
    if (skyDome instanceof Mesh && skyDome.material instanceof MeshBasicMaterial) {
      if (milkyWayTex) {
        milkyWayTex.colorSpace = SRGBColorSpace;
        milkyWayTex.needsUpdate = true;
        skyDome.material.map = milkyWayTex;
        skyDome.material.color.setHex(0xffffff);
        skyDome.material.opacity = 0.92;
        skyDome.material.needsUpdate = true;
      }
    }
  }

  private initSpacecraftTelemetryLEDs(cubesat: Object3D): void {
    if (cubesat.getObjectByName('AdcsAttitudeLockLED')) return;

    const attitudeLockMat = new MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 1.0,
      roughness: 0.2,
      metalness: 0.5,
    });
    attitudeLockMat.name = 'AdcsAttitudeLockLEDMat';

    const epsTelemetryMat = new MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.5,
    });
    epsTelemetryMat.name = 'PowerTelemetryHeartbeatLEDMat';

    const ledGeo = new SphereGeometry(0.0022, 8, 6);

    const attitudeLock = new Mesh(ledGeo, attitudeLockMat);
    attitudeLock.name = 'AdcsAttitudeLockLED';
    attitudeLock.position.set(0.024, 0.045, -0.06);
    cubesat.add(attitudeLock);

    const epsHeartbeat = new Mesh(ledGeo, epsTelemetryMat);
    epsHeartbeat.name = 'PowerTelemetryHeartbeatLED';
    epsHeartbeat.position.set(-0.024, 0.045, -0.06);
    cubesat.add(epsHeartbeat);
  }

  /**
   * Grades the local 2K NASA Blue Marble albedo & water-mask textures so South Asia,
   * the Indus River Basin, the snow-capped Himalayas, the Tibetan/Iranian plateaus,
   * and the Arabian Sea / Bay of Bengal coastal shelves read with high satellite clarity,
   * while windowing the planetary cloud layer so central South Asia is unobstructed.
   */
  private buildSouthAsiaEnhancedPlanetMaps(
    albedoImg?: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
    specImg?: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
    cloudsImg?: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  ): {
    albedo?: CanvasTexture;
    roughness?: CanvasTexture;
    clouds?: CanvasTexture;
  } | null {
    if (typeof document === 'undefined' || !albedoImg) return null;

    const w = 2048;
    const h = 1024;
    const albedoCanvas = document.createElement('canvas');
    albedoCanvas.width = w;
    albedoCanvas.height = h;
    const aCtx = albedoCanvas.getContext('2d');
    if (!aCtx) return null;

    aCtx.drawImage(albedoImg, 0, 0, w, h);
    const aData = aCtx.getImageData(0, 0, w, h);
    const px = aData.data;

    let sPx: Uint8ClampedArray | null = null;
    let roughCanvas: HTMLCanvasElement | undefined;
    let rData: ImageData | undefined;
    let rCtx: CanvasRenderingContext2D | null = null;

    if (specImg) {
      roughCanvas = document.createElement('canvas');
      roughCanvas.width = w;
      roughCanvas.height = h;
      rCtx = roughCanvas.getContext('2d');
      if (rCtx) {
        rCtx.drawImage(specImg, 0, 0, w, h);
        const sImgData = rCtx.getImageData(0, 0, w, h);
        sPx = sImgData.data;
        rData = rCtx.createImageData(w, h);
      }
    }

    for (let i = 0; i < px.length; i += 4) {
      const r0 = px[i];
      const g0 = px[i + 1];
      const b0 = px[i + 2];
      const waterMask = sPx ? sPx[i] / 255 : b0 > r0 * 1.25 && b0 > g0 * 1.1 ? 1 : 0;

      if (waterMask > 0.35) {
        // Natural deep NASA abyssal navy with turquoise coastal shelf falloff
        const shallow = Math.min(1, Math.max(0, (g0 - 18) / 52));
        px[i] = Math.min(38, Math.round(6 + r0 * 0.18 + shallow * 18));
        px[i + 1] = Math.min(84, Math.round(22 + g0 * 0.38 + shallow * 42));
        px[i + 2] = Math.min(128, Math.round(48 + b0 * 0.48 + shallow * 36));
      } else {
        // Landmass clarity boost: separate snow caps, desert ochre plateaus, and emerald river plains
        const lum = (r0 * 0.299 + g0 * 0.587 + b0 * 0.114) / 255;
        if (lum > 0.72) {
          // High-altitude snow/glaciers (Himalayas / Karakoram)
          px[i] = Math.min(238, Math.round(195 + (r0 - 170) * 0.5));
          px[i + 1] = Math.min(242, Math.round(205 + (g0 - 170) * 0.5));
          px[i + 2] = Math.min(248, Math.round(215 + (b0 - 170) * 0.5));
        } else if (r0 > g0 * 1.05) {
          // Arid desert & high plateau ochre (Arabian, Iranian, Thar, Tibetan Plateau) — clamped to warm tan
          px[i] = Math.min(196, Math.round(36 + r0 * 1.16));
          px[i + 1] = Math.min(172, Math.round(28 + g0 * 1.08));
          px[i + 2] = Math.min(128, Math.round(18 + b0 * 0.92));
        } else {
          // Vegetated alluvial plains & river basins (Indus Valley, Punjab, Indo-Gangetic, Deccan)
          px[i] = Math.min(142, Math.round(22 + r0 * 1.15));
          px[i + 1] = Math.min(168, Math.round(38 + g0 * 1.38));
          px[i + 2] = Math.min(112, Math.round(18 + b0 * 1.05));
        }
      }

      if (rData) {
        // Invert specular water mask into PBR roughness (smooth water = 68, matte terrain = 185)
        const roughByte = Math.round(185 - waterMask * 117);
        rData.data[i] = roughByte;
        rData.data[i + 1] = roughByte;
        rData.data[i + 2] = roughByte;
        rData.data[i + 3] = 255;
      }
    }

    aCtx.putImageData(aData, 0, 0);

    // Trace true geographic hydrological courses of the Indus River, Punjab Tributaries, and Ganges
    const lonLatToXY = (lon: number, lat: number): [number, number] => [
      ((lon + 180) / 360) * w,
      ((90 - lat) / 180) * h,
    ];
    const drawRiverCourse = (
      coords: Array<[number, number]>,
      lineWidth: number,
      strokeStyle: string,
    ) => {
      aCtx.beginPath();
      for (let i = 0; i < coords.length; i++) {
        const [x, y] = lonLatToXY(coords[i][0], coords[i][1]);
        if (i === 0) aCtx.moveTo(x, y);
        else aCtx.lineTo(x, y);
      }
      aCtx.strokeStyle = strokeStyle;
      aCtx.lineWidth = lineWidth;
      aCtx.lineCap = 'round';
      aCtx.lineJoin = 'round';
      aCtx.stroke();
    };

    const indusCoords: Array<[number, number]> = [
      [81.2, 31.2],
      [77.6, 34.1],
      [74.6, 35.4],
      [72.8, 34.1],
      [71.4, 32.6],
      [70.9, 30.2],
      [69.7, 28.4],
      [68.9, 27.5],
      [68.1, 26.2],
      [68.3, 25.1],
      [67.5, 24.0],
    ];
    const punjabCoords: Array<[number, number]> = [
      [77.2, 32.4],
      [75.1, 32.1],
      [73.2, 31.1],
      [71.5, 29.4],
      [70.9, 29.1],
    ];
    const gangesCoords: Array<[number, number]> = [
      [78.9, 30.1],
      [79.5, 27.6],
      [81.9, 25.4],
      [85.1, 25.6],
      [88.1, 24.5],
      [89.8, 23.6],
      [90.5, 22.2],
    ];

    // 1. Wide outer flood inundation halo representing emergency river overflow corridor
    drawRiverCourse(indusCoords, 6.2, 'rgba(14, 165, 233, 0.32)');
    drawRiverCourse(punjabCoords, 4.4, 'rgba(14, 165, 233, 0.26)');

    // 2. High-contrast inner river channels
    drawRiverCourse(indusCoords, 2.2, 'rgba(56, 189, 248, 0.88)');
    drawRiverCourse(punjabCoords, 1.6, 'rgba(56, 189, 248, 0.75)');
    drawRiverCourse(gangesCoords, 1.8, 'rgba(46, 168, 196, 0.52)');

    // 3. Subtle urban population cluster pinpoints at risk from Indus floodwaters
    const citiesAtRisk: Array<[number, number, number]> = [
      [67.0, 24.86, 3.2], // Karachi
      [68.37, 25.39, 2.2], // Hyderabad
      [68.85, 27.7, 2.4], // Sukkur
      [71.47, 30.19, 2.6], // Multan
      [74.35, 31.52, 3.0], // Lahore
      [73.04, 33.68, 2.8], // Islamabad / Rawalpindi
      [71.52, 34.01, 2.2], // Peshawar
    ];
    for (const [lon, lat, radius] of citiesAtRisk) {
      const [cx, cy] = lonLatToXY(lon, lat);
      const grad = aCtx.createRadialGradient(cx, cy, 0, cx, cy, radius * 2.2);
      grad.addColorStop(0, 'rgba(251, 191, 36, 0.72)');
      grad.addColorStop(0.5, 'rgba(245, 158, 11, 0.35)');
      grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      aCtx.fillStyle = grad;
      aCtx.beginPath();
      aCtx.arc(cx, cy, radius * 2.2, 0, Math.PI * 2);
      aCtx.fill();

      aCtx.fillStyle = 'rgba(254, 243, 199, 0.9)';
      aCtx.beginPath();
      aCtx.arc(cx, cy, radius * 0.65, 0, Math.PI * 2);
      aCtx.fill();
    }

    const albedoOut = new CanvasTexture(albedoCanvas);
    albedoOut.colorSpace = SRGBColorSpace;
    albedoOut.needsUpdate = true;

    let roughnessOut: CanvasTexture | undefined;
    if (roughCanvas && rCtx && rData) {
      rCtx.putImageData(rData, 0, 0);
      roughnessOut = new CanvasTexture(roughCanvas);
      roughnessOut.needsUpdate = true;
    }

    // Window the planetary cloud layer so central South Asia (Indus/Himalayas/India) stays clear
    let cloudsOut: CanvasTexture | undefined;
    if (cloudsImg) {
      const cw = 1024;
      const ch = 512;
      const cCanvas = document.createElement('canvas');
      cCanvas.width = cw;
      cCanvas.height = ch;
      const cCtx = cCanvas.getContext('2d');
      if (cCtx) {
        cCtx.drawImage(cloudsImg, 0, 0, cw, ch);
        const cImgData = cCtx.getImageData(0, 0, cw, ch);
        const cPx = cImgData.data;

        for (let y = 0; y < ch; y++) {
          const lat = 90 - (y / ch) * 180;
          for (let x = 0; x < cw; x++) {
            const lon = (x / cw) * 360 - 180;
            // Smooth clearing window centered on South Asia (lat +21N, lon +74E)
            const dLon = (lon - 74) / 26;
            const dLat = (lat - 21) / 21;
            const distSq = dLon * dLon + dLat * dLat;
            if (distSq < 1.35) {
              const atten = Math.max(0.06, Math.min(1, Math.pow(distSq / 1.35, 1.8)));
              const idx = (y * cw + x) * 4;
              cPx[idx] = Math.round(cPx[idx] * atten);
              cPx[idx + 1] = Math.round(cPx[idx + 1] * atten);
              cPx[idx + 2] = Math.round(cPx[idx + 2] * atten);
            }
          }
        }
        cCtx.putImageData(cImgData, 0, 0);
        cloudsOut = new CanvasTexture(cCanvas);
        cloudsOut.colorSpace = SRGBColorSpace;
        cloudsOut.needsUpdate = true;
      }
    }

    return {
      albedo: albedoOut,
      roughness: roughnessOut,
      clouds: cloudsOut,
    };
  }

  private configureIwerSeatedPoseIfPresent(): void {
    if (typeof window === 'undefined') return;
    const iwer = (window as unknown as Record<string, any>).IWER_DEVICE;
    if (!iwer) return;

    // Configure desktop IWER emulator to a seated operator posture (1.25m eye height, 0.32m back)
    // without mutating world.player.position (keeping real Quest local-floor 1:1).
    if (iwer.position?.set) {
      iwer.position.set(0, 1.25, 0.34);
    }
    if (iwer.quaternion?.set) {
      // Slight -11 deg downward pitch toward the console and Earth globe
      iwer.quaternion.set(-0.0958, 0, 0, 0.9954);
    }
    if (iwer.controllers?.left?.position?.set) {
      iwer.controllers.left.position.set(-0.34, 0.84, -0.04);
    }
    if (iwer.controllers?.right?.position?.set) {
      iwer.controllers.right.position.set(0.34, 0.84, -0.04);
    }
    if (iwer.hands?.left?.position?.set) {
      iwer.hands.left.position.set(-0.30, 0.85, -0.08);
    }
    if (iwer.hands?.right?.position?.set) {
      iwer.hands.right.position.set(0.30, 0.85, -0.08);
    }
  }

  public calibrateSeatedView(): number[] {
    // Compute tracked head local position relative to player rig origin
    const camWorld = this.camera.getWorldPosition(new Vector3());
    const headLocal = camWorld.sub(this.player.position);

    // Offset player rig so resulting camera world position matches SEATED_TARGET_HEAD_WORLD
    const offsetX = Math.max(-0.8, Math.min(0.8, SEATED_TARGET_HEAD_WORLD.x - headLocal.x));
    const offsetY = Math.max(-0.65, Math.min(0.45, SEATED_TARGET_HEAD_WORLD.y - headLocal.y));
    const offsetZ = Math.max(-0.8, Math.min(0.8, SEATED_TARGET_HEAD_WORLD.z - headLocal.z));

    this.player.position.set(offsetX, offsetY, offsetZ);
    this.profile.preferences.seatOffset = [offsetX, offsetY, offsetZ];
    saveMissionProfile(this.profile);
    this.playCue('SELECT_SECTOR');
    return this.player.position.toArray();
  }

  private isAnyObjectGrabbed(): boolean {
    for (const cubeEntity of this.queries.cubes.entities) {
      if (cubeEntity.hasComponent(Grabbed)) return true;
    }
    for (const ctrlEntity of this.queries.controls.entities) {
      if (ctrlEntity.hasComponent(Grabbed)) return true;
    }
    return false;
  }

  private forceReleaseAllGrabs(): void {
    this.suppressReleaseActions = true;
    const grabSystem = this.world.getSystem(GrabSystem);
    if (grabSystem) {
      for (const cubeEntity of this.queries.cubes.entities) {
        if (cubeEntity.hasComponent(Grabbed)) {
          grabSystem.forceRelease(cubeEntity);
        }
      }
      for (const ctrlEntity of this.queries.controls.entities) {
        if (ctrlEntity.hasComponent(Grabbed)) {
          grabSystem.forceRelease(ctrlEntity);
        }
      }
    }
    const scannerObj = this.world.getSceneObject('scanner-tool');
    if (scannerObj) {
      scannerObj.position.copy(SCANNER_HOME_POSITION);
      scannerObj.rotation.set(0, 0, 0);
    }
    this.highlightDropZones(false);
    this.suppressReleaseActions = false;
  }

  private bindSpatialPanels(): void {
    this.briefingPanel = this.world.getSceneObject<UIKitMLAsset>('briefing-panel');
    this.telemetryPanel = this.world.getSceneObject<UIKitMLAsset>('telemetry-hud');
    this.debriefPanel = this.world.getSceneObject<UIKitMLAsset>('debrief-panel');

    const bindClick = (
      panel: UIKitMLAsset | undefined,
      id: string,
      handler: () => void,
    ) => {
      const el = panel?.getElementById(id);
      if (!el) return;
      el.name = id;
      el.addEventListener('click', handler);
      this.cleanupFuncs.push(() => el.removeEventListener('click', handler));
    };

    // Briefing Panel controls
    bindClick(this.briefingPanel, 'Btn_CycleSector', () => this.handleCycleSector());
    bindClick(this.briefingPanel, 'Btn_ToggleSensor', () => this.handleToggleSensor());
    bindClick(this.briefingPanel, 'Btn_ScanSector', () => this.handleScan());
    bindClick(this.briefingPanel, 'Btn_CalibrateSeat', () => {
      this.calibrateSeatedView();
    });

    // XR Enter / Exit / Calibrate buttons on Briefing Panel
    const xrButton = this.briefingPanel?.getElementById('xr-button');
    const exitButton = this.briefingPanel?.getElementById('exit-button');
    const calibrateButton = this.briefingPanel?.getElementById('Btn_CalibrateSeat');
    if (xrButton && exitButton) {
      xrButton.name = 'xr-button';
      exitButton.name = 'exit-button';
      if (!this.world.xrEnabled) {
        xrButton.setProperties({ display: 'none' });
        exitButton.setProperties({ display: 'none' });
        calibrateButton?.setProperties({ display: 'none' });
      } else {
        const launchXR = () => {
          const isArRequested = this.profile.preferences.tabletopMode && this.isArSupported;
          this.world.launchXR({
            sessionMode: isArRequested ? SessionMode.ImmersiveAR : SessionMode.ImmersiveVR,
          });
        };
        const exitXR = () => this.world.exitXR();
        xrButton.addEventListener('click', launchXR);
        exitButton.addEventListener('click', exitXR);
        this.cleanupFuncs.push(
          () => xrButton.removeEventListener('click', launchXR),
          () => exitButton.removeEventListener('click', exitXR),
          this.world.visibilityState.subscribe((visibilityState) => {
            const is2D = visibilityState === VisibilityState.NonImmersive;
            xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
            exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
            calibrateButton?.setProperties({ display: is2D ? 'none' : 'flex' });
            if (!is2D && this.world.renderer) {
              const session = (this.world.renderer.xr as any)?.getSession?.();
              const isAR = session?.mode === 'immersive-ar';
              this.world.renderer.setClearColor(0x000000, isAR ? 0 : 1);
            }
          }),
        );
      }
    }

    // Telemetry HUD controls
    bindClick(this.telemetryPanel, 'Btn_ProcessCube', () =>
      this.handleProcessSelected(),
    );
    bindClick(this.telemetryPanel, 'Btn_QueueCube', () =>
      this.handleQueueSelected(),
    );
    bindClick(this.telemetryPanel, 'Btn_DiscardCube', () =>
      this.handleDiscardSelected(),
    );
    bindClick(this.telemetryPanel, 'Btn_CycleCube', () => this.cycleEvidence());
    bindClick(this.telemetryPanel, 'Btn_Pause', () => this.togglePause());
    bindClick(this.telemetryPanel, 'Btn_Settings', () => {
      this.settingsOpen = !this.settingsOpen;
      this.telemetryPanel?.getElementById('AccessibilitySettings')?.setProperties({ display: this.settingsOpen ? 'flex' : 'none' });
    });
    const preferenceIds = { guidance: 'Guidance', dominantHand: 'DominantHand', oneHanded: 'OneHanded', gazeAssist: 'GazeAssist', tabletopMode: 'TabletopMode', largeText: 'LargeText', highContrast: 'HighContrast', reducedMotion: 'ReducedMotion', captions: 'Captions', audioLevel: 'AudioLevel' } as const;
    for (const key of Object.keys(preferenceIds) as (keyof typeof preferenceIds)[]) {
      bindClick(this.telemetryPanel, `Btn_${preferenceIds[key]}`, () => this.cyclePreference(key));
    }
    this.applyAccessibility();

    // Debrief Panel controls
    bindClick(this.debriefPanel, 'Btn_ReorderQueue', () =>
      this.handleReorderQueue(),
    );
    bindClick(this.debriefPanel, 'Btn_CommitDownlink', () =>
      this.handleCommitDownlinkButton(),
    );
    bindClick(this.debriefPanel, 'Btn_RestartMission', () =>
      this.handleRestartMission(),
    );
    bindClick(this.debriefPanel, 'Btn_NextMission', () => this.nextMission());
    bindClick(this.debriefPanel, 'Btn_DailyPass', () => this.startDailyPass());
    bindClick(this.debriefPanel, 'Btn_ReplayDecision', () => this.cycleReplay());
  }

  public rotateGlobe(deltaYaw: number, deltaPitch: number): void {
    const globe = this.world.getSceneObject('earth-globe');
    if (!globe) return;
    this.isSlerpingToSector = false;

    // Yaw around world Up, pitch around world Right
    const qYaw = new Quaternion().setFromAxisAngle(this.worldUp, deltaYaw);
    const rightAxis = new Vector3(1, 0, 0);
    const qPitch = new Quaternion().setFromAxisAngle(rightAxis, deltaPitch);

    const qDelta = new Quaternion().multiplyQuaternions(qYaw, qPitch);
    globe.quaternion.premultiply(qDelta);
    this.globeCurrentQuaternion.copy(globe.quaternion);
    this.globeAngularVelocity.set(deltaYaw, deltaPitch);
  }

  public zoomGlobe(deltaZoom: number): void {
    this.targetFocalDistance = Math.max(-0.85, Math.min(-0.38, this.targetFocalDistance - deltaZoom));
  }

  public slerpGlobeToSector(sectorId: SectorId): void {
    const globe = this.world.getSceneObject('earth-globe');
    if (!globe) return;

    const sectorDef = SECTOR_GEO_DEFINITIONS[sectorId];
    if (!sectorDef) return;

    // Center normal of the selected sector in globe-local space
    const [lat, lon] = sectorDef.centerLatLon;
    const localSectorNormal = latLonToGlobePoint(lat, lon, 1.0).normalize();

    // In world space, we want this sector normal to point directly at the player & CubeSat nadir beam
    const targetWorldDir = new Vector3(0, 0.38, 0.92).normalize();

    this.globeTargetQuaternion.setFromUnitVectors(localSectorNormal, targetWorldDir);
    this.isSlerpingToSector = true;
    this.slerpProgress = 0.0;
  }

  private handleSelectSector(sectorId: SectorId): void {
    this.applyAction({ type: 'SELECT_SECTOR', sectorId });
    this.playCue('SELECT_SECTOR');
    this.slerpGlobeToSector(sectorId);
    this.voiceCommander?.handleSectorSelection(sectorId, this.engine.getState().activeSensorMode);
    this.syncAll();
  }

  private handleCycleSector(): void {
    const current = this.engine.getState().selectedSectorId;
    const idx = SECTOR_ORDER.indexOf(current);
    const next = SECTOR_ORDER[(idx + 1) % SECTOR_ORDER.length];
    this.handleSelectSector(next);
  }

  private handleToggleSensor(): void {
    this.applyAction({ type: 'SET_SENSOR', sensorMode: this.engine.getState().activeSensorMode === 'RADAR' ? 'OPTICAL' : 'RADAR' });
    this.playCue('TOGGLE_SENSOR');
    const state = this.engine.getState();
    this.voiceCommander?.handleSectorSelection(state.selectedSectorId, state.activeSensorMode);
    this.syncAll();
  }

  private handleScan(): void {
    const mode = this.engine.getState().activeSensorMode;
    const state = this.engine.getState();
    const res = this.applyAction({ type: 'SCAN', sectorId: state.selectedSectorId, sensorMode: state.activeSensorMode });
    if (res.ok) {
      if (res.packet) this.cubeTransitions.set(res.packet.id, { kind: 'SCAN', remaining: 0.85 });
      this.scanBeamPulseTimer = 0.85;
      this.scanBeamSectorId = this.engine.getState().selectedSectorId;
      this.scanBeamMode = mode;
      this.playCue(mode === 'OPTICAL' ? 'SCAN_OPTICAL' : 'SCAN_RADAR');
      this.voiceCommander?.trigger('SCAN_ACQUIRED');

      // Immediately illuminate 3D observation swath cone
      const globe = this.world.getSceneObject('earth-globe');
      const swath = globe?.getObjectByName('OrbitalScanSwathCone');
      if (swath instanceof Mesh && swath.material instanceof MeshBasicMaterial) {
        swath.material.color.setHex(mode === 'OPTICAL' ? 0x38bdf8 : 0xf59e0b);
        swath.material.opacity = 0.58;
        swath.visible = true;
      }
    } else {
      this.playCue('ERROR_REJECT');
    }
    this.syncAll();
  }

  private handleProcessSelected(): void {
    const res = this.applyAction({ type: 'PROCESS', packetId: this.engine.getState().selectedPacketId });
    if (res.ok) {
      if (res.packet) this.cubeTransitions.set(res.packet.id, { kind: 'PROCESS', remaining: 0.65 });
      this.cradlePulseTimer = 0.65;
      this.playCue('PROCESS_SUCCESS');
      this.audio.playCompressionChirp();
      this.voiceCommander?.trigger('PROCESS_SUCCESS');
    } else {
      this.playCue('ERROR_REJECT');
    }
    this.syncAll();
  }

  private handleQueueSelected(preferredSlotIndex?: number): void {
    const state = this.engine.getState();
    const pkt = state.packets.find((p) => p.id === state.selectedPacketId);
    if (pkt?.queued && typeof preferredSlotIndex !== 'number') {
      const res = this.applyAction({ type: 'UNQUEUE', packetId: pkt.id });
      this.playCue(res.ok ? 'QUEUE_SLOT' : 'ERROR_REJECT');
    } else {
      const res = this.applyAction({
        type: 'QUEUE',
        packetId: this.engine.getState().selectedPacketId,
        slotIndex: preferredSlotIndex,
      });
      this.playCue(res.ok ? 'QUEUE_SLOT' : 'ERROR_REJECT');
      const nextState = this.engine.getState();
      if (nextState.downlinkCommittedSec > nextState.downlinkWindowSec + 0.01) {
        this.voiceCommander?.trigger('QUEUE_OVERFLOW');
      }
    }
    this.syncAll();
  }

  private handleReorderQueue(): void {
    const state = this.engine.getState();
    if (state.queuePacketIds.length < 2) {
      this.playCue('ERROR_REJECT');
      return;
    }
    if (
      state.selectedPacketId &&
      state.queuePacketIds.includes(state.selectedPacketId) &&
      state.queuePacketIds[0] !== state.selectedPacketId
    ) {
      const index = state.queuePacketIds.indexOf(state.selectedPacketId);
      const order = [...state.queuePacketIds];
      if (index > 0) [order[index - 1], order[index]] = [order[index], order[index - 1]];
      const res = this.applyAction({ type: 'REORDER', packetIds: order });
      this.playCue(res.ok ? 'QUEUE_SLOT' : 'ERROR_REJECT');
    } else {
      const rotated = [...state.queuePacketIds.slice(1), state.queuePacketIds[0]];
      const res = this.applyAction({ type: 'REORDER', packetIds: rotated });
      this.playCue(res.ok ? 'QUEUE_SLOT' : 'ERROR_REJECT');
    }
    this.syncAll();
  }

  private handleDiscardSelected(): void {
    if (this.isAnyObjectGrabbed()) {
      this.playCue('ERROR_REJECT');
      return;
    }
    const res = this.applyAction({ type: 'DISCARD', packetId: this.engine.getState().selectedPacketId });
    this.playCue(res.ok ? 'DISCARD_CUBE' : 'ERROR_REJECT');
    this.syncAll();
  }

  private handleStartDownlink(): boolean {
    this.lastTransmittedCount = 0;
    this.downlinkUiSyncAccumulator = 0;
    const res = this.applyAction({ type: 'COMMIT' });
    if (res.ok) {
      this.forceReleaseAllGrabs();
      this.cubeTransitions.clear();
      this.lastDownlinkTickSecond = -1;
      this.playCue('SOLENOID_LATCH');
      this.playCue('DOWNLINK_COMMIT');
      this.voiceCommander?.trigger('DOWNLINK_TRANSMIT');

      // Immediately activate live S-Band microwave uplink beam
      const consoleObj = this.world.getSceneObject('orbital-console');
      const uplinkBeam = consoleObj?.getObjectByName('DownlinkUplinkBeam');
      if (
        uplinkBeam instanceof Mesh &&
        uplinkBeam.material instanceof MeshBasicMaterial
      ) {
        uplinkBeam.material.opacity = 0.58;
        uplinkBeam.visible = true;
      }
    } else {
      this.playCue('ERROR_REJECT');
    }
    this.syncAll();
    return res.ok;
  }

  private handleCommitDownlinkButton(): void {
    const phase = this.engine.getState().phase;
    if (phase === 'OPERATIONS') {
      this.handleStartDownlink();
    } else if (phase === 'DEBRIEF') {
      this.handleRestartMission();
    }
  }

  private handleRestartMission(): void {
    this.forceReleaseAllGrabs();
    this.lastTransmittedCount = 0;
    this.lastDownlinkTickSecond = -1;
    this.downlinkUiSyncAccumulator = 0;
    this.scanBeamPulseTimer = 0;
    this.cradlePulseTimer = 0;
    const globe = this.world.getSceneObject('earth-globe');
    const swath = globe?.getObjectByName('OrbitalScanSwathCone');
    if (swath) swath.visible = false;
    const downlinkLaserGroup = globe?.getObjectByName('DownlinkLaserBeamGroup');
    if (downlinkLaserGroup) downlinkLaserGroup.visible = false;
    const karachiTerminal = globe?.getObjectByName('KarachiGroundStation');
    const shockwave = karachiTerminal?.getObjectByName('KarachiDishShockwave');
    if (shockwave) shockwave.visible = false;
    const consoleObj = this.world.getSceneObject('orbital-console');
    const uplinkBeam = consoleObj?.getObjectByName('DownlinkUplinkBeam');
    if (uplinkBeam) uplinkBeam.visible = false;
    this.reviewState = undefined;
    this.recordedDebrief = false;
    this.replayIndex = -1;
    if (this.debriefPanel) this.setText(this.debriefPanel, 'ReplayTimeline', 'DECISION REPLAY AVAILABLE AFTER DOWNLINK');
    this.missionElapsedTime = 0;
    this.earnedMedals = [];
    this.cubeTransitions.clear();
    this.solverSignature = '';
    this.engine.reset();
    this.playCue('MISSION_RESET');
    this.voiceCommander?.trigger('PASS_START');
    this.syncAll();
  }

  private applyAction(action: MissionAction): ActionResult {
    const result = this.engine.dispatch(action, this.missionElapsedTime);
    return 'ok' in result ? result : {
      ok: result.lastActionOk, code: result.lastActionOk ? 'OK' : 'INVALID_PHASE',
      message: result.lastStatusMessage,
    };
  }

  private playCue(cue: OrbitalSoundCue): void {
    this.audio.playCue(cue);
    const captions: Partial<Record<OrbitalSoundCue, string>> = {
      SCAN_OPTICAL: 'OPTICAL APERTURE: Visible-band reflectance frame acquired.',
      SCAN_RADAR: 'SAR BACKSCATTER: Active microwave return acquired through cloud layer.',
      PROCESS_SUCCESS: 'PROCESSING COMPLETE: Onboard feature vectorization compressed packet to 1 STR.',
      DOWNLINK_COMMIT: 'CARRIER ACQUIRED: S-Band phased array live downlink active.',
      PACKET_RECEIVED: 'GROUND ACKNOWLEDGEMENT: Evidence telemetry verified at regional depot.',
      LINK_CUTOFF: 'LOSS OF SIGNAL: Orbital horizon cutoff reached.',
      OPTIMAL_VICTORY: 'MISSION SUCCESS: Optimal disaster triage evidence delivered to ground teams.',
      ERROR_REJECT: this.engine.getState().lastStatusMessage,
      MISSION_RESET: 'SYSTEM RESET: Orbital pass re-initialized. Ready for observation sequence.',
      SCENARIO_CYCLE: 'ORBITAL PARAMETERS UPDATED: Loading next tactical pass scenario.',
    };
    if (captions[cue]) this.caption = captions[cue]!;
  }

  private getSolution(state: MissionState): MissionSolution {
    const signature = `${state.scenarioId}:${state.power}:${state.packets.map((p) => `${p.id}/${p.processed}`).join(',')}`;
    if (signature !== this.solverSignature || !this.cachedSolution) {
      this.solverSignature = signature;
      this.cachedSolution = solveMission(state);
    }
    return this.cachedSolution;
  }

  private togglePause(): void {
    const state = this.engine.getState();
    if (state.phase === 'DEBRIEF') return;
    this.applyAction({ type: state.paused ? 'RESUME' : 'PAUSE' });
    if (!state.paused) this.forceReleaseAllGrabs();
    this.syncAll();
  }

  private cyclePreference(key: keyof MissionPreferences): void {
    const preferences = this.profile.preferences;
    if (key === 'guidance') {
      const modes = ['GUIDED', 'STANDARD', 'EXPERT'] as const;
      preferences.guidance = modes[(modes.indexOf(preferences.guidance) + 1) % modes.length];
    } else if (key === 'dominantHand') {
      preferences.dominantHand = preferences.dominantHand === 'LEFT' ? 'RIGHT' : 'LEFT';
    } else if (key === 'audioLevel') preferences.audioLevel = preferences.audioLevel > 0.7 ? 0 : preferences.audioLevel === 0 ? 0.4 : preferences.audioLevel < 0.5 ? 0.65 : 1;
    else if (key !== 'seatOffset') preferences[key] = !preferences[key];
    this.audio.setVolume(preferences.audioLevel);
    saveMissionProfile(this.profile);
    this.applyAccessibility();
    this.syncAll();
  }

  private applyAccessibility(): void {
    const preferences = this.profile.preferences;
    for (const panel of [this.briefingPanel, this.telemetryPanel, this.debriefPanel]) {
      if (!panel) continue;
      panel.traverse((object) => {
        if (object instanceof UIKit.Text) {
          let size = this.panelFontSizes.get(object);
          if (size === undefined) {
            const measured = object.properties.value.fontSize;
            size = typeof measured === 'number' ? measured : 13;
            this.panelFontSizes.set(object, size);
          }
          object.setProperties({ fontSize: preferences.largeText ? Math.max(15, size * 1.14) : size, color: preferences.highContrast ? '#ffffff' : '#e2e8f0' });
        }
      });
    }
    const scanner = this.world.getSceneObject('scanner-tool');
    SCANNER_HOME_POSITION.x = preferences.dominantHand === 'LEFT' ? -0.48 : 0.12;
    const holster = this.world.getSceneObject('orbital-console')?.getObjectByName('ScannerHolster');
    if (holster) holster.position.x = SCANNER_HOME_POSITION.x;
    if (scanner && !this.isAnyObjectGrabbed()) scanner.position.copy(SCANNER_HOME_POSITION);
    this.applyTabletopMode();
  }

  public applyTabletopMode(): void {
    const isTabletop = this.profile.preferences.tabletopMode;
    const consoleObj = this.world.getSceneObject('orbital-console');
    if (consoleObj) {
      const cabinEnclosure = consoleObj.getObjectByName('CockpitEnclosureShell');
      if (cabinEnclosure) cabinEnclosure.visible = !isTabletop;
      const cosmicDome = consoleObj.getObjectByName('MilkyWayCosmicDome');
      if (cosmicDome) cosmicDome.visible = !isTabletop;
    }

    if (this.briefingPanel) {
      if (isTabletop) {
        this.briefingPanel.position.set(-0.92, 1.25, -1.36);
        this.briefingPanel.rotation.set(0, (32 * Math.PI) / 180, 0);
        this.briefingPanel.scale.setScalar(0.118);
      } else {
        this.briefingPanel.position.set(-0.74, 1.16, -1.04);
        this.briefingPanel.rotation.set(0, (26 * Math.PI) / 180, 0);
        this.briefingPanel.scale.setScalar(0.098);
      }
    }
    if (this.telemetryPanel) {
      if (isTabletop) {
        this.telemetryPanel.position.set(0, 1.78, -1.48);
        this.telemetryPanel.rotation.set((14 * Math.PI) / 180, 0, 0);
        this.telemetryPanel.scale.setScalar(0.122);
      } else {
        this.telemetryPanel.position.set(0, 1.67, -1.16);
        this.telemetryPanel.rotation.set((16 * Math.PI) / 180, 0, 0);
        this.telemetryPanel.scale.setScalar(0.100);
      }
    }
    if (this.debriefPanel) {
      if (isTabletop) {
        this.debriefPanel.position.set(0.92, 1.25, -1.36);
        this.debriefPanel.rotation.set(0, (-32 * Math.PI) / 180, 0);
        this.debriefPanel.scale.setScalar(0.118);
      } else {
        this.debriefPanel.position.set(0.74, 1.16, -1.04);
        this.debriefPanel.rotation.set(0, (-26 * Math.PI) / 180, 0);
        this.debriefPanel.scale.setScalar(0.098);
      }
    }
  }

  public setCameraPreset(preset: 'HERO' | 'GLOBE' | 'CUBES' | 'CRADLE' | 'DOWNLINK' | 'DEBRIEF'): void {
    if (this.world.renderer.xr.isPresenting) return;
    const presets: Record<string, { pos: [number, number, number]; target: [number, number, number]; fov: number }> = {
      HERO: { pos: [0, 1.25, 0.34], target: [0, 1.04, -0.82], fov: 64 },
      GLOBE: { pos: [0, 1.12, -0.22], target: [0, 0.99, -0.58], fov: 55 },
      CUBES: { pos: [-0.37, 0.98, -0.18], target: [-0.37, 0.79, -0.43], fov: 50 },
      CRADLE: { pos: [0.24, 0.96, -0.28], target: [0.24, 0.79, -0.55], fov: 50 },
      DOWNLINK: { pos: [0.39, 0.96, -0.22], target: [0.39, 0.79, -0.46], fov: 50 },
      DEBRIEF: { pos: [0.35, 1.25, 0.15], target: [0.74, 1.16, -1.04], fov: 60 },
    };
    const cfg = presets[preset] ?? presets.HERO;
    this.camera.position.set(...cfg.pos);
    this.camera.lookAt(...cfg.target);
    if ('fov' in this.camera) {
      (this.camera as any).fov = cfg.fov;
      (this.camera as any).updateProjectionMatrix?.();
    }
    this.camera.updateMatrixWorld(true);
  }

  private cycleEvidence(): void {
    const state = this.engine.getState();
    if (!state.packets.length) return;
    const index = state.packets.findIndex((packet) => packet.id === state.selectedPacketId);
    this.applyAction({ type: 'SELECT_PACKET', packetId: state.packets[(index + 1) % state.packets.length].id });
    this.syncAll();
  }

  private nextMission(): void {
    if (this.engine.getState().phase === 'DOWNLINK') return;
    this.forceReleaseAllGrabs();
    this.dailyDate = null;
    this.engine.cycleScenario();
    this.handleRestartMission();
  }

  private startDailyPass(): void {
    if (this.engine.getState().phase === 'DOWNLINK') return;
    this.forceReleaseAllGrabs();
    this.dailyDate = new Date().toISOString().slice(0, 10);
    this.engine.setScenario(getDailyPass(this.dailyDate));
    this.handleRestartMission();
  }

  private cycleReplay(): void {
    const state = this.engine.getState();
    if (!state.debrief || !this.debriefPanel) return;
    const journal = this.engine.getJournal();
    const decisions = journal.filter((entry) => !['SELECT_SECTOR', 'SET_SENSOR', 'SELECT_PACKET', 'TICK', 'PAUSE', 'RESUME'].includes(entry.action.type));
    if (!decisions.length) return;
    this.replayIndex = (this.replayIndex + 1) % (decisions.length + 1);
    if (this.replayIndex === decisions.length) {
      this.reviewState = undefined;
      this.syncAll();
      this.setText(this.debriefPanel, 'ReplayTimeline', 'REPLAY COMPLETE - original mission result restored.');
      return;
    }
    const entry = decisions[this.replayIndex];
    this.reviewState = replayMission(state.scenarioId, journal.slice(0, entry.sequence + 1)).getState();
    this.syncCubeTransforms(this.reviewState.packets, this.reviewState);
    const action = entry.action;
    const detail = action.type === 'SCAN' ? `SEC-${action.sectorId} / ${action.sensorMode}` : 'packetId' in action ? action.packetId ?? '' : '';
    const achievable = this.reviewState.phase === 'OPERATIONS' ? solveMission(this.reviewState).score : state.debrief.totalScore;
    this.setText(this.debriefPanel, 'ReplayTimeline', `DECISION ${this.replayIndex + 1}/${decisions.length} | ${entry.elapsedSec.toFixed(1)}s: ${action.type} ${detail}\n${entry.ok ? '[OK]' : '[X]'} | ${this.reviewState.power} POWER | ${this.reviewState.storageUsed} STORAGE | SCORE STILL REACHABLE ${achievable}/100`);
  }

  private syncSettings(): void {
    if (!this.telemetryPanel) return;
    const p = this.profile.preferences;
    const labels: Record<string, string> = {
      Lbl_Pause: this.engine.getState().paused ? 'RESUME PASS' : 'PAUSE PASS',
      Lbl_Guidance: `GUIDANCE: ${p.guidance}`,
      Lbl_DominantHand: `SCANNER HAND: ${p.dominantHand}`,
      Lbl_OneHanded: `ONE-HAND ASSIST: ${p.oneHanded ? 'ON' : 'OFF'}`,
      Lbl_LargeText: `LARGE TEXT: ${p.largeText ? 'ON' : 'OFF'}`,
      Lbl_HighContrast: `HIGH CONTRAST: ${p.highContrast ? 'ON' : 'OFF'}`,
      Lbl_ReducedMotion: `REDUCED MOTION: ${p.reducedMotion ? 'ON' : 'OFF'}`,
      Lbl_Captions: `CAPTIONS: ${p.captions ? 'ON' : 'OFF'}`,
      Lbl_AudioLevel: `AUDIO: ${Math.round(p.audioLevel * 100)}%`,
      Lbl_GazeAssist: `HEAD POINT ASSIST: ${p.gazeAssist ? 'ON' : 'OFF'}`,
      Lbl_TabletopMode: `MR TABLETOP: ${
        p.tabletopMode
          ? this.isArSupported
            ? 'ON (PASSTHROUGH)'
            : 'ON (CUPOLA VR)'
          : 'OFF'
      }`,
    };
    for (const [id, text] of Object.entries(labels)) this.setText(this.telemetryPanel, id, text);
    this.setText(this.telemetryPanel, 'AudioCaption', p.captions ? this.caption || 'GROUND CONTROL: one pass, three requests, one final downlink.' : '');
    if (this.debriefPanel) {
      const mastery = this.profile.mastery[this.engine.getState().scenarioId];
      this.setText(this.debriefPanel, 'MasteryReadout', mastery
        ? `PERSONAL BEST: ${mastery.bestScore}/100 | ${mastery.bestGrade}-RANK | ${mastery.bestMarginSec.toFixed(1)}s MARGIN | ${mastery.attempts} PASSES`
        : `PROVEN OBJECTIVE: ${getMissionBenchmark(this.engine.getState().scenarioId).score}/100 | COMPLETE THIS PASS TO EARN MASTERY`);
      this.setText(this.debriefPanel, 'MedalsReadout', this.earnedMedals.length ? this.earnedMedals.join(' | ') : 'GROUND TRUTH / POWER DISCIPLINE / LINK PRECISION');
    }
  }

  private handleControlAction(action: string): void {
    const padMap: Record<string, string> = {
      SCAN: 'pad-fire-swath',
      TOGGLE_SENSOR: 'pad-toggle-sensor',
      PROCESS: 'pad-process-cradle',
      QUEUE: 'pad-queue-downlink',
      COMMIT_DOWNLINK: 'pad-commit-downlink',
      DISCARD: 'pad-discard-chute',
    };
    const targetPadId = padMap[action];
    if (targetPadId) {
      this.padPressTimers.set(targetPadId, 0.18);
      this.audio.playMechanicalSwitchClick(true);
    }

    switch (action) {
      case 'PAUSE': this.togglePause(); break;
      case 'NEXT_MISSION': this.nextMission(); break;
      case 'DAILY_PASS': this.startDailyPass(); break;
      case 'CYCLE_CUBE': this.cycleEvidence(); break;
      case 'REPLAY': this.cycleReplay(); break;
      case 'SCAN':
        this.handleScan();
        break;
      case 'TOGGLE_SENSOR':
        this.handleToggleSensor();
        break;
      case 'PROCESS':
        this.handleProcessSelected();
        break;
      case 'QUEUE':
        this.handleQueueSelected();
        break;
      case 'DISCARD':
        this.handleDiscardSelected();
        break;
      case 'COMMIT_DOWNLINK':
        this.handleCommitDownlinkButton();
        break;
    }
  }

  private handleTrigger3DNodeById(nodeId: string): boolean {
    const obj = this.world.getSceneObject(nodeId);
    if (!obj) return false;

    for (const sectorEntity of this.queries.sectors.entities) {
      if (sectorEntity.object3D === obj) {
        const sectorId = (sectorEntity.getValue(OrbitSectorNode, 'sectorId') ||
          'B') as SectorId;
        this.handleSelectSector(sectorId);
        return true;
      }
    }

    for (const ctrlEntity of this.queries.controls.entities) {
      if (ctrlEntity.object3D === obj) {
        const action = ctrlEntity.getValue(ConsoleControlNode, 'action') || 'SCAN';
        this.handleControlAction(action);
        return true;
      }
    }

    for (const cubeEntity of this.queries.cubes.entities) {
      if (cubeEntity.object3D === obj) {
        const slotIndex = cubeEntity.getValue(EvidenceCubeNode, 'slotIndex') ?? 0;
        const pkt = this.engine.getState().packets[slotIndex];
        if (pkt) {
          this.applyAction({ type: 'SELECT_PACKET', packetId: pkt.id });
          this.playCue('SELECT_SECTOR');
          this.syncAll();
          return true;
        }
      }
    }

    return false;
  }

  private handleSimulateCubeDrop(
    slotIndex: number,
    targetZone: 'PROCESS' | 'QUEUE' | 'RAW_TRAY' | 'DISCARD' | 'INVALID',
  ): boolean {
    const cubeEntity = Array.from(this.queries.cubes.entities).find(
      (e) => (e.getValue(EvidenceCubeNode, 'slotIndex') ?? -1) === slotIndex,
    );
    if (!cubeEntity?.object3D) return false;

    const targetPos =
      targetZone === 'PROCESS'
        ? PROCESS_CRADLE_WORLD
        : targetZone === 'QUEUE'
          ? DOWNLINK_BAY_CENTER_WORLD
          : targetZone === 'RAW_TRAY'
            ? RAW_TRAY_CENTER_WORLD
            : targetZone === 'DISCARD'
              ? DISCARD_CHUTE_WORLD
              : new Vector3(0, 1.15, -0.2);

    cubeEntity.object3D.position.copy(targetPos);
    cubeEntity.object3D.updateMatrixWorld(true);
    this.handleCubeReleased(cubeEntity);
    return true;
  }

  private handleScannerToolReleased(entity: Entity): void {
    if (this.suppressReleaseActions || this.engine.getState().phase !== 'OPERATIONS' || this.engine.getState().paused) return;
    const obj = entity.object3D;
    if (!obj) return;

    obj.updateWorldMatrix(true, false);
    this.tempVec.setFromMatrixPosition(obj.matrixWorld);

    let closestSector: SectorId | null = null;
    let bestDist = 0.28;
    for (const sectorEntity of this.queries.sectors.entities) {
      const sObj = sectorEntity.object3D;
      if (!sObj) continue;
      sObj.updateWorldMatrix(true, false);
      const pos = new Vector3().setFromMatrixPosition(sObj.matrixWorld);
      const dist = this.tempVec.distanceTo(pos);
      if (dist < bestDist) {
        bestDist = dist;
        closestSector = (sectorEntity.getValue(OrbitSectorNode, 'sectorId') ||
          'B') as SectorId;
      }
    }

    if (closestSector) {
      this.applyAction({ type: 'SELECT_SECTOR', sectorId: closestSector });
      this.handleScan();
    } else if (this.tempVec.distanceTo(GLOBE_CENTER_WORLD) < 0.34) {
      this.handleScan();
    }

    obj.position.copy(SCANNER_HOME_POSITION);
    obj.rotation.set(0, 0, 0);
  }

  private handleCubeReleased(entity: Entity): void {
    if (this.suppressReleaseActions || this.engine.getState().phase !== 'OPERATIONS' || this.engine.getState().paused) return;
    const obj = entity.object3D;
    if (!obj) return;

    const slotIndex = entity.getValue(EvidenceCubeNode, 'slotIndex') ?? 0;
    const state = this.engine.getState();
    const pkt = state.packets[slotIndex];
    if (!pkt) {
      this.syncCubeTransforms(state.packets);
      return;
    }

    this.applyAction({ type: 'SELECT_PACKET', packetId: pkt.id });
    obj.updateWorldMatrix(true, false);
    this.tempVec.setFromMatrixPosition(obj.matrixWorld);

    const distProcess = this.tempVec.distanceTo(PROCESS_CRADLE_WORLD);
    const distDiscard = this.tempVec.distanceTo(DISCARD_CHUTE_WORLD);
    const distDownlinkCenter = this.tempVec.distanceTo(DOWNLINK_BAY_CENTER_WORLD);
    const distRawTray = this.tempVec.distanceTo(RAW_TRAY_CENTER_WORLD);

    let closestSlotIdx = -1;
    let bestSlotDist = 0.22;
    for (let s = 0; s < DOWNLINK_BAY_POSITIONS.length; s++) {
      const [bx, by, bz] = DOWNLINK_BAY_POSITIONS[s];
      const slotPos = new Vector3(bx, by, bz);
      const d = this.tempVec.distanceTo(slotPos);
      if (d < bestSlotDist) {
        bestSlotDist = d;
        closestSlotIdx = s;
      }
    }
    const downlinkDist = Math.min(distDownlinkCenter, bestSlotDist);

    // Determine the closest magnetic destination station among valid capture envelopes
    let closestTarget: 'DISCARD' | 'PROCESS' | 'DOWNLINK' | 'RAW_TRAY' | 'NONE' = 'NONE';
    let minDistance = this.profile.preferences.oneHanded ? 0.24 : 0.20;
    const assistance = this.profile.preferences.oneHanded ? 1.3 : 1;

    if (distDiscard < 0.15 * assistance && distDiscard < minDistance) {
      closestTarget = 'DISCARD';
      minDistance = distDiscard;
    }
    if (distProcess < 0.15 * assistance && distProcess < minDistance) {
      closestTarget = 'PROCESS';
      minDistance = distProcess;
    }
    if (downlinkDist < 0.18 * assistance && downlinkDist < minDistance) {
      closestTarget = 'DOWNLINK';
      minDistance = downlinkDist;
    }
    if (distRawTray < 0.22 * assistance && distRawTray < minDistance) {
      closestTarget = 'RAW_TRAY';
      minDistance = distRawTray;
    }

    if (closestTarget === 'DISCARD') {
      this.playCue('CUBE_DOCK');
      this.handleDiscardSelected();
      return;
    }
    if (closestTarget === 'PROCESS') {
      this.playCue('CUBE_DOCK');
      this.handleProcessSelected();
      return;
    }
    if (closestTarget === 'DOWNLINK') {
      this.playCue('CUBE_DOCK');
      if (!pkt.queued) {
        const res = this.applyAction({ type: 'QUEUE', packetId: pkt.id, slotIndex: closestSlotIdx >= 0 ? closestSlotIdx : undefined });
        this.playCue(res.ok ? 'QUEUE_SLOT' : 'ERROR_REJECT');
      } else if (closestSlotIdx >= 0 && pkt.queueIndex !== closestSlotIdx) {
        // Reorder into specific target slot
        const res = this.applyAction({ type: 'QUEUE', packetId: pkt.id, slotIndex: closestSlotIdx });
        this.playCue(res.ok ? 'QUEUE_SLOT' : 'ERROR_REJECT');
      }
      this.syncAll();
      return;
    }
    if (closestTarget === 'RAW_TRAY') {
      this.playCue('CUBE_DOCK');
      if (pkt.queued) {
        const res = this.applyAction({ type: 'UNQUEUE', packetId: pkt.id });
        this.playCue(res.ok ? 'QUEUE_SLOT' : 'ERROR_REJECT');
      }
      this.syncAll();
      return;
    }

    // Automatic drop recovery: return cube to its assigned tray or downlink bay slot
    this.syncAll();
  }

  private highlightDropZones(active: boolean): void {
    const processPad = this.world.getSceneObject('pad-process-cradle');
    const queuePad = this.world.getSceneObject('pad-queue-downlink');
    const discardPad = this.world.getSceneObject('pad-discard-chute');

    if (processPad) {
      this.setObjectTint(processPad, 0xf59e0b, active ? 1.45 : 0.85);
    }
    if (queuePad) {
      this.setObjectTint(queuePad, 0x38bdf8, active ? 1.45 : 0.85);
    }
    if (discardPad) {
      this.setObjectTint(discardPad, 0xef4444, active ? 1.45 : 0.85);
    }

    const consoleObj = this.world.getSceneObject('orbital-console');
    if (consoleObj) {
      const cradleHalo = consoleObj.getObjectByName('CradleDropHalo');
      const queueHalo = consoleObj.getObjectByName('QueueDropHalo');
      const discardHalo = consoleObj.getObjectByName('DiscardDropHalo');

      const scale = active ? 1.18 : 1.0;
      const opacity = active ? 0.75 : 0.0;

      if (
        cradleHalo instanceof Mesh &&
        cradleHalo.material instanceof MeshBasicMaterial
      ) {
        cradleHalo.visible = active;
        cradleHalo.material.opacity = opacity;
        cradleHalo.scale.set(scale, scale, scale);
      }
      if (
        queueHalo instanceof Mesh &&
        queueHalo.material instanceof MeshBasicMaterial
      ) {
        queueHalo.visible = active;
        queueHalo.material.opacity = opacity;
        queueHalo.scale.set(1.68 * scale, 0.65 * scale, 1);
      }
      if (
        discardHalo instanceof Mesh &&
        discardHalo.material instanceof MeshBasicMaterial
      ) {
        discardHalo.visible = active;
        discardHalo.material.opacity = opacity;
        discardHalo.scale.set(scale, scale, scale);
      }
    }
  }

  private syncAll(): void {
    const state = this.engine.getState();
    const globe = this.world.getSceneObject('earth-globe');

    // 1. Update 3D Sector Beacons & Surface-Conforming Spherical Sector Polygons on the Globe
    for (const sectorEntity of this.queries.sectors.entities) {
      const sectorId = (sectorEntity.getValue(OrbitSectorNode, 'sectorId') ||
        'B') as SectorId;
      const isSelected = sectorId === state.selectedSectorId;
      const isGazed = sectorId === this.gazeSectorId;
      const sectorCfg = getScenarioSector(state.scenarioId, sectorId);
      const obj = sectorEntity.object3D;
      if (!obj) continue;

      const scannedPkt = state.packets.find((p) => p.sectorId === sectorId);
      const isScanned = scannedPkt !== undefined;
      const scale = isSelected ? 1.35 : isGazed ? 1.18 : isScanned ? 1.12 : 1.0;
      obj.scale.set(scale, scale, scale);

      let hex = 0x38bdf8;
      if (isScanned) {
        if (scannedPkt.confidence === 'CONFIRMED') {
          hex = scannedPkt.headline.toLowerCase().includes('inundation') ||
                scannedPkt.headline.toLowerCase().includes('breach') ||
                scannedPkt.headline.toLowerCase().includes('washed')
            ? 0x0284c7 // Deep sapphire for confirmed floodwater
            : 0x10b981; // Emerald for confirmed intact/clear crossing
        } else if (scannedPkt.confidence === 'PROBABLE') {
          hex = 0xf59e0b; // Amber for structural glare / mountain layover ambiguity
        } else {
          hex = 0xef4444; // Crimson for cloud-obscured / unverified failure
        }
      } else {
        hex = isSelected
          ? 0x10b981
          : isGazed
            ? 0x67e8f9
            : sectorCfg.cloudCover === 'DENSE_STORM'
              ? 0xf59e0b
              : 0x38bdf8;
      }
      this.setObjectTint(obj, hex, isSelected ? 1.45 : isGazed ? 1.25 : isScanned ? 1.15 : 0.85);

      if (globe) {
        const polyRibbon = globe.getObjectByName(`SectorPoly_${sectorId}`);
        if (
          polyRibbon instanceof Mesh &&
          polyRibbon.material instanceof MeshStandardMaterial
        ) {
          polyRibbon.material.color.setHex(hex);
          polyRibbon.material.emissive.setHex(hex);
          polyRibbon.material.emissiveIntensity = isSelected ? 1.75 : isScanned ? 1.35 : 0.92;
          polyRibbon.material.opacity = isSelected ? 1.0 : isScanned ? 0.95 : 0.82;
        }
        const polyFill = globe.getObjectByName(`SectorFill_${sectorId}`);
        if (
          polyFill instanceof Mesh &&
          polyFill.material instanceof MeshBasicMaterial
        ) {
          polyFill.material.color.setHex(hex);
          polyFill.material.opacity = isSelected
            ? 0.28
            : isScanned
              ? 0.22
              : sectorCfg.cloudCover === 'DENSE_STORM'
                ? 0.08
                : 0.035;
        }
        const stormCap = globe.getObjectByName(`SectorStormCap_${sectorId}`);
        if (
          stormCap instanceof Mesh &&
          stormCap.material instanceof MeshStandardMaterial
        ) {
          stormCap.visible = sectorCfg.cloudCover === 'DENSE_STORM';
          if (isScanned) {
            if (scannedPkt.sensorMode === 'RADAR') {
              // Microwave radar penetrated the storm wall: cloud becomes semi-transparent
              stormCap.material.opacity = 0.24;
              stormCap.material.emissive.setHex(0x38bdf8);
              stormCap.material.emissiveIntensity = 0.55;
            } else {
              // Optical failed against cloud deck: high-albedo cloud reflection glare
              stormCap.material.opacity = 0.92;
              stormCap.material.color.setHex(0xe2e8f0);
              stormCap.material.emissive.setHex(0xef4444);
              stormCap.material.emissiveIntensity = 0.45;
            }
          } else {
            stormCap.material.opacity = isSelected ? 0.82 : 0.68;
            stormCap.material.emissive.setHex(0x000000);
            stormCap.material.emissiveIntensity = 0.0;
          }
        }
      }
    }

    // 2. Update Scanner Tool & 3U CubeSat payload aperture colors for active sensor mode
    const scannerObj = this.world.getSceneObject('scanner-tool');
    if (scannerObj) {
      const sensorHex = state.activeSensorMode === 'OPTICAL' ? 0x38bdf8 : 0xf59e0b;
      this.setObjectTint(scannerObj, sensorHex, 0.95);
    }

    const cubesat = this.world.getSceneObject('cubesat-spacecraft');
    if (cubesat) {
      const opticalRing = cubesat.getObjectByName('CubeSatOpticalApertureRing');
      if (
        opticalRing instanceof Mesh &&
        opticalRing.material instanceof MeshStandardMaterial
      ) {
        opticalRing.material.emissiveIntensity =
          state.activeSensorMode === 'OPTICAL' ? 2.4 : 0.25;
      }
      const sarFeed = cubesat.getObjectByName('CubeSatSarFeedStrip');
      if (
        sarFeed instanceof Mesh &&
        sarFeed.material instanceof MeshStandardMaterial
      ) {
        sarFeed.material.emissiveIntensity =
          state.activeSensorMode === 'RADAR' ? 2.4 : 0.25;
      }
    }

    // 2b. Update Processing Cradle resting state if not animating
    const consoleObj = this.world.getSceneObject('orbital-console');
    if (consoleObj && this.cradlePulseTimer <= 0) {
      const clampLeft = consoleObj.getObjectByName('CradleClampLeft');
      const clampRight = consoleObj.getObjectByName('CradleClampRight');
      const cradleCore = consoleObj.getObjectByName('ProcessingCradleCore');
      if (clampLeft) clampLeft.position.x = -0.048;
      if (clampRight) clampRight.position.x = 0.048;
      if (
        cradleCore instanceof Mesh &&
        cradleCore.material instanceof MeshStandardMaterial
      ) {
        cradleCore.material.emissive.setHex(0xb45309);
        cradleCore.material.emissiveIntensity = 0.95;
      }
    }

    // 2c. Update Downlink Bay Slot Waveguides (EMPTY, QUEUED_FITS, QUEUED_OVERFLOW, TRANSMITTED)
    if (consoleObj) {
      const schedule = getQueueSchedule(state);
      for (let i = 0; i < 3; i++) {
        const waveguide = consoleObj.getObjectByName(`DownlinkSlotWaveguide_${i + 1}`);
        if (
          waveguide instanceof Mesh &&
          waveguide.material instanceof MeshStandardMaterial
        ) {
          const slot = schedule[i];
          const pktId = slot?.packetId;
          if (!pktId) {
            // EMPTY slot
            waveguide.material.color.setHex(0x334155);
            waveguide.material.emissive.setHex(0x0f172a);
            waveguide.material.emissiveIntensity = 0.2;
          } else {
            const queuedPkt = state.packets.find((p) => p.id === pktId);
            if (queuedPkt?.transmitted) {
              // TRANSMITTED
              waveguide.material.color.setHex(0x38bdf8);
              waveguide.material.emissive.setHex(0x0284c7);
              waveguide.material.emissiveIntensity = 1.8;
            } else if (queuedPkt) {
              if (slot.fits) {
                // QUEUED_FITS (fits safely inside window)
                waveguide.material.color.setHex(0x10b981);
                waveguide.material.emissive.setHex(0x047857);
                waveguide.material.emissiveIntensity = 1.2;
              } else {
                // QUEUED_OVERFLOW (will be cut off by 10.0s window!)
                waveguide.material.color.setHex(0xef4444);
                waveguide.material.emissive.setHex(0x991b1b);
                waveguide.material.emissiveIntensity = 1.5;
              }
            }
          }
          const progressBar = consoleObj.getObjectByName(`DownlinkSlotProgress_${i + 1}`);
          if (progressBar instanceof Mesh && progressBar.material instanceof MeshBasicMaterial) {
            const progress = state.phase === 'OPERATIONS' ? 0 : slot?.progress ?? 0;
            progressBar.visible = progress > 0;
            progressBar.scale.x = Math.max(0.001, progress);
            progressBar.position.x = DOWNLINK_BAY_POSITIONS[i][0] - 0.027 * (1 - progress);
            progressBar.material.color.setHex(slot?.fits ? 0x38bdf8 : 0xf87171);
          }
        }
      }
    }

    this.syncCubeTransforms(this.reviewState?.packets ?? state.packets, this.reviewState ?? state);

    // 4. Update the 3 Spatial UIKitML Panels
    if (state.debrief && !this.recordedDebrief) {
      this.recordedDebrief = true;
      this.earnedMedals = recordMissionMastery(this.profile, state.scenarioId, state.debrief);
      if (this.dailyDate) recordDailyPass(this.profile, this.dailyDate, state.debrief.totalScore);
      saveMissionProfile(this.profile);
    }
    this.syncBriefingPanel();
    this.syncTelemetryPanel();
    this.syncDebriefPanel();
    this.syncSettings();
    this.desktopControls?.updateHud();
  }

  private animateCubeTransitions(delta: number): void {
    if (!this.cubeTransitions.size) return;
    let completed = false;
    for (const [packetId, transition] of this.cubeTransitions) {
      transition.remaining = Math.max(0, transition.remaining - delta);
      const entity = [...this.queries.cubes.entities].find((cube) => cube.getValue(EvidenceCubeNode, 'packetId') === packetId);
      const object = entity?.object3D;
      if (!object || entity?.hasComponent(Grabbed)) {
        this.cubeTransitions.delete(packetId);
        continue;
      }
      const packet = this.frameSnapshot?.packets.find((p) => p.id === packetId);
      if (!packet) { this.cubeTransitions.delete(packetId); continue; }
      const duration = transition.kind === 'SCAN' ? 0.85 : 0.65;
      const progress = 1 - transition.remaining / duration;
      const smooth = progress * progress * (3 - 2 * progress);
      const selected = this.frameSnapshot?.selectedPacketId === packetId ? 1.15 : 1;
      const particles = object.getObjectByName('CubeAssemblyParticles');
      if (transition.kind === 'SCAN') {
        const scale = this.profile.preferences.reducedMotion ? 1 : 0.15 + 0.89 * smooth;
        object.scale.setScalar(scale * selected);
        if (particles instanceof Points && particles.material instanceof PointsMaterial) {
          particles.visible = !this.profile.preferences.reducedMotion && transition.remaining > 0;
          particles.material.color.setHex(packet.sensorMode === 'RADAR' ? 0xfbbf24 : 0x38bdf8);
          particles.material.opacity = Math.sin(progress * Math.PI) * 0.95;
          particles.rotation.y = progress * Math.PI;
        }
      } else if (!this.profile.preferences.reducedMotion) {
        object.position.copy(PROCESS_CRADLE_WORLD);
        object.position.y += 0.02;
        const scaleProgress = 1.04 - 0.34 * smooth;
        object.scale.set(scaleProgress * selected, (1.04 - 0.39 * smooth) * selected, scaleProgress * selected);
        if (particles instanceof Points && particles.material instanceof PointsMaterial) {
          particles.visible = !this.profile.preferences.reducedMotion && transition.remaining > 0;
          particles.material.color.setHex(0xf59e0b); // Golden photon compression burst
          particles.material.opacity = Math.sin(progress * Math.PI) * 0.95;
          particles.rotation.y = progress * Math.PI * 2;
        }
      }
      if (transition.remaining === 0) {
        if (particles) particles.visible = false;
        this.cubeTransitions.delete(packetId);
        completed = true;
      }
    }
    if (completed && this.frameSnapshot) {
      this.syncCubeTransforms(this.frameSnapshot.packets, this.frameSnapshot);
    }
  }

  private syncCubeTransforms(packets: DataPacket[], snapshot?: MissionState): void {
    const state = snapshot ?? this.engine.getState();

    for (const cubeEntity of this.queries.cubes.entities) {
      const slotIndex = cubeEntity.getValue(EvidenceCubeNode, 'slotIndex') ?? 0;
      const pkt = packets[slotIndex];
      const obj = cubeEntity.object3D;
      if (!obj) continue;

      const isCurrentlyGrabbed = cubeEntity.hasComponent(Grabbed);

      if (!pkt) {
        cubeEntity.setValue(EvidenceCubeNode, 'packetId', '');
        if (!isCurrentlyGrabbed) {
          const home = RAW_TRAY_POSITIONS[slotIndex] ?? RAW_TRAY_POSITIONS[0];
          obj.position.set(home[0], home[1], home[2]);
          obj.rotation.set(0, 0, 0);
        }
        // Keep standby holocubes full-sized and visibly luminous on the tray
        obj.scale.set(0.92, 0.92, 0.92);

        // Reset dynamic 3D elements for standby
        const bridgeSpan = obj.getObjectByName('CubeBridgeSpan');
        if (bridgeSpan) bridgeSpan.visible = false;
        const cloudCap = obj.getObjectByName('CubeCloudObscurationCap');
        if (cloudCap) cloudCap.visible = false;
        const radarSpikes = obj.getObjectByName('CubeRadarSpikes');
        if (radarSpikes) radarSpikes.visible = false;
        const highwayVector = obj.getObjectByName('CubeHighwayVector');
        if (highwayVector) highwayVector.visible = false;
        const terrainCore = obj.getObjectByName('CubeConfidenceCore');
        if (terrainCore) {
          terrainCore.scale.set(1, 1, 1);
          terrainCore.position.y = 0.026;
        }

        const standbyHex = STANDBY_CUBE_COLORS[slotIndex] ?? 0x38bdf8;
        this.setObjectTint(obj, standbyHex, 0.55);
        this.updateCubeTelemetryCanvas(obj, slotIndex, undefined);
        continue;
      }

      cubeEntity.setValue(EvidenceCubeNode, 'packetId', pkt.id);

      if (!isCurrentlyGrabbed) {
        if (pkt.queued && pkt.queueIndex !== null && pkt.queueIndex < 3) {
          const bayPos =
            DOWNLINK_BAY_POSITIONS[pkt.queueIndex] ?? DOWNLINK_BAY_POSITIONS[0];
          obj.position.set(bayPos[0], bayPos[1], bayPos[2]);
        } else {
          const trayPos = RAW_TRAY_POSITIONS[slotIndex] ?? RAW_TRAY_POSITIONS[0];
          obj.position.set(trayPos[0], trayPos[1], trayPos[2]);
        }
        obj.rotation.set(0, 0, 0);
      }

      // Update sector-specific 3D internal physical features (Phase 4 Living Micro-Holograms)
      const bridgeSpan = obj.getObjectByName('CubeBridgeSpan');
      if (bridgeSpan) {
        bridgeSpan.visible = (pkt.sectorId === 'C' || pkt.sectorId === 'D') && pkt.confidence !== 'UNVERIFIED';
      }

      const cloudCap = obj.getObjectByName('CubeCloudObscurationCap');
      if (cloudCap) {
        cloudCap.visible = pkt.confidence === 'UNVERIFIED';
      }

      const radarSpikes = obj.getObjectByName('CubeRadarSpikes');
      if (radarSpikes) {
        radarSpikes.visible = pkt.confidence === 'PROBABLE';
      }

      const highwayVector = obj.getObjectByName('CubeHighwayVector');
      if (highwayVector) {
        highwayVector.visible = pkt.confidence === 'CONFIRMED';
      }

      const terrainCore = obj.getObjectByName('CubeConfidenceCore');
      if (terrainCore) {
        if (pkt.confidence === 'UNVERIFIED') {
          terrainCore.scale.set(1, 0.75, 1);
          terrainCore.position.y = 0.023;
        } else if (pkt.sectorId === 'E') {
          // Sector E Shelter Ridge Spur: elevated high-ground mountain terrain
          terrainCore.scale.set(1, 1.35, 1);
          terrainCore.position.y = 0.029;
        } else if (pkt.sectorId === 'B') {
          // Sector B East Levee: low-lying flat inundated alluvial flood plain
          terrainCore.scale.set(1, 0.75, 1);
          terrainCore.position.y = 0.023;
        } else {
          // Sector C/D/A/F: standard river corridor
          terrainCore.scale.set(1, 1.0, 1);
          terrainCore.position.y = 0.026;
        }
      }

      const isSelected = state.selectedPacketId === pkt.id;
      // Phase 4: 70% scale for compressed feature cubes
      const baseScale = pkt.processed ? 0.70 : 1.04;
      const selectBoost = isSelected ? 1.15 : 1.0;
      obj.scale.set(
        baseScale * selectBoost,
        (pkt.processed ? 0.65 : 1.04) * selectBoost,
        baseScale * selectBoost,
      );

      const confidenceHex =
        pkt.confidence === 'CONFIRMED'
          ? 0x10b981
          : pkt.confidence === 'PROBABLE'
            ? 0xf59e0b
            : 0xef4444;
      this.setObjectTint(obj, confidenceHex, isSelected ? 1.35 : 0.95);
      this.updateCubeTelemetryCanvas(obj, slotIndex, pkt);
    }
  }

  /**
   * High-DPI 512×512 telemetry renderer with 4-quadrant layout:
   * 1. Top Header Banner: Sector code, sensor mode & request match status pill
   * 2. Left Swath: Simulated Synthetic Aperture Radar backscatter or Optical NDWI flood swath
   * 3. Right Telemetry: SNR signal ratio, confidence grade, AI compression state
   * 4. Bottom Meter: Transmit duration vs 10.0s downlink window consumption bar
   */
  private updateCubeTelemetryCanvas(
    cubeRoot: Object3D,
    slotIndex: number,
    pkt: DataPacket | undefined,
  ): void {
    if (typeof document === 'undefined') return;

    const sig = pkt
      ? `${pkt.id}:${pkt.sectorId}:${pkt.sensorMode}:${pkt.confidence}:${pkt.processed}:${pkt.queued}:${pkt.transmitted}:${pkt.droppedByWindow}:${this.engine.getState().downlinkWindowSec}`
      : `STANDBY:${slotIndex}`;

    let binding = this.cubeCanvasMap.get(slotIndex);
    if (!binding) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      binding = { canvas, ctx, texture, signature: '' };
      this.cubeCanvasMap.set(slotIndex, binding);

      // Attach texture to CubeFrontDisplay and CubeTopDisplay meshes
      for (const displayMeshName of ['CubeFrontDisplay', 'CubeTopDisplay']) {
        const mesh = cubeRoot.getObjectByName(displayMeshName);
        if (mesh instanceof Mesh && mesh.material instanceof MeshStandardMaterial) {
          mesh.material.map = texture;
          mesh.material.emissiveMap = texture;
          mesh.material.color.setHex(0xffffff);
          mesh.material.emissive.setHex(0xffffff);
          mesh.material.emissiveIntensity = 0.85;
          mesh.material.needsUpdate = true;
        }
      }
    }

    if (binding.signature === sig) return;
    binding.signature = sig;

    const { ctx, texture } = binding;
    ctx.clearRect(0, 0, 512, 512);

    // Deep space dark chassis background
    ctx.fillStyle = '#060d17';
    ctx.fillRect(0, 0, 512, 512);

    const accentColor = !pkt
      ? slotIndex === 0
        ? '#38bdf8'
        : slotIndex === 1
          ? '#f59e0b'
          : '#10b981'
      : pkt.confidence === 'CONFIRMED'
        ? '#10b981'
        : pkt.confidence === 'PROBABLE'
          ? '#f59e0b'
          : '#ef4444';

    // Outer Aerospace HUD Bezel
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 492, 492);

    // Corner targeting ticks
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#94a3b8';
    const corners = [
      [24, 24],
      [488, 24],
      [24, 488],
      [488, 488],
    ];
    for (const [cx, cy] of corners) {
      const dx = cx < 256 ? 1 : -1;
      const dy = cy < 256 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(cx, cy + dy * 18);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + dx * 18, cy);
      ctx.stroke();
    }

    if (!pkt) {
      // Standby buffer HUD
      ctx.fillStyle = accentColor;
      ctx.fillRect(26, 26, 460, 68);
      ctx.fillStyle = '#030712';
      ctx.font = 'bold 36px monospace';
      ctx.fillText(`CUBE SLOT #${slotIndex + 1}`, 42, 72);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('STANDBY HOLOCUBE BUFFER', 38, 134);

      // Radar azimuth reticle
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(256, 260, 92, 0, Math.PI * 2);
      ctx.arc(256, 260, 54, 0, Math.PI * 2);
      ctx.moveTo(130, 260);
      ctx.lineTo(382, 260);
      ctx.moveTo(256, 134);
      ctx.lineTo(256, 386);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 20px monospace';
      ctx.fillText('STORAGE CAPACITY: 3 STR', 120, 395);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('AWAITING ORBITAL SCAN', 104, 448);
    } else {
      // 1. Top Header Banner
      ctx.fillStyle = accentColor;
      ctx.fillRect(26, 26, 460, 66);
      ctx.fillStyle = '#040a14';
      const statusSymbol =
        pkt.confidence === 'CONFIRMED'
          ? '[OK]'
          : pkt.confidence === 'PROBABLE'
            ? '[PR]'
            : '[!]';
      ctx.font = 'bold 28px monospace';
      ctx.fillText(`${statusSymbol} ${pkt.sectorCode}`, 36, 68);

      ctx.font = 'bold 22px monospace';
      ctx.fillText(pkt.sensorMode, 222, 68);

      const matchLabel = pkt.satisfiesRequestId ? `${pkt.satisfiesRequestId} MATCH` : 'SURVEY';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(matchLabel, 344, 68);

      // 2. Left Visual Swath Box (Radar Backscatter or Optical NDWI Swath)
      ctx.fillStyle = '#0b1626';
      ctx.fillRect(26, 106, 224, 218);
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 3;
      ctx.strokeRect(26, 106, 224, 218);

      if (pkt.confidence === 'UNVERIFIED') {
        // Red hazard cloud stripes
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 4;
        for (let x = 36; x < 240; x += 32) {
          ctx.beginPath();
          ctx.moveTo(x, 116);
          ctx.lineTo(x + 24, 314);
          ctx.stroke();
        }
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 22px monospace';
        ctx.fillText('CLOUD BLOCKED', 44, 205);
        ctx.fillStyle = '#fca5a5';
        ctx.font = 'bold 17px monospace';
        ctx.fillText('OPTICAL SCATTER', 48, 235);
      } else {
        // Technical 2D scan profile
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.lineWidth = 1.5;
        for (let y = 126; y < 314; y += 30) {
          ctx.beginPath();
          ctx.moveTo(34, y);
          ctx.lineTo(242, y);
          ctx.stroke();
        }
        // River channel in swath box
        ctx.fillStyle = 'rgba(14, 165, 233, 0.35)';
        ctx.beginPath();
        ctx.moveTo(34, 160);
        ctx.bezierCurveTo(90, 180, 160, 240, 242, 280);
        ctx.lineTo(242, 314);
        ctx.lineTo(34, 314);
        ctx.closePath();
        ctx.fill();

        // Waveform profile line
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
          const px = 36 + i * 20;
          const py =
            215 +
            Math.sin(i * 1.05 + pkt.sectorId.charCodeAt(0)) * 34 +
            (pkt.sensorMode === 'RADAR' ? (i % 2 === 0 ? -12 : 12) : 0);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(
          pkt.sensorMode === 'RADAR' ? 'SAR BACKSCATTER' : 'OPTICAL NDWI',
          36,
          130,
        );
      }

      // 3. Right Telemetry Data Column
      ctx.fillStyle = '#0b1626';
      ctx.fillRect(262, 106, 224, 218);
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 3;
      ctx.strokeRect(262, 106, 224, 218);

      ctx.fillStyle = accentColor;
      ctx.font = 'bold 22px monospace';
      ctx.fillText(`CONF: ${pkt.confidence}`, 274, 142);

      const snrText = `${pkt.snrDb.toFixed(1)} dB SNR (${pkt.swathWidthKm.toFixed(0)}km)`;
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(snrText, 274, 178);

      const procStr = pkt.processed
        ? `1 STR (${pkt.compressionAlgorithm === 'EDGE_TRUSS_VECTORIZATION' ? 'TRUSS' : 'NDWI'})`
        : '3 STR (RAW)';
      ctx.fillStyle = pkt.processed ? '#10b981' : '#f59e0b';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(`ONBOARD: ${procStr}`, 274, 214);

      const queueState = pkt.transmitted
        ? 'TX COMPLETE'
        : pkt.droppedByWindow ? 'SIGNAL LOST'
        : pkt.queued
          ? `QUEUED (#${(pkt.queueIndex ?? 0) + 1})`
          : 'BUFFERED';
      ctx.fillStyle = pkt.transmitted ? '#38bdf8' : pkt.queued ? '#10b981' : '#e2e8f0';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(`STATE: ${queueState}`, 274, 250);

      // 4. Bottom Downlink Window Budget Gauge
      ctx.fillStyle = '#0b1626';
      ctx.fillRect(26, 336, 460, 148);
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 3;
      ctx.strokeRect(26, 336, 460, 148);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 19px monospace';
      const windowSec = this.engine.getState().downlinkWindowSec;
      ctx.fillText(`TX DURATION: ${pkt.transmitSec.toFixed(1)}s / ${windowSec.toFixed(1)}s WINDOW`, 38, 368);

      // Meter bar background
      ctx.fillStyle = '#172554';
      ctx.fillRect(38, 382, 436, 26);
      // Meter bar fill
      const barRatio = Math.min(1.0, pkt.transmitSec / windowSec);
      ctx.fillStyle = pkt.transmitSec <= 3.0 ? '#10b981' : '#f59e0b';
      ctx.fillRect(38, 382, 436 * barRatio, 26);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(38, 382, 436, 26);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 15px monospace';
      const metaLine = `${pkt.phenomenologyTag.replace(/_/g, ' ')} | ${pkt.resolutionMeters.toFixed(2)}m RES`;
      ctx.fillText(metaLine.length > 46 ? metaLine.substring(0, 43) + '...' : metaLine, 38, 432);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 16px monospace';
      const headlineText =
        pkt.headline.length > 44 ? pkt.headline.substring(0, 41) + '...' : pkt.headline;
      ctx.fillText(headlineText, 38, 462);
    }

    texture.needsUpdate = true;
  }

  private syncBriefingPanel(): void {
    if (!this.briefingPanel) return;
    const state = this.engine.getState();
    const scenario = MISSION_SCENARIOS[state.scenarioId] ?? MISSION_SCENARIOS.STANDARD_INDUS_PASS;
    const sector = getScenarioSector(state.scenarioId, state.selectedSectorId);
    const scanCost =
      state.activeSensorMode === 'OPTICAL'
        ? scenario.budget.opticalScan
        : scenario.budget.radarScan;

    this.setText(
      this.briefingPanel,
      'BriefingSubtitle',
      `${scenario.name.toUpperCase()} | ${state.downlinkWindowSec.toFixed(1)}s WINDOW | ${state.maxPower} PWR`,
    );

    this.setText(
      this.briefingPanel,
      'SelectedSectorTitle',
      `TARGET: ${sector.code} ${sector.name} (${sector.cloudCover === 'DENSE_STORM' ? 'STORM CLOUDS' : 'CLEAR SKY'})`,
    );
    this.setText(
      this.briefingPanel,
      'SelectedSectorDesc',
      `Sensor: ${state.activeSensorMode} (${scanCost.powerCost} PWR, ${scanCost.storageCost} STR, ${scanCost.transmitSec.toFixed(1)}s Tx) | ${sector.terrainSummary}`,
    );
    this.setText(
      this.briefingPanel,
      'Lbl_ToggleSensor',
      `Active Sensor: ${state.activeSensorMode} (Click to Switch OPTICAL / RADAR)`,
    );
    this.setText(
      this.briefingPanel,
      'Lbl_ScanSector',
      `SCAN ${sector.code} WITH ${state.activeSensorMode} (-${scanCost.powerCost} PWR)`,
    );

    for (let i = 0; i < GROUND_REQUEST_ORDER.length; i++) {
      const reqId = GROUND_REQUEST_ORDER[i];
      const req = GROUND_REQUESTS[reqId];
      const matchingPkt = state.packets.find(
        (p) => p.satisfiesRequestId === reqId && p.confidence !== 'UNVERIFIED',
      );
      const cardId = `Req${i + 1}Card`;
      const titleId = `Req${i + 1}Title`;
      const statusId = `Req${i + 1}Status`;

      if (matchingPkt) {
        if (matchingPkt.transmitted) {
          this.setText(
            this.briefingPanel,
            titleId,
            `${matchingPkt.confidence === 'PROBABLE' && req.minimumConfidence === 'CONFIRMED' ? '[?] PARTIAL ON GROUND' : '[OK] VERIFIED ON GROUND'}: ${req.shortLabel}`,
          );
          this.setText(
            this.briefingPanel,
            statusId,
            `[DOWNLINKED] ${matchingPkt.confidenceBadge} ${matchingPkt.sensorMode}; minimum requested ${req.requiredBadge}.`,
          );
          this.setBg(this.briefingPanel, cardId, '#047857');
        } else if (matchingPkt.queued) {
          let cumSec = 0;
          for (const qId of state.queuePacketIds) {
            const qPkt = state.packets.find((p) => p.id === qId);
            if (qPkt) cumSec += qPkt.transmitSec;
            if (qId === matchingPkt.id) break;
          }
          const willFit = cumSec <= state.downlinkWindowSec + 1e-6;
          if (willFit) {
            this.setText(
              this.briefingPanel,
              titleId,
              `REQ ${i + 1}: ${req.shortLabel} [QUEUED SLOT #${(matchingPkt.queueIndex ?? 0) + 1}]`,
            );
            this.setText(
              this.briefingPanel,
              statusId,
              `[READY FOR TX] ${matchingPkt.confidenceBadge} | ${matchingPkt.transmitSec.toFixed(1)}s Tx (Fits ${state.downlinkWindowSec.toFixed(1)}s window)`,
            );
            this.setBg(this.briefingPanel, cardId, '#064e3b');
          } else {
            this.setText(
              this.briefingPanel,
              titleId,
              `REQ ${i + 1}: ${req.shortLabel} [CUTOFF OVERFLOW WARNING]`,
            );
            this.setText(
              this.briefingPanel,
              statusId,
              `[!] Will drop at ${state.downlinkWindowSec.toFixed(1)}s cutoff! Compress in Cradle (-6 PWR -> 1.8s) or reorder queue.`,
            );
            this.setBg(this.briefingPanel, cardId, '#7f1d1d');
          }
        } else {
          const procStr = `${matchingPkt.processed ? 'COMPRESSED' : 'RAW'} ${matchingPkt.transmitSec.toFixed(1)}s`;
          this.setText(
            this.briefingPanel,
            titleId,
            `REQ ${i + 1}: ${req.shortLabel} [ON TRAY - QUEUE ME]`,
          );
          this.setText(
            this.briefingPanel,
            statusId,
            `[OK] On Tray: ${matchingPkt.id} (${procStr}) -> Drop into Downlink Bay or Cradle`,
          );
          this.setBg(this.briefingPanel, cardId, '#1e3a8a');
        }
      } else {
        this.setText(
          this.briefingPanel,
          titleId,
          `REQ ${i + 1}: ${req.shortLabel} [AWAITING SCAN]`,
        );
        this.setText(
          this.briefingPanel,
          statusId,
          `[?] Best sensor: ${getRecommendedSensor(state.scenarioId, req.targetSectorId)} on SEC-${req.targetSectorId} | ${getScenarioSector(state.scenarioId, req.targetSectorId).cloudCover === 'DENSE_STORM' ? 'storm obscuration' : 'clear sky'} | target ${req.requiredBadge}`,
        );
        this.setBg(this.briefingPanel, cardId, '#152238');
      }
    }
  }

  private getNextTacticalHint(state: MissionState): string {
    if (state.paused) return 'PAUSED: pass clock held. Use RESUME when ready.';
    if (state.phase === 'DEBRIEF') return 'PASS COMPLETE: review one decision, earn mastery, or launch the next orbital pass.';
    if (state.phase === 'DOWNLINK') return `TRANSMITTING: ${state.downlinkRemainingSec.toFixed(1)}s left. Evidence is locked until ground acknowledgement.`;
    const solution = this.getSolution(state);
    const benchmark = getMissionBenchmark(state.scenarioId);
    if (this.profile.preferences.guidance === 'EXPERT') return `EXPERT MODE | ${state.packets.length}/3 CUBES | ${state.downlinkCommittedSec.toFixed(1)}s QUEUE | OBJECTIVE ${benchmark.score}/100`;
    if (this.profile.preferences.guidance === 'STANDARD') return `OBJECTIVE ${benchmark.score}/100 | REACHABLE ${solution.score}/100 | observe -> compress -> prioritize -> transmit`;
    const next = getNextPlanAction(state, solution);
    if (!next) return state.queuePacketIds.length
      ? `READY: ${state.downlinkCommittedSec.toFixed(1)}s / ${state.downlinkWindowSec.toFixed(1)}s. Press COMMIT to begin the live downlink.`
      : 'No useful evidence remains reachable with this power reserve. Restart to try a different observation plan.';
    const ceiling = solution.score < benchmark.score ? `REACHABLE ${solution.score}/${benchmark.score}. ` : '';
    if (next.type === 'SCAN') {
      if (state.selectedSectorId !== next.sectorId) return `${ceiling}NEXT: select SEC-${next.sectorId} on the globe or cycle the target.`;
      if (state.activeSensorMode !== next.sensorMode) return `${ceiling}NEXT: switch to ${next.sensorMode} for SEC-${next.sectorId}.`;
      return `${ceiling}NEXT: scan SEC-${next.sectorId} using ${next.sensorMode}.`;
    }
    const packet = state.packets.find((p) => p.id === next.packetId);
    if (packet && state.selectedPacketId !== packet.id) return `${ceiling}NEXT: select ${packet.id} (SEC-${packet.sectorId}) using the cube or SELECT NEXT EVIDENCE.`;
    if (next.type === 'PROCESS') return `${ceiling}NEXT: compress SEC-${next.sectorId} in the amber cradle before the next observation.`;
    if (next.type === 'DISCARD') return `${ceiling}NEXT: discard unnecessary SEC-${next.sectorId} evidence to free a physical cube.`;
    if (next.type === 'UNQUEUE') return `${ceiling}NEXT: remove SEC-${next.sectorId} from the bay so the strongest evidence fits.`;
    return `${ceiling}NEXT: place SEC-${next.sectorId} in the downlink bay.`;
  }

  private syncTelemetryPanel(): void {
    if (!this.telemetryPanel) return;
    const state = this.engine.getState();

    const pwrRatio = Math.max(0, Math.min(1, state.power / state.maxPower));
    const pwrFilled = Math.round(pwrRatio * 10);
    const pwrBar = `[${'#'.repeat(pwrFilled)}${'-'.repeat(10 - pwrFilled)}]`;

    const strFilled = Math.max(0, Math.min(state.maxStorage, state.storageUsed));
    const strBar = `[${'#'.repeat(strFilled)}${'-'.repeat(state.maxStorage - strFilled)}]`;

    this.setText(
      this.telemetryPanel,
      'ResourceReadout',
      `PWR: ${pwrBar} ${state.power}/${state.maxPower} PWR  |  STR: ${strBar} ${state.storageUsed}/${state.maxStorage} STR`,
    );

    const winRatio = Math.max(
      0,
      Math.min(1, state.downlinkCommittedSec / state.downlinkWindowSec),
    );
    const winFilled = Math.round(winRatio * 10);
    const winBar = `[${'#'.repeat(winFilled)}${'-'.repeat(10 - winFilled)}]`;
    const marginSec = Math.max(
      0,
      state.downlinkWindowSec - state.downlinkCommittedSec,
    );
    const windowOverflow =
      state.downlinkCommittedSec > state.downlinkWindowSec + 1e-6;

    let windowText = '';
    if (state.phase === 'DOWNLINK') {
      const remRatio = Math.max(
        0,
        Math.min(1, state.downlinkRemainingSec / state.downlinkWindowSec),
      );
      const remFilled = Math.round(remRatio * 10);
      const remBar = `[${'#'.repeat(remFilled)}${'-'.repeat(10 - remFilled)}]`;
      windowText = `TX STREAM: ${remBar} ${state.downlinkRemainingSec.toFixed(1)}s REMAINING  |  PHASE: DOWNLINK`;
    } else if (state.phase === 'DEBRIEF') {
      windowText = `WINDOW CLOSED: ${state.debrief?.downlinkUsedSec.toFixed(1)}s USED / ${state.downlinkWindowSec.toFixed(1)}s | ${state.debrief?.transmittedPacketIds.length ?? 0} PACKETS DELIVERED`;
    } else if (windowOverflow) {
      windowText = `WINDOW: ${winBar} ${state.downlinkCommittedSec.toFixed(1)}s / ${state.downlinkWindowSec.toFixed(1)}s [OVERFLOW +${(state.downlinkCommittedSec - state.downlinkWindowSec).toFixed(1)}s!]`;
    } else {
      windowText = `WINDOW: ${winBar} ${state.downlinkCommittedSec.toFixed(1)}s / ${state.downlinkWindowSec.toFixed(1)}s [MARGIN: ${marginSec.toFixed(1)}s]`;
    }

    this.setText(this.telemetryPanel, 'WindowReadout', windowText);
    this.setBg(
      this.telemetryPanel,
      'TelemetryHeaderCard',
      state.phase === 'DEBRIEF'
        ? '#064e3b'
        : state.phase === 'DOWNLINK'
          ? '#1e3a8a'
          : windowOverflow
            ? '#7f1d1d'
            : '#132036',
    );

    const statusMsg = state.lastActionOk ? this.getNextTacticalHint(state) : state.lastStatusMessage;

    this.setText(
      this.telemetryPanel,
      'StatusMessageText',
      statusMsg,
    );
    this.setBg(
      this.telemetryPanel,
      'StatusBannerCard',
      state.lastActionOk ? '#1e293b' : '#7f1d1d',
    );

    const selectedPkt = state.packets.find(
      (p) => p.id === state.selectedPacketId,
    );
    if (!selectedPkt) {
      this.setText(
        this.telemetryPanel,
        'InspectorTitle',
        'ACTIVE EVIDENCE CUBE: NONE SELECTED',
      );
      this.setText(
        this.telemetryPanel,
        'InspectorConfidence',
        'Scan a sector or poke/grab a Data Cube on the console tray to inspect.',
      );
      this.setText(
        this.telemetryPanel,
        'InspectorScience',
        'Onboard Processing (6 PWR) compresses CONFIRMED or PROBABLE cubes from 3 STR -> 1 STR and 4.5s -> 1.8s Tx.',
      );
      this.setBg(this.telemetryPanel, 'CubeInspectorCard', '#152238');
      this.setText(
        this.telemetryPanel,
        'Lbl_ProcessCube',
        'PROCESS SELECTED CUBE (6 PWR -> 1 STR / 1.8s Tx)',
      );
      this.setText(
        this.telemetryPanel,
        'Lbl_QueueCube',
        'ADD SELECTED CUBE TO DOWNLINK BAY',
      );
    } else {
      const procTag = selectedPkt.processed ? 'PROCESSED' : 'RAW';
      this.setText(
        this.telemetryPanel,
        'InspectorTitle',
        `${selectedPkt.id} | ${selectedPkt.sectorCode} ${selectedPkt.sectorName} (${selectedPkt.sensorMode} - ${procTag})`,
      );
      this.setText(
        this.telemetryPanel,
        'InspectorConfidence',
        `${selectedPkt.confidenceBadge} | ${selectedPkt.storageCost} STR | ${selectedPkt.transmitSec.toFixed(1)}s Tx | ${selectedPkt.headline}`,
      );
      this.setText(
        this.telemetryPanel,
        'InspectorScience',
        selectedPkt.scientificReason,
      );

      const cardColor =
        selectedPkt.confidence === 'CONFIRMED'
          ? '#064e3b'
          : selectedPkt.confidence === 'PROBABLE'
            ? '#78350f'
            : '#7f1d1d';
      this.setBg(this.telemetryPanel, 'CubeInspectorCard', cardColor);

      this.setText(
        this.telemetryPanel,
        'Lbl_ProcessCube',
        selectedPkt.processed
          ? `${selectedPkt.id} ALREADY PROCESSED (1 STR / 1.8s Tx)`
          : selectedPkt.confidence === 'UNVERIFIED'
            ? `CANNOT PROCESS [X] UNVERIFIED CUBE (DISCARD INSTEAD)`
            : `PROCESS ${selectedPkt.id} (-6 PWR -> 1 STR / 1.8s Tx)`,
      );

      this.setText(
        this.telemetryPanel,
        'Lbl_QueueCube',
        selectedPkt.queued
          ? `REMOVE ${selectedPkt.id} FROM DOWNLINK SLOT #${(selectedPkt.queueIndex ?? 0) + 1}`
          : `QUEUE ${selectedPkt.id} IN DOWNLINK BAY (${selectedPkt.transmitSec.toFixed(1)}s Tx)`,
      );
    }
  }

  private syncDebriefPanel(): void {
    if (!this.debriefPanel) return;
    const state = this.engine.getState();

    let cumulativeSec = 0;
    for (let i = 0; i < 3; i++) {
      const pktId = state.queuePacketIds[i];
      const pkt = state.packets.find((p) => p.id === pktId);
      const titleId = `Slot${i + 1}Title`;
      const descId = `Slot${i + 1}Desc`;
      const cardId = `Slot${i + 1}Card`;

      if (!pkt) {
        this.setText(
          this.debriefPanel,
          titleId,
          `DOWNLINK SLOT #${i + 1}: [EMPTY]`,
        );
        this.setText(
          this.debriefPanel,
          descId,
          'Drop or queue evidence cube here before committing pass.',
        );
        this.setBg(this.debriefPanel, cardId, '#152238');
      } else {
        const startSec = cumulativeSec;
        cumulativeSec = Number((cumulativeSec + pkt.transmitSec).toFixed(1));
        const willDrop = cumulativeSec > state.downlinkWindowSec + 1e-6;
        const timelineStr = `${startSec.toFixed(1)}s -> ${cumulativeSec.toFixed(1)}s`;
        const marginStr = (state.downlinkWindowSec - cumulativeSec).toFixed(1);
        const overStr = (cumulativeSec - state.downlinkWindowSec).toFixed(1);

        const txStateTag = pkt.transmitted
          ? '[TRANSMITTED TO GROUND]'
          : pkt.droppedByWindow
            ? `[DROPPED AT ${state.downlinkWindowSec.toFixed(1)}s CUTOFF]`
            : willDrop
              ? `[EXCEEDS WINDOW BY +${overStr}s - WILL DROP!]`
              : `[FITS WINDOW - MARGIN ${marginStr}s]`;

        this.setText(
          this.debriefPanel,
          titleId,
          `SLOT #${i + 1}: ${pkt.id} (${pkt.sectorCode} ${pkt.sensorMode}) - ${pkt.confidenceBadge}`,
        );
        this.setText(
          this.debriefPanel,
          descId,
          `Tx: ${pkt.transmitSec.toFixed(1)}s [${timelineStr}] | ${txStateTag}`,
        );
        this.setBg(
          this.debriefPanel,
          cardId,
          pkt.transmitted
            ? '#047857'
            : willDrop || pkt.droppedByWindow
              ? '#7f1d1d'
              : '#064e3b',
        );
      }
    }

    if (!state.debrief) {
      this.setText(
        this.debriefPanel,
        'DebriefRankTitle',
        state.phase === 'DOWNLINK'
          ? `TRANSMITTING DOWNLINK (${state.downlinkRemainingSec.toFixed(1)}s WINDOW LEFT)`
          : `DOWNLINK BAY (${state.queuePacketIds.length}/3 SLOTS | ${state.downlinkCommittedSec.toFixed(1)}s / ${state.downlinkWindowSec.toFixed(1)}s)`,
      );
      this.setText(
        this.debriefPanel,
        'DebriefScoreSubtitle',
        `OBJECTIVE: ${getMissionBenchmark(state.scenarioId).score}/100 | CUTOFF ${state.downlinkWindowSec.toFixed(1)}s | ${state.paused ? 'PAUSED' : state.phase}`,
      );
      this.setBg(this.debriefPanel, 'DebriefBannerCard', '#132036');

      this.setText(
        this.debriefPanel,
        'OutcomeReq1',
        'REQ 1 (SEC-B Road Inundation): AWAITING DOWNLINK',
      );
      this.setText(
        this.debriefPanel,
        'OutcomeReq2',
        'REQ 2 (SEC-C Crossing Approach): AWAITING DOWNLINK',
      );
      this.setText(
        this.debriefPanel,
        'OutcomeReq3',
        'REQ 3 (SEC-E Shelter Spur): AWAITING DOWNLINK',
      );
      this.setText(
        this.debriefPanel,
        'DebriefAdviceText',
        MISSION_SCENARIOS[state.scenarioId].briefing,
      );
    } else {
      const d = state.debrief;
      this.setText(
        this.debriefPanel,
        'DebriefRankTitle',
        `DEBRIEF: ${d.missionRank} [GRADE ${d.efficiencyGrade}] (${d.totalScore}/${d.maxScore} PTS)`,
      );
      this.setText(
        this.debriefPanel,
        'DebriefScoreSubtitle',
        `${d.requestsVerifiedCount}/3 Verified | Window: ${d.downlinkUsedSec.toFixed(1)}s/${d.downlinkWindowSec.toFixed(1)}s | Margin: ${Math.max(0, d.downlinkWindowSec - d.downlinkUsedSec).toFixed(1)}s | ${d.powerRemaining} PWR Left`,
      );
      const bannerColor =
        d.totalScore >= d.achievableScore
          ? '#047857'
          : d.missionRank === 'PARTIAL DOWNLINK'
            ? '#78350f'
            : '#7f1d1d';
      this.setBg(this.debriefPanel, 'DebriefBannerCard', bannerColor);

      for (let i = 0; i < d.evaluations.length; i++) {
        const ev = d.evaluations[i];
        this.setText(
          this.debriefPanel,
          `OutcomeReq${i + 1}`,
          `${ev.shortLabel}: ${ev.statusBadge} - ${ev.groundConsequence}`,
        );
      }
      this.setText(
        this.debriefPanel,
        'DebriefAdviceText',
        `${d.deterministicRecommendation} | ${d.counterfactualComparison}`,
      );
    }
  }

  private setText(panel: UIKitMLAsset, id: string, text: string): void {
    let values = this.panelValues.get(panel);
    if (!values) { values = new Map(); this.panelValues.set(panel, values); }
    if (values.get(id) === text) return;
    const el = panel.getElementById<UIKit.Text>(id);
    if (!el) return;
    values.set(id, text);
    el.setProperties({ text });
  }

  private setBg(panel: UIKitMLAsset, id: string, backgroundColor: string): void {
    let values = this.panelValues.get(panel);
    if (!values) { values = new Map(); this.panelValues.set(panel, values); }
    const color = this.profile.preferences.highContrast ? '#07111f' : backgroundColor;
    if (values.get(`${id}:bg`) === color) return;
    const el = panel.getElementById(id);
    if (!el) return;
    values.set(`${id}:bg`, color);
    el.setProperties({ backgroundColor: color });
  }

  private prepareEntityMaterials(): void {
    const allEntities = [
      ...this.queries.sectors.entities,
      ...this.queries.cubes.entities,
      ...this.queries.controls.entities,
    ];
    for (const entity of allEntities) {
      if (entity.object3D) {
        this.ensureClonedMaterials(entity.object3D);
      }
    }
    const scannerObj = this.world.getSceneObject('scanner-tool');
    if (scannerObj) {
      this.ensureClonedMaterials(scannerObj);
    }
  }

  private ensureClonedMaterials(root: Object3D): MeshStandardMaterial[] {
    const cached = this.materialCache.get(root);
    if (cached) return cached;

    const mats: MeshStandardMaterial[] = [];
    root.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      if (
        child.name === 'ScannerAimLaser' ||
        child.name === 'OrbitalScanSwathCone' ||
        child.name === 'DownlinkUplinkBeam' ||
        child.name.startsWith('DownlinkPulseRing') ||
        child.name.endsWith('DropHalo')
      ) {
        return;
      }
      const source = Array.isArray(child.material)
        ? child.material
        : [child.material];
      const clones = source.map((m) => m.clone());
      child.material = Array.isArray(child.material) ? clones : clones[0];
      for (const mat of clones) {
        if (mat.name === 'CubeTelemetryDisplayMat') {
          continue;
        }
        if ('emissive' in mat && 'emissiveIntensity' in mat) {
          const std = mat as MeshStandardMaterial;
          std.emissiveMap = null;
          std.needsUpdate = true;
          mats.push(std);
        }
      }
    });
    this.materialCache.set(root, mats);
    return mats;
  }

  private setObjectTint(
    root: Object3D,
    hex: number,
    emissiveIntensity: number,
  ): void {
    const mats = this.ensureClonedMaterials(root);
    const color = this.tempColor.setHex(hex);

    if (root.name === 'EvidenceDataCube') {
      const core = root.getObjectByName('CubeConfidenceCore');
      if (core instanceof Mesh && core.material instanceof MeshStandardMaterial) {
        core.material.color.copy(color);
        core.material.emissive.copy(color);
        core.material.emissiveIntensity = emissiveIntensity;
        core.material.needsUpdate = true;
      }
      const shell = root.getObjectByName('CubeAcrylicShell');
      if (shell instanceof Mesh && shell.material instanceof MeshStandardMaterial) {
        shell.material.emissive.copy(color).multiplyScalar(0.25);
        shell.material.emissiveIntensity = 0.25;
        shell.material.needsUpdate = true;
      }
      const contour1 = root.getObjectByName('CubeContourWireframe_1');
      if (contour1 instanceof Mesh && contour1.material instanceof MeshStandardMaterial) {
        contour1.material.emissive.copy(color).multiplyScalar(0.6);
        contour1.material.needsUpdate = true;
      }
      const contour2 = root.getObjectByName('CubeContourWireframe_2');
      if (contour2 instanceof Mesh && contour2.material instanceof MeshStandardMaterial) {
        contour2.material.emissive.copy(color).multiplyScalar(0.6);
        contour2.material.needsUpdate = true;
      }
      return;
    }

    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      // Preserve metallic titanium/gunmetal structural frames while tinting emissive cores
      if (mats.length > 2 && i < mats.length - 3) {
        m.emissive.copy(color).multiplyScalar(0.18);
        m.emissiveIntensity = emissiveIntensity * 0.3;
      } else if (mats.length > 1 && i === 0) {
        m.emissive.copy(color).multiplyScalar(0.22);
        m.emissiveIntensity = emissiveIntensity * 0.35;
      } else {
        m.color.copy(color);
        m.emissive.copy(color);
        m.emissiveIntensity = emissiveIntensity;
      }
      m.needsUpdate = true;
    }
  }
}
