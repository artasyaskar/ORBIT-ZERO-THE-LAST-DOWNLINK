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
  InstancedMesh,
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
  Group,
} from '@iwsdk/core';
import {
  ConsoleControlNode,
  EvidenceCubeNode,
  OrbitSectorNode,
} from '../components';
import { DesktopControlsManager } from './desktopControls';
import {
  getScenarioSector,
  getScenarioRequests,
  getRecommendedSensor,
  GROUND_REQUEST_ORDER,
  GROUND_REQUESTS,
  MISSION_BUDGET,
  MISSION_SCENARIOS,
  SECTOR_ORDER,
  SECTORS,
} from '../mission/missionConfig';
import { MissionEngine, replayMission } from '../mission/missionEngine';
import { NativeXRHands, type LiveXRHandSample } from './nativeXRHands';
import { CubeInteractions, cubeStationTargets, nearestCubeStation, isVisible, setWorldPosition, type CubeDropTarget } from './cubeInteractions';
import { TutorialEngine } from '../mission/tutorialEngine';
import { describeMissionPlan, getMissionBenchmark, getNextPlanAction, getQueueSchedule, solveMission } from '../mission/missionPlanner';
import type { DataPacket, MissionScenarioId, MissionState, SectorId, SensorMode } from '../mission/types';
import {
  GLOBE_RADIUS,
  SECTOR_GEO_DEFINITIONS,
  latLonToGlobePoint,
} from '../scene-assets/earthGlobe.scene-asset';
import { createEarthGlobeEnhancementsOptimized, updateEarthEnhancementsOptimized } from '../scene-assets/earthGlobeEnhancements.optimized';
import { alignSpan } from '../scene-assets/lib/hardsurface';
import { VRHandSimulator } from './vrHandSimulator';
import { OrbitalAudioController, type OrbitalSoundCue } from './orbitalAudio';
import { VoiceCommander, type VoiceDialogueId } from './voiceCommander';
import { AgenticCoPilot, type AgenticIntervention } from './agenticCoPilot';
import {
  getDailyPass, loadMissionProfile, recordDailyPass, recordMissionMastery, saveMissionProfile,
  type MissionPreferences,
} from './missionProfile';
import type { ActionResult, MissionAction, MissionSolution } from '../mission/types';

const DOWNLINK_BAY_POSITIONS: [number, number, number][] = [
  [0.25, 0.79, -0.43],
  [0.32, 0.79, -0.43],
  [0.39, 0.79, -0.43],
];

const STANDBY_CUBE_COLORS = [0x38bdf8, 0x38bdf8, 0xf59e0b];

const SCANNER_HOME_POSITION = new Vector3(-0.44, 0.80, -0.30);
const GLOBE_CENTER_WORLD = new Vector3(0, 0.98, -0.48);
const DOWNLINK_BAY_CENTER_WORLD = new Vector3(0.32, 0.79, -0.43);

// Target seated eye position in world space (0.44m back from origin, 1.20m seated eye height)
const SEATED_TARGET_HEAD_WORLD = new Vector3(0, 1.20, 0.44);

interface CubeCanvasBinding {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  signature: string;
}

export interface XRHandTelemetryEvent {
  timestampMs: number;
  missionElapsedSec: number;
  eventType:
  | 'mode_change'
  | 'connected'
  | 'disconnected'
  | 'globe_touch'
  | 'point_hover'
  | 'poke'
  | 'selectstart'
  | 'selectend'
  | 'select'
  | 'grabstart'
  | 'grabmove'
  | 'grabrelease'
  | 'tracking_lost_recovery';
  inputSource: 'hand';
  handedness: 'left' | 'right';
  connected: boolean;
  poseId: string;
  pinchValue: number;
  position: [number, number, number];
  indexTipPosition: [number, number, number];
  graspPosition: [number, number, number];
  targetType?:
  | 'SECTOR'
  | 'CONTROL_PAD'
  | 'DATA_CUBE'
  | 'SPATIAL_UI_BUTTON'
  | 'DROP_ZONE'
  | 'GLOBE'
  | 'NONE';
  targetId?: string;
  actionOrOutcome?: string;
}

interface Resolved3DHandTarget {
  targetType: 'SECTOR' | 'CONTROL_PAD' | 'DATA_CUBE' | 'SPATIAL_UI_BUTTON' | 'GLOBE';
  targetId: string;
  distance: number;
  worldPosition: Vector3;
  sectorId?: SectorId;
  controlAction?: string;
  cubeEntity?: Entity;
  slotIndex?: number;
  panelId?: string;
  buttonId?: string;
}

export class MissionControlSystem extends createSystem({
  sectors: { required: [OrbitSectorNode] },
  sectorActivated: { required: [OrbitSectorNode, Pressed] },
  cubes: { required: [EvidenceCubeNode] },
  cubeActivated: { required: [EvidenceCubeNode, Pressed] },
  controls: { required: [ConsoleControlNode] },
  controlActivated: { required: [ConsoleControlNode, Pressed] },
  controlGrabbed: { required: [ConsoleControlNode, Grabbed] },
}) {
  private engine = new MissionEngine();
  private tutorial = new TutorialEngine();
  private audio = new OrbitalAudioController();
  private materialCache = new WeakMap<Object3D, MeshStandardMaterial[]>();
  private cubeCanvasMap = new Map<number, CubeCanvasBinding>();
  private tempVec = new Vector3();
  private tempObj = new Object3D();
  private hasHiddenParkedPads = false;
  private static readonly GAUGE_COLOR_UNLIT = new Color(0x1e293b);
  private static readonly GAUGE_COLOR_CYAN = new Color(0x38bdf8);
  private static readonly GAUGE_COLOR_AMBER = new Color(0xf59e0b);
  private static readonly GAUGE_COLOR_RED = new Color(0xef4444);
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
  private delegationBaseline = 0;
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
  private earthGlobeEnhancements?: Object3D;
  private enhancementAnimationTime = 0;
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
  public spatialHudVisible = true;

  // Desktop Controls & First-Time Player Experience
  private desktopControls?: DesktopControlsManager;

  // Phase 5: In-Engine VR Hand & Ergonomic Simulator
  private vrHandSimulator!: VRHandSimulator;

  // Phase 2: Commander ARIA-7 Holographic Voice Handler & Radio DSP
  private voiceCommander?: VoiceCommander;

  // Deep Agentic Co-Pilot Telemetry & Spatial Delegation Engine ("Take It Away Test")
  private coPilot!: AgenticCoPilot;

  // Phase 1: 3D Gimbal Globe Interactive Rotation & Focal Zoom
  private globeAngularVelocity = new Vector2(0, 0);
  private globeTargetQuaternion = new Quaternion();
  private globeCurrentQuaternion = new Quaternion();
  private globeFocalDistance = -0.48;
  private targetFocalDistance = -0.48;
  private isSlerpingToSector = false;
  private slerpProgress = 1.0;
  private slerpDuration = 0.65;

  // WebXR Hand Joint & XRSession Input Pipeline (IWER 2.7.0 + Physical Meta Quest 3 / 3S)
  private currentInputSource: 'xr-hand' | 'desktop' = 'desktop';
  private boundXRSession: XRSession | null = null;
  private readonly nativeHands = new NativeXRHands();
  private readonly cubeInteractions = new CubeInteractions();
  private xrHandEventLog: XRHandTelemetryEvent[] = [];
  private lastHandConnected: Record<'left' | 'right', boolean> = { left: false, right: false };
  private lastHandPressed: Record<'left' | 'right', boolean> = { left: false, right: false };
  private lastHandPointTarget: Record<'left' | 'right', string> = { left: '', right: '' };
  private handHoverTargets = new Map<'left' | 'right', { targetId: string; sample: LiveXRHandSample; time: number }>();
  private lastHandPokeTime = new Map<string, number>();
  private lastHandGlobeTouchPos = new Map<'left' | 'right', Vector3>();
  private activeXRHandGrabs = new Map<
    'left' | 'right',
    {
      cubeEntity: Entity;
      slotIndex: number;
      packetId: string;
      grabStartPos: Vector3;
      lastGraspPos: Vector3;
      inspectedNotified: boolean;
    }
  >();

  private withInputSource<T>(source: 'xr-hand' | 'desktop', fn: () => T): T {
    const prev = this.currentInputSource;
    this.currentInputSource = source;
    try {
      return fn();
    } finally {
      this.currentInputSource = prev;
    }
  }

  init(): void {
    if (typeof window !== 'undefined') {
      const initialScenario = (window as any).__ORBIT_INITIAL_SCENARIO__ as MissionScenarioId | undefined;
      if (initialScenario && MISSION_SCENARIOS[initialScenario]) {
        this.engine.setScenario(initialScenario);
      }
      if ((window as any).__ORBIT_START_TUTORIAL__) {
        this.tutorial.start(Boolean(this.world.renderer?.xr?.isPresenting));
      }
    }
    const inputSystem = this.world.getSystem(InputSystem);
    if (inputSystem) inputSystem.config.maintainScenePointers.value = true;
    this.scene.traverse((object) => {
      if (object instanceof Points || object instanceof Line ||
        /^(ScannerAimLaser|OrbitalScanSwathCone|DownlinkUplinkBeam|DownlinkPulseRing|DownlinkLaserCore|DownlinkLaserSheath|KarachiDishShockwave|.*DropHalo)/.test(object.name)) {
        object.raycast = () => { };
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
    this.voiceCommander.onCaption = (text) => { this.caption = text; };
    this.cleanupFuncs.push(() => this.voiceCommander?.dispose());

    // Deep Agentic Co-Pilot System Integration
    this.coPilot = new AgenticCoPilot({
      getState: () => this.engine.getState(),
      applyAction: (action) => {
        const res = this.applyAction(action);
        this.syncAll();
        return { ok: res.ok, message: res.message };
      },
      playCue: (cue) => this.playCue(cue as never),
      voiceCommander: this.voiceCommander,
      audio: this.audio,
    });
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

    // 1a. RC10: Mount Tactical Earth Enhancements (storm, lightning, flood over Indus Basin)
    const globe = this.world.getSceneObject('earth-globe');
    if (globe) {
      this.earthGlobeEnhancements = createEarthGlobeEnhancementsOptimized();
      globe.add(this.earthGlobeEnhancements);
    }

    // Keep the 6 desk tactile pad ECS targets active for XR hand/ray interaction while stripping
    // duplicate decorative child meshes (already rendered by orbital-console) to stay under Quest GPU budget.
    const deskPadIds = [
      'pad-fire-swath',
      'pad-toggle-sensor',
      'pad-process-cradle',
      'pad-queue-downlink',
      'pad-commit-downlink',
      'pad-discard-chute',
    ];
    const syncDeskPadsForXR = (isImmersive: boolean) => {
      for (const id of deskPadIds) {
        const obj = this.world.getSceneObject(id);
        if (!obj) continue;
        obj.visible = isImmersive;
        if (isImmersive) {
          let keptPrimaryMesh = false;
          obj.traverse((child) => {
            if (child instanceof Mesh) {
              if (!keptPrimaryMesh) {
                child.visible = true;
                keptPrimaryMesh = true;
              } else {
                child.visible = false;
              }
            }
          });
        }
      }
    };
    syncDeskPadsForXR(this.world.visibilityState.value !== VisibilityState.NonImmersive);

    // 1b. Bind Deep-Space Milky Way Cosmic Skybox Dome
    this.bindCosmicEnvironmentAndTextures();

    // 2. Subscribe to 3D Sector Beacon activations (poke or ray-click when not driven by live XR hand joints)
    this.queries.sectorActivated.subscribe('qualify', (entity) => {
      if (this.isLiveXRHandActive()) return;
      if (this.isAnyObjectGrabbed()) return;
      const sectorId = (entity.getValue(OrbitSectorNode, 'sectorId') || 'B') as SectorId;
      const src = this.world.renderer.xr.isPresenting ? 'xr-hand' : 'desktop';
      this.withInputSource(src, () => {
        this.tutorial.notifySectorPointed(sectorId, src);
        this.handleSelectSector(sectorId);
      });
    });

    // 3. Subscribe to 3D Evidence Cube activations (poke/click selects cube)
    this.queries.cubeActivated.subscribe('qualify', (entity) => {
      if (this.isLiveXRHandActive()) return;
      const slotIndex = entity.getValue(EvidenceCubeNode, 'slotIndex') ?? 0;
      const state = this.engine.getState();
      const pkt = state.packets[slotIndex];
      if (pkt) {
        const src = this.world.renderer.xr.isPresenting ? 'xr-hand' : 'desktop';
        this.withInputSource(src, () => {
          this.tutorial.notifyCubeGrabOrSelect(pkt.confidence !== 'UNVERIFIED', src);
          this.applyAction({ type: 'SELECT_PACKET', packetId: pkt.id });
          this.playCue('SELECT_SECTOR');
          this.syncAll();
        });
      }
    });

    // 5. Subscribe to 3D Console Control Pads & Scanner Tool
    this.queries.controlActivated.subscribe('qualify', (entity) => {
      if (this.isLiveXRHandActive()) return;
      if (this.isAnyObjectGrabbed()) return;
      const action = entity.getValue(ConsoleControlNode, 'action') || 'SCAN';
      if (action === 'SCAN' && entity.hasComponent(Grabbed)) {
        return;
      }
      const src = this.world.renderer.xr.isPresenting ? 'xr-hand' : 'desktop';
      this.withInputSource(src, () => {
        this.handleControlAction(action);
      });
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
        this.tutorial.setVrMode(!is2D);
        this.syncDeskPadsForXR(!is2D);
        this.applyTabletopMode();
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
          this.bindXRSessionHandEvents();
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
      inspectPacket: (id) => {
        const pkt = this.engine.getState().packets.find((p) => p.id === id);
        if (pkt && pkt.confidence !== 'UNVERIFIED') {
          this.tutorial.notifyCubeInspected('desktop');
          this.tutorial.syncWithMissionState(this.engine.getState(), undefined, 'desktop');
        }
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
      toggleSpatialHud: () => this.toggleSpatialHud(),
      cubeInteractions: this.cubeInteractions,
      getCubeDropTargets: () => this.getCubeDropTargets(),
      releaseCube: (object) => this.withInputSource('desktop', () => this.releaseCube(object)),
      previewCubeDrop: (target) => this.highlightDropZones(true, target),
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
        getMissionBenchmark: () => getMissionBenchmark(this.engine.getState().scenarioId, this.engine.getActiveCustomScenario()),
        getReachablePlan: () => this.getSolution(this.engine.getState()),
        getProfile: () => structuredClone(this.profile),
        togglePreference: (key: keyof MissionPreferences) => this.cyclePreference(key),
        toggleTabletopMode: () => { this.cyclePreference('tabletopMode'); return this.profile.preferences.tabletopMode; },
        getGazeState: () => ({ sectorId: this.gazeSectorId, dwellProgress: Math.min(1, this.gazeDwellSec / 1.35), gazeAssist: this.profile.preferences.gazeAssist, tabletopMode: this.profile.preferences.tabletopMode }),
        setCameraPreset: (preset: 'HERO' | 'GLOBE' | 'CUBES' | 'CRADLE' | 'DOWNLINK' | 'DEBRIEF') => this.setCameraPreset(preset),
        pause: () => this.togglePause(),
        selectPacket: (id: string) => { this.applyAction({ type: 'SELECT_PACKET', packetId: id }); this.syncAll(); },
        inspectPacket: (id: string) => {
          const pkt = this.engine.getState().packets.find((p) => p.id === id);
          if (pkt && pkt.confidence !== 'UNVERIFIED') {
            this.tutorial.notifyCubeInspected('desktop');
            this.tutorial.syncWithMissionState(this.engine.getState(), undefined, 'desktop');
          }
        },
        cycleCube: () => { this.cycleEvidence(); },
        getRuntimeStatus: () => ({ immersive: this.world.renderer.xr.isPresenting, phase: this.engine.getState().phase, caption: this.caption }),
        getControlScreenPosition: (panelId: string, elementId: string) => {
          if (this.world.renderer.xr.isPresenting) return null;
          if (this.engine.getState().paused && elementId === 'Btn_Pause') return null;
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
          const worldPoint = point.clone();
          point.project(this.camera);
          if (Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || point.z < -1 || point.z > 1) return null;
          const bounds = this.world.renderer.domElement.getBoundingClientRect();
          const screenX = bounds.left + ((point.x + 1) * bounds.width) / 2;
          const screenY = bounds.top + ((1 - point.y) * bounds.height) / 2;

          // Occlusion check: ensure ray isn't blocked by foreground spacecraft or hardware
          const testRay = new Raycaster();
          testRay.setFromCamera(new Vector2(point.x, point.y), this.camera);
          const hits = testRay.intersectObjects([this.scene], true);
          if (hits.length > 0) {
            const firstHit = hits[0];
            let isInsidePanel = false;
            let curr: Object3D | null = firstHit.object;
            while (curr) {
              if (curr === panel) {
                isInsidePanel = true;
                break;
              }
              curr = curr.parent;
            }
            if (!isInsidePanel && firstHit.distance < this.camera.position.distanceTo(worldPoint) - 0.04) {
              return null; // Control is visually blocked by foreground object
            }
          }

          return { x: screenX, y: screenY };
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
        setSensor: (mode: SensorMode) => {
          this.applyAction({ type: 'SET_SENSOR', sensorMode: mode });
          this.syncSensorSwitchHardware(this.engine.getState().activeSensorMode);
          this.syncAll();
          return this.engine.getState();
        },
        scan: () => this.handleScan(),
        tutorial: this.tutorial,
        startTutorial: (vrMode?: boolean) => {
          if (this.engine.getState().scenarioId !== 'ORBITAL_ACADEMY') {
            this.dailyDate = null;
            this.engine.setScenario('ORBITAL_ACADEMY');
            this.handleRestartMission();
          }
          const isVr = typeof vrMode === 'boolean' ? vrMode : Boolean(this.world.renderer?.xr?.isPresenting);
          this.tutorial.start(isVr);
          this.syncAll();
          return this.tutorial.getState();
        },
        skipTutorial: () => {
          this.tutorial.skip();
          this.syncAll();
          return this.tutorial.getState();
        },
        getTutorialState: () => ({
          ...this.tutorial.getState(),
          stepSpec: this.tutorial.getCurrentStepSpec(),
        }),
        get3DTargetWorldPosition: (targetId: string) => this.get3DTargetWorldPosition(targetId),
        getXRHandTelemetryLog: () => this.getXRHandTelemetryLog(),
        clearXRHandTelemetryLog: () => this.clearXRHandTelemetryLog(),
        getActiveXRHandGrabs: () =>
          Array.from(this.activeXRHandGrabs.entries()).map(([handedness, g]) => ({
            handedness,
            slotIndex: g.slotIndex,
            packetId: g.packetId,
            cubeWorldPosition: g.cubeEntity.object3D
              ? g.cubeEntity.object3D.getWorldPosition(new Vector3()).toArray()
              : null,
          })),
        cycleCampaignOperation: () => {
          this.cycleCampaignOperation();
          return this.engine.getState();
        },
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
        startProceduralCrisis: (seed?: string | number) => this.startProceduralPass(seed),
        executeCoPilotDelegation: () => this.handleAriaDelegate(),
        getCoPilotIntervention: () => this.coPilot.getActiveIntervention(),
        getTotalDelegations: () => this.coPilot.getTotalDelegations(),
        handleMasterIgnition: () => this.handleMasterIgnition(),
        toggleSpatialHud: (active?: boolean) => this.toggleSpatialHud(active),
        getSpatialHudVisible: () => this.spatialHudVisible,
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
          this.targetFocalDistance = -0.48;
          this.globeFocalDistance = -0.48;
          const globe = this.world.getSceneObject('earth-globe');
          if (globe) {
            globe.position.z = -0.48;
          }
        },
        getDrawCalls: () => this.world.renderer.info.render.calls,
        getTriangles: () => this.world.renderer.info.render.triangles,
        getDrawCallList: () => {
          const names: string[] = [];
          this.scene.traverse((obj) => {
            if ((obj as any).isMesh || (obj as any).isLine || (obj as any).isPoints) {
              if (obj.visible) {
                let cur: Object3D | null = obj.parent;
                let allVisible = true;
                const path: string[] = [obj.name || obj.type];
                while (cur) {
                  if (!cur.visible) {
                    allVisible = false;
                    break;
                  }
                  if (cur.name) path.unshift(cur.name);
                  cur = cur.parent;
                }
                if (allVisible) {
                  names.push(path.join(' / '));
                }
              }
            }
          });
          return names;
        },
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
        /**
         * Read-only scene census for profiling (tests/profile-scenes.mjs). Counts only
         * visible renderable objects; also reports per-render-call statistics so that
         * multi-pass rendering can be distinguished from scene complexity.
         */
        getSceneProfile: () => {
          const meshes: any[] = [];
          const lights: any[] = [];
          let points = 0;
          let pointCount = 0;
          let instanced = 0;
          let instancedTriangles = 0;
          const geoms = new Set<any>();
          const mats = new Set<any>();
          const texs = new Set<any>();
          let transparentMeshes = 0;
          const isVisible = (o: any): boolean => {
            for (let p = o; p; p = p.parent) if (p.visible === false) return false;
            return true;
          };
          this.scene.traverse((o: any) => {
            if (!isVisible(o)) return;
            if (o.isLight) lights.push({ type: o.type, castShadow: !!o.castShadow });
            if (o.isPoints) {
              points++;
              pointCount += o.geometry?.attributes?.position?.count ?? 0;
            }
            if (o.isMesh || o.isLine || o.isPoints || o.isSprite) {
              meshes.push(o);
              if (o.isInstancedMesh) {
                instanced++;
                const idx = o.geometry?.index?.count ?? o.geometry?.attributes?.position?.count ?? 0;
                instancedTriangles += Math.floor(idx / 3) * (o.count ?? 0);
              }
              if (o.geometry) geoms.add(o.geometry);
              const list = Array.isArray(o.material) ? o.material : [o.material];
              let transparent = false;
              for (const m of list) {
                if (!m) continue;
                mats.add(m);
                if (m.transparent) transparent = true;
                for (const key of Object.keys(m)) {
                  const v = m[key];
                  if (v && v.isTexture) texs.add(v);
                }
              }
              if (transparent) transparentMeshes++;
            }
          });
          let textureBytes = 0;
          const textureList: any[] = [];
          texs.forEach((t: any) => {
            const img: any = t.image;
            const w = img?.width ?? img?.videoWidth ?? 0;
            const h = img?.height ?? img?.videoHeight ?? 0;
            const bytes = Math.round(w * h * 4 * (t.generateMipmaps ? 1.33 : 1));
            textureBytes += bytes;
            textureList.push({ name: t.name || t.uuid.slice(0, 6), w, h, bytes });
          });
          textureList.sort((a, b) => b.bytes - a.bytes);
          const lightSummary: Record<string, number> = {};
          for (const l of lights) lightSummary[l.type] = (lightSummary[l.type] ?? 0) + 1;
          return {
            visibleRenderables: meshes.length,
            instancedMeshes: instanced,
            instancedTriangles,
            uniqueGeometries: geoms.size,
            uniqueMaterials: mats.size,
            transparentRenderables: transparentMeshes,
            referencedTextures: texs.size,
            referencedTextureBytesApprox: textureBytes,
            topTextures: textureList.slice(0, 5),
            lights: lightSummary,
            shadowCastingLights: lights.filter((l) => l.castShadow).length,
            shadowMapEnabled: !!this.renderer.shadowMap.enabled,
            pointsObjects: points,
            pointVertices: pointCount,
            pixelRatio: this.renderer.getPixelRatio(),
            xrPresenting: !!this.renderer.xr.isPresenting,
          };
        },
        /** Top visible triangle/draw-call contributors grouped by nearest named ancestor (profiling aid). */
        getTopContributors: (limit = 15) => {
          const groups = new Map<string, { calls: number; tris: number }>();
          const isVisible = (o: any): boolean => {
            for (let p = o; p; p = p.parent) if (p.visible === false) return false;
            return true;
          };
          const labelOf = (o: any): string => {
            const chain: string[] = [];
            for (let p = o.parent; p; p = p.parent) if (p.name) chain.unshift(p.name);
            return chain.slice(0, 2).join(' > ') || o.name || o.type;
          };
          this.scene.traverse((o: any) => {
            if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite) || !isVisible(o)) return;
            const g = o.geometry;
            const verts = g?.index?.count ?? g?.attributes?.position?.count ?? 0;
            const tris = o.isMesh ? Math.floor(verts / 3) * (o.isInstancedMesh ? (o.count ?? 1) : 1) : 0;
            const key = labelOf(o);
            const e = groups.get(key) ?? { calls: 0, tris: 0 };
            e.calls += Array.isArray(o.material) ? o.material.length : 1;
            e.tris += tris;
            groups.set(key, e);
          });
          return [...groups.entries()]
            .map(([name, v]) => ({ name, ...v }))
            .sort((a, b) => b.tris - a.tris)
            .slice(0, limit);
        },
        /** Sample renderer.info over N animation frames and count render() invocations per frame. */
        sampleFrameStats: (frames = 30) =>
          new Promise<{
            frames: number;
            callsMin: number;
            callsMax: number;
            callsMedian: number;
            trisMin: number;
            trisMax: number;
            trisMedian: number;
            renderInvocationsPerFrame: number;
            autoReset: boolean;
          }>((resolve) => {
            const r: any = this.renderer;
            const origRender = r.render.bind(r);
            let invocations = 0;
            r.render = (...args: any[]) => {
              invocations++;
              return origRender(...args);
            };
            const calls: number[] = [];
            const tris: number[] = [];
            let n = 0;
            const step = () => {
              calls.push(r.info.render.calls);
              tris.push(r.info.render.triangles);
              if (++n >= frames) {
                r.render = origRender;
                const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
                resolve({
                  frames: n,
                  callsMin: Math.min(...calls),
                  callsMax: Math.max(...calls),
                  callsMedian: med(calls),
                  trisMin: Math.min(...tris),
                  trisMax: Math.max(...tris),
                  trisMedian: med(tris),
                  renderInvocationsPerFrame: invocations / n,
                  autoReset: r.info.autoReset,
                });
              } else {
                requestAnimationFrame(step);
              }
            };
            requestAnimationFrame(step);
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

    // Adopt panoramic hero cockpit perspective on startup
    this.setCameraPreset('HERO');

    // Trigger Commander ARIA-7 Opening Tactical Pass Briefing
    window.setTimeout(() => {
      this.announceActiveScenarioPassStart();
    }, 600);

    this.syncAll();
  }

  private announceActiveScenarioPassStart(): void {
    const st = this.engine.getState();
    const sc = this.engine.getActiveScenario();
    if (st.scenarioId === 'STANDARD_INDUS_PASS') {
      this.voiceCommander?.trigger('PASS_START');
    } else {
      this.voiceCommander?.speakDirect(
        `Orbit Zero online. ${sc.operationCode ?? sc.name} active. ${st.power} Watt-hours and ${st.maxStorage} Storage Units ready. Select a priority sector on the globe.`,
        `[ARIA-7] ${sc.operationCode ?? sc.name} [SIMULATED]. ${st.power} Wh / ${st.maxStorage} STR online. Select sector on globe.`,
        'HIGH',
      );
    }
  }

  private syncDeskPadsForXR(isImmersive: boolean): void {
    const deskPadIds = [
      'pad-fire-swath',
      'pad-toggle-sensor',
      'pad-process-cradle',
      'pad-queue-downlink',
      'pad-commit-downlink',
      'pad-discard-chute',
      'pad-recenter-desk',
      'pad-master-power',
      'pad-aria-delegate',
    ];
    for (const id of deskPadIds) {
      const obj = this.world.getSceneObject(id);
      if (!obj) continue;
      obj.visible = isImmersive;
      if (isImmersive) {
        let keptPrimaryMesh = false;
        obj.traverse((child) => {
          if (child instanceof Mesh) {
            if (!keptPrimaryMesh) {
              child.visible = true;
              keptPrimaryMesh = true;
            } else {
              child.visible = false;
            }
          }
        });
      }
    }
  }

  update(delta: number): void {
    this.syncDeskPadsForXR(this.world.renderer.xr.isPresenting);
    this.updateXRHandInteractions(delta);
    this.frameSnapshot = this.engine.getState();
    if (this.frameSnapshot.paused) return;
    const simulationDelta = Math.max(0, delta);
    if (this.frameSnapshot.phase !== 'DEBRIEF') this.missionElapsedTime += simulationDelta;
    delta = Math.min(simulationDelta, 0.1);
    const reducedMotion = this.profile.preferences.reducedMotion;
    if (!reducedMotion && !this.reviewState) this.elapsedTime += delta;

    // RC10: Update Earth Enhancements (storm rotation and lightning pulses)
    this.enhancementAnimationTime += delta;
    if (this.earthGlobeEnhancements) {
      updateEarthEnhancementsOptimized(this.earthGlobeEnhancements as Group, delta, this.enhancementAnimationTime);
    }

    this.animateCubeTransitions(delta);

    // Deep Agentic Co-Pilot Telemetry & Spatial Delegation Loop
    const intervention = this.coPilot.update(delta);
    const gaugesAsset = this.world.getSceneObject('desk-gauges');
    if (gaugesAsset) {
      const beaconCap = gaugesAsset.getObjectByName('AriaBeaconCap');
      if (beaconCap && beaconCap instanceof Mesh && beaconCap.material instanceof MeshStandardMaterial) {
        if (intervention) {
          const pulse = 1.0 + 0.65 * Math.sin(this.elapsedTime * 9.0);
          beaconCap.material.emissiveIntensity = pulse * 2.2;
          beaconCap.material.emissive.setHex(intervention.urgency === 'CRITICAL' ? 0xf59e0b : 0x38bdf8);
        } else {
          beaconCap.material.emissiveIntensity = 0.5;
          beaconCap.material.emissive.setHex(0x0284c7);
        }
      }
    }

    // Phase 5: In-Engine VR Hand & Ergonomic Simulator
    if (this.frameSnapshot && this.frameSnapshot.phase === 'OPERATIONS') {
      const solution = this.getSolution(this.frameSnapshot);
      const next = getNextPlanAction(this.frameSnapshot, solution);
      if (next) {
        if (next.type === 'SCAN') {
          if (this.frameSnapshot.selectedSectorId !== next.sectorId) {
            const beaconObj = this.world.getSceneObject(`sector-${next.sectorId.toLowerCase()}`);
            if (beaconObj) {
              const pos = new Vector3();
              beaconObj.getWorldPosition(pos);
              this.vrHandSimulator.setDemoTarget(pos);
            }
          } else if (this.frameSnapshot.activeSensorMode !== next.sensorMode) {
            const switchObj = this.world.getSceneObject('pad-toggle-sensor');
            if (switchObj) {
              const pos = new Vector3();
              switchObj.getWorldPosition(pos);
              this.vrHandSimulator.setDemoTarget(pos);
            }
          } else {
            const plungerObj = this.world.getSceneObject('pad-fire-swath');
            if (plungerObj) {
              const pos = new Vector3();
              plungerObj.getWorldPosition(pos);
              this.vrHandSimulator.setDemoTarget(pos);
            }
          }
        } else if (next.type === 'PROCESS') {
          const cradleObj = this.world.getSceneObject('pad-process-cradle');
          if (cradleObj) {
            const pos = new Vector3();
            cradleObj.getWorldPosition(pos);
            this.vrHandSimulator.setDemoTarget(pos);
          }
        } else if (next.type === 'QUEUE') {
          const bayObj = this.world.getSceneObject('pad-queue-downlink');
          if (bayObj) {
            const pos = new Vector3();
            bayObj.getWorldPosition(pos);
            this.vrHandSimulator.setDemoTarget(pos);
          }
        }
      } else if (this.frameSnapshot.queuePacketIds.length > 0) {
        const leverObj = this.world.getSceneObject('pad-commit-downlink');
        if (leverObj) {
          const pos = new Vector3();
          leverObj.getWorldPosition(pos);
          this.vrHandSimulator.setDemoTarget(pos);
        }
      } else {
        this.vrHandSimulator.setDemoTarget(null);
      }
    } else {
      this.vrHandSimulator.setDemoTarget(null);
    }
    this.vrHandSimulator.update(delta, this.desktopControls?.getInteractionTargetPoint() ?? null);

    // Desktop Controls frame update (inertial spinning, slerp animations)
    this.desktopControls?.update(delta);

    // Gaze-assisted target acquisition & hands-free dwell selection
    if (this.profile.preferences.gazeAssist && this.frameSnapshot.phase === 'OPERATIONS' && !this.isAnyObjectGrabbed()) {
      const headPos = this.camera.getWorldPosition(this.tempVec);
      const headDir = this.camera.getWorldDirection(this.tempDirection);
      let closestGazedSector: SectorId | null = null;
      let minAngle = 0.22; // ~12.6 degrees cone

      for (const sectorEntity of this.queries.sectors.entities) {
        const sObj = sectorEntity.object3D;
        if (!sObj || !isVisible(sObj)) continue;
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
    const vibratingDesk = this.world.getSceneObject('orbital-console')?.getObjectByName('ConsoleDeskAssembly');
    if (vibratingDesk) vibratingDesk.position.x = 0;
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

          // Diegetic console vibration pulse during button press (never camera)
          if (vibratingDesk && progress < 0.5) {
            const vibration = Math.sin(progress * Math.PI * 8) * 0.003;
            vibratingDesk.position.x += vibration;
          }
        } else {
          cap.position.y = restY;
          this.padPressTimers.delete(padId);
          this.audio.playMechanicalSwitchClick(false);
        }
      } else if (newTimer <= 0) {
        this.padPressTimers.delete(padId);
      }
    }

    // Phase 3 SPRINT 3: Data Cube Internal State Visuals & Compression Animation
    for (const pkt of this.frameSnapshot.packets) {
      const cubeEntity = [...this.queries.cubes.entities].find((e) =>
        e.getValue(EvidenceCubeNode, 'packetId') === pkt.id
      );
      if (cubeEntity?.object3D) {
        const cubeRoot = cubeEntity.object3D;

        // Update cube internal glow based on confidence state
        let cubeGlowColor = 0xffffff;
        if (pkt.confidence === 'CONFIRMED') {
          cubeGlowColor = 0x00ff66; // Emerald glow
        } else if (pkt.confidence === 'PROBABLE') {
          cubeGlowColor = pkt.sensorMode === 'RADAR' ? 0xffb800 : 0xff2a54; // Amber/crimson glitch
        } else if (pkt.confidence === 'UNVERIFIED') {
          cubeGlowColor = 0xc0c0c0; // Dimmed gray
        }

        const glowCore = cubeRoot.getObjectByName('CubeGlowCore');
        if (glowCore && glowCore instanceof Mesh && glowCore.material instanceof MeshStandardMaterial) {
          glowCore.material.emissive.setHex(cubeGlowColor);
          glowCore.material.emissiveIntensity = pkt.confidence === 'PROBABLE' ?
            0.8 + 0.4 * Math.sin(this.elapsedTime * 6) : 1.2; // Pulsing for PROBABLE
        }

        // Animate 30% compression shrink when processed in cradle (4.5s → 1.8s transmission)
        if (!this.cubeInteractions.isHeld(cubeRoot)) {
          if (pkt.processed && !pkt.queued) {
            const compressionProgress = Math.min(1, this.elapsedTime * 1.8);
            cubeRoot.scale.lerp(new Vector3(0.72, 0.72, 0.72), compressionProgress * 0.4);
          } else {
            cubeRoot.scale.lerp(new Vector3(1, 1, 1), 0.2);
          }
        }
      }
    }

    // Phase 3: Diegetic 3D Segmented Arc Gauges Update (Battery, Storage, Karachi Window)
    const deskGauges = this.world.getSceneObject('desk-gauges');
    if (deskGauges && this.frameSnapshot) {
      const state = this.frameSnapshot;
      const cUnlit = MissionControlSystem.GAUGE_COLOR_UNLIT;
      const cCyan = MissionControlSystem.GAUGE_COLOR_CYAN;
      const cAmber = MissionControlSystem.GAUGE_COLOR_AMBER;
      const cRed = MissionControlSystem.GAUGE_COLOR_RED;
      const mats = deskGauges.userData.materials;

      // 1. Battery Gauge (10 segments into 1 InstancedMesh)
      const battInst = deskGauges.getObjectByName('BatteryGaugeInstanced');
      const litBattSegs = Math.max(0, Math.min(10, Math.ceil((state.power / 55) * 10)));
      if (battInst instanceof InstancedMesh) {
        const battColor = state.power > 44 ? cCyan : state.power >= 20 ? cAmber : cRed;
        for (let i = 0; i < 10; i++) {
          battInst.setColorAt(i, i < litBattSegs ? battColor : cUnlit);
        }
        if (battInst.instanceColor) battInst.instanceColor.needsUpdate = true;
      } else if (mats) {
        const battMat = state.power > 44 ? mats.cyan : state.power >= 20 ? mats.amber : mats.red;
        for (let i = 0; i < 10; i++) {
          const seg = deskGauges.getObjectByName(`GaugeBattSeg_${i}`);
          if (seg instanceof Mesh) seg.material = i < litBattSegs ? battMat : mats.unlit;
        }
      }

      // 2. Solid-State Storage Buffer Gauge (9 segments into 1 InstancedMesh)
      const storageInst = deskGauges.getObjectByName('StorageGaugeInstanced');
      const litStorageSegs = Math.max(0, Math.min(9, Math.ceil(state.storageUsed)));
      if (storageInst instanceof InstancedMesh) {
        for (let i = 0; i < 9; i++) {
          storageInst.setColorAt(i, i < litStorageSegs ? cAmber : cUnlit);
        }
        if (storageInst.instanceColor) storageInst.instanceColor.needsUpdate = true;
      } else if (mats) {
        for (let i = 0; i < 9; i++) {
          const seg = deskGauges.getObjectByName(`GaugeStorageSeg_${i}`);
          if (seg instanceof Mesh) seg.material = i < litStorageSegs ? mats.amber : mats.unlit;
        }
      }

      // 3. Karachi Contact Window Gauge (10 segments into 1 InstancedMesh)
      const windowInst = deskGauges.getObjectByName('WindowGaugeInstanced');
      const queuedPackets = state.packets.filter((p) => state.queuePacketIds.includes(p.id));
      const totalTxSec = queuedPackets.reduce((acc, p) => acc + p.transmitSec, 0);
      const isOverflow = totalTxSec > state.downlinkWindowSec;
      const litWinSegs = Math.max(0, Math.min(10, Math.ceil(totalTxSec)));
      const flashRed = isOverflow && Math.sin(this.elapsedTime * 14) > 0;
      if (windowInst instanceof InstancedMesh) {
        const winColor = flashRed ? cRed : totalTxSec <= 8 ? cCyan : cAmber;
        for (let i = 0; i < 10; i++) {
          windowInst.setColorAt(i, i < litWinSegs ? winColor : cUnlit);
        }
        if (windowInst.instanceColor) windowInst.instanceColor.needsUpdate = true;
      } else if (mats) {
        const winMat = flashRed ? mats.red : totalTxSec <= 8 ? mats.cyan : mats.amber;
        for (let i = 0; i < 10; i++) {
          const seg = deskGauges.getObjectByName(`GaugeWindowSeg_${i}`);
          if (seg instanceof Mesh) seg.material = i < litWinSegs ? winMat : mats.unlit;
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
      // Circular Holographic War Table Radar Sweep Blade
      const sweepBlade = orbitalConsole.getObjectByName('TacticalRadarSweepBlade');
      if (sweepBlade) {
        sweepBlade.rotation.z += (reducedMotion ? 0 : delta) * 0.95;
      }
      // Floating 3D Flood Inundation Hologram (Subtle hover & pulse)
      const floodHolo = orbitalConsole.getObjectByName('FloodInundationHoloRelief');
      if (floodHolo) {
        floodHolo.position.y = 0.24 + Math.sin(this.elapsedTime * 2.0) * 0.008;
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

      // Animate 3D Audio Spectrum Waveform bars beside ARIA's head (Concept Image 1 Match - InstancedMesh)
      const waveformObj = avatarObj.getObjectByName('AriaWaveform3D');
      if (waveformObj) {
        const instancedBars = waveformObj.getObjectByName('AriaWaveformInstancedBars');
        if (instancedBars instanceof InstancedMesh) {
          for (let i = 0; i < 20; i++) {
            const baseH = 0.016 + 0.052 * Math.sin((i / 19) * Math.PI);
            const wave = metrics.isSpeaking
              ? 0.4 + 0.6 * Math.abs(Math.sin(this.elapsedTime * 14 + i * 0.85)) * metrics.intensity
              : 0.2 + 0.12 * Math.sin(this.elapsedTime * 2.5 + i * 0.4);
            const scaleY = Math.max(0.25, wave * 2.4);
            this.tempObj.position.set(i * 0.011, 0, 0);
            this.tempObj.rotation.set(0, 0, 0);
            this.tempObj.scale.set(1.0, baseH * scaleY, 1.0);
            this.tempObj.updateMatrix();
            instancedBars.setMatrixAt(i, this.tempObj.matrix);
          }
          instancedBars.instanceMatrix.needsUpdate = true;
        } else {
          for (let i = 0; i < 18; i++) {
            const bar = waveformObj.getObjectByName(`AriaWaveBar_${i}`);
            if (bar) {
              const wave = metrics.isSpeaking
                ? 0.4 + 0.6 * Math.abs(Math.sin(this.elapsedTime * 14 + i * 0.85)) * metrics.intensity
                : 0.2 + 0.12 * Math.sin(this.elapsedTime * 2.5 + i * 0.4);
              bar.scale.y = Math.max(0.25, wave * 2.4);
            }
          }
        }
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

      // VR-BUG-02 Fix: Keep all 6 interactive sector beacons (sector-a..f) locked to Earth Globe rotation & zoom
      globe.updateMatrixWorld(true);
      for (const sectorEntity of this.queries.sectors.entities) {
        const sObj = sectorEntity.object3D;
        if (!sObj || !isVisible(sObj)) continue;
        const sId = (sectorEntity.getValue(OrbitSectorNode, 'sectorId') || 'B') as SectorId;
        const sDef = SECTOR_GEO_DEFINITIONS[sId];
        if (!sDef) continue;
        const localPos = latLonToGlobePoint(sDef.centerLatLon[0], sDef.centerLatLon[1], GLOBE_RADIUS * 1.002);
        const worldPos = localPos.clone().applyMatrix4(globe.matrixWorld);
        sObj.position.copy(worldPos);
        const worldNormal = localPos.clone().normalize().applyQuaternion(globe.quaternion).normalize();
        sObj.quaternion.setFromUnitVectors(this.worldUp, worldNormal);
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

      // Update & animate cinematic targeting reticle on globe surface (Concept Image 2)
      const activeReticle = globe.getObjectByName('ActiveSectorReticleGroup');
      if (activeReticle) {
        const hasSelected = this.desktopControls?.hasSelectedSector() ?? true;
        activeReticle.visible = hasSelected;
        if (hasSelected) {
          const sectorDef = SECTOR_GEO_DEFINITIONS[selectedId];
          if (sectorDef) {
            const reticlePos = latLonToGlobePoint(
              sectorDef.centerLatLon[0],
              sectorDef.centerLatLon[1],
              GLOBE_RADIUS * 1.018,
            );
            activeReticle.position.copy(reticlePos);
            const normal = reticlePos.clone().normalize();
            activeReticle.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), normal);
            const pulseScale = 1.0 + 0.06 * Math.sin(this.elapsedTime * 4.0);
            activeReticle.scale.set(pulseScale, pulseScale, pulseScale);
          }
        }
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
            const beamHex =
              this.scanBeamMode === 'OPTICAL'
                ? 0x38bdf8
                : this.scanBeamMode === 'THERMAL'
                  ? 0xff6b2b
                  : 0xf59e0b;

            swathCone.material.color.setHex(beamHex);
            swathCone.material.opacity = opacity;
            swathCone.visible = true;
          } else {
            // Swath cone is only visible during active pulse scan
            swathCone.visible = false;
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

      // Starboard (Right) Window Flight Locus (Concept Images 1 & 2):
      // Satellite cruises comfortably inside the right window without obscuring the central Earth globe
      const satBaseX = 0.70;
      const satBaseY = 1.28;
      const satBaseZ = -0.96;
      const bobTime = this.elapsedTime * (reducedMotion ? 0.3 : 0.65);
      const satX = satBaseX + Math.sin(bobTime * 0.5) * 0.04;
      const satY = satBaseY + Math.cos(bobTime * 0.8) * 0.025;
      const satZ = satBaseZ + Math.cos(bobTime * 0.5) * 0.035;
      cubesat.position.set(satX, satY, satZ);

      // Attitude: Tilted gracefully displaying gold Kapton foil, solar arrays, and communications antenna
      cubesat.rotation.set(
        0.18 + Math.sin(bobTime * 0.4) * 0.05,
        -0.62 + Math.cos(bobTime * 0.3) * 0.06,
        -0.12 + Math.sin(bobTime * 0.6) * 0.04,
      );
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
              : this.engine.getState().activeSensorMode === 'THERMAL'
                ? 0xff6b2b
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
            if (!sObj || !isVisible(sObj)) continue;
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
        // Play tension heartbeat audio during final 3 seconds
        const remainingSec = nextState.downlinkRemainingSec;
        if (remainingSec <= 3 && remainingSec > 0) {
          this.audio.playTensionHeartbeat();
        }
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
          if (this.tutorial.getState().active) {
            this.tutorial.syncWithMissionState(
              nextState,
              { type: 'TICK' },
              this.world.renderer.xr.isPresenting ? 'xr-hand' : 'desktop',
            );
          }
          this.playCue('HANDSHAKE_CONFIRM');
          if (nextState.debrief && nextState.debrief.totalScore >= nextState.debrief.achievableScore) {
            this.playCue('OPTIMAL_VICTORY');
            this.audio.playSuccessFanfare();

            // ZERO PACKET LOSS achievement if all 3 packets transmitted
            if (nextState.debrief.transmittedPacketIds.length === 3) {
              this.desktopControls?.triggerAchievement('🛰️ ZERO PACKET LOSS', 'All 3 Verified Packets Delivered', '✨');
            }

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
              !this.cubeInteractions.isHeld(activeCubeEntity.object3D)
            ) {
              const obj = activeCubeEntity.object3D;
              const basePos = activePkt.queueIndex !== null ? this.cubeStationPosition('QUEUE', activePkt.queueIndex) : null;
              if (basePos) {
                setWorldPosition(obj, basePos.add(new Vector3(0, reducedMotion ? 0 : 0.018, 0)));
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

          // Phase 5: Space-to-Ground Downlink Telemetry Beam & Karachi Ground Station Lock (Stylized S-Band Carrier Link Visualization)
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
        color =
          next.sensorMode === 'RADAR'
            ? 0xfbbf24
            : next.sensorMode === 'THERMAL'
              ? 0xff6b2b
              : 0x38bdf8;
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
        skyDome.material.color.setHex(0x223555);
        skyDome.material.opacity = 0.42;
        skyDome.material.needsUpdate = true;
      }
    }

    const earthAlbedoTex = AssetManager.getTexture('earth-albedo-tex');
    const earthNormalTex = AssetManager.getTexture('earth-normal-tex');
    const earthSpecTex = AssetManager.getTexture('earth-specular-tex');
    const planetVista = consoleObj.getObjectByName('StarboardPlanetaryHorizonVista');
    if (planetVista instanceof Mesh && (planetVista.material instanceof MeshStandardMaterial || planetVista.material instanceof MeshBasicMaterial)) {
      if (earthAlbedoTex) {
        earthAlbedoTex.colorSpace = SRGBColorSpace;
        earthAlbedoTex.needsUpdate = true;
        planetVista.material.map = earthAlbedoTex;
        if (planetVista.material instanceof MeshStandardMaterial) {
          if (earthNormalTex) planetVista.material.normalMap = earthNormalTex;
          if (earthSpecTex) planetVista.material.roughnessMap = earthSpecTex;
        }
        planetVista.material.color.setHex(0xffffff);
        planetVista.material.opacity = 1.0;
        planetVista.material.needsUpdate = true;
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

  private recordXRHandEvent(
    entry: Omit<XRHandTelemetryEvent, 'timestampMs' | 'missionElapsedSec'>,
  ): void {
    this.xrHandEventLog.push({
      timestampMs: Date.now(),
      missionElapsedSec: Number(this.missionElapsedTime.toFixed(3)),
      ...entry,
    });
    if (this.xrHandEventLog.length > 500) {
      this.xrHandEventLog.shift();
    }
  }

  public getXRHandTelemetryLog(): XRHandTelemetryEvent[] {
    return this.xrHandEventLog.map((e) => ({
      ...e,
      position: [...e.position] as [number, number, number],
      indexTipPosition: [...e.indexTipPosition] as [number, number, number],
      graspPosition: [...e.graspPosition] as [number, number, number],
    }));
  }

  public clearXRHandTelemetryLog(): void {
    this.xrHandEventLog = [];
  }

  private toVec3Tuple(v: Vector3): [number, number, number] {
    return [
      Number(v.x.toFixed(4)),
      Number(v.y.toFixed(4)),
      Number(v.z.toFixed(4)),
    ];
  }

  private syncGlobeSectorBeaconPositions(): void {
    const globe = this.world.getSceneObject('earth-globe');
    if (!globe) return;
    globe.updateMatrixWorld(true);
    for (const sectorEntity of this.queries.sectors.entities) {
      const sObj = sectorEntity.object3D;
      if (!sObj || !isVisible(sObj)) continue;
      const sId = (sectorEntity.getValue(OrbitSectorNode, 'sectorId') || 'B') as SectorId;
      const sDef = SECTOR_GEO_DEFINITIONS[sId];
      if (!sDef) continue;
      const localPos = latLonToGlobePoint(
        sDef.centerLatLon[0],
        sDef.centerLatLon[1],
        GLOBE_RADIUS * 1.002,
      );
      const worldPos = localPos.clone().applyMatrix4(globe.matrixWorld);
      sObj.position.copy(worldPos);
      const worldNormal = localPos
        .clone()
        .normalize()
        .applyQuaternion(globe.quaternion)
        .normalize();
      sObj.quaternion.setFromUnitVectors(this.worldUp, worldNormal);
      sObj.updateMatrixWorld(true);
    }
  }

  private getSpatialButtonWorldPosition(
    panelId: string,
    buttonId: string,
  ): Vector3 | null {
    const panel = this.world.getSceneObject<UIKitMLAsset>(panelId);
    if (!panel || !panel.visible) return null;
    const element = panel.getElementById<UIKit.Container>(buttonId);
    if (!element) return null;

    panel.updateMatrixWorld(true);
    const matrix = (element as any)?.globalMatrix?.value;
    const rootComp = (element as any)?.root?.value?.component;
    if (matrix && rootComp) {
      rootComp.parent?.updateWorldMatrix(true, false);
      rootComp.updateMatrix();
      const pt = new Vector3()
        .setFromMatrixPosition(matrix)
        .applyMatrix4(rootComp.matrix);
      if (rootComp.parent) pt.applyMatrix4(rootComp.parent.matrixWorld);
      if (pt.lengthSq() > 0.001) {
        return pt;
      }
    }

    // Deterministic fallback inside panel world space if UIKit layout matrix has not ticked yet
    const fallbackOffsets: Record<string, [number, number, number]> = {
      Btn_StartTutorial: [-0.08, -0.18, 0.02],
      Btn_SelectCampaign: [0.08, -0.18, 0.02],
      Btn_CycleSector: [-0.12, -0.10, 0.02],
      Btn_ToggleSensor: [0.0, -0.10, 0.02],
      Btn_ScanSector: [0.12, -0.10, 0.02],
      Btn_CalibrateSeat: [0.0, -0.24, 0.02],
      'xr-button': [-0.08, -0.24, 0.02],
      'exit-button': [0.08, -0.24, 0.02],
      Btn_ProcessCube: [-0.12, -0.12, 0.02],
      Btn_QueueCube: [0.0, -0.12, 0.02],
      Btn_DiscardCube: [0.12, -0.12, 0.02],
      Btn_CycleCube: [-0.10, -0.20, 0.02],
      Btn_Pause: [0.0, -0.20, 0.02],
      Btn_Settings: [0.10, -0.20, 0.02],
      Btn_ReorderQueue: [-0.12, -0.16, 0.02],
      Btn_CommitDownlink: [0.0, -0.16, 0.02],
      Btn_RestartMission: [-0.10, -0.22, 0.02],
      Btn_NextMission: [0.10, -0.22, 0.02],
      Btn_DailyPass: [-0.10, -0.26, 0.02],
      Btn_ReplayDecision: [0.10, -0.26, 0.02],
    };
    const panelCenter = panel.getWorldPosition(new Vector3());
    const off = fallbackOffsets[buttonId] ?? [0, 0, 0.02];
    const worldOffset = new Vector3(off[0], off[1], off[2]).applyQuaternion(
      panel.getWorldQuaternion(new Quaternion()),
    );
    return panelCenter.add(worldOffset);
  }

  public get3DTargetWorldPosition(
    targetId: string,
  ): { x: number; y: number; z: number } | null {
    this.syncGlobeSectorBeaconPositions();

    const stationIds: Record<string, [CubeDropTarget['kind'], number]> = {
      PROCESS_CRADLE: ['PROCESS', 0], DISCARD_CHUTE: ['DISCARD', 0],
      DOWNLINK_BAY: ['QUEUE', 0], DOWNLINK_SLOT_1: ['QUEUE', 0], DOWNLINK_SLOT_2: ['QUEUE', 1], DOWNLINK_SLOT_3: ['QUEUE', 2],
      RAW_TRAY_1: ['RAW_TRAY', 0], RAW_TRAY_2: ['RAW_TRAY', 1], RAW_TRAY_3: ['RAW_TRAY', 2],
    };
    const station = stationIds[targetId];
    if (station) {
      const { x, y, z } = this.cubeStationPosition(...station);
      return { x, y, z };
    }
    if (targetId === 'GLOBE_GIMBAL') {
      return { x: 0.0, y: 1.08, z: -0.42 };
    }
    if (targetId.includes(':')) {
      const [panelId, buttonId] = targetId.split(':');
      const btnPos = this.getSpatialButtonWorldPosition(panelId, buttonId);
      return btnPos ? { x: btnPos.x, y: btnPos.y, z: btnPos.z } : null;
    }

    const obj = this.world.getSceneObject(targetId);
    if (!obj) return null;
    obj.updateWorldMatrix(true, false);
    const pos = obj.getWorldPosition(new Vector3());
    return { x: pos.x, y: pos.y, z: pos.z };
  }

  private sampleLiveXRHandState(
    handedness: 'left' | 'right',
  ): LiveXRHandSample | null {
    const xr = this.world.renderer.xr;
    return this.nativeHands.sample(
      handedness, xr.getSession(), xr.getFrame(), xr.getReferenceSpace(), this.player,
    );
  }

  private resolve3DTargetForHand(
    sample: LiveXRHandSample,
    preferredTargetId?: string,
  ): Resolved3DHandTarget | null {
    this.syncGlobeSectorBeaconPositions();

    const pointToRay = (targetPos: Vector3) => {
      const toTarget = targetPos.clone().sub(sample.indexTip);
      const alongRay = toTarget.dot(sample.fingerDir);
      if (alongRay <= 0) {
        return { alongRay, perpDist: Infinity };
      }
      const closestOnRay = sample.indexTip
        .clone()
        .addScaledVector(sample.fingerDir, alongRay);
      return {
        alongRay,
        perpDist: targetPos.distanceTo(closestOnRay),
      };
    };

    const candidates: Resolved3DHandTarget[] = [];
    const isPointPose = sample.poseId === 'point' || !sample.pressed;

    // 1. Check 3D Evidence Data Cubes for near-hand pinch-grab (< 7.5 cm in pinch pose, < 4.5 cm in point pose)
    const cubeThreshold = isPointPose ? 0.055 : 0.085;
    for (const cubeEntity of this.queries.cubes.entities) {
      const obj = cubeEntity.object3D;
      if (!obj || !isVisible(obj) || this.cubeInteractions.isHeld(obj)) continue;
      const slotIndex = cubeEntity.getValue(EvidenceCubeNode, 'slotIndex') ?? 0;
      if (!this.engine.getState().packets[slotIndex]) continue;
      obj.updateWorldMatrix(true, false);
      const cubePos = obj.getWorldPosition(new Vector3());
      const dist = sample.graspPoint.distanceTo(cubePos);
      if (dist <= cubeThreshold) {
        candidates.push({
          targetType: 'DATA_CUBE',
          targetId: `evidence-cube-${slotIndex + 1}`,
          distance: dist,
          worldPosition: cubePos,
          cubeEntity,
          slotIndex,
        });
      }
    }

    // 2. Check 3D Sector Beacons on the Earth Globe (near fingertip < 9.5 cm or pointed ray)
    for (const sectorEntity of this.queries.sectors.entities) {
      const sObj = sectorEntity.object3D;
      if (!sObj || !isVisible(sObj)) continue;
      const sectorId = (sectorEntity.getValue(OrbitSectorNode, 'sectorId') ||
        'B') as SectorId;
      const sPos = sObj.getWorldPosition(new Vector3());
      const directDist = Math.min(
        sample.indexTip.distanceTo(sPos),
        sample.graspPoint.distanceTo(sPos),
      );
      const rayInfo = pointToRay(sPos);
      const effectiveDist =
        directDist <= 0.095
          ? directDist
          : isPointPose &&
            rayInfo.alongRay > 0 &&
            rayInfo.alongRay <= 0.75 &&
            rayInfo.perpDist <= 0.055
            ? rayInfo.perpDist + 0.02
            : Infinity;

      if (effectiveDist < Infinity) {
        candidates.push({
          targetType: 'SECTOR',
          targetId: `sector-${sectorId.toLowerCase()}`,
          distance: effectiveDist,
          worldPosition: sPos,
          sectorId,
        });
      }
    }

    // 3. Check 3D Console Control Pads (< 9.5 cm direct or pointed ray)
    const padNodes: Array<{ id: string; action: string }> = [
      { id: 'pad-fire-swath', action: 'SCAN' },
      { id: 'pad-toggle-sensor', action: 'TOGGLE_SENSOR' },
      { id: 'pad-process-cradle', action: 'PROCESS' },
      { id: 'pad-queue-downlink', action: 'QUEUE' },
      { id: 'pad-commit-downlink', action: 'COMMIT_DOWNLINK' },
      { id: 'pad-discard-chute', action: 'DISCARD' },
      { id: 'pad-recenter-desk', action: 'RECENTER' },
      { id: 'pad-master-power', action: 'MASTER_POWER' },
      { id: 'pad-aria-delegate', action: 'ARIA_DELEGATE' },
      { id: 'avatar-aria', action: 'ARIA_DELEGATE' },
    ];
    for (const pad of padNodes) {
      const obj = this.world.getSceneObject(pad.id);
      if (!obj) continue;
      obj.updateWorldMatrix(true, false);
      const pPos = obj.getWorldPosition(new Vector3());
      const directDist = Math.min(
        sample.indexTip.distanceTo(pPos),
        sample.graspPoint.distanceTo(pPos),
      );
      const rayInfo = pointToRay(pPos);
      const effectiveDist =
        directDist <= 0.095
          ? directDist
          : isPointPose &&
            rayInfo.alongRay > 0 &&
            rayInfo.alongRay <= 0.85 &&
            rayInfo.perpDist <= 0.055
            ? rayInfo.perpDist + 0.02
            : Infinity;
      if (effectiveDist < Infinity) {
        candidates.push({
          targetType: 'CONTROL_PAD',
          targetId: pad.id,
          distance: effectiveDist,
          worldPosition: pPos,
          controlAction: pad.action,
        });
      }
    }

    // 4. Check 3D Spatial UIKitML Panel Buttons (direct fingertip proximity < 14 cm or pointed ray < 7.5 cm)
    const panelButtons: Array<{ panelId: string; buttonId: string }> = [
      { panelId: 'briefing-panel', buttonId: 'Btn_StartTutorial' },
      { panelId: 'briefing-panel', buttonId: 'Btn_SelectCampaign' },
      { panelId: 'briefing-panel', buttonId: 'Btn_CycleSector' },
      { panelId: 'briefing-panel', buttonId: 'Btn_ToggleSensor' },
      { panelId: 'briefing-panel', buttonId: 'Btn_ScanSector' },
      { panelId: 'briefing-panel', buttonId: 'Btn_CalibrateSeat' },
      { panelId: 'briefing-panel', buttonId: 'exit-button' },
      { panelId: 'briefing-panel', buttonId: 'xr-button' },
      { panelId: 'telemetry-hud', buttonId: 'Btn_Pause' },
      { panelId: 'telemetry-hud', buttonId: 'Btn_ProcessCube' },
      { panelId: 'telemetry-hud', buttonId: 'Btn_QueueCube' },
      { panelId: 'telemetry-hud', buttonId: 'Btn_DiscardCube' },
      { panelId: 'telemetry-hud', buttonId: 'Btn_CycleCube' },
      { panelId: 'telemetry-hud', buttonId: 'Btn_Settings' },
      { panelId: 'debrief-panel', buttonId: 'Btn_CommitDownlink' },
      { panelId: 'debrief-panel', buttonId: 'Btn_RestartMission' },
      { panelId: 'debrief-panel', buttonId: 'Btn_NextMission' },
      { panelId: 'debrief-panel', buttonId: 'Btn_ReorderQueue' },
      { panelId: 'debrief-panel', buttonId: 'Btn_DailyPass' },
      { panelId: 'debrief-panel', buttonId: 'Btn_ReplayDecision' },
    ];
    for (const pb of panelButtons) {
      const btnPos = this.getSpatialButtonWorldPosition(pb.panelId, pb.buttonId);
      if (!btnPos) continue;
      const directDist = Math.min(
        sample.indexTip.distanceTo(btnPos),
        sample.graspPoint.distanceTo(btnPos),
      );
      const rayInfo = pointToRay(btnPos);
      const effectiveDist =
        directDist <= 0.14
          ? directDist
          : rayInfo.alongRay > 0 &&
            rayInfo.alongRay <= 1.45 &&
            rayInfo.perpDist <= 0.075
            ? rayInfo.perpDist + 0.03
            : Infinity;
      if (effectiveDist < Infinity) {
        candidates.push({
          targetType: 'SPATIAL_UI_BUTTON',
          targetId: `${pb.panelId}:${pb.buttonId}`,
          distance: effectiveDist,
          worldPosition: btnPos,
          panelId: pb.panelId,
          buttonId: pb.buttonId,
        });
      }
    }

    if (candidates.length === 0) return null;
    const preferred = candidates.find((target) => target.targetId === preferredTargetId);
    if (preferred) return preferred;
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0];
  }

  private bindXRSessionHandEvents(): void {
    const session = (this.world.renderer?.xr as any)?.getSession?.();
    if (!session || this.boundXRSession === session) return;
    this.boundXRSession = session;

    const onSelectStart = (event: XRInputSourceEvent) => this.nativeHands.setSelect(event.inputSource, true);
    const onSelectEnd = (event: XRInputSourceEvent) => this.nativeHands.setSelect(event.inputSource, false);
    const onInputSourcesChange = (event: XRInputSourcesChangeEvent) => {
      for (const source of event.removed) {
        if (source.hand && (source.handedness === 'left' || source.handedness === 'right')) {
          this.handleXRHandTrackingLost(source.handedness);
        }
      }
    };
    const onEnd = () => {
      for (const side of ['left', 'right'] as const) this.handleXRHandTrackingLost(side);
      this.forceReleaseAllGrabs();
      this.nativeHands.reset();
      this.boundXRSession = null;
      this.syncAll();
    };

    session.addEventListener('selectstart', onSelectStart);
    session.addEventListener('selectend', onSelectEnd);
    session.addEventListener('inputsourceschange', onInputSourcesChange);
    session.addEventListener('end', onEnd);
    this.cleanupFuncs.push(() => {
      session.removeEventListener('selectstart', onSelectStart);
      session.removeEventListener('selectend', onSelectEnd);
      session.removeEventListener('inputsourceschange', onInputSourcesChange);
      session.removeEventListener('end', onEnd);
    });
  }

  private handleXRHandPressStart(
    sample: LiveXRHandSample,
    viaEvent: 'selectstart' | 'pinch_threshold' | 'poke',
  ): void {
    const hover = this.handHoverTargets.get(sample.handedness);
    const latched = hover && performance.now() - hover.time <= 250 && Math.min(
      hover.sample.position.distanceTo(sample.position),
      hover.sample.indexTip.distanceTo(sample.indexTip),
      hover.sample.graspPoint.distanceTo(sample.graspPoint),
    ) <= 0.05;
    const resolved = this.resolve3DTargetForHand(latched ? hover.sample : sample, latched ? hover.targetId : undefined);

    this.recordXRHandEvent({
      eventType: viaEvent === 'poke' ? 'poke' : 'selectstart',
      inputSource: 'hand',
      handedness: sample.handedness,
      connected: sample.connected,
      poseId: sample.poseId,
      pinchValue: Number(sample.pinchValue.toFixed(3)),
      position: this.toVec3Tuple(sample.position),
      indexTipPosition: this.toVec3Tuple(sample.indexTip),
      graspPosition: this.toVec3Tuple(sample.graspPoint),
      targetType: resolved?.targetType ?? 'NONE',
      targetId: resolved?.targetId ?? 'none',
      actionOrOutcome: `hover:${hover?.targetId ?? 'none'}:${hover ? Math.round(performance.now() - hover.time) : -1}:${latched ? 'latched' : 'fresh'}`,
    });

    if (!resolved) return;

    this.withInputSource('xr-hand', () => {
      if (
        resolved.targetType === 'DATA_CUBE' &&
        resolved.cubeEntity &&
        typeof resolved.slotIndex === 'number'
      ) {
        if (
          this.engine.getState().phase !== 'OPERATIONS' ||
          this.engine.getState().paused
        ) {
          return;
        }
        const pkt = this.engine.getState().packets[resolved.slotIndex];
        const obj = resolved.cubeEntity.object3D;
        if (!obj || !pkt || !this.cubeInteractions.acquire(sample.device, obj, pkt.id)) return;
        this.activeXRHandGrabs.set(sample.handedness, {
          cubeEntity: resolved.cubeEntity,
          slotIndex: resolved.slotIndex,
          packetId: pkt?.id ?? '',
          grabStartPos: obj.position.clone(),
          lastGraspPos: sample.graspPoint.clone(),
          inspectedNotified: false,
        });
        if (pkt) {
          this.tutorial.notifyCubeGrabOrSelect(
            pkt.confidence !== 'UNVERIFIED',
            'xr-hand',
          );
          this.applyAction({ type: 'SELECT_PACKET', packetId: pkt.id });
        }
        this.playCue('CUBE_GRAB');
        this.highlightDropZones(true);
        this.syncAll();

        this.recordXRHandEvent({
          eventType: 'grabstart',
          inputSource: 'hand',
          handedness: sample.handedness,
          connected: sample.connected,
          poseId: sample.poseId,
          pinchValue: Number(sample.pinchValue.toFixed(3)),
          position: this.toVec3Tuple(sample.position),
          indexTipPosition: this.toVec3Tuple(sample.indexTip),
          graspPosition: this.toVec3Tuple(sample.graspPoint),
          targetType: 'DATA_CUBE',
          targetId: resolved.targetId,
          actionOrOutcome: `grabbed:${pkt?.id ?? 'standby'}`,
        });
        return;
      }

      if (resolved.targetType === 'SECTOR' && resolved.sectorId) {
        if (this.isAnyObjectGrabbed()) return;
        this.tutorial.notifySectorPointed(resolved.sectorId, 'xr-hand');
        this.handleSelectSector(resolved.sectorId);
        return;
      }

      if (resolved.targetType === 'CONTROL_PAD' && resolved.controlAction) {
        if (this.isAnyObjectGrabbed()) return;
        if (resolved.controlAction === 'SCAN') {
          this.tutorial.notifyPinchScan('xr-hand');
        }
        if (resolved.controlAction === 'COMMIT_DOWNLINK') {
          this.tutorial.notifyTransmitActivated('xr-hand');
        }
        this.handleControlAction(resolved.controlAction);
        return;
      }

      if (
        resolved.targetType === 'SPATIAL_UI_BUTTON' &&
        resolved.panelId &&
        resolved.buttonId
      ) {
        if (resolved.buttonId === 'Btn_ScanSector') {
          this.tutorial.notifyPinchScan('xr-hand');
        }
        if (resolved.buttonId === 'Btn_CommitDownlink') {
          this.tutorial.notifyTransmitActivated('xr-hand');
        }
        const panel = this.world.getSceneObject<UIKitMLAsset>(resolved.panelId);
        const element = panel?.getElementById(resolved.buttonId);
        if (element) {
          element.dispatchEvent({ type: 'click' } as never);
        }
      }
    });
  }

  private handleXRHandPressEnd(
    sample: LiveXRHandSample,
    viaEvent: 'selectend' | 'pinch_release',
  ): void {
    if (!sample.connected) {
      this.lastHandConnected[sample.handedness] = false;
      this.handleXRHandTrackingLost(sample.handedness, sample);
      return;
    }
    const activeGrab = this.activeXRHandGrabs.get(sample.handedness);
    this.recordXRHandEvent({
      eventType: 'selectend',
      inputSource: 'hand',
      handedness: sample.handedness,
      connected: sample.connected,
      poseId: sample.poseId,
      pinchValue: Number(sample.pinchValue.toFixed(3)),
      position: this.toVec3Tuple(sample.position),
      indexTipPosition: this.toVec3Tuple(sample.indexTip),
      graspPosition: this.toVec3Tuple(sample.graspPoint),
      targetType: activeGrab ? 'DATA_CUBE' : 'NONE',
      targetId: activeGrab ? `evidence-cube-${activeGrab.slotIndex + 1}` : 'none',
    });

    if (!activeGrab) return;

    this.activeXRHandGrabs.delete(sample.handedness);
    if (!this.cubeInteractions.release(sample.device)) return;
    if (this.activeXRHandGrabs.size === 0) this.highlightDropZones(false);

    const obj = activeGrab.cubeEntity.object3D;
    if (obj) setWorldPosition(obj, sample.graspPoint);
    const target = nearestCubeStation(sample.graspPoint, this.getCubeDropTargets());
    const zoneLabel = target?.kind ?? 'TRAY_SNAP_RECOVERY';

    this.withInputSource('xr-hand', () => {
      this.handleCubeReleased(activeGrab.cubeEntity);
    });

    this.recordXRHandEvent({
      eventType: 'grabrelease',
      inputSource: 'hand',
      handedness: sample.handedness,
      connected: sample.connected,
      poseId: sample.poseId,
      pinchValue: Number(sample.pinchValue.toFixed(3)),
      position: this.toVec3Tuple(sample.position),
      indexTipPosition: this.toVec3Tuple(sample.indexTip),
      graspPosition: this.toVec3Tuple(sample.graspPoint),
      targetType: 'DROP_ZONE',
      targetId: zoneLabel,
      actionOrOutcome: `released:${activeGrab.packetId || 'cube'}->${zoneLabel}`,
    });
  }

  private handleXRHandTrackingLost(
    handedness: 'left' | 'right',
    lastSample?: LiveXRHandSample,
  ): void {
    const activeGrab = this.activeXRHandGrabs.get(handedness);
    if (!activeGrab && !this.lastHandConnected[handedness]) return;
    this.lastHandConnected[handedness] = false;
    this.nativeHands.reset(handedness);
    this.cubeInteractions.release(handedness === 'left' ? 'hand-left' : 'hand-right', true);
    this.lastHandPressed[handedness] = false;
    this.lastHandGlobeTouchPos.delete(handedness);
    this.handHoverTargets.delete(handedness);

    if (activeGrab) {
      this.activeXRHandGrabs.delete(handedness);
      if (activeGrab.cubeEntity.hasComponent(Grabbed)) {
        this.world.getSystem(GrabSystem)?.forceRelease(activeGrab.cubeEntity);
      }
      if (this.activeXRHandGrabs.size === 0) {
        this.highlightDropZones(false);
      }
      // Snap dropped cube safely back to its assigned tray or downlink bay slot
      const state = this.engine.getState();
      this.syncCubeTransforms(state.packets, state);
      const snappedPos = activeGrab.cubeEntity.object3D
        ? this.toVec3Tuple(activeGrab.cubeEntity.object3D.position)
        : ([0, 0, 0] as [number, number, number]);

      this.recordXRHandEvent({
        eventType: 'tracking_lost_recovery',
        inputSource: 'hand',
        handedness,
        connected: false,
        poseId: lastSample?.poseId ?? 'default',
        pinchValue: 0,
        position: lastSample ? this.toVec3Tuple(lastSample.position) : [0, 0, 0],
        indexTipPosition: lastSample
          ? this.toVec3Tuple(lastSample.indexTip)
          : [0, 0, 0],
        graspPosition: snappedPos,
        targetType: 'DATA_CUBE',
        targetId: `evidence-cube-${activeGrab.slotIndex + 1}`,
        actionOrOutcome: `tracking_lost_snapped_to:[${snappedPos.join(',')}]`,
      });
    } else {
      this.recordXRHandEvent({
        eventType: 'disconnected',
        inputSource: 'hand',
        handedness,
        connected: false,
        poseId: lastSample?.poseId ?? 'default',
        pinchValue: 0,
        position: lastSample ? this.toVec3Tuple(lastSample.position) : [0, 0, 0],
        indexTipPosition: lastSample
          ? this.toVec3Tuple(lastSample.indexTip)
          : [0, 0, 0],
        graspPosition: lastSample
          ? this.toVec3Tuple(lastSample.graspPoint)
          : [0, 0, 0],
      });
    }
  }

  private updateXRHandInteractions(_delta: number): void {
    const isImmersive = Boolean(this.world.renderer?.xr?.isPresenting);
    if (!isImmersive) {
      for (const side of ['left', 'right'] as const) this.handleXRHandTrackingLost(side);
      return;
    }

    this.bindXRSessionHandEvents();

    for (const side of ['left', 'right'] as const) {
      const sample = this.sampleLiveXRHandState(side);
      if (!sample) {
        this.handleXRHandTrackingLost(side);
        continue;
      }

      // 1. Connection & Disconnection Transition Tracking
      if (sample.connected && !this.lastHandConnected[side]) {
        this.lastHandConnected[side] = true;
        this.recordXRHandEvent({
          eventType: 'connected',
          inputSource: 'hand',
          handedness: side,
          connected: true,
          poseId: sample.poseId,
          pinchValue: Number(sample.pinchValue.toFixed(3)),
          position: this.toVec3Tuple(sample.position),
          indexTipPosition: this.toVec3Tuple(sample.indexTip),
          graspPosition: this.toVec3Tuple(sample.graspPoint),
        });
      } else if (!sample.connected && this.lastHandConnected[side]) {
        this.lastHandConnected[side] = false;
        this.handleXRHandTrackingLost(side, sample);
        continue;
      }

      if (!sample.connected) continue;

      // 2. If currently holding a 3D Data Cube, move the cube 1:1 with the hand's 3D grasp anchor
      const activeGrab = this.activeXRHandGrabs.get(side);
      if (activeGrab) {
        if (activeGrab.cubeEntity.hasComponent(Grabbed)) {
          this.world.getSystem(GrabSystem)?.forceRelease(activeGrab.cubeEntity);
        }
        const obj = activeGrab.cubeEntity.object3D;
        if (obj) {
          setWorldPosition(obj, sample.graspPoint);
          const target = nearestCubeStation(sample.graspPoint, this.getCubeDropTargets());
          this.cubeInteractions.preview(sample.device, target);
          this.highlightDropZones(true, target);
        }
        const movedFromStart = sample.graspPoint.distanceTo(
          activeGrab.grabStartPos,
        );
        if (movedFromStart >= 0.02 && !activeGrab.inspectedNotified) {
          activeGrab.inspectedNotified = true;
          this.withInputSource('xr-hand', () => {
            this.tutorial.notifyCubeInspected('xr-hand');
            if (this.tutorial.isActive()) {
              this.tutorial.syncWithMissionState(
                this.engine.getState(),
                undefined,
                'xr-hand',
              );
            }
          });
          this.recordXRHandEvent({
            eventType: 'grabmove',
            inputSource: 'hand',
            handedness: side,
            connected: true,
            poseId: sample.poseId,
            pinchValue: Number(sample.pinchValue.toFixed(3)),
            position: this.toVec3Tuple(sample.position),
            indexTipPosition: this.toVec3Tuple(sample.indexTip),
            graspPosition: this.toVec3Tuple(sample.graspPoint),
            targetType: 'DATA_CUBE',
            targetId: `evidence-cube-${activeGrab.slotIndex + 1}`,
            actionOrOutcome: `carried_${movedFromStart.toFixed(3)}m`,
          });
        }
        activeGrab.lastGraspPos.copy(sample.graspPoint);
      } else {
        // 3. Check 3D Globe Gimbal touch / rotation & Point Hover when not holding a cube
        const distToGlobe = sample.indexTip.distanceTo(GLOBE_CENTER_WORLD);
        if (distToGlobe <= 0.30) {
          const prevTouch = this.lastHandGlobeTouchPos.get(side);
          if (!prevTouch) {
            this.lastHandGlobeTouchPos.set(side, sample.indexTip.clone());
            this.withInputSource('xr-hand', () => {
              this.tutorial.notifyGlobeInteraction('xr-hand');
              if (this.tutorial.isActive()) {
                this.tutorial.syncWithMissionState(
                  this.engine.getState(),
                  undefined,
                  'xr-hand',
                );
              }
            });
            this.recordXRHandEvent({
              eventType: 'globe_touch',
              inputSource: 'hand',
              handedness: side,
              connected: true,
              poseId: sample.poseId,
              pinchValue: Number(sample.pinchValue.toFixed(3)),
              position: this.toVec3Tuple(sample.position),
              indexTipPosition: this.toVec3Tuple(sample.indexTip),
              graspPosition: this.toVec3Tuple(sample.graspPoint),
              targetType: 'GLOBE',
              targetId: 'earth-globe',
            });
          } else if (sample.pressed) {
            const dx = sample.indexTip.x - prevTouch.x;
            const dy = sample.indexTip.y - prevTouch.y;
            if (Math.abs(dx) + Math.abs(dy) > 0.008 && !this.isSlerpingToSector) {
              this.withInputSource('xr-hand', () => {
                this.rotateGlobe(dx * 1.4, -dy * 1.0);
              });
              prevTouch.copy(sample.indexTip);
            }
          } else {
            prevTouch.copy(sample.indexTip);
          }
        } else {
          this.lastHandGlobeTouchPos.delete(side);
        }

        // 4. Resolve 3D target for pointing hover & direct index-tip poke
        const resolved = this.resolve3DTargetForHand(sample);
        if (!sample.pressed && sample.poseId !== 'pinch') {
          if (resolved) this.handHoverTargets.set(side, { targetId: resolved.targetId, sample, time: performance.now() });
          else this.handHoverTargets.delete(side);
        }
        this.cubeInteractions.hover(sample.device, resolved?.cubeEntity?.object3D);
        if (resolved) {
          if (this.lastHandPointTarget[side] !== resolved.targetId) {
            this.lastHandPointTarget[side] = resolved.targetId;
            if (resolved.targetType === 'SECTOR' && resolved.sectorId) {
              this.gazeSectorId = resolved.sectorId;
              this.withInputSource('xr-hand', () => {
                this.tutorial.notifySectorPointed(resolved.sectorId!, 'xr-hand');
              });
            }
            this.recordXRHandEvent({
              eventType: 'point_hover',
              inputSource: 'hand',
              handedness: side,
              connected: true,
              poseId: sample.poseId,
              pinchValue: Number(sample.pinchValue.toFixed(3)),
              position: this.toVec3Tuple(sample.position),
              indexTipPosition: this.toVec3Tuple(sample.indexTip),
              graspPosition: this.toVec3Tuple(sample.graspPoint),
              targetType: resolved.targetType,
              targetId: resolved.targetId,
            });
          }
        } else {
          this.lastHandPointTarget[side] = '';
        }
      }

      // 5. Poll pinch press / release transitions if XRSession selectstart/selectend did not already fire this frame
      if (sample.pressed && !this.lastHandPressed[side]) {
        this.lastHandPressed[side] = true;
        this.handleXRHandPressStart(sample, 'pinch_threshold');
      } else if (!sample.pressed && this.lastHandPressed[side]) {
        this.lastHandPressed[side] = false;
        this.handleXRHandPressEnd(sample, 'pinch_release');
      }
    }
  }

  private isLiveXRHandActive(): boolean {
    if (!this.world.renderer?.xr?.isPresenting) return false;
    return Boolean(this.lastHandConnected.left || this.lastHandConnected.right);
  }

  private isAnyObjectGrabbed(): boolean {
    if (this.cubeInteractions.hasHeld) return true;
    if (this.isLiveXRHandActive()) return false;
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
    this.desktopControls?.cancelCubeDrag();
    this.cubeInteractions.recoverAll();
    this.activeXRHandGrabs.clear();
    this.handHoverTargets.clear();
    this.nativeHands.reset();
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
      const onClick = (event?: any) => {
        if (event && typeof event.pointerId === 'number') {
          setTimeout(() => handler(), 0);
        } else {
          handler();
        }
      };
      el.addEventListener('click', onClick);
      this.cleanupFuncs.push(() => el.removeEventListener('click', onClick));
    };

    // Briefing Panel controls
    bindClick(this.briefingPanel, 'Btn_CycleSector', () => this.handleCycleSector());
    bindClick(this.briefingPanel, 'Btn_ToggleSensor', () => this.handleToggleSensor());
    bindClick(this.briefingPanel, 'Btn_ScanSector', () => this.handleScan());
    bindClick(this.briefingPanel, 'Btn_SelectCampaign', () => this.cycleCampaignOperation());
    bindClick(this.briefingPanel, 'Btn_StartTutorial', () => {
      if (this.tutorial.isActive()) {
        this.tutorial.skip();
      } else {
        if (this.engine.getState().scenarioId !== 'ORBITAL_ACADEMY') {
          this.dailyDate = null;
          this.engine.setScenario('ORBITAL_ACADEMY');
          this.handleRestartMission();
        }
        this.tutorial.start(Boolean(this.world.renderer?.xr?.isPresenting));
      }
      this.playCue('SELECT_SECTOR');
      this.syncAll();
    });
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

    this.syncSpatialPanelsVisibility();
  }

  public toggleSpatialHud(active?: boolean): boolean {
    this.spatialHudVisible = typeof active === 'boolean' ? active : !this.spatialHudVisible;
    this.syncSpatialPanelsVisibility();
    return this.spatialHudVisible;
  }

  public syncSpatialPanelsVisibility(): void {
    const isXRorIWER = Boolean((window as any).__ORBIT_IWER__) || this.world.renderer.xr.isPresenting;
    const show = isXRorIWER || this.spatialHudVisible;
    const isDebrief = this.engine.getState().phase === 'DEBRIEF';

    if (this.briefingPanel) {
      this.briefingPanel.visible = show && !isDebrief;
    }
    if (this.telemetryPanel) {
      this.telemetryPanel.visible = show && !isDebrief;
    }
    if (this.debriefPanel) {
      this.debriefPanel.visible = isDebrief;
    }
  }

  public rotateGlobe(deltaYaw: number, deltaPitch: number): void {
    const globe = this.world.getSceneObject('earth-globe');
    if (!globe) return;
    this.isSlerpingToSector = false;
    this.tutorial.notifyGlobeInteraction(this.currentInputSource);
    if (this.tutorial.isActive()) {
      this.tutorial.syncWithMissionState(this.engine.getState(), undefined, this.currentInputSource);
    }

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
    this.desktopControls?.onSectorSelected(sectorId);
    this.applyAction({ type: 'SELECT_SECTOR', sectorId });
    this.playCue('SELECT_SECTOR');
    this.slerpGlobeToSector(sectorId);
    const state = this.engine.getState();
    if (state.scenarioId === 'STANDARD_INDUS_PASS') {
      this.voiceCommander?.handleSectorSelection(sectorId, state.activeSensorMode);
    }

    this.syncAll();
  }

  private handleCycleSector(): void {
    const current = this.engine.getState().selectedSectorId;
    const idx = SECTOR_ORDER.indexOf(current);
    const next = SECTOR_ORDER[(idx + 1) % SECTOR_ORDER.length];
    this.handleSelectSector(next);
  }

  private syncSensorSwitchHardware(sensorMode: SensorMode): void {
    const consoleObj = this.world.getSceneObject('orbital-console');
    if (consoleObj) {
      const stem = consoleObj.getObjectByName('SensorToggleStem');
      if (stem) {
        stem.rotation.x =
          sensorMode === 'RADAR'
            ? -0.38
            : sensorMode === 'THERMAL'
              ? 0.0
              : 0.38;
      }
      const led = consoleObj.getObjectByName('SensorSwitchLed');
      if (led instanceof Mesh && led.material instanceof MeshBasicMaterial) {
        led.material.color.setHex(
          sensorMode === 'RADAR'
            ? 0x10b981
            : sensorMode === 'THERMAL'
              ? 0xff6b2b
              : 0x38bdf8,
        );
      }
    }
  }

  private handleToggleSensor(): void {
    const scenario = this.engine.getActiveScenario();
    const modes: SensorMode[] = scenario.availableSensors?.length
      ? scenario.availableSensors
      : ['RADAR', 'OPTICAL'];
    const current = this.engine.getState().activeSensorMode;
    const idx = modes.indexOf(current);
    const nextMode = modes[(idx + 1) % modes.length];
    this.applyAction({ type: 'SET_SENSOR', sensorMode: nextMode });
    this.playCue('TOGGLE_SENSOR');
    const state = this.engine.getState();

    // Animate physical 3D aerospace switch stem & micro-LED on flight deck
    this.syncSensorSwitchHardware(state.activeSensorMode);

    if (state.scenarioId === 'STANDARD_INDUS_PASS') {
      this.voiceCommander?.handleSectorSelection(state.selectedSectorId, state.activeSensorMode);
    }
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
      this.audio.playSubBassPulse();

      // Achievement triggers
      if (state.selectedSectorId === 'B' && mode === 'RADAR') {
        this.desktopControls?.triggerAchievement('⚡ CLOUD PIERCER', '5.4 GHz Microwave Backscatter Verified', '🔴');
      } else if (state.selectedSectorId === 'C' && mode === 'OPTICAL') {
        this.desktopControls?.triggerAchievement('🔭 SUB-METER LOCK', '0.75m GSD Zero Multipath Glare', '🟢');
      } else if (mode === 'THERMAL') {
        this.desktopControls?.triggerAchievement('🔥 PYROCLASTIC LOCK', 'MWIR/LWIR Thermal Radiometry Verified', '🟠');
      }

      this.voiceCommander?.trigger('SCAN_ACQUIRED');

      // Immediately illuminate 3D observation swath cone
      const globe = this.world.getSceneObject('earth-globe');
      const swath = globe?.getObjectByName('OrbitalScanSwathCone');
      if (swath instanceof Mesh && swath.material instanceof MeshBasicMaterial) {
        swath.material.color.setHex(
          mode === 'OPTICAL' ? 0x38bdf8 : mode === 'THERMAL' ? 0xff6b2b : 0xf59e0b,
        );
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

      // Check if all packets fit now (Knapsack Optimizer achievement)
      const nextState = this.engine.getState();
      const queuedPackets = nextState.packets.filter((p) => nextState.queuePacketIds.includes(p.id));
      const totalTx = queuedPackets.reduce((acc, p) => acc + p.transmitSec, 0);
      if (totalTx <= nextState.downlinkWindowSec && queuedPackets.length === 3) {
        this.desktopControls?.triggerAchievement('🧠 KNAPSACK OPTIMIZER', `13.0s → ${totalTx.toFixed(1)}s AI Feature Extraction`, '⚙️');
      }

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
      if (res.ok) {
        this.audio.playMagneticSnap(); // Tactile magnetic dock snap
      }
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
    this.tutorial.notifyTransmitActivated(this.currentInputSource);
    const res = this.applyAction({ type: 'COMMIT' });
    if (res.ok) {
      this.forceReleaseAllGrabs();
      this.cubeTransitions.clear();
      this.lastDownlinkTickSecond = -1;
      this.playCue('SOLENOID_LATCH');
      this.playCue('DOWNLINK_COMMIT');
      this.audio.playCarrierAcquisition(); // S-band carrier synthesizer lock buildup
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
    if (globe) {
      this.targetFocalDistance = -0.48;
      this.globeFocalDistance = -0.48;
      globe.position.z = -0.48;
      globe.updateMatrixWorld(true);
    }
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
    this.voiceCommander?.reset();
    this.playCue('MISSION_RESET');
    this.announceActiveScenarioPassStart();
    this.syncAll();
  }

  private applyAction(action: MissionAction): ActionResult {
    const result = this.engine.dispatch(action, this.missionElapsedTime);
    const out: ActionResult = 'ok' in result ? result : {
      ok: result.lastActionOk, code: result.lastActionOk ? 'OK' : 'INVALID_PHASE',
      message: result.lastStatusMessage,
    };
    if (out.ok && this.tutorial.getState().active) {
      this.tutorial.syncWithMissionState(this.engine.getState(), action, this.currentInputSource);
    }
    return out;
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
      this.cachedSolution = solveMission(state, this.engine.getActiveCustomScenario());
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
    SCANNER_HOME_POSITION.x = preferences.dominantHand === 'LEFT' ? -0.44 : 0.44;
    SCANNER_HOME_POSITION.y = 0.80;
    SCANNER_HOME_POSITION.z = -0.30;
    const holster = this.world.getSceneObject('orbital-console')?.getObjectByName('ScannerHolster');
    if (holster) holster.position.x = SCANNER_HOME_POSITION.x;
    if (scanner && !this.isAnyObjectGrabbed()) scanner.position.copy(SCANNER_HOME_POSITION);
    this.applyTabletopMode();
  }

  public applyTabletopMode(): void {
    const isTabletop = this.profile.preferences.tabletopMode;
    const isImmersive = Boolean(this.world.renderer?.xr?.isPresenting);
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
      } else if (isImmersive) {
        this.briefingPanel.position.set(-0.88, 1.16, -0.98);
        this.briefingPanel.rotation.set(0, (30 * Math.PI) / 180, 0);
        this.briefingPanel.scale.setScalar(0.098);
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
      } else if (isImmersive) {
        this.telemetryPanel.position.set(0.88, 1.16, -0.98);
        this.telemetryPanel.rotation.set(0, (-30 * Math.PI) / 180, 0);
        this.telemetryPanel.scale.setScalar(0.098);
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
      } else if (isImmersive) {
        this.debriefPanel.position.set(0.0, 1.18, -0.92);
        this.debriefPanel.rotation.set((-4 * Math.PI) / 180, 0, 0);
        this.debriefPanel.scale.setScalar(0.098);
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
      HERO: { pos: [0, 1.12, 0.46], target: [0, 1.15, -0.78], fov: 76 },
      GLOBE: { pos: [0, 1.12, -0.22], target: [0, 0.99, -0.58], fov: 55 },
      CUBES: { pos: [-0.37, 0.98, -0.18], target: [-0.37, 0.79, -0.43], fov: 50 },
      CRADLE: { pos: [0.24, 0.96, -0.28], target: [0.24, 0.79, -0.55], fov: 50 },
      DOWNLINK: { pos: [0.39, 0.96, -0.22], target: [0.39, 0.79, -0.46], fov: 50 },
      DEBRIEF: { pos: [0.0, 1.18, 0.22], target: [0.0, 1.18, -0.92], fov: 60 },
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

    // Find the current position in the packets array
    const index = state.packets.findIndex((packet) => packet.id === state.selectedPacketId);
    // If not found (empty selection), start from 0; otherwise move to next
    const nextIndex = index < 0 ? 0 : (index + 1) % state.packets.length;

    const nextPacket = state.packets[nextIndex];
    this.applyAction({ type: 'SELECT_PACKET', packetId: nextPacket.id });
    this.syncAll();
  }

  private nextMission(): void {
    if (this.engine.getState().phase === 'DOWNLINK') return;
    if (this.engine.getState().scenarioId === 'ORBITAL_ACADEMY' && this.tutorial.isActive()) {
      this.tutorial.skip();
    }
    this.forceReleaseAllGrabs();
    this.dailyDate = null;
    this.engine.cycleScenario();
    this.handleRestartMission();
  }

  public cycleCampaignOperation(): void {
    if (this.engine.getState().phase === 'DOWNLINK') return;
    if (this.engine.getState().scenarioId === 'ORBITAL_ACADEMY' && this.tutorial.isActive()) {
      this.tutorial.skip();
    }
    this.forceReleaseAllGrabs();
    this.dailyDate = null;
    this.engine.cycleCampaignOperation();
    this.playCue('SCENARIO_CYCLE');
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
    const achievable = this.reviewState.phase === 'OPERATIONS' ? solveMission(this.reviewState, this.engine.getActiveCustomScenario()).score : state.debrief.totalScore;
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
      Lbl_TabletopMode: `MR TABLETOP: ${p.tabletopMode
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
        : `PROVEN OBJECTIVE: ${getMissionBenchmark(this.engine.getState().scenarioId, this.engine.getActiveCustomScenario()).score}/100 | COMPLETE THIS PASS TO EARN MASTERY`);
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
      RECENTER: 'pad-recenter-desk',
      MASTER_POWER: 'pad-master-power',
      IGNITION: 'pad-master-power',
      ARIA_DELEGATE: 'pad-aria-delegate',
      DELEGATE: 'pad-aria-delegate',
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
      case 'RECENTER':
        this.calibrateSeatedView();
        break;
      case 'MASTER_POWER':
      case 'IGNITION':
        this.handleMasterIgnition();
        break;
      case 'ARIA_DELEGATE':
      case 'DELEGATE':
        this.handleAriaDelegate();
        break;
      case 'PROCEDURAL_CRISIS':
      case 'NEW_PROCEDURAL_PASS':
        this.startProceduralPass();
        break;
    }
  }

  public handleMasterIgnition(): void {
    this.audio.playMechanicalSwitchClick(true);
    this.playCue('SELECT_SECTOR');
    this.voiceCommander?.trigger('PASS_START');
    this.syncAll();
  }

  public handleAriaDelegate(): void {
    const res = this.coPilot.executeActiveIntervention();
    if (res.ok) {
      this.playCue('PROCESS_SUCCESS');
      this.syncAll();
    } else {
      this.playCue('ERROR_REJECT');
    }
  }

  public startProceduralPass(seedInput?: string | number): void {
    this.engine.startProceduralCrisis(seedInput ?? Date.now());
    this.recordedDebrief = false;
    this.earnedMedals = [];
    this.replayIndex = -1;
    this.lastTransmittedCount = 0;
    this.audio.playRadioSquelchBurst();
    const threat = this.engine.getActiveThreat();
    if (threat) {
      this.voiceCommander?.speakDirect(
        `Emergency alert: ${threat.name} active. ${threat.description} Triage priority sectors immediately.`,
        `[ARIA-7] ${threat.name}: ${threat.description}`,
        'CRITICAL',
      );
    }
    this.syncAll();
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
          this.tutorial.notifyCubeGrabOrSelect(pkt.confidence !== 'UNVERIFIED');
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
    const pkt = this.engine.getState().packets[slotIndex];
    if (pkt) {
      this.tutorial.notifyCubeGrabOrSelect(pkt.confidence !== 'UNVERIFIED');
      this.tutorial.notifyCubeInspected();
    }

    const targetPos = targetZone === 'INVALID'
      ? new Vector3(0, 1.15, -0.2)
      : this.cubeStationPosition(targetZone, targetZone === 'RAW_TRAY' ? slotIndex : 0);
    setWorldPosition(cubeEntity.object3D, targetPos);
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
      if (!sObj || !isVisible(sObj)) continue;
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

  private getCubeDropTargets(): CubeDropTarget[] {
    const console = this.world.getSceneObject('orbital-console');
    return console ? cubeStationTargets(console, this.profile.preferences.oneHanded ? 1.2 : 1) : [];
  }

  private cubeStationPosition(kind: CubeDropTarget['kind'], slotIndex = 0): Vector3 {
    return this.getCubeDropTargets().find((target) => target.kind === kind && (target.slotIndex ?? 0) === slotIndex)!.position;
  }

  private releaseCube(object: Object3D): boolean {
    const entity = [...this.queries.cubes.entities].find((cube) => cube.object3D === object);
    if (!entity) return false;
    const target = nearestCubeStation(object.getWorldPosition(new Vector3()), this.getCubeDropTargets());
    this.handleCubeReleased(entity);
    return target !== null && this.engine.getState().lastActionOk;
  }

  private handleCubeReleased(entity: Entity): void {
    if (this.suppressReleaseActions || this.engine.getState().phase !== 'OPERATIONS' || this.engine.getState().paused) {
      this.syncAll();
      return;
    }
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

    const target = nearestCubeStation(this.tempVec, this.getCubeDropTargets());
    const closestTarget = target?.kind ?? 'NONE';
    const closestSlotIdx = target?.slotIndex ?? -1;

    if (closestTarget === 'DISCARD') {
      this.playCue('CUBE_DOCK');
      this.handleDiscardSelected();
      return;
    }
    if (closestTarget === 'PROCESS') {
      this.playCue('CUBE_DOCK');
      this.tutorial.notifyCradleRelease(this.currentInputSource);
      this.handleProcessSelected();
      return;
    }
    if (closestTarget === 'QUEUE') {
      this.playCue('CUBE_DOCK');
      this.tutorial.notifyDownlinkBayRelease(this.currentInputSource);
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

    this.playCue('ERROR_REJECT');
    this.syncAll();
  }

  private highlightDropZones(active: boolean, preview?: CubeDropTarget | null): void {
    const selected = (kind: CubeDropTarget['kind']) => active && (preview === undefined || preview?.kind === kind);
    const processPad = this.world.getSceneObject('pad-process-cradle');
    const queuePad = this.world.getSceneObject('pad-queue-downlink');
    const discardPad = this.world.getSceneObject('pad-discard-chute');

    if (processPad) {
      this.setObjectTint(processPad, 0xf59e0b, selected('PROCESS') ? 1.45 : 0.85);
    }
    if (queuePad) {
      this.setObjectTint(queuePad, 0x38bdf8, selected('QUEUE') ? 1.45 : 0.85);
    }
    if (discardPad) {
      this.setObjectTint(discardPad, 0xef4444, selected('DISCARD') ? 1.45 : 0.85);
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
        cradleHalo.visible = selected('PROCESS');
        cradleHalo.material.opacity = opacity;
        cradleHalo.scale.set(scale, scale, scale);
      }
      if (
        queueHalo instanceof Mesh &&
        queueHalo.material instanceof MeshBasicMaterial
      ) {
        queueHalo.visible = selected('QUEUE');
        queueHalo.material.opacity = opacity;
        queueHalo.scale.set(1.68 * scale, 0.65 * scale, 1);
      }
      if (
        discardHalo instanceof Mesh &&
        discardHalo.material instanceof MeshBasicMaterial
      ) {
        discardHalo.visible = selected('DISCARD');
        discardHalo.material.opacity = opacity;
        discardHalo.scale.set(scale, scale, scale);
      }
    }
  }

  private syncAll(): void {
    const state = this.engine.getState();
    const globe = this.world.getSceneObject('earth-globe');

    // Single source of truth: engine's committed downlink time vs. the active window.
    // Withdraw the one-shot QUEUE_OVERFLOW advisory as soon as it is no longer true.
    if (state.downlinkCommittedSec <= state.downlinkWindowSec + 0.01) {
      this.voiceCommander?.retract('QUEUE_OVERFLOW');
    }

    // 1. Update 3D Sector Beacons & Surface-Conforming Spherical Sector Polygons on the Globe
    for (const sectorEntity of this.queries.sectors.entities) {
      const sectorId = (sectorEntity.getValue(OrbitSectorNode, 'sectorId') ||
        'B') as SectorId;
      const isSelected = sectorId === state.selectedSectorId;
      const isGazed = sectorId === this.gazeSectorId;
      const sectorCfg = getScenarioSector(
        state.scenarioId,
        sectorId,
        this.engine.getActiveScenario(),
      );
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
            : sectorCfg.cloudCover !== 'CLEAR'
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
              : sectorCfg.cloudCover !== 'CLEAR'
                ? 0.08
                : 0.035;
        }
        const stormCap = globe.getObjectByName(`SectorStormCap_${sectorId}`);
        if (
          stormCap instanceof Mesh &&
          stormCap.material instanceof MeshStandardMaterial
        ) {
          stormCap.visible = sectorCfg.cloudCover !== 'CLEAR';
          if (isScanned) {
            if (scannedPkt.sensorMode === 'RADAR' || scannedPkt.sensorMode === 'THERMAL') {
              // Microwave radar or MWIR/LWIR thermal penetrated the obscuration layer
              stormCap.material.opacity = 0.24;
              stormCap.material.emissive.setHex(
                scannedPkt.sensorMode === 'THERMAL' ? 0xff6b2b : 0x38bdf8,
              );
              stormCap.material.emissiveIntensity = 0.55;
            } else {
              // Optical failed against cloud/smoke deck: high-albedo reflection glare
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
      const sensorHex =
        state.activeSensorMode === 'OPTICAL'
          ? 0x38bdf8
          : state.activeSensorMode === 'THERMAL'
            ? 0xff6b2b
            : 0xf59e0b;
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
      if (state.scenarioId !== 'ORBITAL_ACADEMY') {
        this.earnedMedals = recordMissionMastery(this.profile, state.scenarioId, state.debrief, {
          actualHandsUsed: this.profile.preferences.oneHanded ? 1 : 2,
          hintsRequestedCount: (this.coPilot?.getTotalDelegations() ?? 0) - this.delegationBaseline,
        });
        if (this.dailyDate) recordDailyPass(this.profile, this.dailyDate, state.debrief.totalScore);
        saveMissionProfile(this.profile);
      } else {
        this.earnedMedals = state.debrief.outcome === 'SUCCESS' ? ['ORBITAL WORKSTATION QUALIFIED'] : [];
        recordMissionMastery(this.profile, state.scenarioId, state.debrief);
        saveMissionProfile(this.profile);
      }
      this.delegationBaseline = this.coPilot?.getTotalDelegations() ?? 0;
    }
    this.syncBriefingPanel();
    this.syncTelemetryPanel();
    this.syncDebriefPanel();
    this.syncSpatialPanelsVisibility();
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
      if (!object || this.cubeInteractions.isHeld(object)) {
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
        setWorldPosition(object, this.cubeStationPosition('PROCESS'));
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

      const isCurrentlyGrabbed = this.cubeInteractions.isHeld(obj);

      if (!pkt) {
        cubeEntity.setValue(EvidenceCubeNode, 'packetId', '');
        if (!isCurrentlyGrabbed) {
          setWorldPosition(obj, this.cubeStationPosition('RAW_TRAY', slotIndex));
          obj.rotation.set(0, 0, 0);
          obj.updateMatrixWorld(true);
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
          setWorldPosition(obj, this.cubeStationPosition('QUEUE', pkt.queueIndex));
        } else if (
          this.cubeTransitions.get(pkt.id)?.kind === 'PROCESS' &&
          !this.profile.preferences.reducedMotion
        ) {
          setWorldPosition(obj, this.cubeStationPosition('PROCESS'));
          obj.position.y += 0.02;
        } else {
          setWorldPosition(obj, this.cubeStationPosition('RAW_TRAY', slotIndex));
        }
        obj.rotation.set(0, 0, 0);
        obj.updateMatrixWorld(true);
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
   * 2. Left Swath: Simulated Synthetic Aperture Radar backscatter or Optical visible swath
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

      // 2. Left Visual Swath Box (Radar Backscatter or Optical Swath)
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
          pkt.sensorMode === 'RADAR'
            ? 'SAR BACKSCATTER'
            : pkt.sensorMode === 'THERMAL'
              ? 'THERMAL IR SWATH'
              : 'OPTICAL SWATH',
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

      const compLabel =
        pkt.compressionAlgorithm === 'INTERFEROMETRIC_CHANGE_DETECTION'
          ? 'CHANGE-DET'
          : pkt.compressionAlgorithm === 'THERMAL_RADIOMETRIC_ENCODING'
            ? 'THERM-ENC'
            : pkt.compressionAlgorithm === 'OPTICAL_ROAD_EDGE_ENCODING'
              ? 'EDGE'
              : pkt.compressionAlgorithm === 'SAR_AMBIGUITY_METADATA_ENCODING'
                ? 'AMBIG'
                : pkt.sensorMode === 'RADAR'
                  ? 'SAR-ENC'
                  : 'OPT-ENC';
      const procStr = pkt.processed
        ? `1 STR (${compLabel})`
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
    const scenario = this.engine.getActiveScenario();
    const threat = this.engine.getActiveThreat();
    const sector = getScenarioSector(state.scenarioId, state.selectedSectorId, scenario);
    const scanCost =
      state.activeSensorMode === 'OPTICAL'
        ? scenario.budget.opticalScan
        : state.activeSensorMode === 'THERMAL'
          ? (scenario.budget.thermalScan ?? MISSION_BUDGET.thermalScan ?? { powerCost: 11, storageCost: 3, transmitSec: 4.2 })
          : scenario.budget.radarScan;

    const threatBadge = threat ? `[ALERT: ${threat.name} (SEV ${threat.severity}/5)] ` : '';
    const opLabel = scenario.operationCode ? `${scenario.operationCode} — ${scenario.name.toUpperCase()}` : scenario.name.toUpperCase();
    this.setText(
      this.briefingPanel,
      'BriefingSubtitle',
      `${threatBadge}${opLabel} | ${state.downlinkWindowSec.toFixed(1)}s @ 10 MB/s | ${state.maxPower} Wh`,
    );

    const payloadMb = scanCost.payloadMb ?? Number((scanCost.transmitSec * 10).toFixed(0));
    this.setText(
      this.briefingPanel,
      'SelectedSectorTitle',
      `TARGET: ${sector.code} ${sector.name} (${sector.cloudCover !== 'CLEAR' ? sector.cloudCover.replace(/_/g, ' ') : 'CLEAR SKY'})`,
    );
    this.setText(
      this.briefingPanel,
      'SelectedSectorDesc',
      `Sensor: ${state.activeSensorMode} (${scanCost.powerCost} Wh, ${scanCost.storageCost} STR, ${payloadMb} MB / ${scanCost.transmitSec.toFixed(1)}s Tx) | ${sector.terrainSummary}`,
    );
    const availableModes = (scenario.availableSensors ?? ['RADAR', 'OPTICAL']).join(' / ');
    this.setText(
      this.briefingPanel,
      'Lbl_ToggleSensor',
      `Active Sensor: ${state.activeSensorMode} (Switch ${availableModes})`,
    );
    this.setText(
      this.briefingPanel,
      'Lbl_ScanSector',
      `SCAN ${sector.code} WITH ${state.activeSensorMode} (-${scanCost.powerCost} Wh)`,
    );
    this.setText(
      this.briefingPanel,
      'Lbl_SelectCampaign',
      `SWITCH OP (${scenario.operationCode ?? 'CAMPAIGN'})`,
    );
    this.setText(
      this.briefingPanel,
      'Lbl_StartTutorial',
      this.tutorial.isActive() ? 'SKIP ACADEMY' : 'ORBITAL ACADEMY',
    );

    const requests = getScenarioRequests(state.scenarioId, scenario);
    for (let i = 0; i < GROUND_REQUEST_ORDER.length; i++) {
      const reqId = GROUND_REQUEST_ORDER[i];
      const req = requests[reqId];
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
        const reqSector = getScenarioSector(state.scenarioId, req.targetSectorId, scenario);
        this.setText(
          this.briefingPanel,
          statusId,
          `[?] Best sensor: ${getRecommendedSensor(state.scenarioId, req.targetSectorId, scenario)} on SEC-${req.targetSectorId} | ${reqSector.cloudCover !== 'CLEAR' ? reqSector.cloudCover.toLowerCase().replace(/_/g, ' ') : 'clear sky'} | target ${req.requiredBadge}`,
        );
        this.setBg(this.briefingPanel, cardId, '#152238');
      }
    }
  }

  private getNextTacticalHint(state: MissionState): string {
    for (const owner of ['hand-left', 'hand-right', 'desktop'] as const) {
      const held = this.cubeInteractions.held(owner);
      if (!held) continue;
      const target = held.preview;
      return target ? `RELEASE TO ${target.kind.replace('_', ' ')}${target.slotIndex !== undefined && target.kind === 'QUEUE' ? ` SLOT ${target.slotIndex + 1}` : ''}`
        : 'INVALID PLACEMENT: release returns evidence to its assigned station.';
    }
    if (this.tutorial.isActive()) {
      const step = this.tutorial.getCurrentStepSpec();
      if (step) {
        return `[ORBITAL ACADEMY ${step.index}/9] ${step.vrInstruction}`;
      }
    }
    if (state.paused) return 'PAUSED: pass clock held. Use RESUME when ready.';
    if (state.phase === 'DEBRIEF') return 'PASS COMPLETE: review mission decisions or launch next operation.';
    if (state.phase === 'DOWNLINK') return `TRANSMITTING: ${state.downlinkRemainingSec.toFixed(1)}s left (@ 10.0 MB/s). Evidence streaming to ground.`;
    const solution = this.getSolution(state);
    const benchmark = getMissionBenchmark(state.scenarioId, this.engine.getActiveCustomScenario());
    if (this.profile.preferences.guidance === 'EXPERT') return `EXPERT MODE | ${state.packets.length}/3 CUBES | ${state.downlinkCommittedSec.toFixed(1)}s QUEUE | TARGET ${benchmark.score}/100`;
    if (this.profile.preferences.guidance === 'STANDARD') return `TARGET ${benchmark.score}/100 | REACHABLE ${solution.score}/100 | observe -> compress -> queue -> transmit`;
    const next = getNextPlanAction(state, solution);
    if (!next) return state.queuePacketIds.length
      ? `> DIRECTIVE: ${state.downlinkCommittedSec.toFixed(1)}s queued. Pull green Lever to commit downlink pass!`
      : '> DIRECTIVE: No useful evidence reachable with remaining power. Restart pass to try a different strategy.';
    const ceiling = solution.score < benchmark.score ? `[REACHABLE ${solution.score}/${benchmark.score}] ` : '';
    if (next.type === 'SCAN') {
      if (state.selectedSectorId !== next.sectorId) return `${ceiling}> STEP 1: Point at highlighted Sector ${next.sectorId} on the globe & pinch to acquire.`;
      if (state.activeSensorMode !== next.sensorMode) return `${ceiling}> STEP 2: Press console switch to arm ${next.sensorMode} sensor.`;
      return `${ceiling}> STEP 3: Press red Swath Plunger to capture ${next.sensorMode} evidence.`;
    }
    const packet = state.packets.find((p) => p.id === next.packetId);
    if (packet && state.selectedPacketId !== packet.id) return `${ceiling}> STEP 4: Grab or select Evidence Cube ${packet.id} (SEC-${packet.sectorId}).`;
    if (next.type === 'PROCESS') return `${ceiling}> STEP 4: Drop cube into the Amber Cradle to compress payload (-6 Wh).`;
    if (next.type === 'DISCARD') return `${ceiling}> DIRECTIVE: Drop unnecessary SEC-${next.sectorId} cube into discard chute.`;
    if (next.type === 'UNQUEUE') return `${ceiling}> DIRECTIVE: Remove SEC-${next.sectorId} from the bay to fit higher-value evidence.`;
    return `${ceiling}> STEP 5: Place compressed cube into Downlink Bay slot.`;
  }

  private syncTelemetryPanel(): void {
    if (!this.telemetryPanel) return;
    const state = this.engine.getState();

    const scenario = this.engine.getActiveScenario();
    const tutStep = this.tutorial.getCurrentStepSpec();
    this.setText(
      this.telemetryPanel,
      'OperationTitleText',
      tutStep
        ? `ORBIT ZERO // OP 00: ORBITAL ACADEMY (STEP ${tutStep.index}/9)`
        : `ORBIT ZERO // ${scenario?.operationCode ?? ''} ${scenario?.name.toUpperCase() ?? 'TACTICAL PASS'}`,
    );
    this.setText(
      this.telemetryPanel,
      'OperationPhaseBadge',
      state.phase === 'DOWNLINK'
        ? 'PHASE: DOWNLINK PASS'
        : state.phase === 'DEBRIEF'
          ? 'PHASE: MISSION DEBRIEF'
          : tutStep
            ? 'MODE: GESTURE TRAINING'
            : 'PHASE: RECON & PROCESSING',
    );

    const pwrRatio = Math.max(0, Math.min(1, state.power / state.maxPower));
    const pwrFilled = Math.round(pwrRatio * 10);
    const pwrBar = `[${'#'.repeat(pwrFilled)}${'-'.repeat(10 - pwrFilled)}]`;

    const strFilled = Math.max(0, Math.min(state.maxStorage, state.storageUsed));
    const strBar = `[${'#'.repeat(strFilled)}${'-'.repeat(state.maxStorage - strFilled)}]`;

    this.setText(
      this.telemetryPanel,
      'ResourceReadout',
      `POWER: ${pwrBar} ${state.power}/${state.maxPower} Wh  |  STORAGE: ${strBar} ${state.storageUsed}/${state.maxStorage} STR (18 MB/UNIT)`,
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
      windowText = `TX STREAM (10 MB/s): ${remBar} ${state.downlinkRemainingSec.toFixed(1)}s REMAINING  |  PHASE: DOWNLINK`;
    } else if (state.phase === 'DEBRIEF') {
      windowText = `WINDOW CLOSED: ${state.debrief?.downlinkUsedSec.toFixed(1)}s USED / ${state.downlinkWindowSec.toFixed(1)}s | ${state.debrief?.transmittedPacketIds.length ?? 0} PACKETS (${state.debrief?.transmittedPayloadMb ?? 0} MB @ 10 MB/s)`;
    } else if (windowOverflow) {
      windowText = `WINDOW (10 MB/s): ${winBar} ${state.downlinkCommittedSec.toFixed(1)}s / ${state.downlinkWindowSec.toFixed(1)}s [OVERFLOW +${(state.downlinkCommittedSec - state.downlinkWindowSec).toFixed(1)}s!]`;
    } else {
      windowText = `WINDOW (10 MB/s): ${winBar} ${state.downlinkCommittedSec.toFixed(1)}s / ${state.downlinkWindowSec.toFixed(1)}s [MARGIN: ${marginSec.toFixed(1)}s]`;
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
        'Onboard Processing (6 Wh) compresses CONFIRMED or PROBABLE cubes from 3 STR (40-45 MB) -> 1 STR (18 MB / 1.8s @ 10 MB/s).',
      );
      this.setBg(this.telemetryPanel, 'CubeInspectorCard', '#152238');
      this.setText(
        this.telemetryPanel,
        'Lbl_ProcessCube',
        'PROCESS SELECTED CUBE (-6 Wh -> 1 STR / 18 MB / 1.8s Tx)',
      );
      this.setText(
        this.telemetryPanel,
        'Lbl_QueueCube',
        'ADD SELECTED CUBE TO DOWNLINK BAY',
      );
    } else {
      const procTag = selectedPkt.processed ? 'PROCESSED' : 'RAW';
      const mb = selectedPkt.payloadMb ?? Number((selectedPkt.transmitSec * 10).toFixed(0));
      const confPct = selectedPkt.observationConfidencePct ?? (selectedPkt.confidence === 'CONFIRMED' ? 94 : selectedPkt.confidence === 'PROBABLE' ? 68 : 12);
      this.setText(
        this.telemetryPanel,
        'InspectorTitle',
        `${selectedPkt.id} | ${selectedPkt.sectorCode} ${selectedPkt.sectorName} (${selectedPkt.sensorMode} - ${procTag})`,
      );
      this.setText(
        this.telemetryPanel,
        'InspectorConfidence',
        `${selectedPkt.confidenceBadge} (${confPct}% SIM. OBS. CONF.) | ${selectedPkt.storageCost} STR (${mb} MB / ${selectedPkt.transmitSec.toFixed(1)}s @ 10 MB/s) | ${selectedPkt.headline}`,
      );
      this.setText(
        this.telemetryPanel,
        'InspectorScience',
        `${selectedPkt.scientificReason} ${selectedPkt.scientificCaveat ?? ''}`.trim(),
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
          ? `${selectedPkt.id} ALREADY PROCESSED (1 STR / 18 MB / 1.8s Tx)`
          : selectedPkt.confidence === 'UNVERIFIED'
            ? `CANNOT PROCESS [X] UNVERIFIED CUBE (DISCARD INSTEAD)`
            : `PROCESS ${selectedPkt.id} (-6 Wh -> 1 STR / 18 MB / 1.8s Tx)`,
      );

      this.setText(
        this.telemetryPanel,
        'Lbl_QueueCube',
        selectedPkt.queued
          ? `REMOVE ${selectedPkt.id} FROM DOWNLINK SLOT #${(selectedPkt.queueIndex ?? 0) + 1}`
          : `QUEUE ${selectedPkt.id} IN DOWNLINK BAY (${mb} MB / ${selectedPkt.transmitSec.toFixed(1)}s Tx)`,
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
        `OBJECTIVE: ${getMissionBenchmark(state.scenarioId, this.engine.getActiveCustomScenario()).score}/100 | CUTOFF ${state.downlinkWindowSec.toFixed(1)}s | ${state.paused ? 'PAUSED' : state.phase}`,
      );
      this.setBg(this.debriefPanel, 'DebriefBannerCard', '#132036');

      const requests = getScenarioRequests(state.scenarioId, this.engine.getActiveScenario());
      this.setText(
        this.debriefPanel,
        'OutcomeReq1',
        `${requests.REQ_1.shortLabel}: AWAITING DOWNLINK`,
      );
      this.setText(
        this.debriefPanel,
        'OutcomeReq2',
        `${requests.REQ_2.shortLabel}: AWAITING DOWNLINK`,
      );
      this.setText(
        this.debriefPanel,
        'OutcomeReq3',
        `${requests.REQ_3.shortLabel}: AWAITING DOWNLINK`,
      );
      this.setText(
        this.debriefPanel,
        'DebriefAdviceText',
        this.engine.getActiveScenario().briefing,
      );
    } else {
      const d = state.debrief;
      const isAcademyPass =
        state.scenarioId === 'ORBITAL_ACADEMY' && d.outcome === 'SUCCESS';
      const outcomeLabel = isAcademyPass
        ? 'TRAINING COMPLETE'
        : d.outcome === 'SUCCESS'
          ? 'MISSION SUCCESS'
          : d.outcome === 'PARTIAL_SUCCESS'
            ? 'PARTIAL SUCCESS'
            : 'MISSION FAILURE';
      this.setText(
        this.debriefPanel,
        'DebriefRankTitle',
        isAcademyPass
          ? `${outcomeLabel}: ${d.missionRank} (${d.totalScore}/${d.maxScore} PTS)`
          : `${outcomeLabel}: ${d.missionRank} [GRADE ${d.efficiencyGrade} / ${d.certification}] (${d.totalScore}/${d.maxScore} PTS)`,
      );
      this.setText(
        this.debriefPanel,
        'DebriefScoreSubtitle',
        isAcademyPass
          ? `1/1 Training Target Verified | ${d.transmittedPayloadMb ?? 0} MB (${d.downlinkUsedSec.toFixed(1)}s/${d.downlinkWindowSec.toFixed(1)}s @ 10 MB/s) | ${d.powerRemaining} Wh Left | Ready for OP 01: FIRELINE`
          : `${d.requestsVerifiedCount}/3 Verified | ${d.transmittedPayloadMb ?? 0} MB (${d.downlinkUsedSec.toFixed(1)}s/${d.downlinkWindowSec.toFixed(1)}s @ 10 MB/s) | ${d.powerRemaining} Wh Left`,
      );
      const bannerColor =
        d.outcome === 'SUCCESS'
          ? '#047857'
          : d.outcome === 'PARTIAL_SUCCESS'
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
      const diagPrefix =
        d.outcome !== 'SUCCESS' && d.failureExplanation
          ? `[DIAGNOSTIC: ${d.failureReasonCode ?? 'TRIAGE_GAP'}] ${d.failureExplanation} | `
          : '';
      this.setText(
        this.debriefPanel,
        'DebriefAdviceText',
        `${diagPrefix}${d.deterministicRecommendation} | ${d.counterfactualComparison}`,
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
