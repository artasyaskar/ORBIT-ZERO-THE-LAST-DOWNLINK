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
  Light,
  Line,
  Matrix4,
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
  describeWeather,
  getScenarioSector,
  getScenarioRequests,
  getScenarioThresholds,
  getRecommendedSensor,
  requestValue,
  SENSOR_PLAIN_GUIDE,
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
import { SolverMemo } from '../mission/solverMemo';
import { coveredRequestIds, formatClock, getNextStep, isPassStalled } from '../mission/guidance';
import { NamedChildCache, SceneObjectCache } from './sceneObjectCache';
import { clipText, retryGuidanceFor } from '../ui/debriefText';
import { DELIBERATE_SCANNER_PRESS_RADIUS_M, SCANNER_TARGET_ID, isStrayScannerGrab, pressOwner } from './scannerArbitration';
import { GLOBE_CARD_SCALE, IMMERSIVE_PANEL_POSES, MISSION_HUD_POSES, type PanelPose } from '../ui/spatialLayout';
import { SectorWeatherLayer } from './sectorWeatherFx';
import { paintSensorView } from '../ui/sensorViewPainter';
import { missionCardModel, resultModel, trackerText } from '../ui/hudText';
import { getXrEntryOverlay, isXrEntryOverlayShowing } from '../ui/xrEntryOverlay';
import { SCORING } from '../mission/missionConfig';
import { fmtRate, rateOf, rawStorageUnits } from '../mission/budgetText';
import type { DataPacket, MissionScenarioId, MissionState, SectorId, SensorMode } from '../mission/types';
import {
  GLOBE_RADIUS,
  SECTOR_GEO_DEFINITIONS,
  latLonToGlobePoint,
} from '../scene-assets/earthGlobe.scene-asset';
import { createEarthGlobeEnhancementsOptimized, updateEarthEnhancementsOptimized } from '../scene-assets/earthGlobeEnhancements.optimized';
import { GAUGE_SEGMENT_RANGES, GAUGE_SEGMENTS_MESH_NAME } from '../scene-assets/deskGauges.scene-asset';
import { alignSpan, isBakedStaticMaterial } from '../scene-assets/lib/hardsurface';
import { VRHandSimulator } from './vrHandSimulator';
import { OrbitalAudioController, type OrbitalSoundCue } from './orbitalAudio';
import { VoiceCommander, type VoiceDialogueId } from './voiceCommander';
import { AgenticCoPilot, type AgenticIntervention } from './agenticCoPilot';
import {
  getDailyPass, loadMissionProfile, recordDailyPass, recordMissionMastery, saveMissionProfile, starsFor, starString,
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
/**
 * Longest simulation step per frame. A stalled frame (headset off, GC pause, tab sleep) must not
 * eat the pass clock or the live downlink window in one jump.
 */
const MAX_SIMULATION_STEP_SEC = 0.1;
/** A second click on the same UIKit element inside this window is the other input path of the same pinch. */
const UI_CLICK_SAME_PINCH_MS = 1500;
/** Both the custom hand path and IWSDK's pointer can select a sector on one pinch; select once. */
const SECTOR_SELECT_DEDUPE_MS = 600;
/** Pointer event as seen on scene objects (@pmndrs/pointer-events, dispatched by IWSDK's input system). */
interface ScenePointerEvent {
  pointerType?: string;
  pointerId?: number;
}
type ScenePointerEventType = 'pointerdown' | 'pointerenter' | 'pointerleave';
/** Object3D as seen by IWSDK's pointer events. */
interface PointerEventTarget {
  addEventListener(type: ScenePointerEventType, listener: (event: ScenePointerEvent) => void): void;
  removeEventListener(type: ScenePointerEventType, listener: (event: ScenePointerEvent) => void): void;
}
/**
 * Desk pads (and the ARIA hologram) a hand can press, with the action each fires. Far presses come only
 * from IWSDK's hand ray (the visible laser); near presses from the app's fingertip/pinch proximity check.
 */
/**
 * Headset size of the main desk pads. The four front pads match the console push buttons they replace in
 * the headset (5.3 x 3.8 cm, was 2.6 x 1.9 cm); commit and discard get the same cap size class.
 */
const XR_DESK_PAD_SCALE: Readonly<Record<string, number>> = {
  'pad-toggle-sensor': 1.2,
  'pad-process-cradle': 1.2,
  'pad-queue-downlink': 1.2,
  'pad-fire-swath': 0.8,
  'pad-commit-downlink': 1.0,
  'pad-discard-chute': 1.0,
  // Hit targets under the round gauge-row buttons (3.1 x 2.2 cm, was 1.8 x 1.3 cm), still hidden by them.
  'pad-recenter-desk': 0.7,
  'pad-master-power': 0.7,
  'pad-aria-delegate': 0.7,
};
/**
 * The gauge-row buttons are drawn by the desk-gauges asset; the pad entity under each one is what the
 * laser and the near pinch press. Hover and press are mirrored onto the visible button.
 */
/** Evidence-cube parts tinted fully (colour and glow) and faintly (glow only) by setObjectTint. */
const CUBE_FULL_TINT_PARTS = ['CubeOuterFrame', 'CubeHighwayVector'] as const;
const CUBE_FAINT_TINT_PARTS = [
  'CubeConfidenceCore', 'CubeAcrylicShell', 'CubeContourWireframe_1', 'CubeBridgeSpan', 'CubeCloudObscurationCap', 'CubeRadarSpikes',
] as const;

const GAUGE_BUTTON_TWIN: Readonly<Record<string, { group: string; cap: string }>> = {
  'pad-recenter-desk': { group: 'RecenterDeskButton', cap: 'PadIlluminatedCap' },
  'pad-master-power': { group: 'MasterIgnitionSwitch', cap: 'MasterIgnitionCap' },
  'pad-aria-delegate': { group: 'AriaDelegationBeacon', cap: 'AriaBeaconCap' },
};
const LASER_PADS: ReadonlyArray<{ id: string; action: string }> = [
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
/**
 * A pinch acts on what the hand touches when the fingertip or pinch point is this close to it; otherwise
 * the laser decides. Pad centres are 9-12 cm apart and beacons 6.4-12 cm apart; the nearest one wins.
 */
const NEAR_PAD_REACH_M = 0.06;
const NEAR_BEACON_REACH_M = 0.05;
/** A pad under a hand laser grows by this factor. */
const LASER_PAD_HOVER_SCALE = 1.15;
/**
 * The laser and the fingertip check can both report one pinch on a pad, in the same frame. A second press of
 * the same pad inside this window is that duplicate; a deliberate second pinch (DISCARD confirm) takes longer.
 */
const SAME_PINCH_PAD_MS = 120;
/** Minimum gap between laser hover ticks, so sweeping across the six beacons is not a buzz. */
const LASER_HOVER_CUE_GAP_MS = 120;
/** Scanner sensor aperture in the tool's local frame (see createScannerToolAsset). */
const SCANNER_APERTURE_LOCAL = new Vector3(0, 0.092, -0.075);
/** Scanner beam axis in the tool's local frame: forward (-Z) from the aperture. */
const SCANNER_BEAM_DIR_LOCAL = new Vector3(0, 0, -1);
/** Length of the visible ScannerAimLaser cylinder (createScannerToolAsset), measured from the aperture. */
const SCANNER_BEAM_LENGTH_M = 0.28;
/** The beam locks on a beacon whose centre is within this distance of the beam axis (beacons are >= 6.4 cm apart). */
const SCANNER_BEAM_LOCK_RADIUS_M = 0.03;
/** A lock moves to another beacon only when that beacon is this much nearer the beam (no flicker between neighbours). */
const SCANNER_BEAM_SWITCH_MARGIN_M = 0.01;
/**
 * Pinch-release jitter: a release this soon after the beam slipped off a beacon still scans it, but only if the
 * beam had rested on it for SCANNER_LOCK_DWELL_MS (deliberate aim). Sweeping across a beacon never counts.
 */
const SCANNER_RELEASE_GRACE_MS = 200;
const SCANNER_LOCK_DWELL_MS = 250;
/** A scanner let go within this distance of the globe's surface with no lock gets the "no scan" feedback. */
const SCANNER_NEAR_GLOBE_M = 0.15;
/** Second-pinch window for in-world paid hints (see handleAriaDelegate). */
const HINT_CONFIRM_WINDOW_MS = 3000;
/** Second-pinch window for discarding from the pad or panel button in a headset (see handleDiscardSelected). */
const DISCARD_CONFIRM_WINDOW_MS = 3000;
/** Debrief panel elements that only matter before downlink; hidden once results are shown. */
const DEBRIEF_PANEL_OPERATIONS_ONLY = ['Slot1Card', 'Slot2Card', 'Slot3Card', 'Btn_ReorderQueue', 'Btn_CommitDownlink'] as const;

const GLOBE_CENTER_WORLD = new Vector3(0, 0.98, -0.48);
/** Seated-XR spot for the ARIA hologram: left of the globe, below the forward HUD strip. */
const ARIA_XR_POSITION = new Vector3(-0.38, 1.06, -0.7);
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
  /** Per tinted root: is it an evidence cube (tinted on its core), decided once. */
  private evidenceCubeRoots = new WeakMap<Object3D, boolean>();
  private cubeCanvasMap = new Map<number, CubeCanvasBinding>();
  private tempVec = new Vector3();
  private tempObj = new Object3D();
  private hasHiddenParkedPads = false;
  private static readonly CUBE_COMPRESSED_SCALE = new Vector3(0.72, 0.72, 0.72);
  private static readonly CUBE_FULL_SCALE = new Vector3(1, 1, 1);
  private static readonly RETICLE_AXIS = new Vector3(0, 0, 1);
  private static readonly RIGHT_AXIS = new Vector3(1, 0, 0);
  /** Panels farther than this from a hand cannot have a button within its 14 cm touch reach. */
  private static readonly PANEL_TOUCH_SCAN_RADIUS_M = 0.9;
  private readonly tempVecB = new Vector3();
  private readonly tempVecC = new Vector3();
  private readonly tempQuatA = new Quaternion();
  private readonly tempQuatB = new Quaternion();
  /** Globe world matrix the sector beacons were last placed for; skips re-placing them when unchanged. */
  private readonly beaconGlobeMatrix = new Matrix4();
  private beaconsPlaced: Object3D | null = null;
  /** Last values written to the desk gauges; instance colours are only rewritten when one changes. */
  private gaugeKey = -1;
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
  /** performance.now() deadline for the second pinch that confirms a paid in-world hint (0 = not armed). */
  private hintArmedUntilMs = 0;
  /** performance.now() deadline for the second pinch that confirms a pad/button discard (0 = not armed). */
  private discardArmedUntilMs = 0;
  private discardArmedPacketId: string | null = null;
  /** Sector the held scanner's beam is locked on right now (null = beam on no beacon). */
  private scannerBeamLock: SectorId | null = null;
  /** When the current lock began; and the last lock that ended: which beacon, when, and for how long it held. */
  private scannerBeamLockSince = -Infinity;
  private scannerBeamLastLockId: SectorId | null = null;
  private scannerBeamLastLockAt = -Infinity;
  private scannerBeamLastLockHeldMs = 0;
  /** Distance along the beam from the aperture to the locked beacon (sizes the visible beam). */
  private scannerBeamAlong = SCANNER_BEAM_LENGTH_M;
  private readonly beamOrigin = new Vector3();
  private readonly beamDir = new Vector3();
  private readonly beamPoint = new Vector3();
  private readonly beamBeacon = new Vector3();
  private readonly beamGlobeCenter = new Vector3();
  /** UIKit element the custom hand path clicked on the current pinch (IWSDK's duplicate click is dropped). */
  private customUiClick: { id: string; until: number } | null = null;
  /** Last sector selection, so one pinch seen by two input paths selects (and announces) once. */
  private lastSectorSelect: { id: SectorId | null; at: number } = { id: null, at: -Infinity };
  /** Hand-ray pointer ids currently over each laser target ('sector-b', 'pad-fire-swath', 'ui:Btn_StartPass'). */
  private readonly laserHover = new Map<string, Set<number>>();
  private lastLaserHoverCueAt = -Infinity;
  private lastPadPress: { id: string; at: number } = { id: '', at: -Infinity };
  /** Frames each hand's IWSDK ray has sat in SELECT with the pinch open and nothing under it. */
  private readonly stuckRayFrames = { left: 0, right: 0 };
  /** The last 40 sound cues (newest last), read by the e2e connection checks. */
  private readonly cueLog: Array<{ cue: OrbitalSoundCue; at: number }> = [];
  /** The player is away: XR session not visible, page hidden, or flat-page window blurred. */
  private interrupted = false;
  /** Voice and sound currently held (see syncMediaHold). */
  private mediaHeld = false;
  /** XR presentation state the desk pads were last synced for (null = never). */
  private deskPadsPresenting: boolean | null = null;
  private moodLightCache: Light[] | null = null;
  private baseEnvironmentIntensity?: number;
  /**
   * `world.getSceneObject(id)` walks the whole level tree on every call, and the per-frame update
   * and hand-interaction paths call it dozens of times. Lookups go through a revalidating cache:
   * a node that was removed, moved out of the scene, rebuilt, or belongs to another level is
   * re-resolved. See sceneObjectCache.ts.
   */
  private readonly sceneLookups = new SceneObjectCache({
    root: () => this.scene,
    resolve: (id) => this.world.getSceneObject(id),
    isCurrent: (id, object) =>
      object.userData.iwsdkSceneNodeId === id &&
      (object.userData.iwsdkSceneLevelId == null || object.userData.iwsdkSceneLevelId === this.world.activeLevelId),
  });
  /** Cached `root.getObjectByName(name)` for lookups made every frame (see NamedChildCache). */
  private readonly namedChildren = new NamedChildCache();
  private childByName<T extends Object3D = Object3D>(root: Object3D | null | undefined, name: string): T | undefined {
    return this.namedChildren.get<T>(root, name);
  }
  private sceneObject<T extends Object3D = Object3D>(id: string): T | undefined {
    return this.sceneLookups.get<T>(id);
  }
  private debriefBorder = '';
  /** Memoized planner keyed on every solver input, including the custom scenario instance. */
  private readonly solverMemo = new SolverMemo();
  private panelValues = new WeakMap<UIKitMLAsset, Map<string, string>>();
  private panelFontSizes = new WeakMap<object, number>();
  private frameSnapshot?: MissionState;
  private reviewState?: MissionState;
  private suppressReleaseActions = false;
  private readonly beamStart = new Vector3(0.39, 0.85, 0.035);
  private readonly beamEnd = new Vector3(0, 1.255, 0.01);
  private readonly worldUp = new Vector3(0, 1, 0);
  private scannerEntity?: Entity;
  /** What the app resolved each hand's current pinch to (null when it hit nothing). Cleared on release. */
  private readonly pressResolvedTarget = new Map<'left' | 'right', string | null>();
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
  /** Forward headset HUD: Mission Card -> Next Step + clock -> Result. */
  private missionHud?: UIKitMLAsset;
  /** Headset Mission Card is open until START PASS, the first scan, or training starts. */
  private xrCardOpen = true;
  private globeHudScale = 1;
  /** World-space panels on a flat screen duplicate the DOM HUD at unreadable size; XR / IWER always show them. */
  public spatialHudVisible = false;

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
    if (this.profile.preferences.relaxedClock) {
      this.engine.setRelaxedMode(true);
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
      getSolution: (state) => this.getSolution(state),
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
    // Leaving the page (tab hidden) or, on the flat page, switching away (window blur) holds the media and
    // pauses a running pass. In a headset the session's own visibility events do this (bindXRSessionHandEvents).
    const onPageVisibility = () => this.setInterrupted(document.hidden, true);
    const onWindowBlur = () => { if (!this.world.renderer.xr.isPresenting) this.setInterrupted(true, true); };
    const onWindowFocus = () => { if (!this.world.renderer.xr.isPresenting && !document.hidden) this.setInterrupted(false, false); };
    document.addEventListener('visibilitychange', onPageVisibility);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    this.cleanupFuncs.push(() => {
      document.removeEventListener('visibilitychange', onPageVisibility);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
    });
    // 1. Bind NASA Blue Marble 4K textures onto the 3D Earth Globe & Cloud Layer
    this.bindEarthPlanetTextures();

    // 1a. RC10: Mount Tactical Earth Enhancements (storm, lightning, flood over Indus Basin)
    const globe = this.sceneObject('earth-globe');
    if (globe) {
      this.earthGlobeEnhancements = createEarthGlobeEnhancementsOptimized();
      globe.add(this.earthGlobeEnhancements);
    }

    // Desk pads: headset-only ECS targets (desktop clicks the console's own buttons). See syncDeskPadsForXR.
    this.syncDeskPadsForXR(this.world.visibilityState.value !== VisibilityState.NonImmersive);

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
        this.selectSectorOnce(sectorId);
      });
    });

    // 2b. With tracked hands, far targets are pressed only by IWSDK's hand ray: the laser the player sees.
    // Point at a beacon or desk pad (it grows, a soft tick plays), pinch to press it. Ray only: a fingertip
    // brushing a beacon (IWSDK's touch pointer) must never retarget the next scan. Near presses (fingertip
    // within reach of a pad or beacon) stay with the app's proximity check in handleXRHandPressStart.
    for (const sectorEntity of this.queries.sectors.entities) {
      const sectorId = (sectorEntity.getValue(OrbitSectorNode, 'sectorId') || 'B') as SectorId;
      this.bindLaserTarget(sectorEntity.object3D, `sector-${sectorId.toLowerCase()}`, () => {
        this.withInputSource('xr-hand', () => {
          this.tutorial.notifySectorPointed(sectorId, 'xr-hand');
          this.selectSectorOnce(sectorId);
        });
      }, () => this.withInputSource('xr-hand', () => this.tutorial.notifySectorPointed(sectorId, 'xr-hand')));
    }
    for (const pad of LASER_PADS) {
      this.bindLaserTarget(this.sceneObject(pad.id), pad.id, () => this.pressPadByHand(pad.id, pad.action));
    }
    // Pointer hit-testing walks every descendant of an interactable entity, for every hand pointer, every
    // frame, hidden or not. The ARIA hologram has 44 parts (most are hidden proxies) and each cube 14, so
    // each is hit-tested through one representative mesh instead: ARIA's portrait plate (what the laser
    // aims at) and the cube's acrylic shell (the box around its core). Events still bubble to the entity.
    this.limitPointerHitTest(this.sceneObject('avatar-aria'), 'AriaPortraitPlate');
    for (const cubeEntity of this.queries.cubes.entities) this.limitPointerHitTest(cubeEntity.object3D, 'CubeAcrylicShell');

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
          this.applyXRPerformanceProfile(false);
          this.forceReleaseAllGrabs();
          this.player.position.set(0, 0, 0);
          this.player.rotation.set(0, 0, 0);
          this.syncAll();
        } else {
          // On physical Quest hardware in local-floor space, restore persisted seated calibration
          const [ox, oy, oz] = this.profile.preferences.seatOffset;
          this.player.position.set(ox, oy, oz);
          this.applyXRPerformanceProfile(true);
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
      getSceneObject: (id) => this.sceneObject(id),
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
      setSensor: (mode) => {
        this.applyAction({ type: 'SET_SENSOR', sensorMode: mode });
        this.syncSensorSwitchHardware(this.engine.getState().activeSensorMode);
        this.playCue('SELECT_SECTOR');
        this.syncAll();
      },
      requestHint: () => this.requestAriaHint(),
      abortPass: () => this.handleAbortPass(),
      startAcademy: () => this.launchScenario('ORBITAL_ACADEMY'),
      launchScenario: (id) => this.launchScenario(id as MissionScenarioId),
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
          const panel = this.sceneObject<UIKitMLAsset>(panelId);
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
        getPanelText: (panelId: string, elementId: string) => this.sceneObject<UIKitMLAsset>(panelId)?.getElementById<UIKit.Text>(elementId)?.properties.value.text,
        clickPanel: (panelId: string, elementId: string) => {
          const panel = this.sceneObject<UIKitMLAsset>(panelId);
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
        getCueLog: () => this.cueLog.slice(),
        getMediaState: () => ({
          interrupted: this.interrupted,
          held: this.mediaHeld,
          audio: this.audio.getState(),
          voiceHeld: this.voiceCommander?.getIsHeld() ?? null,
          voiceSpeaking: this.voiceCommander?.getIsSpeaking() ?? null,
        }),
        /** IWSDK's per-hand pointer arbitration: which sub-pointer is active and what the hand ray (the laser) hits. */
        getHandPointerState: (hand: 'left' | 'right') => {
          const multi = (this.input as unknown as { xr?: { multiPointers?: Record<string, any> } }).xr?.multiPointers?.[hand];
          if (!multi) return null;
          const nodeOf = (hit: any): string | null => {
            for (let o = hit?.object; o; o = o.parent) if (o.userData?.iwsdkSceneNodeId) return o.userData.iwsdkSceneNodeId;
            return null;
          };
          const ray = multi.getPointer('ray')?.getIntersection?.();
          const touch = multi.getPointer('touch')?.getIntersection?.();
          const grab = multi.getPointer('grab')?.getIntersection?.();
          return {
            activeKind: multi.getActiveKind?.() ?? null,
            states: Object.fromEntries(multi.pointerStates ?? []),
            rayHitObject: ray?.object?.name ?? null,
            rayTarget: nodeOf(ray),
            rayDistance: ray?.distance ?? null,
            touchTarget: nodeOf(touch),
            touchDistance: touch?.distance ?? null,
            grabTarget: nodeOf(grab),
            grabDistance: grab?.distance ?? null,
          };
        },
        getLaserHover: () => [...this.laserHover.entries()].filter(([, pointers]) => pointers.size > 0).map(([id]) => id),
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
        requestHint: () => this.requestAriaHint(),
        abortPass: () => this.handleAbortPass(),
        closeLink: () => { this.applyAction({ type: 'CLOSE_LINK' }); this.syncAll(); return this.engine.getState(); },
        setRelaxedMode: (enabled: boolean) => this.setRelaxedMode(enabled),
        getNextStep: () => getNextStep(this.engine.getState(), this.engine.getActiveCustomScenario()),
        startProceduralCrisis: (seed?: string | number) => this.startProceduralPass(seed),
        executeCoPilotDelegation: () => this.requestAriaHint(),
        getCoPilotIntervention: () => this.coPilot.getActiveIntervention(),
        getTotalDelegations: () => this.coPilot.getTotalDelegations(),
        handleMasterIgnition: () => this.handleMasterIgnition(),
        toggleSpatialHud: (active?: boolean) => this.toggleSpatialHud(active),
        getSpatialHudVisible: () => this.spatialHudVisible,
        calibrateSeatedView: () => this.calibrateSeatedView(),
        getSceneObject: (id: string) => this.sceneObject(id),
        trigger3DNode: (nodeId: string) => this.handleTrigger3DNodeById(nodeId),
        highlightDropZones: (active: boolean) => this.highlightDropZones(active),
        handleControlAction: (action: string) => this.handleControlAction(action),
        rotateGlobe: (yaw: number, pitch: number) => this.rotateGlobe(yaw, pitch),
        zoomGlobe: (delta: number) => this.zoomGlobe(delta),
        getGlobeRotationDelta: () => {
          const globe = this.sceneObject('earth-globe');
          if (!globe) return 0;
          return 2 * Math.acos(Math.min(1, Math.max(-1, globe.quaternion.w)));
        },
        getGlobeFocalDistance: () => {
          const globe = this.sceneObject('earth-globe');
          return globe ? globe.position.z : -0.58;
        },
        resetGlobeFocalDistance: () => {
          this.targetFocalDistance = -0.48;
          this.globeFocalDistance = -0.48;
          const globe = this.sceneObject('earth-globe');
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
        getSceneLookupStats: () => ({ ...this.sceneLookups.stats, cached: this.sceneLookups.size }),
        getSolverStats: () => ({ ...this.solverMemo.stats }),
        /** Read-only handle for the Virtual Quest perf/XR probes (tests/virtual-quest). */
        getWebGLRenderer: () => this.world.renderer,
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
          VRHandSimulator.verifySeatedReachEnvelope(this.scene, (id) => this.sceneObject(id)),
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
      this.whenPlayerReady(() => this.announceActiveScenarioPassStart());
    }, 600);

    this.syncAll();
  }

  /**
   * Runs `speak` once the player can hear it: the page has had a user gesture (browsers block speech
   * and sound before the first one) and the VR entry overlay is not up. In the headset lobby the game
   * loads before any tap, so the opening line plays after entering VR (or choosing the flat screen)
   * instead of being blocked or spoken over the lobby.
   */
  private whenPlayerReady(speak: () => void): void {
    const ready = () => {
      const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
      return (!activation || activation.hasBeenActive) && !isXrEntryOverlayShowing();
    };
    if (ready()) {
      speak();
      return;
    }
    const timer = window.setInterval(() => {
      if (!ready()) return;
      window.clearInterval(timer);
      window.setTimeout(speak, 600);
    }, 250);
    this.cleanupFuncs.push(() => window.clearInterval(timer));
  }

  private announceActiveScenarioPassStart(): void {
    const st = this.engine.getState();
    const sc = this.engine.getActiveScenario();
    // One config-driven line for every operation, so the spoken numbers always match the budget.
    this.voiceCommander?.speakDirect(
      `Orbit Zero online. ${sc.operationCode ?? sc.name} active. ${st.power} Watt-hours and ${st.maxStorage} Storage Units ready. Select a priority sector on the globe.`,
      `[ARIA-7] ${sc.operationCode ?? sc.name} [SIMULATED]. ${st.power} Wh / ${st.maxStorage} STR online. Select sector on globe.`,
      'HIGH',
    );
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
      const obj = this.sceneObject(id);
      if (!obj) continue;
      obj.visible = isImmersive;
      // Every part of a pad is shown (the FIRE SWATH plunger is base + guard ring + cap; showing only its
      // first mesh left a dark stub). In the headset the main pads take the size of the console buttons
      // they replace, so the button the laser presses is the one the player sees.
      const authored = (obj.userData.authoredScale ??= obj.scale.x) as number;
      const scale = isImmersive ? XR_DESK_PAD_SCALE[id] ?? authored : authored;
      obj.scale.setScalar(scale);
      obj.userData.laserBaseScale = scale;
      if (GAUGE_BUTTON_TWIN[id]) {
        // The round button above it is what the player sees. This pad stays a hit target (IWSDK's pointers
        // test Object3D.visible) but is not drawn, so its corners never show under the button.
        obj.traverse((child) => {
          if (child instanceof Mesh && !Array.isArray(child.material)) child.material.visible = !isImmersive;
        });
      }
    }
    // The console's own push buttons (and their bezels) are the desktop click targets for these actions.
    // In the headset they duplicated the pads 3 cm behind them and did nothing when pinched or lasered.
    const tactileButtons = this.sceneObject('orbital-console')?.getObjectByName('TactileDeckControls');
    if (tactileButtons) tactileButtons.visible = !isImmersive;
  }

  update(delta: number): void {
    if (this.hintArmedUntilMs > 0 && performance.now() > this.hintArmedUntilMs) {
      this.hintArmedUntilMs = 0; // armed hint expired unspent: restore the HUD label
      this.syncMissionHud();
    }
    if (this.discardArmedUntilMs > 0 && performance.now() > this.discardArmedUntilMs) {
      this.discardArmedUntilMs = 0; // armed discard expired: nothing was thrown away
      this.discardArmedPacketId = null;
      this.syncTelemetryPanel();
    }
    const presenting = this.world.renderer.xr.isPresenting;
    if (presenting !== this.deskPadsPresenting) {
      this.deskPadsPresenting = presenting;
      this.syncDeskPadsForXR(presenting);
      this.syncAll(); // headset and flat page show different panels and panel content
    }
    this.updateXRHandInteractions(delta);
    if (presenting) this.recoverStuckHandRays();
    this.updateMissionHudPose(Math.min(Math.max(0, delta), 0.1));
    this.frameSnapshot = this.engine.getState();
    this.syncMediaHold(this.frameSnapshot.paused);
    if (this.frameSnapshot.paused) return;
    const simulationDelta = Math.min(Math.max(0, delta), MAX_SIMULATION_STEP_SEC);
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
    this.weatherLayer?.animate(this.elapsedTime, reducedMotion);

    // Deep Agentic Co-Pilot Telemetry & Spatial Delegation Loop
    const intervention = this.coPilot.update(delta);
    const gaugesAsset = this.sceneObject('desk-gauges');
    if (gaugesAsset) {
      const beaconCap = this.childByName(gaugesAsset, 'AriaBeaconCap');
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

    // Phase 5: In-Engine VR Hand & Ergonomic Simulator (desktop demo aid). The solver call below serializes
    // the whole mission state, so it only runs while the simulator is switched on.
    if (this.vrHandSimulator.isActive() && this.frameSnapshot.phase === 'OPERATIONS') {
      const solution = this.getSolution(this.frameSnapshot);
      const next = getNextPlanAction(this.frameSnapshot, solution);
      if (next) {
        if (next.type === 'SCAN') {
          if (this.frameSnapshot.selectedSectorId !== next.sectorId) {
            const beaconObj = this.sceneObject(`sector-${next.sectorId.toLowerCase()}`);
            if (beaconObj) {
              const pos = new Vector3();
              beaconObj.getWorldPosition(pos);
              this.vrHandSimulator.setDemoTarget(pos);
            }
          } else if (this.frameSnapshot.activeSensorMode !== next.sensorMode) {
            const switchObj = this.sceneObject('pad-toggle-sensor');
            if (switchObj) {
              const pos = new Vector3();
              switchObj.getWorldPosition(pos);
              this.vrHandSimulator.setDemoTarget(pos);
            }
          } else {
            const plungerObj = this.sceneObject('pad-fire-swath');
            if (plungerObj) {
              const pos = new Vector3();
              plungerObj.getWorldPosition(pos);
              this.vrHandSimulator.setDemoTarget(pos);
            }
          }
        } else if (next.type === 'PROCESS') {
          const cradleObj = this.sceneObject('pad-process-cradle');
          if (cradleObj) {
            const pos = new Vector3();
            cradleObj.getWorldPosition(pos);
            this.vrHandSimulator.setDemoTarget(pos);
          }
        } else if (next.type === 'QUEUE') {
          const bayObj = this.sceneObject('pad-queue-downlink');
          if (bayObj) {
            const pos = new Vector3();
            bayObj.getWorldPosition(pos);
            this.vrHandSimulator.setDemoTarget(pos);
          }
        }
      } else if (this.frameSnapshot.queuePacketIds.length > 0) {
        const leverObj = this.sceneObject('pad-commit-downlink');
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

      let gazedEntity: Entity | null = null;
      for (const sectorEntity of this.queries.sectors.entities) {
        const sObj = sectorEntity.object3D;
        if (!sObj || !isVisible(sObj)) continue;
        sObj.updateWorldMatrix(true, false);
        const toSector = this.tempVecB.setFromMatrixPosition(sObj.matrixWorld).sub(headPos).normalize();
        const angle = headDir.angleTo(toSector);
        if (angle < minAngle) {
          minAngle = angle;
          closestGazedSector = (sectorEntity.getValue(OrbitSectorNode, 'sectorId') || 'B') as SectorId;
          gazedEntity = sectorEntity;
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
            if (gazedEntity?.object3D) {
              const isSelected = closestGazedSector === this.engine.getState().selectedSectorId;
              const baseScale = isSelected ? 1.32 : 1.18;
              const dwellScale = baseScale + dwellProgress * 0.16;
              gazedEntity.object3D.scale.set(dwellScale, dwellScale, dwellScale);
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
    const vibratingDesk = this.childByName(this.sceneObject('orbital-console'), 'ConsoleDeskAssembly');
    if (vibratingDesk) vibratingDesk.position.x = 0;
    for (const [padId, timer] of this.padPressTimers.entries()) {
      const newTimer = Math.max(0, timer - delta);
      const padObj = this.sceneObject(padId);
      const cap = this.childByName(padObj, 'PadIlluminatedCap');
      const stroke = padId === 'pad-fire-swath' ? 0.012 : 0.009; // -12mm stroke for plunger, -9mm for pads
      // Gauge-row pads sit under a visible button of the desk-gauges asset: that button's cap moves too.
      const twin = GAUGE_BUTTON_TWIN[padId];
      const twinCap = twin ? this.childByName(this.childByName(this.sceneObject('desk-gauges'), twin.group), twin.cap) : undefined;
      const twinRestY = twinCap ? ((twinCap.userData.pressRestY ??= twinCap.position.y) as number) : 0;
      if (cap) {
        // Spring back to the cap's authored height. A fixed 0.016 left pad caps 1 cm above their socket
        // after the first press, where a laser aimed at the pad missed them.
        const restY = (cap.userData.pressRestY ??= cap.position.y) as number;
        if (newTimer > 0) {
          this.padPressTimers.set(padId, newTimer);
          const progress = 1.0 - newTimer / 0.18;
          const depression = reducedMotion ? 0 : Math.sin(progress * Math.PI) * Math.exp(-1.8 * progress);
          cap.position.y = restY - depression * stroke;
          if (twinCap) twinCap.position.y = twinRestY - depression * 0.005; // 5 mm on the small round caps

          // Diegetic console vibration pulse during button press (never camera)
          if (vibratingDesk && progress < 0.5) {
            const vibration = Math.sin(progress * Math.PI * 8) * 0.003;
            vibratingDesk.position.x += vibration;
          }
        } else {
          cap.position.y = restY;
          if (twinCap) twinCap.position.y = twinRestY;
          this.padPressTimers.delete(padId);
          this.audio.playMechanicalSwitchClick(false);
        }
      } else if (newTimer <= 0) {
        this.padPressTimers.delete(padId);
      }
    }

    // Phase 3 SPRINT 3: Data Cube Internal State Visuals & Compression Animation
    // One pass over the (at most three) cube entities; no array copies or new vectors per frame.
    for (const cubeEntity of this.queries.cubes.entities) {
      const cubeRoot = cubeEntity.object3D;
      const packetId = cubeEntity.getValue(EvidenceCubeNode, 'packetId');
      if (!cubeRoot || !packetId) continue;
      const pkt = this.frameSnapshot.packets.find((p) => p.id === packetId);
      // Animate 30% compression shrink when processed in cradle (4.5s -> 1.8s transmission)
      if (!pkt || this.cubeInteractions.isHeld(cubeRoot)) continue;
      if (pkt.processed && !pkt.queued) {
        const compressionProgress = Math.min(1, this.elapsedTime * 1.8);
        cubeRoot.scale.lerp(MissionControlSystem.CUBE_COMPRESSED_SCALE, compressionProgress * 0.4);
      } else {
        cubeRoot.scale.lerp(MissionControlSystem.CUBE_FULL_SCALE, 0.2);
      }
    }

    // Phase 3: Diegetic 3D Segmented Arc Gauges Update (Battery, Storage, Karachi Window)
    const deskGauges = this.sceneObject('desk-gauges');
    if (deskGauges && this.frameSnapshot) {
      const state = this.frameSnapshot;
      const cUnlit = MissionControlSystem.GAUGE_COLOR_UNLIT;
      const cCyan = MissionControlSystem.GAUGE_COLOR_CYAN;
      const cAmber = MissionControlSystem.GAUGE_COLOR_AMBER;
      const cRed = MissionControlSystem.GAUGE_COLOR_RED;
      const mats = deskGauges.userData.materials;

      // Gauges are scaled to this scenario's budget (battery, memory, window), not to fixed numbers.
      const battFrac = state.power / Math.max(1, state.maxPower);
      const litBattSegs = Math.max(0, Math.min(10, Math.ceil(battFrac * 10)));
      const litStorageSegs = Math.max(0, Math.min(9, Math.ceil((state.storageUsed / Math.max(1, state.maxStorage)) * 9)));
      let totalTxSec = 0;
      for (const p of state.packets) if (state.queuePacketIds.includes(p.id)) totalTxSec += p.transmitSec;
      const isOverflow = totalTxSec > state.downlinkWindowSec;
      const litWinSegs = Math.max(0, Math.min(10, Math.ceil((totalTxSec / Math.max(0.1, state.downlinkWindowSec)) * 10)));
      const flashRed = isOverflow && Math.sin(this.elapsedTime * 14) > 0;
      // The segment colours depend only on these five values: rewrite (and re-upload) them only when one changes.
      const battTone = battFrac > 0.8 ? 0 : battFrac >= 0.36 ? 1 : 2;
      const winTone = flashRed ? 2 : totalTxSec <= 0.8 * state.downlinkWindowSec ? 0 : 1;
      const gaugeKey = litBattSegs + 11 * (battTone + 3 * (litStorageSegs + 10 * (litWinSegs + 11 * winTone)));
      const gaugesChanged = gaugeKey !== this.gaugeKey;
      this.gaugeKey = gaugeKey;

      // All three meters are ranges of one InstancedMesh (battery 10, storage 9, Karachi window 10 segments).
      const segments = gaugesChanged ? this.childByName(deskGauges, GAUGE_SEGMENTS_MESH_NAME) : undefined;
      if (segments instanceof InstancedMesh) {
        const battColor = battFrac > 0.8 ? cCyan : battFrac >= 0.36 ? cAmber : cRed;
        const winColor = flashRed ? cRed : totalTxSec <= 0.8 * state.downlinkWindowSec ? cCyan : cAmber;
        const { battery, storage, window: win } = GAUGE_SEGMENT_RANGES;
        for (let i = 0; i < battery.count; i++) segments.setColorAt(battery.start + i, i < litBattSegs ? battColor : cUnlit);
        for (let i = 0; i < storage.count; i++) segments.setColorAt(storage.start + i, i < litStorageSegs ? cAmber : cUnlit);
        for (let i = 0; i < win.count; i++) segments.setColorAt(win.start + i, i < litWinSegs ? winColor : cUnlit);
        if (segments.instanceColor) segments.instanceColor.needsUpdate = true;
      } else if (mats && gaugesChanged) {
        const battMat = battFrac > 0.8 ? mats.cyan : battFrac >= 0.36 ? mats.amber : mats.red;
        const winMat = flashRed ? mats.red : totalTxSec <= 0.8 * state.downlinkWindowSec ? mats.cyan : mats.amber;
        for (let i = 0; i < 10; i++) {
          const seg = this.childByName(deskGauges, `GaugeBattSeg_${i}`);
          if (seg instanceof Mesh) seg.material = i < litBattSegs ? battMat : mats.unlit;
        }
        for (let i = 0; i < 9; i++) {
          const seg = this.childByName(deskGauges, `GaugeStorageSeg_${i}`);
          if (seg instanceof Mesh) seg.material = i < litStorageSegs ? mats.amber : mats.unlit;
        }
        for (let i = 0; i < 10; i++) {
          const seg = this.childByName(deskGauges, `GaugeWindowSeg_${i}`);
          if (seg instanceof Mesh) seg.material = i < litWinSegs ? winMat : mats.unlit;
        }
      }
    }

    // Phase 3: Swath Plunger Safety Guard Ring Pulse
    const plunger = this.sceneObject('pad-fire-swath');
    if (plunger && this.frameSnapshot) {
      const guardRing = this.childByName(plunger, 'PlungerGuardRing');
      if (guardRing instanceof Mesh && guardRing.material instanceof MeshStandardMaterial) {
        const hasTarget = Boolean(this.frameSnapshot.selectedSectorId);
        guardRing.material.emissiveIntensity = hasTarget ? 0.75 + 0.35 * Math.sin(this.elapsedTime * 4) : 0.2;
      }
    }

    // Phase 4: Dynamic 5Hz pulse on radar multipath backscatter spikes & highway route pulse
    for (const cubeEntity of this.queries.cubes.entities) {
      const obj = cubeEntity.object3D;
      const spikes = this.childByName(obj, 'CubeRadarSpikes');
      if (spikes && spikes.visible) {
        const pulse = 1.0 + 0.35 * Math.sin(this.elapsedTime * 31.4); // 5Hz pulse
        spikes.scale.set(1, pulse, 1);
      }
      const hVec = this.childByName(obj, 'CubeHighwayVector');
      if (hVec instanceof Mesh && hVec.visible && hVec.material instanceof MeshStandardMaterial) {
        hVec.material.emissiveIntensity = 1.25 + 0.35 * Math.sin(this.elapsedTime * 4.0);
      }
    }

    const orbitalConsole = this.sceneObject('orbital-console');
    if (orbitalConsole) {
      // Phase 1: 2,500 Starfield Scintillation & Cosmic Drift
      const starfield = this.childByName(orbitalConsole, 'CupolaStarfieldDome');
      if (starfield instanceof Points && starfield.material instanceof PointsMaterial) {
        starfield.rotation.y += (reducedMotion ? 0 : delta) * 0.0012;
        starfield.material.opacity = 0.90 + 0.07 * Math.sin(this.elapsedTime * 2.5);
      }
      // Circular Holographic War Table Radar Sweep Blade
      const sweepBlade = this.childByName(orbitalConsole, 'TacticalRadarSweepBlade');
      if (sweepBlade) {
        sweepBlade.rotation.z += (reducedMotion ? 0 : delta) * 0.95;
      }
    }

    // Phase 2: Commander ARIA-7 Voice Handler Tick & 3D Holographic AI Avatar Dynamic Animation
    this.voiceCommander?.tick(delta);
    const avatarObj = this.sceneObject('avatar-aria');
    if (avatarObj && this.voiceCommander) {
      const metrics = this.voiceCommander.getAvatarMetrics(delta);
      const core = this.childByName(avatarObj, 'AriaCore');
      const emitter = this.childByName(avatarObj, 'AriaEmitter');

      if (core) {
        core.rotation.y += (reducedMotion ? 0 : delta) * (metrics.isSpeaking ? 1.8 : 0.45);
        core.rotation.x += (reducedMotion ? 0 : delta) * (metrics.isSpeaking ? 1.2 : 0.25);
        const s = metrics.coreScale;
        core.scale.set(s, s, s);
      }
      if (emitter instanceof Mesh && emitter.material instanceof MeshStandardMaterial) {
        emitter.material.emissiveIntensity = 0.9 + (metrics.isSpeaking ? 0.8 * metrics.intensity : 0.12 * Math.sin(this.elapsedTime * 3));
      }

      // Animate 3D Audio Spectrum Waveform bars beside ARIA's head (Concept Image 1 Match - InstancedMesh)
      const waveformObj = this.childByName(avatarObj, 'AriaWaveform3D');
      if (waveformObj) {
        const instancedBars = this.childByName(waveformObj, 'AriaWaveformInstancedBars');
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
            const bar = this.childByName(waveformObj, `AriaWaveBar_${i}`);
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

    const globe = this.sceneObject('earth-globe');
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
        const qYaw = this.tempQuatA.setFromAxisAngle(this.worldUp, this.globeAngularVelocity.x);
        const qPitch = this.tempQuatB.setFromAxisAngle(MissionControlSystem.RIGHT_AXIS, this.globeAngularVelocity.y);
        globe.quaternion.premultiply(qYaw.multiply(qPitch));
      }

      // Phase 1: Smooth Focal Zoom Distance Interpolation
      if (Math.abs(globe.position.z - this.targetFocalDistance) > 0.0005) {
        this.globeFocalDistance += (this.targetFocalDistance - this.globeFocalDistance) * (1.0 - Math.exp(-12.0 * delta));
        globe.position.z = this.globeFocalDistance;
      }

      // VR-BUG-02 Fix: Keep all 6 interactive sector beacons (sector-a..f) locked to Earth Globe rotation & zoom
      this.syncGlobeSectorBeaconPositions();
      const cloudSphere = this.childByName(globe, 'GlobeCloudSphere');
      if (cloudSphere) {
        cloudSphere.rotation.y += (reducedMotion ? 0 : delta) * 0.018;
      }
      const ring = this.childByName(globe, 'EquatorTelemetryRing');
      if (ring) {
        ring.rotation.z += (reducedMotion ? 0 : delta) * 0.14;
      }
      const outerBand = this.childByName(globe, 'OuterAzimuthRingGroup');
      if (outerBand) {
        outerBand.rotation.z -= (reducedMotion ? 0 : delta) * 0.09;
      }
      // Glowing atmosphere rim halo pulse
      const atmoRim = this.childByName(globe, 'GlobeAtmosphereRim');
      if (atmoRim instanceof Mesh && atmoRim.material instanceof MeshBasicMaterial) {
        atmoRim.material.opacity = 0.20 + 0.08 * Math.sin(this.elapsedTime * 2.2);
      }
      const horizonHalo = this.childByName(globe, 'GlobeHorizonHalo');
      if (horizonHalo instanceof Mesh && horizonHalo.material instanceof MeshBasicMaterial) {
        horizonHalo.material.opacity = 0.28 + 0.06 * Math.sin(this.elapsedTime * 1.8);
      }

      // Dynamic breathing pulse on active target sector ribbon
      const selectedId = this.engine.getState().selectedSectorId;
      const selectedRibbon = this.childByName(globe, `SectorPoly_${selectedId}`);
      if (
        selectedRibbon instanceof Mesh &&
        selectedRibbon.material instanceof MeshStandardMaterial
      ) {
        selectedRibbon.material.emissiveIntensity =
          1.45 + 0.45 * Math.sin(this.elapsedTime * 4.5);
      }

      // Update & animate cinematic targeting reticle on globe surface (Concept Image 2)
      const activeReticle = this.childByName(globe, 'ActiveSectorReticleGroup');
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
              this.tempVecB,
            );
            activeReticle.position.copy(reticlePos);
            const normal = reticlePos.normalize();
            activeReticle.quaternion.setFromUnitVectors(MissionControlSystem.RETICLE_AXIS, normal);
            const pulseScale = 1.0 + 0.06 * Math.sin(this.elapsedTime * 4.0);
            activeReticle.scale.set(pulseScale, pulseScale, pulseScale);
          }
        }
      }

      // Animate Sub-Satellite Nadir Pip gliding along ground track over the Indus Basin
      const nadirPip = this.childByName(globe, 'SubSatelliteNadirPip');
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
      const swathCone = this.childByName(globe, 'OrbitalScanSwathCone');
      if (
        swathCone instanceof Mesh &&
        swathCone.material instanceof MeshBasicMaterial
      ) {
        const cubesat = this.sceneObject('cubesat-spacecraft');
        const activeSectorId = this.scanBeamPulseTimer > 0 ? this.scanBeamSectorId : this.engine.getState().selectedSectorId;
        const sectorDef = SECTOR_GEO_DEFINITIONS[activeSectorId];

        // The cone is only drawn during the 0.85 s scan pulse, so it is only aimed then.
        if (cubesat && sectorDef && this.scanBeamPulseTimer > 0) {
          const pSatLocal = globe.worldToLocal(cubesat.getWorldPosition(this.tempVecB));
          const pSectorLocal = latLonToGlobePoint(
            sectorDef.centerLatLon[0],
            sectorDef.centerLatLon[1],
            GLOBE_RADIUS,
            this.tempVecC,
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
    const cubesat = this.sceneObject('cubesat-spacecraft');
    if (cubesat) {
      this.initSpacecraftTelemetryLEDs(cubesat);

      // Spacecraft Avionics Bus Telemetry Indicators
      const attitudeLock = this.childByName(cubesat, 'AdcsAttitudeLockLED');
      if (attitudeLock instanceof Mesh && attitudeLock.material instanceof MeshStandardMaterial) {
        attitudeLock.material.emissiveIntensity = 0.8 + 0.2 * Math.sin(this.elapsedTime * 2.0);
      }
      const epsHeartbeat = this.childByName(cubesat, 'PowerTelemetryHeartbeatLED');
      if (epsHeartbeat instanceof Mesh && epsHeartbeat.material instanceof MeshStandardMaterial) {
        const isLowPower = this.frameSnapshot.power < 15;
        epsHeartbeat.material.color.setHex(isLowPower ? 0xf59e0b : 0x38bdf8);
        epsHeartbeat.material.emissive.setHex(isLowPower ? 0xd97706 : 0x0284c7);
        epsHeartbeat.material.emissiveIntensity = 0.5 + 0.3 * Math.sin(this.elapsedTime * 3.14);
      }

      // Starboard (Right) Window Flight Locus (Concept Images 1 & 2):
      // Satellite cruises comfortably inside the right window without obscuring the central Earth globe
      // Kept well behind the side HUD panels (they sit about 1 m out) so it never floats over text.
      const satBaseX = 0.85;
      const satBaseY = 1.45;
      const satBaseZ = -1.9;
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
    const scannerObj = this.sceneObject('scanner-tool');
    if (scannerObj) {
      const currentPhase = this.frameSnapshot.phase;
      const scannerEntity = this.scannerEntity ??= [...this.queries.controls.entities].find((e) => e.getValue(ConsoleControlNode, 'action') === 'SCAN');
      const isGrabbed = currentPhase === 'OPERATIONS' && (scannerEntity?.hasComponent(Grabbed) ?? false);
      const aimLaser = this.childByName(scannerObj, 'ScannerAimLaser');
      if (
        aimLaser instanceof Mesh &&
        aimLaser.material instanceof MeshBasicMaterial
      ) {
        if (isGrabbed) {
          const mode = this.frameSnapshot.activeSensorMode;
          aimLaser.material.color.setHex(mode === 'OPTICAL' ? 0x38bdf8 : mode === 'THERMAL' ? 0xff6b2b : 0xf59e0b);
          aimLaser.visible = true;

          // One aim rule for the live highlight and for the scan on release (see scannerBeamTarget).
          const previousLock = this.scannerBeamLock;
          const lock = this.scannerBeamTarget(scannerObj, previousLock);
          if (lock !== previousLock) {
            const now = performance.now();
            if (previousLock) {
              this.scannerBeamLastLockId = previousLock;
              this.scannerBeamLastLockAt = now;
              this.scannerBeamLastLockHeldMs = now - this.scannerBeamLockSince;
            }
            this.scannerBeamLockSince = now;
          }
          this.scannerBeamLock = lock;
          // A locked beam stops at its beacon and brightens, so the player sees exactly what a release scans.
          const beamLen = lock ? Math.min(SCANNER_BEAM_LENGTH_M, Math.max(0.02, this.scannerBeamAlong)) : SCANNER_BEAM_LENGTH_M;
          aimLaser.scale.set(1, beamLen / SCANNER_BEAM_LENGTH_M, 1);
          aimLaser.position.z = -0.07 - beamLen / 2; // the beam starts at the lens face (local z = -0.07)
          aimLaser.material.opacity = lock ? 0.9 : 0.4;
          if (lock && lock !== previousLock) {
            // The locked beacon becomes the selected sector: it grows and glows, and the HUD reads "SCAN SECTOR X".
            if (lock !== this.engine.getState().selectedSectorId) this.applyAction({ type: 'SELECT_SECTOR', sectorId: lock });
            this.playCue('WAND_LOCK');
            this.syncAll();
          }
        } else {
          aimLaser.material.opacity = 0.0;
          aimLaser.visible = false;
          this.scannerBeamLock = null;
        }
      }
    }

    // Animated processing cradle pneumatic clamps & status induction flash
    if (this.cradlePulseTimer > 0) {
      this.cradlePulseTimer = Math.max(0, this.cradlePulseTimer - delta);
      const consoleObj = this.sceneObject('orbital-console');
      if (consoleObj) {
        const clampLeft = this.childByName(consoleObj, 'CradleClampLeft');
        const clampRight = this.childByName(consoleObj, 'CradleClampRight');
        const cradleCore = this.childByName(consoleObj, 'ProcessingCradleCore');
        const ring = this.childByName(consoleObj, 'CradleInductionRing');
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

    // Live-window mood: the cockpit dims during the downlink so the beam and the countdown own the scene.
    // It dims the key and fill lights that light every surface (the holo-table point light is off in XR).
    // Intensity is a uniform, so this never recompiles shaders.
    const mood = this.frameSnapshot.phase === 'DOWNLINK' ? 0.45 : 1;
    const moodStep = Math.min(1, delta * 4);
    for (const light of this.moodLights()) {
      light.userData.baseIntensity ??= light.intensity;
      const targetI = (light.userData.baseIntensity as number) * mood;
      light.intensity += (targetI - light.intensity) * moodStep;
    }
    // Most cockpit surfaces are lit by the IWSDK image-based environment, not by the analytic lights.
    this.baseEnvironmentIntensity ??= this.scene.environmentIntensity;
    const targetEnv = this.baseEnvironmentIntensity * (mood < 1 ? 0.25 : 1);
    this.scene.environmentIntensity += (targetEnv - this.scene.environmentIntensity) * moodStep;

    // Orbital pass clock: runs during OPERATIONS after the first scan; at zero the window opens itself.
    if (
      this.frameSnapshot.phase === 'OPERATIONS' && this.frameSnapshot.passStarted &&
      this.frameSnapshot.passRemainingSec !== null && !this.frameSnapshot.paused && !this.tutorial.isActive()
    ) {
      const before = this.frameSnapshot.passRemainingSec;
      const nextState = this.engine.dispatch({ type: 'TICK', seconds: simulationDelta }, this.missionElapsedTime) as MissionState;
      this.frameSnapshot = nextState;
      const remaining = nextState.passRemainingSec ?? 0;
      if (Math.ceil(before) !== Math.ceil(remaining) && remaining <= 10 && remaining > 0) {
        this.playCue('DOWNLINK_TICK');
        if (remaining <= 5) this.audio.playTensionHeartbeat();
      }
      if (nextState.phase === 'DOWNLINK') {
        // Window opened automatically: same feedback as a manual commit.
        this.lastTransmittedCount = 0;
        this.downlinkUiSyncAccumulator = 0;
        this.lastDownlinkTickSecond = -1;
        this.playCue('DOWNLINK_COMMIT');
        this.audio.playCarrierAcquisition();
        this.voiceCommander?.speakDirect(
          'Contact window open. Dock your remaining cubes now.',
          '[ARIA-7] PASS CLOCK EXPIRED: window opened automatically. Dock your cubes now!',
          'CRITICAL',
        );
        this.syncAll();
      } else if (nextState.phase === 'DEBRIEF') {
        this.playCue('LINK_CUTOFF');
        this.voiceCommander?.trigger('DEBRIEF_RETRY');
        this.syncAll();
      } else if (Math.floor(before) !== Math.floor(remaining)) {
        this.syncAll();
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
          this.announceGroundReceipts(nextState);
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
              this.desktopControls?.triggerAchievement('ZERO PACKET LOSS', 'Every docked cube reached the ground', '+');
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
    const consoleObj = this.sceneObject('orbital-console');
    if (consoleObj) {
      const uplinkBeam = this.childByName(consoleObj, 'DownlinkUplinkBeam');
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
            const ring = this.childByName(consoleObj, `DownlinkPulseRing_${i + 1}`);
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
                const particles = this.childByName(obj, 'CubeAssemblyParticles');
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
          const globe = this.sceneObject('earth-globe');
          const cubesat = this.sceneObject('cubesat-spacecraft');
          if (globe && cubesat) {
            const downlinkLaserGroup = this.childByName(globe, 'DownlinkLaserBeamGroup');
            const karachiTerminal = this.childByName(globe, 'KarachiGroundStation');
            if (downlinkLaserGroup && karachiTerminal) {
              downlinkLaserGroup.visible = true;
              const pSatLocal = globe.worldToLocal(cubesat.getWorldPosition(this.tempVecB));
              const pKarachiLocal = karachiTerminal.position;

              const laserCore = this.childByName(downlinkLaserGroup, 'DownlinkLaserCore');
              const laserSheath = this.childByName(downlinkLaserGroup, 'DownlinkLaserSheath');

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
              const shockwave = this.childByName(karachiTerminal, 'KarachiDishShockwave');
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
            const ring = this.childByName(consoleObj, `DownlinkPulseRing_${i + 1}`);
            if (
              ring instanceof Mesh &&
              ring.material instanceof MeshBasicMaterial
            ) {
              ring.visible = false;
              ring.material.opacity = 0.0;
            }
          }
          const globe = this.sceneObject('earth-globe');
          if (globe) {
            const downlinkLaserGroup = this.childByName(globe, 'DownlinkLaserBeamGroup');
            if (downlinkLaserGroup) {
              downlinkLaserGroup.visible = false;
              const laserCore = this.childByName(downlinkLaserGroup, 'DownlinkLaserCore');
              if (laserCore) laserCore.visible = false;
              const laserSheath = this.childByName(downlinkLaserGroup, 'DownlinkLaserSheath');
              if (laserSheath) laserSheath.visible = false;
            }
            const karachiTerminal = this.childByName(globe, 'KarachiGroundStation');
            const shockwave = this.childByName(karachiTerminal, 'KarachiDishShockwave');
            if (shockwave) shockwave.visible = false;
          }
        }
      }
    }

    // GUIDED mode pulses the station for the next *kind* of step (from the Next Step card).
    // It never highlights the sensor switch for a specific sensor: choosing it is the puzzle.
    if ((currentPhase === 'OPERATIONS' || currentPhase === 'DOWNLINK') && this.profile.preferences.guidance === 'GUIDED' && !this.isAnyObjectGrabbed()) {
      const state = this.frameSnapshot;
      const step = getNextStep(state, this.engine.getActiveCustomScenario());
      const intensity = reducedMotion ? 1.15 : 0.9 + 0.25 * Math.sin(this.elapsedTime * 4);
      let targetId: string | null = null;
      let color = 0x34d399;
      if (/^.*SCAN SECTOR/.test(step.title)) { targetId = 'scanner-tool'; color = 0x67e8f9; }
      else if (/PICK A TARGET/.test(step.title)) {
        const open = [...'BCDEAF'].find((s) => {
          const covered = coveredRequestIds(state);
          const reqs = Object.values(this.engine.getActiveScenario().requests ?? {});
          return reqs.some((r) => r.targetSectorId === s && !covered.has(r.id));
        });
        if (open) { targetId = `sector-${open.toLowerCase()}`; color = 0x67e8f9; }
      }
      else if (/BAY TOO FULL|MEMORY FULL/.test(step.title)) { targetId = 'pad-process-cradle'; color = 0xfbbf24; }
      else if (/BLOCKED SCAN|TRAY FULL/.test(step.title)) { targetId = 'pad-discard-chute'; color = 0xf87171; }
      else if (/LOAD THE DOWNLINK BAY|LIVE WINDOW/.test(step.title)) { targetId = 'pad-queue-downlink'; color = 0x38bdf8; }
      else if (/READY TO TRANSMIT|NO WAY TO FINISH/.test(step.title)) { targetId = 'pad-commit-downlink'; color = 0x34d399; }
      const target = targetId ? this.sceneObject(targetId) : undefined;
      if (target) this.setObjectTint(target, color, intensity);
    }
  }

  private bindEarthPlanetTextures(): void {
    const globe = this.sceneObject('earth-globe');
    if (!globe) return;

    this.globeCurrentQuaternion.copy(globe.quaternion);
    this.globeTargetQuaternion.copy(globe.quaternion);
    this.globeFocalDistance = globe.position.z;
    this.targetFocalDistance = globe.position.z;

    const albedoTex = AssetManager.getTexture('earth-albedo-tex');
    const normalTex = AssetManager.getTexture('earth-normal-tex');
    const specTex = AssetManager.getTexture('earth-specular-tex');
    const cloudsTex = AssetManager.getTexture('earth-clouds-tex');

    if (albedoTex) {
      albedoTex.colorSpace = SRGBColorSpace;
      albedoTex.needsUpdate = true;
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
    const consoleObj = this.sceneObject('orbital-console');
    if (!consoleObj) return;

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
          // Arid desert & high plateau ochre (Arabian, Iranian, Thar, Tibetan Plateau) - clamped to warm tan
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

  /**
   * Pins the six sector beacons to their lat/lon on the globe. It ran up to three times a frame (frame
   * update plus once per hand), each time forcing a matrix update of the whole globe subtree. The beacons
   * only move when the globe's world matrix moves (desktop spin, focal zoom), so it now places them only
   * then. Only the globe and its ancestors are updated for the check, not its children.
   */
  private syncGlobeSectorBeaconPositions(): void {
    const globe = this.sceneObject('earth-globe');
    if (!globe) return;
    globe.updateWorldMatrix(true, false);
    if (this.beaconsPlaced === globe && globe.matrixWorld.equals(this.beaconGlobeMatrix)) return;
    this.beaconGlobeMatrix.copy(globe.matrixWorld);
    this.beaconsPlaced = globe;
    for (const sectorEntity of this.queries.sectors.entities) {
      const sObj = sectorEntity.object3D;
      if (!sObj) continue;
      const sId = (sectorEntity.getValue(OrbitSectorNode, 'sectorId') || 'B') as SectorId;
      const sDef = SECTOR_GEO_DEFINITIONS[sId];
      if (!sDef) continue;
      const localPos = latLonToGlobePoint(sDef.centerLatLon[0], sDef.centerLatLon[1], GLOBE_RADIUS * 1.002, this.tempVecB);
      sObj.position.copy(this.tempVecC.copy(localPos).applyMatrix4(globe.matrixWorld));
      const worldNormal = localPos.normalize().applyQuaternion(globe.quaternion).normalize();
      sObj.quaternion.setFromUnitVectors(this.worldUp, worldNormal);
      sObj.updateMatrixWorld(true);
    }
  }

  private getSpatialButtonWorldPosition(
    panelId: string,
    buttonId: string,
  ): Vector3 | null {
    const panel = this.sceneObject<UIKitMLAsset>(panelId);
    if (!panel || !panel.visible) return null;
    const element = panel.getElementById<UIKit.Container>(buttonId);
    if (!element) return null;
    // Buttons inside a hidden section (display: none) must never be hand-targeted.
    if ((element as any).isVisible?.value === false) return null;

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
      Btn_StartTraining: [-0.12, -0.14, 0.02],
      Btn_StartPass: [0.12, -0.14, 0.02],
      Btn_HudHint: [-0.12, -0.09, 0.02],
      Btn_HudTransmit: [0.12, -0.09, 0.02],
      Btn_HudRetry: [-0.12, -0.12, 0.02],
      Btn_HudNext: [0.12, -0.12, 0.02],
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

    const obj = this.sceneObject(targetId);
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

    // Far targets (beacons, pads, HUD buttons) are not resolved here: IWSDK's hand ray, the visible laser,
    // presses them (bindLaserTarget, UIKit click). This check covers only what the hand itself reaches.

    // 2. Check 3D Sector Beacons on the Earth Globe (fingertip or pinch point on the beacon)
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
      if (directDist <= NEAR_BEACON_REACH_M) {
        candidates.push({
          targetType: 'SECTOR',
          targetId: `sector-${sectorId.toLowerCase()}`,
          distance: directDist,
          worldPosition: sPos,
          sectorId,
        });
      }
    }

    // 3. Check 3D Console Control Pads (fingertip or pinch point on the pad)
    for (const pad of LASER_PADS) {
      const obj = this.sceneObject(pad.id);
      if (!obj || !isVisible(obj)) continue;
      obj.updateWorldMatrix(true, false);
      const pPos = obj.getWorldPosition(new Vector3());
      const effectiveDist = Math.min(
        sample.indexTip.distanceTo(pPos),
        sample.graspPoint.distanceTo(pPos),
      );
      if (effectiveDist <= NEAR_PAD_REACH_M) {
        candidates.push({
          targetType: 'CONTROL_PAD',
          targetId: pad.id,
          distance: effectiveDist,
          worldPosition: pPos,
          controlAction: pad.action,
        });
      }
    }

    // 4. Check 3D Spatial UIKitML Panel Buttons (fingertip or pinch point within 14 cm)
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
      { panelId: 'mission-hud', buttonId: 'Btn_StartPass' },
      { panelId: 'mission-hud', buttonId: 'Btn_StartTraining' },
      { panelId: 'mission-hud', buttonId: 'Btn_HudHint' },
      { panelId: 'mission-hud', buttonId: 'Btn_HudTransmit' },
      { panelId: 'mission-hud', buttonId: 'Btn_HudRetry' },
      { panelId: 'mission-hud', buttonId: 'Btn_HudNext' },
      { panelId: 'telemetry-hud', buttonId: 'Btn_RelaxedClock' },
    ];
    // Every button lookup forces a matrix update of its whole UIKit panel. This runs for both hands every
    // frame, and a seated player's hands are about a metre from the panels, so a panel is skipped unless the
    // hand is within PANEL_TOUCH_SCAN_RADIUS_M of its centre (larger than any panel's half-diagonal + 14 cm).
    const panelInReach = new Map<string, boolean>();
    const reachRadius = MissionControlSystem.PANEL_TOUCH_SCAN_RADIUS_M;
    for (const pb of panelButtons) {
      let inReach = panelInReach.get(pb.panelId);
      if (inReach === undefined) {
        const panel = this.sceneObject(pb.panelId);
        const centre = panel && panel.visible ? panel.getWorldPosition(this.tempVecB) : null;
        inReach = Boolean(centre) &&
          Math.min(sample.indexTip.distanceTo(centre!), sample.graspPoint.distanceTo(centre!)) <= reachRadius;
        panelInReach.set(pb.panelId, inReach);
      }
      if (!inReach) continue;
      const btnPos = this.getSpatialButtonWorldPosition(pb.panelId, pb.buttonId);
      if (!btnPos) continue;
      const effectiveDist = Math.min(
        sample.indexTip.distanceTo(btnPos),
        sample.graspPoint.distanceTo(btnPos),
      );
      if (effectiveDist <= 0.14) {
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
      this.laserHover.clear(); // hand rays end with the session and may not send pointerleave
      // Leaving VR mid-pass (Quest menu > Exit, or the session ended) holds the clock; resume from the page or in VR.
      this.setInterrupted(true, true);
      this.setInterrupted(false, false);
      this.syncAll();
    };
    // Quest system menu (visible-blurred) or headset taken off (hidden): hand input stops, so hold the pass
    // clock, the live window, voice and sound instead of letting them run out unseen. The player resumes
    // from the HUD. This is an event, not a per-frame check: a hidden session delivers no XR frames.
    const onVisibilityChange = () => this.setInterrupted(session.visibilityState !== 'visible', true);

    session.addEventListener('selectstart', onSelectStart);
    session.addEventListener('selectend', onSelectEnd);
    session.addEventListener('inputsourceschange', onInputSourcesChange);
    session.addEventListener('end', onEnd);
    session.addEventListener('visibilitychange', onVisibilityChange);
    this.cleanupFuncs.push(() => {
      session.removeEventListener('selectstart', onSelectStart);
      session.removeEventListener('selectend', onSelectEnd);
      session.removeEventListener('inputsourceschange', onInputSourcesChange);
      session.removeEventListener('end', onEnd);
      session.removeEventListener('visibilitychange', onVisibilityChange);
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

    const scannerAtPress = this.sceneObject('scanner-tool');
    const scannerPos = scannerAtPress?.getWorldPosition(this.tempVec);
    const distanceToScanner = scannerPos ? Math.min(sample.graspPoint.distanceTo(scannerPos), sample.indexTip.distanceTo(scannerPos)) : null;
    const owner = pressOwner(resolved?.targetId, distanceToScanner);
    this.pressResolvedTarget.set(sample.handedness, owner);
    if (!resolved) return;
    // A pinch on the scanner belongs to IWSDK's OneHandGrabbable (its release fires the scan). It must never
    // also fire the nearest pad or sector. Only a cube that is closer than the scanner can still be grabbed.
    if (owner === SCANNER_TARGET_ID && !(resolved.targetType === 'DATA_CUBE' && resolved.distance < (distanceToScanner ?? Infinity))) return;

    this.withInputSource('xr-hand', () => {
      if (
        resolved.targetType === 'DATA_CUBE' &&
        resolved.cubeEntity &&
        typeof resolved.slotIndex === 'number'
      ) {
        const grabPhase = this.engine.getState().phase;
        if (
          (grabPhase !== 'OPERATIONS' && grabPhase !== 'DOWNLINK') ||
          this.engine.getState().paused
        ) {
          return;
        }
        const pkt = this.engine.getState().packets[resolved.slotIndex];
        // During the live window only tray cubes can be picked up (streaming cubes are locked).
        if (grabPhase === 'DOWNLINK' && pkt?.queued) return;
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
        this.selectSectorOnce(resolved.sectorId);
        return;
      }

      if (resolved.targetType === 'CONTROL_PAD' && resolved.controlAction) {
        this.pressPadByHand(resolved.targetId, resolved.controlAction);
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
        const panel = this.sceneObject<UIKitMLAsset>(resolved.panelId);
        const element = panel?.getElementById(resolved.buttonId);
        if (element) {
          // IWSDK's own ray/poke pointer may click the same element when this pinch releases; drop that one.
          this.customUiClick = { id: resolved.buttonId, until: performance.now() + UI_CLICK_SAME_PINCH_MS };
          element.dispatchEvent({ type: 'click' } as never);
        }
      }
    });
  }

  private handleXRHandPressEnd(
    sample: LiveXRHandSample,
    viaEvent: 'selectend' | 'pinch_release',
  ): void {
    this.pressResolvedTarget.delete(sample.handedness);
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
      this.cancelStrayScannerGrab(side);

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
        // 3. Check 3D Globe Gimbal touch / rotation & Point Hover when not holding a cube.
        // A hand carrying the scanner (an IWSDK grab) must not spin the globe away from the sector it aims at.
        const distToGlobe = sample.indexTip.distanceTo(GLOBE_CENTER_WORLD);
        if (distToGlobe <= 0.30 && !this.isScannerHeldBy(side)) {
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
              // The beacon highlight comes from the laser hover (setLaserHover); this only informs the tutorial.
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

  private isScannerHeldBy(side: 'left' | 'right'): boolean {
    const scanner = (this.scannerEntity ??= [...this.queries.controls.entities].find((e) => e.getValue(ConsoleControlNode, 'action') === 'SCAN'));
    if (!scanner?.hasComponent(Grabbed)) return false;
    return this.world.getSystem(GrabSystem)?.getHolderHand(scanner) === side;
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

  /**
   * One pinch, one authority. The app resolves every pinch to a single target. When that target is
   * not the scanner tool but IWSDK's ray grab also latched the scanner onto the same hand, the tool
   * would fly to the hand and its release would fire an unintended, power-costing scan. Release it
   * silently instead. A scanner held by the other hand, or by a pinch aimed at the scanner, is kept.
   */
  private cancelStrayScannerGrab(side: 'left' | 'right'): void {
    if (!this.pressResolvedTarget.get(side)) return;
    const scanner = (this.scannerEntity ??= [...this.queries.controls.entities].find((e) => e.getValue(ConsoleControlNode, 'action') === 'SCAN'));
    const grabSystem = this.world.getSystem(GrabSystem);
    const grabbed = Boolean(scanner?.hasComponent(Grabbed));
    if (!scanner || !grabSystem || !isStrayScannerGrab({ pressOwnerId: this.pressResolvedTarget.get(side), scannerGrabbed: grabbed, holderHand: grabbed ? grabSystem.getHolderHand(scanner) : null, side })) return;
    const previous = this.suppressReleaseActions;
    this.suppressReleaseActions = true;
    grabSystem.forceRelease(scanner);
    this.suppressReleaseActions = previous;
    const scannerObj = this.sceneObject('scanner-tool');
    if (scannerObj) {
      scannerObj.position.copy(SCANNER_HOME_POSITION);
      scannerObj.rotation.set(0, 0, 0);
    }
  }

  private forceReleaseAllGrabs(): void {
    this.pressResolvedTarget.clear();
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
    const scannerObj = this.sceneObject('scanner-tool');
    if (scannerObj) {
      scannerObj.position.copy(SCANNER_HOME_POSITION);
      scannerObj.rotation.set(0, 0, 0);
    }
    this.highlightDropZones(false);
    this.suppressReleaseActions = false;
  }

  private bindSpatialPanels(): void {
    this.briefingPanel = this.sceneObject<UIKitMLAsset>('briefing-panel');
    this.telemetryPanel = this.sceneObject<UIKitMLAsset>('telemetry-hud');
    this.debriefPanel = this.sceneObject<UIKitMLAsset>('debrief-panel');
    this.missionHud = this.sceneObject<UIKitMLAsset>('mission-hud');

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
          // One pinch, one click: the custom hand path already fired this element for this pinch.
          if (this.customUiClick?.id === id && performance.now() <= this.customUiClick.until) {
            this.customUiClick = null;
            return;
          }
          setTimeout(() => handler(), 0);
        } else {
          handler();
        }
      };
      el.addEventListener('click', onClick);
      // A hand laser landing on a HUD button ticks once (the button's :hover style is the visual).
      const hoverKey = `ui:${id}`;
      const onEnter = (event?: ScenePointerEvent) => {
        if (event?.pointerType === 'ray' && typeof event.pointerId === 'number' && this.isLiveXRHandActive()) this.setLaserHover(hoverKey, event.pointerId, true);
      };
      const onLeave = (event?: ScenePointerEvent) => {
        if (event?.pointerType === 'ray' && typeof event.pointerId === 'number') this.setLaserHover(hoverKey, event.pointerId, false);
      };
      el.addEventListener('pointerenter', onEnter);
      el.addEventListener('pointerleave', onLeave);
      this.cleanupFuncs.push(() => {
        el.removeEventListener('click', onClick);
        el.removeEventListener('pointerenter', onEnter);
        el.removeEventListener('pointerleave', onLeave);
      });
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
          // Same defensive path as the DOM ENTER VR button: a failed request shows a message and TRY AGAIN.
          const overlay = getXrEntryOverlay();
          overlay.attach(this.world);
          overlay.enter({
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
    const preferenceIds = { guidance: 'Guidance', dominantHand: 'DominantHand', oneHanded: 'OneHanded', gazeAssist: 'GazeAssist', tabletopMode: 'TabletopMode', largeText: 'LargeText', highContrast: 'HighContrast', reducedMotion: 'ReducedMotion', captions: 'Captions', audioLevel: 'AudioLevel', relaxedClock: 'RelaxedClock' } as const;
    for (const key of Object.keys(preferenceIds) as (keyof typeof preferenceIds)[]) {
      bindClick(this.telemetryPanel, `Btn_${preferenceIds[key]}`, () => this.cyclePreference(key));
    }
    // The scanner always rests in the left holster now, so the scanner-hand toggle no longer does anything.
    this.telemetryPanel?.getElementById('Btn_DominantHand')?.setProperties({ display: 'none' });
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

    // Forward Mission HUD (headset-first)
    bindClick(this.missionHud, 'Btn_StartPass', () => {
      this.xrCardOpen = false;
      this.playCue('SELECT_SECTOR');
      this.voiceCommander?.speakDirect('Pass armed. Choose your first target.', '[ARIA-7] Pass armed. Point at a sector and pinch to select it.', 'HIGH');
      this.syncAll();
    });
    bindClick(this.missionHud, 'Btn_StartTraining', () => {
      this.xrCardOpen = false;
      this.launchScenario('ORBITAL_ACADEMY');
    });
    bindClick(this.missionHud, 'Btn_HudHint', () => this.handleAriaDelegate());
    bindClick(this.missionHud, 'Btn_HudTransmit', () => this.handleCommitDownlinkButton());
    bindClick(this.missionHud, 'Btn_HudRetry', () => this.handleRestartMission());
    bindClick(this.missionHud, 'Btn_HudNext', () => this.nextMission());
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
    const xr = Boolean(this.world.renderer.xr.isPresenting);
    const isXRorIWER = Boolean((window as any).__ORBIT_IWER__) || xr;
    const show = isXRorIWER || this.spatialHudVisible;
    const phase = this.engine.getState().phase;
    const isDebrief = phase === 'DEBRIEF';

    if (xr) {
      // Headset: the forward Mission HUD carries the card, the next step, the clock and the result. The only
      // side panel is the cube inspector (with pause and settings), and only while cubes are being worked on.
      // Card, live window and result own the view on their own; the briefing panel duplicates the HUD.
      const playing = phase === 'OPERATIONS' && this.missionHudMode() === 'play';
      this.setPanelShown(this.briefingPanel, false);
      this.setPanelShown(this.telemetryPanel, playing);
      this.setPanelShown(this.debriefPanel, false);
    } else {
      this.setPanelShown(this.briefingPanel, show && !isDebrief);
      this.setPanelShown(this.telemetryPanel, show && !isDebrief);
      this.setPanelShown(this.debriefPanel, isDebrief);
    }
    // The forward Mission HUD exists only in a live immersive session; on flat screens the DOM HUD
    // shows the same content (shared models in src/ui/hudText.ts).
    this.setPanelShown(this.missionHud, Boolean(this.world.renderer.xr.isPresenting));
  }

  /**
   * Shows or hides a spatial panel. A hidden panel also leaves pointer hit-testing. IWSDK's pointers skip
   * invisible objects through a visibility filter, but only after visiting each one and walking all of its
   * ancestors, for every hand pointer, every frame; pruning the panel skips that work entirely.
   */
  private setPanelShown(panel: Object3D | null | undefined, shown: boolean): void {
    if (!panel) return;
    panel.visible = shown;
    (panel as Object3D & { intersectChildren?: boolean }).intersectChildren = shown ? undefined : false;
  }

  /** Pointer hit-tests of `root` visit only the named mesh (see the note where it is called). */
  private limitPointerHitTest(root: Object3D | null | undefined, meshName: string): void {
    const target = root?.getObjectByName(meshName);
    if (!root || !(target instanceof Mesh)) return;
    (root as Object3D & { interactableDescendants?: Object3D[] }).interactableDescendants = [target];
  }

  /** Which mode the forward headset HUD is in for the current state. */
  private missionHudMode(): 'card' | 'play' | 'result' {
    const state = this.engine.getState();
    if (state.phase === 'DEBRIEF') return 'result';
    if (state.phase === 'OPERATIONS' && this.xrCardOpen && !state.passStarted && state.packets.length === 0 && !this.tutorial.isActive()) return 'card';
    return 'play';
  }

  private setTextColor(panel: UIKitMLAsset, id: string, color: string): void {
    let values = this.panelValues.get(panel);
    if (!values) { values = new Map(); this.panelValues.set(panel, values); }
    if (values.get(`${id}:color`) === color) return;
    const el = panel.getElementById(id);
    if (!el) return;
    values.set(`${id}:color`, color);
    el.setProperties({ color });
  }

  /** Writes the forward Mission HUD from the shared text models (same content as the desktop HUD). */
  private syncMissionHud(): void {
    const hud = this.missionHud;
    if (!hud) return;
    const state = this.engine.getState();
    const custom = this.engine.getActiveCustomScenario();
    const mode = this.missionHudMode();
    this.setDisplay(hud, 'CardSection', mode === 'card' ? 'flex' : 'none');
    this.setDisplay(hud, 'PlaySection', mode === 'play' ? 'flex' : 'none');
    this.setDisplay(hud, 'ResultSection', mode === 'result' ? 'flex' : 'none');

    if (mode === 'card') {
      const card = missionCardModel(state, custom);
      const record = this.profile.mastery[state.scenarioId];
      const stars = starsFor(record, getScenarioThresholds(state.scenarioId, custom).successScore);
      this.setText(hud, 'CardKicker', record?.attempts
        ? `${card.kicker} | ${stars}/3 STARS | BEST ${record.bestScore} PTS`
        : card.kicker);
      this.setText(hud, 'CardTitle', card.title);
      // Three lines only. Requests and sensors are learned in play: selecting a sector speaks its weather and
      // value, switching the sensor speaks what it can see, and the strip above the globe tracks each request.
      this.setText(hud, 'CardStory', card.what);
      this.setText(hud, 'CardHow', card.how);
      this.setText(hud, 'CardRules', card.win);
      return;
    }

    if (mode === 'result') {
      const result = resultModel(state, custom);
      if (!result) return;
      const color = result.tone === 'success' ? '#34d399' : result.tone === 'warn' ? '#f59e0b' : '#f87171';
      this.setText(hud, 'ResultTitle', result.title);
      this.setTextColor(hud, 'ResultTitle', color);
      this.setText(hud, 'ResultScore', result.score);
      for (let i = 0; i < 3; i++) {
        this.setDisplay(hud, `ResultReq${i + 1}`, result.requests[i] ? 'flex' : 'none');
        if (result.requests[i]) this.setText(hud, `ResultReq${i + 1}`, result.requests[i]);
      }
      this.setText(hud, 'ResultTip', clipText(result.tip, 220));
      this.setText(hud, 'Lbl_HudNext', state.scenarioId === 'ORBITAL_ACADEMY' ? 'START OP 01' : 'NEXT OPERATION');
      return;
    }

    // PLAY: Next Step + clock + resources + tracker
    const tutStep = this.tutorial.getCurrentStepSpec();
    const step = getNextStep(state, custom);
    const hint = this.coPilot?.getLastHintText();
    if (tutStep) {
      this.setText(hud, 'StepKicker', `TRAINING ${tutStep.index}/9 | NO CLOCK`);
      this.setText(hud, 'StepTitle', tutStep.title.replace(/^STEP \d+\/9:\s*/, ''));
      this.setText(hud, 'StepBody', clipText(tutStep.vrInstruction, 170));
      this.setText(hud, 'StepHands', '');
    } else {
      this.setText(hud, 'StepKicker', state.lastActionOk ? 'NEXT STEP' : 'ACTION REJECTED');
      this.setText(hud, 'StepTitle', step.title);
      this.setText(hud, 'StepBody', clipText(state.lastActionOk ? step.body : state.lastStatusMessage, 170));
      this.setText(hud, 'StepHands', hint && state.hintsUsed > 0 ? hint : `HANDS: ${step.hands}`);
    }
    const toneColor = step.tone === 'critical' ? '#f87171' : step.tone === 'warn' ? '#fbbf24' : step.tone === 'success' ? '#34d399' : '#f8fafc';
    this.setTextColor(hud, 'StepTitle', state.lastActionOk ? toneColor : '#f87171');

    let clockLabel = 'PASS CLOCK';
    let clockText = 'NO CLOCK';
    let clockColor = '#34d399';
    if (state.phase === 'DOWNLINK') {
      clockLabel = 'LIVE LINK';
      const left = Math.max(0, state.downlinkWindowSec - state.downlinkElapsedSec);
      clockText = `${left.toFixed(1)}s`;
      clockColor = '#f87171';
    } else if (state.passRemainingSec !== null) {
      clockLabel = state.passStarted ? 'LINK OPENS IN' : 'CLOCK (WAITS)';
      clockText = formatClock(state.passRemainingSec);
      clockColor = state.passStarted && state.passRemainingSec <= 10 ? '#f87171' : state.passStarted && state.passRemainingSec <= 25 ? '#fbbf24' : '#e2e8f0';
    }
    this.setText(hud, 'ClockLabel', clockLabel);
    this.setText(hud, 'ClockText', clockText);
    this.setTextColor(hud, 'ClockText', clockColor);
    this.setText(hud, 'ResourceLine', `BATTERY ${state.power}/${state.maxPower} Wh  |  MEMORY ${state.storageUsed}/${state.maxStorage}  |  SEND ${state.downlinkCommittedSec.toFixed(1)}/${state.downlinkWindowSec.toFixed(1)}s`);
    this.setText(hud, 'TrackerLine', trackerText(state, custom));
    const stalled = isPassStalled(state, custom);
    this.setText(hud, 'Lbl_HudTransmit', state.paused ? 'RESUME PASS' : state.phase === 'DOWNLINK' ? 'CLOSE LINK' : stalled ? 'ABORT PASS' : `TRANSMIT (${state.queuePacketIds.length}/${this.engine.getActiveScenario().budget.maxQueueSlots} LOADED)`);
    this.setText(hud, 'Lbl_HudHint', this.isHintArmed() ? `PINCH AGAIN: -${SCORING.hintPenalty} pts` : `ASK ARIA (-${SCORING.hintPenalty} pts)`);
  }

  /** Moves the forward HUD between the eye-level card pose and the strip above the globe, and
   * shrinks the globe while the card is open so it never hides the card's lower rows. */
  private updateMissionHudPose(delta: number): void {
    const hud = this.missionHud;
    const globe = this.sceneObject('earth-globe');
    const immersive = Boolean(this.world.renderer.xr.isPresenting);
    const mode = this.missionHudMode();
    // Visibility is enforced every frame: on XR entry `isPresenting` flips after the visibility event.
    if (hud && hud.visible !== immersive) {
      hud.visible = immersive;
      if (immersive) this.syncMissionHud();
    }
    // The ARIA hologram floats above the globe on desktop; in the headset it moves beside the globe
    // so it never covers the forward Mission HUD.
    const avatar = this.sceneObject('avatar-aria');
    if (avatar) {
      avatar.userData.desktopPos ??= avatar.position.clone();
      const want = immersive ? ARIA_XR_POSITION : (avatar.userData.desktopPos as Vector3);
      if (!avatar.position.equals(want)) {
        avatar.position.copy(want);
        avatar.scale.setScalar(immersive ? 0.7 : 1);
      }
    }
    if (hud && immersive) {
      const pose = mode === 'play' ? MISSION_HUD_POSES.strip : MISSION_HUD_POSES.card;
      hud.position.set(pose.position[0], pose.position[1], pose.position[2]);
      hud.rotation.set((pose.pitchDeg * Math.PI) / 180, 0, 0);
      hud.scale.setScalar(pose.scale);
    }
    const target = immersive && mode !== 'play' ? GLOBE_CARD_SCALE : 1;
    if (globe && Math.abs(this.globeHudScale - target) > 0.001) {
      const k = this.profile.preferences.reducedMotion ? 1 : 1 - Math.exp(-6 * delta);
      this.globeHudScale += (target - this.globeHudScale) * k;
      if (Math.abs(this.globeHudScale - target) < 0.002) this.globeHudScale = target;
      globe.scale.setScalar(this.globeHudScale);
    }
  }

  public rotateGlobe(deltaYaw: number, deltaPitch: number): void {
    const globe = this.sceneObject('earth-globe');
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
    const globe = this.sceneObject('earth-globe');
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

  /** Lights dimmed by the live-window mood, found once (key light, fill light, holo-table light). */
  private moodLights(): Light[] {
    if (this.moodLightCache) return this.moodLightCache;
    const found: Light[] = [];
    for (const id of ['key-light', 'fill-light']) {
      this.sceneObject(id)?.traverse((object) => {
        if (object instanceof Light) found.push(object);
      });
    }
    const holo = this.sceneObject('orbital-console')?.getObjectByName('HoloTableProjectorLight');
    if (holo instanceof Light) found.push(holo);
    if (found.length) this.moodLightCache = found;
    return found;
  }

  /**
   * Wires a far target to IWSDK's hand ray (the visible laser): hover state plus a pinch handler. Only
   * `pointerType === 'ray'` with live tracked hands counts; controllers and the desktop keep their own paths.
   */
  private bindLaserTarget(object: Object3D | undefined, key: string, onPinch: () => void, onFirstHover?: () => void): void {
    const target = object as unknown as PointerEventTarget | undefined;
    if (!target) return;
    const isHandRay = (event: ScenePointerEvent) => event.pointerType === 'ray' && this.isLiveXRHandActive();
    const onDown = (event: ScenePointerEvent) => {
      if (!isHandRay(event) || this.isAnyObjectGrabbed()) return;
      // A pinch on something within reach (a cube, a pad, a beacon) acts on that, in handleXRHandPressStart.
      if (this.isRayHandTouchingTarget(event.pointerId)) return;
      onPinch();
    };
    const onEnter = (event: ScenePointerEvent) => {
      if (!isHandRay(event) || typeof event.pointerId !== 'number') return;
      const wasHovered = this.isLaserHovered(key);
      this.setLaserHover(key, event.pointerId, true);
      if (!wasHovered) onFirstHover?.();
    };
    const onLeave = (event: ScenePointerEvent) => {
      if (event.pointerType !== 'ray' || typeof event.pointerId !== 'number') return;
      this.setLaserHover(key, event.pointerId, false);
    };
    target.addEventListener('pointerdown', onDown);
    target.addEventListener('pointerenter', onEnter);
    target.addEventListener('pointerleave', onLeave);
    this.cleanupFuncs.push(() => {
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointerenter', onEnter);
      target.removeEventListener('pointerleave', onLeave);
    });
  }

  /**
   * IWSDK 1.0.1's MultiPointer ignores a pinch release that happens while the hand ray points at nothing (its
   * button lifecycle returns before handling selectEnd). The ray then stays in SELECT and swallows the next
   * pinch: in IWER a beacon that moved out from under the laser mid-pinch made the following pinch do nothing.
   * Once a tracked hand's pinch has been open for two frames with its ray still in SELECT on nothing, release it.
   */
  private recoverStuckHandRays(): void {
    const pointers = this.input.xr.multiPointers as unknown as Record<'left' | 'right', {
      pointerStates?: Map<string, string>;
      getPointer(kind: 'ray'): {
        getIntersection(): { object?: { isVoidObject?: boolean } } | undefined;
        up(event: { button: number; timeStamp: number }): void;
      };
    } | undefined>;
    for (const side of ['left', 'right'] as const) {
      const multi = pointers[side];
      const ray = multi?.getPointer('ray');
      const hit = ray?.getIntersection();
      const onNothing = !hit || Boolean(hit.object?.isVoidObject); // pmndrs reports "nothing" as a void-object hit
      const stuck = Boolean(multi?.pointerStates && ray) && this.lastHandConnected[side] && !this.lastHandPressed[side]
        && multi!.pointerStates!.get('ray') === 'select' && onNothing;
      this.stuckRayFrames[side] = stuck ? this.stuckRayFrames[side] + 1 : 0;
      if (this.stuckRayFrames[side] < 2) continue;
      ray!.up({ button: 0, timeStamp: performance.now() });
      multi!.pointerStates!.set('ray', 'normal');
      this.stuckRayFrames[side] = 0;
    }
  }

  /** True when the hand that owns this IWSDK ray pointer has the scanner, a cube, pad, beacon or button within reach. */
  private isRayHandTouchingTarget(pointerId: number | undefined): boolean {
    const pointers = this.input.xr.multiPointers;
    const side = pointers.left.getPointer('ray').id === pointerId ? 'left'
      : pointers.right.getPointer('ray').id === pointerId ? 'right' : null;
    const sample = side ? this.sampleLiveXRHandState(side) : null;
    if (!sample) return false;
    const scanner = this.sceneObject('scanner-tool')?.getWorldPosition(this.tempVec);
    if (scanner && Math.min(sample.graspPoint.distanceTo(scanner), sample.indexTip.distanceTo(scanner)) <= DELIBERATE_SCANNER_PRESS_RADIUS_M) return true;
    return this.resolve3DTargetForHand(sample) !== null;
  }

  /** A hand pressed a desk pad (laser pinch or fingertip). One pinch seen by both paths presses once. */
  private pressPadByHand(padId: string, action: string): void {
    if (this.isAnyObjectGrabbed()) return;
    const now = performance.now();
    if (this.lastPadPress.id === padId && now - this.lastPadPress.at < SAME_PINCH_PAD_MS) return;
    this.lastPadPress = { id: padId, at: now };
    this.withInputSource('xr-hand', () => {
      if (action === 'SCAN') this.tutorial.notifyPinchScan('xr-hand');
      if (action === 'COMMIT_DOWNLINK') this.tutorial.notifyTransmitActivated('xr-hand');
      this.handleControlAction(action);
    });
  }

  /** Hand and pointer entry point for sector selection: the custom joint path and IWSDK's ray can both see one pinch. */
  private selectSectorOnce(sectorId: SectorId): void {
    const now = performance.now();
    if (this.lastSectorSelect.id === sectorId && now - this.lastSectorSelect.at < SECTOR_SELECT_DEDUPE_MS) return;
    this.lastSectorSelect = { id: sectorId, at: now };
    this.handleSelectSector(sectorId);
  }

  private handleSelectSector(sectorId: SectorId): void {
    this.desktopControls?.onSectorSelected(sectorId);
    this.applyAction({ type: 'SELECT_SECTOR', sectorId });
    this.playCue('SELECT_SECTOR');
    // In a headset the globe stays put: turning it would pull the beacon out from under the player's laser
    // (and scanner beam) mid-pinch. All six beacons already face the seated player.
    if (!this.world.renderer.xr.isPresenting) this.slerpGlobeToSector(sectorId);
    this.announceSectorWeather(sectorId);

    this.syncAll();
  }

  private handleCycleSector(): void {
    const current = this.engine.getState().selectedSectorId;
    const idx = SECTOR_ORDER.indexOf(current);
    const next = SECTOR_ORDER[(idx + 1) % SECTOR_ORDER.length];
    this.handleSelectSector(next);
  }

  private syncSensorSwitchHardware(sensorMode: SensorMode): void {
    const consoleObj = this.sceneObject('orbital-console');
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
    // Spoken sensor capability (a fact about the sensor, never "this is the right one here").
    const guide = SENSOR_PLAIN_GUIDE[state.activeSensorMode];
    this.voiceCommander?.speakDirect(`${guide.label}. ${guide.sees}.`, `[ARIA-7] ${guide.label}: ${guide.sees}. ${guide.blind}.`, 'LOW');
    this.syncAll();
  }

  private announcedReceipts = new Set<string>();

  /** Finale: each delivered cube gets a "ground radio" reply built from its request's own data. */
  private announceGroundReceipts(state: MissionState): void {
    const requests = getScenarioRequests(state.scenarioId, this.engine.getActiveCustomScenario());
    for (const pkt of state.packets) {
      if (!pkt.transmitted || this.announcedReceipts.has(pkt.id)) continue;
      this.announcedReceipts.add(pkt.id);
      const req = pkt.satisfiesRequestId ? requests[pkt.satisfiesRequestId] : undefined;
      if (!req) {
        this.voiceCommander?.speakDirect('Ground received a frame with no request attached.', '[GROUND] Received: no request matched this cube.', 'MEDIUM');
        continue;
      }
      const label = req.shortLabel.split('|')[1]?.trim().toLowerCase() ?? 'request';
      const meets = req.minimumConfidence === 'PROBABLE' || pkt.confidence === 'CONFIRMED';
      const spoken = meets
        ? `Ground here. ${label} evidence received. Teams are moving.`
        : `Ground here. ${label} evidence is only probable. We will send scouts.`;
      const caption = `[GROUND] ${meets ? clipText(req.consequenceOnSuccess, 140) : clipText(req.consequenceOnPartial, 140)}`;
      this.voiceCommander?.speakDirect(spoken, caption, 'HIGH');
      this.caption = caption;
    }
  }

  private lastWeatherCallout = { sectorId: '', at: 0 };

  /** Headset players cannot read small text quickly, so the selected sector's weather is spoken. */
  private announceSectorWeather(sectorId: SectorId): void {
    const now = performance.now();
    if (this.lastWeatherCallout.sectorId === sectorId && now - this.lastWeatherCallout.at < 6000) return;
    this.lastWeatherCallout = { sectorId, at: now };
    const custom = this.engine.getActiveCustomScenario();
    const state = this.engine.getState();
    const sector = getScenarioSector(state.scenarioId, sectorId, custom);
    const req = Object.values(getScenarioRequests(state.scenarioId, custom)).find((r) => r.targetSectorId === sectorId);
    const weather = describeWeather(sector.cloudCover);
    const spoken = req
      ? `Sector ${sectorId}. ${weather}. ${req.shortLabel.split('|')[1]?.trim().toLowerCase() ?? 'request target'}, worth ${requestValue(req)} points.`
      : `Sector ${sectorId}. ${weather}. No ground request here.`;
    this.voiceCommander?.speakDirect(spoken, `[ARIA-7] ${spoken}`, 'MEDIUM');
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

      // Achievement: the chosen sensor saw through this sector's weather well enough for its request.
      const scanned = this.engine.getState().packets.find((p) => p.id === res.packet?.id);
      const scannedReq = scanned?.satisfiesRequestId
        ? getScenarioRequests(state.scenarioId, this.engine.getActiveCustomScenario())[scanned.satisfiesRequestId]
        : undefined;
      if (scanned && scannedReq && (scannedReq.minimumConfidence === 'PROBABLE' || scanned.confidence === 'CONFIRMED') && scanned.confidence !== 'UNVERIFIED') {
        const weather = describeWeather(getScenarioSector(state.scenarioId, scanned.sectorId, this.engine.getActiveCustomScenario()).cloudCover);
        this.desktopControls?.triggerAchievement('SENSOR MATCH', `${SENSOR_PLAIN_GUIDE[mode].label} read Sector ${scanned.sectorId} through: ${weather.toLowerCase()}`, '*');
      }

      this.voiceCommander?.trigger('SCAN_ACQUIRED');

      // Immediately illuminate 3D observation swath cone
      const globe = this.sceneObject('earth-globe');
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
        this.desktopControls?.triggerAchievement('FITS THE WINDOW', `${queuedPackets.reduce((acc, p) => acc + p.rawTransmitSec, 0).toFixed(1)}s raw -> ${totalTx.toFixed(1)}s after compression`, '+');
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

  /**
   * Discarding destroys evidence, so in a headset it needs a deliberate gesture: carry the cube into the
   * chute (`dropIntoChute`), or pinch the DISCARD pad / panel button twice within DISCARD_CONFIRM_WINDOW_MS
   * for the same cube. A single stray pinch only arms it. Desktop keyboard and toolbar discards stay one step.
   */
  private handleDiscardSelected(dropIntoChute = false): void {
    if (this.isAnyObjectGrabbed()) {
      this.playCue('ERROR_REJECT');
      return;
    }
    const selectedId = this.engine.getState().selectedPacketId;
    if (!dropIntoChute && this.world.renderer.xr.isPresenting) {
      const now = performance.now();
      const confirmed = selectedId !== null && this.discardArmedPacketId === selectedId && now <= this.discardArmedUntilMs;
      if (!confirmed) {
        if (!selectedId) {
          this.playCue('ERROR_REJECT');
          return;
        }
        const pkt = this.engine.getState().packets.find((p) => p.id === selectedId);
        this.discardArmedPacketId = selectedId;
        this.discardArmedUntilMs = now + DISCARD_CONFIRM_WINDOW_MS;
        this.caption = `Pinch DISCARD again within ${DISCARD_CONFIRM_WINDOW_MS / 1000} s to throw away ${selectedId}${pkt ? ` (Sector ${pkt.sectorId} ${pkt.sensorMode})` : ''}, or drop the cube into the red chute.`;
        this.audio.playMechanicalSwitchClick(false);
        this.syncAll();
        return;
      }
    }
    this.discardArmedUntilMs = 0;
    this.discardArmedPacketId = null;
    const res = this.applyAction({ type: 'DISCARD', packetId: selectedId });
    this.playCue(res.ok ? 'DISCARD_CUBE' : 'ERROR_REJECT');
    this.syncAll();
  }

  private isDiscardArmed(): boolean {
    return this.discardArmedUntilMs > 0 && performance.now() <= this.discardArmedUntilMs;
  }

  private handleStartDownlink(): boolean {
    this.lastTransmittedCount = 0;
    this.downlinkUiSyncAccumulator = 0;
    this.tutorial.notifyTransmitActivated(this.currentInputSource);
    const res = this.applyAction({ type: 'COMMIT' });
    if (res.ok) {
      this.cubeTransitions.clear();
      this.lastDownlinkTickSecond = -1;
      this.playCue('SOLENOID_LATCH');
      this.playCue('DOWNLINK_COMMIT');
      this.audio.playCarrierAcquisition(); // S-band carrier synthesizer lock buildup
      this.voiceCommander?.trigger('DOWNLINK_TRANSMIT');

      // Immediately activate live S-Band microwave uplink beam
      const consoleObj = this.sceneObject('orbital-console');
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

  /**
   * The physical TRANSMIT lever is context-sensitive so the whole pass stays hands-completable:
   * OPERATIONS -> open the link (or abort when no finish is possible); DOWNLINK -> close the link
   * once docked cubes finish; DEBRIEF -> restart.
   */
  private handleCommitDownlinkButton(): void {
    const state = this.engine.getState();
    const phase = state.phase;
    // While paused (including the automatic pause from the Quest system menu) this is the RESUME button,
    // so the player never has to find PAUSE on a side panel.
    if (state.paused) {
      this.togglePause();
      return;
    }
    if (phase === 'OPERATIONS') {
      if (isPassStalled(state, this.engine.getActiveCustomScenario())) {
        this.handleAbortPass();
        return;
      }
      this.handleStartDownlink();
    } else if (phase === 'DOWNLINK') {
      const res = this.applyAction({ type: 'CLOSE_LINK' });
      this.playCue(res.ok ? 'HANDSHAKE_CONFIRM' : 'ERROR_REJECT');
      this.syncAll();
    } else if (phase === 'DEBRIEF') {
      this.handleRestartMission();
    }
  }

  /**
   * Quest performance profile. Fragment shading dominates on mobile XR GPUs, so in a headset:
   * - fixed foveated rendering is enabled (periphery rendered at lower resolution);
   * - two decorative point lights (cradle amber, bay blue) are switched off. Their emissive
   *   materials still glow, and every MeshStandardMaterial drops two per-pixel light evaluations.
   * Applied only on session start/end, so shader programs recompile once, not per frame.
   */
  private applyXRPerformanceProfile(immersive: boolean): void {
    try {
      (this.world.renderer.xr as unknown as { setFoveation?: (v: number) => void }).setFoveation?.(immersive ? 1 : 0);
    } catch { /* foveation is optional */ }
    const consoleObj = this.sceneObject('orbital-console');
    // All three decorative point lights: every lit fragment pays for every visible light.
    for (const name of ['CradleAmberLight', 'DownlinkBayBlueLight', 'HoloTableProjectorLight']) {
      const light = consoleObj?.getObjectByName(name);
      if (light) light.visible = !immersive;
    }
    // 2.88 m x 1.35 m double-sided tint at 2.4% opacity: two full-view blended layers per eye for no visible gain.
    const canopyGlass = consoleObj?.getObjectByName('CanopyGlassGlare');
    if (canopyGlass) canopyGlass.visible = !immersive;
  }

  /** Single entry point for loading an operation from any menu (desktop campaign, landing, panels). */
  public launchScenario(id: MissionScenarioId): void {
    if (!MISSION_SCENARIOS[id] || this.engine.getState().phase === 'DOWNLINK') return;
    this.xrCardOpen = id !== 'ORBITAL_ACADEMY';
    if (this.tutorial.isActive()) this.tutorial.skip();
    this.forceReleaseAllGrabs();
    this.dailyDate = null;
    this.engine.setScenario(id);
    this.handleRestartMission();
    if (id === 'ORBITAL_ACADEMY') this.tutorial.start(Boolean(this.world.renderer?.xr?.isPresenting));
    this.syncAll();
  }

  public handleAbortPass(): void {
    const res = this.applyAction({ type: 'ABORT' });
    this.forceReleaseAllGrabs();
    this.playCue(res.ok ? 'LINK_CUTOFF' : 'ERROR_REJECT');
    if (res.ok) this.voiceCommander?.trigger('DEBRIEF_RETRY');
    this.syncAll();
  }

  public requestAriaHint(): string {
    const res = this.coPilot.executeActiveIntervention();
    if (!res.ok) this.playCue('ERROR_REJECT');
    else this.caption = res.message;
    this.syncAll();
    return res.message;
  }

  public setRelaxedMode(enabled: boolean): void {
    this.engine.setRelaxedMode(enabled);
    this.syncAll();
  }

  private handleRestartMission(): void {
    this.forceReleaseAllGrabs();
    this.xrCardOpen = this.engine.getState().scenarioId !== 'ORBITAL_ACADEMY';
    this.lastTransmittedCount = 0;
    this.lastDownlinkTickSecond = -1;
    this.downlinkUiSyncAccumulator = 0;
    this.scanBeamPulseTimer = 0;
    this.cradlePulseTimer = 0;
    const globe = this.sceneObject('earth-globe');
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
    const consoleObj = this.sceneObject('orbital-console');
    const uplinkBeam = consoleObj?.getObjectByName('DownlinkUplinkBeam');
    if (uplinkBeam) uplinkBeam.visible = false;
    this.reviewState = undefined;
    this.announcedReceipts.clear();
    this.recordedDebrief = false;
    this.replayIndex = -1;
    if (this.debriefPanel) this.setText(this.debriefPanel, 'ReplayTimeline', 'DECISION REPLAY AVAILABLE AFTER DOWNLINK');
    this.missionElapsedTime = 0;
    this.earnedMedals = [];
    this.cubeTransitions.clear();
    this.solverMemo.clear();
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
    this.cueLog.push({ cue, at: Math.round(performance.now()) });
    if (this.cueLog.length > 40) this.cueLog.shift();
    const captions: Partial<Record<OrbitalSoundCue, string>> = {
      SCAN_OPTICAL: 'OPTICAL APERTURE: Visible-band reflectance frame acquired.',
      SCAN_RADAR: 'SAR BACKSCATTER: Active microwave return acquired through cloud layer.',
      PROCESS_SUCCESS: `PROCESSING COMPLETE: Onboard feature vectorization compressed packet to ${this.engine.getActiveScenario().budget.onboardProcess.compressedStorageCost} STR.`,
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
    return this.solverMemo.get(state, this.engine.getActiveCustomScenario());
  }

  private togglePause(): void {
    const state = this.engine.getState();
    if (state.phase === 'DEBRIEF') return;
    this.applyAction({ type: state.paused ? 'RESUME' : 'PAUSE' });
    if (!state.paused) this.forceReleaseAllGrabs();
    this.syncMediaHold();
    this.syncAll();
  }

  /**
   * The player left (Quest menu, headset off, tab hidden, flat-page window blur) or came back. While away,
   * voice and sound are held. With `pausePass`, a running pass (clock started, or the live window) also
   * pauses; it resumes only from the HUD/pause control, never by itself. Before the first scan nothing runs.
   */
  private setInterrupted(away: boolean, pausePass: boolean): void {
    this.interrupted = away;
    const state = this.engine.getState();
    const running = (state.phase === 'OPERATIONS' && state.passStarted) || state.phase === 'DOWNLINK';
    if (away && pausePass && running && !state.paused) this.togglePause();
    this.syncMediaHold();
  }

  /** Voice and sound stop while the pass is paused or the player is away, and come back together. */
  private syncMediaHold(paused = this.engine.getState().paused): void {
    const held = paused || this.interrupted;
    if (held === this.mediaHeld) return;
    this.mediaHeld = held;
    this.voiceCommander?.setHeld(held);
    this.audio.setHeld(held);
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
    if (key === 'relaxedClock') this.engine.setRelaxedMode(preferences.relaxedClock);
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
    const scanner = this.sceneObject('scanner-tool');
    // The console has one scanner holster, on the left. x = +0.44 is the discard chute: a scanner parked
    // there turned every scanner pinch into DISCARD of the selected cube.
    SCANNER_HOME_POSITION.set(-0.44, 0.80, -0.30);
    if (scanner && !this.isAnyObjectGrabbed()) scanner.position.copy(SCANNER_HOME_POSITION);
    this.applyTabletopMode();
  }

  private applyPanelPose(panel: Object3D, pose: PanelPose): void {
    panel.position.set(pose.position[0], pose.position[1], pose.position[2]);
    panel.rotation.set(0, (pose.yawDeg * Math.PI) / 180, 0);
    panel.scale.setScalar(pose.scale);
  }

  public applyTabletopMode(): void {
    const isTabletop = this.profile.preferences.tabletopMode;
    const isImmersive = Boolean(this.world.renderer?.xr?.isPresenting);
    const consoleObj = this.sceneObject('orbital-console');
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
        this.applyPanelPose(this.briefingPanel, IMMERSIVE_PANEL_POSES.briefing);
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
        this.applyPanelPose(this.telemetryPanel, IMMERSIVE_PANEL_POSES.telemetry);
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
        // Same slot as telemetry (hidden during debrief). Centered behind the globe the debrief was hidden by it.
        this.applyPanelPose(this.debriefPanel, IMMERSIVE_PANEL_POSES.debrief);
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
    this.engine.cycleCampaignOperation();
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
      Lbl_RelaxedClock: `PASS CLOCK: ${p.relaxedClock ? 'OFF (RELAXED)' : 'ON'}`,
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
    this.announceActiveScenarioPassStart();
    this.syncAll();
  }

  /**
   * Poking / pinching ARIA (pad, hologram or HUD button) asks for a paid hint, never an autonomous move.
   * In-world triggers sit near the Cradle -> Bay carry path, so the first pinch only arms the hint and a
   * second pinch within HINT_CONFIRM_WINDOW_MS spends the points. A stray pinch never costs score.
   */
  public handleAriaDelegate(): void {
    const now = performance.now();
    if (now <= this.hintArmedUntilMs) {
      this.hintArmedUntilMs = 0;
      this.requestAriaHint();
      return;
    }
    if (this.engine.getState().phase !== 'OPERATIONS') {
      this.requestAriaHint(); // lets the co-pilot explain why no hint is available, at no cost
      return;
    }
    this.hintArmedUntilMs = now + HINT_CONFIRM_WINDOW_MS;
    this.caption = `ARIA: pinch again within ${HINT_CONFIRM_WINDOW_MS / 1000} s to buy a hint (-${SCORING.hintPenalty} pts).`;
    this.audio.playMechanicalSwitchClick(false);
    this.syncAll();
  }

  private isHintArmed(): boolean {
    return this.hintArmedUntilMs > 0 && performance.now() <= this.hintArmedUntilMs;
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
    const obj = this.sceneObject(nodeId);
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
    const obj = entity.object3D;
    if (!obj) return;
    const returnHome = () => {
      obj.position.copy(SCANNER_HOME_POSITION);
      obj.rotation.set(0, 0, 0);
    };
    // Released while paused, during the downlink or after the pass: no scan, but never leave the tool floating.
    if (this.suppressReleaseActions || this.engine.getState().phase !== 'OPERATIONS' || this.engine.getState().paused) {
      returnHome();
      return;
    }

    // A scan costs power, so it fires only at the beacon the visible beam is locked on (the same rule as the
    // live highlight), or rested on until a moment ago (the hand shifts as the pinch opens).
    const graceLock = performance.now() - this.scannerBeamLastLockAt <= SCANNER_RELEASE_GRACE_MS
      && this.scannerBeamLastLockHeldMs >= SCANNER_LOCK_DWELL_MS ? this.scannerBeamLastLockId : null;
    const lock = this.scannerBeamTarget(obj, this.scannerBeamLock) ?? graceLock;
    this.scannerBeamLock = null;
    this.scannerBeamLockSince = -Infinity;
    this.scannerBeamLastLockId = null;
    this.scannerBeamLastLockAt = -Infinity;
    this.scannerBeamLastLockHeldMs = 0;
    if (lock) {
      if (lock !== this.engine.getState().selectedSectorId) this.applyAction({ type: 'SELECT_SECTOR', sectorId: lock });
      this.handleScan();
    } else if (this.isNearGlobeSurface(this.beamOrigin, SCANNER_NEAR_GLOBE_M)) {
      // Let go at the globe with the beam on no beacon: nothing is spent, and the player is told why.
      this.playCue('ERROR_REJECT');
      this.caption = 'No scan: point the scanner beam at a sector until the beacon glows, then let go.';
      this.syncAll();
    }
    returnHome();
  }

  /** True when the point is within `margin` metres of the Earth globe's surface (its real centre and scale). */
  private isNearGlobeSurface(point: Vector3, margin: number): boolean {
    const globe = this.sceneObject('earth-globe');
    if (!globe) return false;
    globe.getWorldPosition(this.beamGlobeCenter);
    const radius = GLOBE_RADIUS * globe.getWorldScale(this.beamPoint).x;
    return point.distanceTo(this.beamGlobeCenter) <= radius + margin;
  }

  /**
   * The sector beacon the scanner's visible beam is on, or null. The beam (ScannerAimLaser) runs
   * SCANNER_BEAM_LENGTH_M forward from the aperture; a beacon locks when its centre lies within
   * SCANNER_BEAM_LOCK_RADIUS_M of that segment and it faces the scanner. The current lock is kept
   * unless another beacon is clearly nearer the beam, so a hand hovering between neighbours does not
   * flicker. The live highlight and the scan on release both use this rule. Allocation-free (runs per frame).
   */
  private scannerBeamTarget(scannerObj: Object3D, current: SectorId | null): SectorId | null {
    scannerObj.updateWorldMatrix(true, false);
    this.beamOrigin.copy(SCANNER_APERTURE_LOCAL).applyMatrix4(scannerObj.matrixWorld);
    this.beamDir.copy(SCANNER_BEAM_DIR_LOCAL).transformDirection(scannerObj.matrixWorld);
    const globe = this.sceneObject('earth-globe');
    if (globe) globe.getWorldPosition(this.beamGlobeCenter);
    let bestId: SectorId | null = null;
    let bestPerp = Infinity;
    let bestAlong = 0;
    let currentPerp = Infinity;
    let currentAlong = 0;
    for (const sectorEntity of this.queries.sectors.entities) {
      const sObj = sectorEntity.object3D;
      if (!sObj || !isVisible(sObj)) continue;
      sObj.updateWorldMatrix(true, false);
      this.beamBeacon.setFromMatrixPosition(sObj.matrixWorld);
      if (globe) {
        // A beacon turned to the far side of the globe faces away from the scanner: it cannot be scanned through Earth.
        this.beamPoint.copy(this.beamBeacon).sub(this.beamGlobeCenter).normalize();
        if (this.beamPoint.dot(this.beamOrigin) - this.beamPoint.dot(this.beamBeacon) < -0.02) continue;
      }
      const along = Math.min(SCANNER_BEAM_LENGTH_M, Math.max(-0.02, this.beamPoint.copy(this.beamBeacon).sub(this.beamOrigin).dot(this.beamDir)));
      const perp = this.beamPoint.copy(this.beamOrigin).addScaledVector(this.beamDir, along).distanceTo(this.beamBeacon);
      const sectorId = (sectorEntity.getValue(OrbitSectorNode, 'sectorId') || 'B') as SectorId;
      if (sectorId === current) {
        currentPerp = perp;
        currentAlong = along;
      }
      if (perp < bestPerp) {
        bestPerp = perp;
        bestAlong = along;
        bestId = sectorId;
      }
    }
    if (current && currentPerp <= SCANNER_BEAM_LOCK_RADIUS_M + SCANNER_BEAM_SWITCH_MARGIN_M && bestPerp > currentPerp - SCANNER_BEAM_SWITCH_MARGIN_M) {
      this.scannerBeamAlong = currentAlong;
      return current;
    }
    if (bestId && bestPerp <= SCANNER_BEAM_LOCK_RADIUS_M) {
      this.scannerBeamAlong = bestAlong;
      return bestId;
    }
    return null;
  }

  private getCubeDropTargets(): CubeDropTarget[] {
    const console = this.sceneObject('orbital-console');
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
    const releasePhase = this.engine.getState().phase;
    if (this.suppressReleaseActions || (releasePhase !== 'OPERATIONS' && releasePhase !== 'DOWNLINK') || this.engine.getState().paused) {
      this.syncAll();
      return;
    }
    if (releasePhase === 'DOWNLINK') {
      // Live window: only docking into the bay (or putting a cube back) is possible.
      const liveObj = entity.object3D;
      const liveSlot = entity.getValue(EvidenceCubeNode, 'slotIndex') ?? 0;
      const livePkt = this.engine.getState().packets[liveSlot];
      if (!liveObj || !livePkt) { this.syncAll(); return; }
      liveObj.updateWorldMatrix(true, false);
      const liveTarget = nearestCubeStation(liveObj.getWorldPosition(new Vector3()), this.getCubeDropTargets());
      if (liveTarget?.kind === 'QUEUE' && !livePkt.queued) {
        this.applyAction({ type: 'SELECT_PACKET', packetId: livePkt.id });
        const res = this.applyAction({ type: 'QUEUE', packetId: livePkt.id });
        this.playCue(res.ok ? 'QUEUE_SLOT' : 'ERROR_REJECT');
        if (res.ok) this.audio.playMagneticSnap();
      } else if (liveTarget?.kind === 'RAW_TRAY' && livePkt.queued) {
        const res = this.applyAction({ type: 'UNQUEUE', packetId: livePkt.id });
        this.playCue(res.ok ? 'QUEUE_SLOT' : 'ERROR_REJECT');
      } else if (liveTarget) {
        this.playCue('ERROR_REJECT');
      }
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
      this.handleDiscardSelected(true); // carrying the cube into the chute is the deliberate gesture
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
    const processPad = this.sceneObject('pad-process-cradle');
    const queuePad = this.sceneObject('pad-queue-downlink');
    const discardPad = this.sceneObject('pad-discard-chute');

    if (processPad) {
      this.setObjectTint(processPad, 0xf59e0b, selected('PROCESS') ? 1.45 : 0.85);
    }
    if (queuePad) {
      this.setObjectTint(queuePad, 0x38bdf8, selected('QUEUE') ? 1.45 : 0.85);
    }
    if (discardPad) {
      this.setObjectTint(discardPad, 0xef4444, selected('DISCARD') ? 1.45 : 0.85);
    }

    const consoleObj = this.sceneObject('orbital-console');
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

  /** Every sector's weather puffs, in one Points object parented to the globe (rotates and scales with it). */
  private weatherLayer: SectorWeatherLayer | null = null;
  private weatherSlots = new Map<SectorId, number>();

  private syncSectorWeather(): void {
    const globe = this.sceneObject('earth-globe');
    if (!globe) return;
    const state = this.engine.getState();
    const custom = this.engine.getActiveCustomScenario();
    if (!this.weatherLayer) {
      const layer = new SectorWeatherLayer(SECTOR_ORDER.length);
      SECTOR_ORDER.forEach((sectorId, index) => {
        const def = SECTOR_GEO_DEFINITIONS[sectorId];
        if (!def) return;
        const local = latLonToGlobePoint(def.centerLatLon[0], def.centerLatLon[1], GLOBE_RADIUS * 1.004);
        this.weatherSlots.set(sectorId, layer.addSector(local, local, index + 1));
      });
      globe.add(layer.points);
      this.weatherLayer = layer;
      this.cleanupFuncs.push(() => { layer.dispose(); this.weatherLayer = null; this.weatherSlots.clear(); });
    }
    for (const [sectorId, slot] of this.weatherSlots) {
      this.weatherLayer.setWeather(slot, getScenarioSector(state.scenarioId, sectorId, custom).cloudCover);
    }
  }

  /** Beacon size and colour per sector: delivered/cut pins, scan result, selected, hovered by a laser or the head. */
  private syncSectorBeacons(state: MissionState, globe: Object3D | undefined): void {
    for (const sectorEntity of this.queries.sectors.entities) {
      const sectorId = (sectorEntity.getValue(OrbitSectorNode, 'sectorId') ||
        'B') as SectorId;
      const isSelected = sectorId === state.selectedSectorId;
      const isGazed = sectorId === this.gazeSectorId || this.isLaserHovered(`sector-${sectorId.toLowerCase()}`);
      const sectorCfg = getScenarioSector(
        state.scenarioId,
        sectorId,
        this.engine.getActiveScenario(),
      );
      const obj = sectorEntity.object3D;
      if (!obj) continue;

      const scannedPkt = state.packets.find((p) => p.sectorId === sectorId);
      const isScanned = scannedPkt !== undefined;
      const scale = isSelected ? (isGazed ? 1.45 : 1.35) : isGazed ? 1.25 : isScanned ? 1.12 : 1.0;
      obj.scale.set(scale, scale, scale);

      let hex = 0x38bdf8;
      const deliveredHere = state.packets.find((p) => p.sectorId === sectorId && p.transmitted && p.satisfiesRequestId);
      const cutHere = state.packets.find((p) => p.sectorId === sectorId && p.droppedByWindow);
      if (deliveredHere || cutHere) {
        // Finale pins: delivered evidence glows green; cut-off evidence burns red.
        hex = deliveredHere ? 0x22c55e : 0xef4444;
        obj.scale.setScalar(1.4);
        this.setObjectTint(obj, hex, deliveredHere ? 2.2 : 1.6);
        const poly = globe?.getObjectByName(`SectorPoly_${sectorId}`);
        if (poly instanceof Mesh && poly.material instanceof MeshStandardMaterial) {
          poly.material.color.setHex(hex);
          poly.material.emissive?.setHex(hex);
        }
        continue;
      }
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
      this.setObjectTint(obj, hex, isSelected ? 1.45 : isGazed ? 1.35 : isScanned ? 1.15 : 0.85);

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
  }

  /** A desk pad under a hand laser grows slightly, so the player sees what a pinch will press. */
  private syncPadHover(): void {
    for (const { id } of LASER_PADS) {
      const pad = this.sceneObject(id);
      if (!pad) continue;
      const base = (pad.userData.laserBaseScale ??= pad.scale.x) as number; // pads are authored at 0.4-0.8
      const hovered = this.isLaserHovered(id);
      pad.scale.setScalar(hovered ? base * LASER_PAD_HOVER_SCALE : base);
      const twin = GAUGE_BUTTON_TWIN[id];
      if (twin) this.childByName(this.sceneObject('desk-gauges'), twin.group)?.scale.setScalar(hovered ? LASER_PAD_HOVER_SCALE : 1);
    }
  }

  private isLaserHovered(id: string): boolean {
    return (this.laserHover.get(id)?.size ?? 0) > 0;
  }

  /**
   * Hover from IWSDK's hand ray (the visible laser) over a sector beacon, desk pad or HUD button. One
   * pointer entering a target that nothing hovered yet plays a soft tick (throttled) and restyles it.
   */
  private setLaserHover(id: string, pointerId: number, hovering: boolean): void {
    let pointers = this.laserHover.get(id);
    const before = (pointers?.size ?? 0) > 0;
    if (hovering) {
      if (!pointers) this.laserHover.set(id, (pointers = new Set()));
      pointers.add(pointerId);
    } else {
      pointers?.delete(pointerId);
    }
    const after = (pointers?.size ?? 0) > 0;
    if (before === after) return;
    if (after) {
      const now = performance.now();
      if (now - this.lastLaserHoverCueAt >= LASER_HOVER_CUE_GAP_MS) {
        this.lastLaserHoverCueAt = now;
        this.playCue('HOVER_TICK');
      }
    }
    // HUD buttons restyle themselves (UIKit :hover rules in public/ui/*.uikitml).
    if (id.startsWith('sector-')) this.syncSectorBeacons(this.engine.getState(), this.sceneObject('earth-globe'));
    else if (!id.startsWith('ui:')) this.syncPadHover();
  }

  private syncAll(): void {
    const state = this.engine.getState();
    const globe = this.sceneObject('earth-globe');
    this.syncSectorWeather();

    // Single source of truth: engine's committed downlink time vs. the active window.
    // Withdraw the one-shot QUEUE_OVERFLOW advisory as soon as it is no longer true.
    if (state.downlinkCommittedSec <= state.downlinkWindowSec + 0.01) {
      this.voiceCommander?.retract('QUEUE_OVERFLOW');
    }

    // 1. Update 3D Sector Beacons & Surface-Conforming Spherical Sector Polygons on the Globe
    this.syncSectorBeacons(state, globe);
    this.syncPadHover();

    // 2. Update Scanner Tool & 3U CubeSat payload aperture colors for active sensor mode
    const scannerObj = this.sceneObject('scanner-tool');
    if (scannerObj) {
      const sensorHex =
        state.activeSensorMode === 'OPTICAL'
          ? 0x38bdf8
          : state.activeSensorMode === 'THERMAL'
            ? 0xff6b2b
            : 0xf59e0b;
      this.setObjectTint(scannerObj, sensorHex, 0.95);
    }

    const cubesat = this.sceneObject('cubesat-spacecraft');
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
    const consoleObj = this.sceneObject('orbital-console');
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
    this.syncMissionHud();
    this.syncTelemetryPanel();
    this.syncDebriefPanel();
    this.syncSpatialPanelsVisibility();
    this.syncSettings();
    // The desktop DOM HUD is display:none in a headset; rebuilding its innerHTML there is pure waste.
    // syncAll() runs again on XR exit, so the DOM HUD is current when it reappears.
    if (!this.world.renderer.xr.isPresenting) this.desktopControls?.updateHud();
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
      // Live window: tray cubes that can still be docked pulse so "dock now!" is obvious.
      const dockableLive = this.engine.getState().phase === 'DOWNLINK' && !pkt.queued && pkt.confidence !== 'UNVERIFIED';
      const liveIntensity = dockableLive ? 1.1 + 0.9 * Math.abs(Math.sin(this.elapsedTime * 6)) : isSelected ? 1.35 : 0.95;
      this.setObjectTint(obj, confidenceHex, liveIntensity);
      this.updateCubeTelemetryCanvas(obj, slotIndex, pkt);
    }
  }

  /**
   * High-DPI 512Ã—512 telemetry renderer with 4-quadrant layout:
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
      ctx.fillText(`STORAGE CAPACITY: ${rawStorageUnits(this.engine.getActiveScenario().budget)} STR`, 120, 395);

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

      // What this sensor actually saw (blocked wash, heat front, radar speckle, sharp optical).
      paintSensorView(ctx, 29, 109, 218, 212, pkt);

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
        ? `${pkt.storageCost} STR (${compLabel})`
        : `${pkt.rawStorageCost} STR (RAW)`;
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
    const opLabel = scenario.operationCode ?? scenario.name.toUpperCase();
    const thresholds = getScenarioThresholds(state.scenarioId, this.engine.getActiveCustomScenario());
    const clockLabel = state.passRemainingSec === null ? 'NO CLOCK' : `CLOCK ${formatClock(state.passRemainingSec)}${state.passStarted ? '' : ' (starts at first scan)'}`;
    this.setText(
      this.briefingPanel,
      'BriefingSubtitle',
      `${threatBadge}${opLabel} | WIN ${thresholds.successScore}+ pts | ${clockLabel} | ${state.downlinkWindowSec.toFixed(1)}s window`,
    );

    const payloadMb = scanCost.payloadMb ?? Number((scanCost.transmitSec * 10).toFixed(0));
    this.setText(
      this.briefingPanel,
      'SelectedSectorTitle',
      `TARGET: ${sector.code} ${sector.name} (${sector.cloudCover !== 'CLEAR' ? sector.cloudCover.replace(/_/g, ' ') : 'CLEAR SKY'})`,
    );
    const guide = SENSOR_PLAIN_GUIDE[state.activeSensorMode];
    this.setText(
      this.briefingPanel,
      'SelectedSectorDesc',
      `WEATHER: ${describeWeather(sector.cloudCover)}. ${guide.label}: ${guide.sees}; ${guide.blind.toLowerCase()} (${scanCost.powerCost} Wh, ${payloadMb} MB / ${scanCost.transmitSec.toFixed(1)}s).`,
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
              `${req.shortLabel} [QUEUED SLOT #${(matchingPkt.queueIndex ?? 0) + 1}]`,
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
              `${req.shortLabel} [CUTOFF OVERFLOW WARNING]`,
            );
            this.setText(
              this.briefingPanel,
              statusId,
              `[!] Will be cut off at ${state.downlinkWindowSec.toFixed(1)}s! Compress in the Cradle (-${scenario.budget.onboardProcess.powerCost} Wh -> ${scenario.budget.onboardProcess.compressedTransmitSec.toFixed(1)}s) or reorder the bay.`,
            );
            this.setBg(this.briefingPanel, cardId, '#7f1d1d');
          }
        } else {
          const procStr = `${matchingPkt.processed ? 'COMPRESSED' : 'RAW'} ${matchingPkt.transmitSec.toFixed(1)}s`;
          this.setText(
            this.briefingPanel,
            titleId,
            `${req.shortLabel} [ON TRAY - QUEUE ME]`,
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
          // shortLabel already starts with "REQ n |"; Academy only qualifies on the first target.
          `${req.shortLabel} [${state.scenarioId === 'ORBITAL_ACADEMY' && i > 0 ? 'OPTIONAL IN TRAINING' : 'AWAITING SCAN'}]`,
        );
        const reqSector = getScenarioSector(state.scenarioId, req.targetSectorId, scenario);
        // Weather is the clue; the matching sensor is for the player to deduce (or buy via an ARIA hint).
        this.setText(
          this.briefingPanel,
          statusId,
          `SECTOR ${req.targetSectorId}: ${describeWeather(reqSector.cloudCover)} | needs ${req.minimumConfidence} | worth ${requestValue(req)} pts`,
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
    if (state.phase === 'DOWNLINK') return `TRANSMITTING: ${state.downlinkRemainingSec.toFixed(1)}s left (@ ${fmtRate(this.engine.getActiveScenario().budget)}). Evidence streaming to ground.`;
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
    if (next.type === 'PROCESS') return `${ceiling}> STEP 4: Drop cube into the Amber Cradle to compress payload (-${this.engine.getActiveScenario().budget.onboardProcess.powerCost} Wh).`;
    if (next.type === 'DISCARD') return `${ceiling}> DIRECTIVE: Drop unnecessary SEC-${next.sectorId} cube into discard chute.`;
    if (next.type === 'UNQUEUE') return `${ceiling}> DIRECTIVE: Remove SEC-${next.sectorId} from the bay to fit higher-value evidence.`;
    return `${ceiling}> STEP 5: Place compressed cube into Downlink Bay slot.`;
  }

  private syncTelemetryPanel(): void {
    if (!this.telemetryPanel) return;
    const state = this.engine.getState();
    // In the headset the Mission HUD strip already shows the next step, battery, memory, clock and send time;
    // this panel keeps only the selected-cube inspector, the cube buttons, pause and settings.
    const xr = Boolean(this.world.renderer.xr.isPresenting);
    this.setDisplay(this.telemetryPanel, 'StatusBannerCard', xr ? 'none' : 'flex');
    this.setDisplay(this.telemetryPanel, 'TelemetryHeaderCard', xr ? 'none' : 'flex');

    const scenario = this.engine.getActiveScenario();
    const tutStep = this.tutorial.getCurrentStepSpec();
    this.setText(
      this.telemetryPanel,
      'OperationTitleText',
      tutStep
        ? `ORBIT ZERO // OP 00: ORBITAL ACADEMY (STEP ${tutStep.index}/9)`
        : `ORBIT ZERO // ${scenario?.operationCode ?? scenario?.name.toUpperCase() ?? 'TACTICAL PASS'}`,
    );
    this.setText(
      this.telemetryPanel,
      'OperationPhaseBadge',
      state.phase === 'DOWNLINK'
        ? 'LIVE LINK'
        : state.phase === 'DEBRIEF'
          ? 'RESULT'
          : tutStep
            ? 'TRAINING'
            : 'SCAN, COMPRESS, LOAD',
    );

    const pwrRatio = Math.max(0, Math.min(1, state.power / state.maxPower));
    const pwrFilled = Math.round(pwrRatio * 10);
    const pwrBar = `[${'#'.repeat(pwrFilled)}${'-'.repeat(10 - pwrFilled)}]`;

    const strFilled = Math.max(0, Math.min(state.maxStorage, state.storageUsed));
    const strBar = `[${'#'.repeat(strFilled)}${'-'.repeat(state.maxStorage - strFilled)}]`;

    const clockText = state.passRemainingSec === null
      ? 'PASS CLOCK: OFF'
      : state.passStarted
        ? `PASS CLOCK: ${formatClock(state.passRemainingSec)}`
        : `PASS CLOCK: ${formatClock(state.passRemainingSec)} (starts at first scan)`;
    this.setText(
      this.telemetryPanel,
      'ResourceReadout',
      `BATTERY ${pwrBar} ${state.power}/${state.maxPower} Wh  |  MEMORY ${strBar} ${state.storageUsed}/${state.maxStorage}  |  ${clockText}`,
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
      windowText = `LIVE LINK: ${remBar} ${state.downlinkRemainingSec.toFixed(1)}s LEFT  |  DOCK REMAINING CUBES NOW`;
    } else if (state.phase === 'DEBRIEF') {
      windowText = `LINK CLOSED: ${state.debrief?.downlinkUsedSec.toFixed(1)}s used of ${state.downlinkWindowSec.toFixed(1)}s | ${state.debrief?.transmittedPacketIds.length ?? 0} cube(s) delivered`;
    } else if (windowOverflow) {
      windowText = `TRANSMIT TIME: ${winBar} ${state.downlinkCommittedSec.toFixed(1)}s / ${state.downlinkWindowSec.toFixed(1)}s  OVER BY ${(state.downlinkCommittedSec - state.downlinkWindowSec).toFixed(1)}s - LAST SLOT WILL BE CUT`;
    } else {
      windowText = `TRANSMIT TIME: ${winBar} ${state.downlinkCommittedSec.toFixed(1)}s / ${state.downlinkWindowSec.toFixed(1)}s loaded (${marginSec.toFixed(1)}s spare)`;
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

    const step = getNextStep(state, this.engine.getActiveCustomScenario());
    const tutorialText = tutStep ? `${tutStep.title}\n${this.world.renderer?.xr?.isPresenting ? tutStep.vrInstruction : tutStep.desktopInstruction}` : null;
    const statusMsg = !state.lastActionOk
      ? `> ${state.lastStatusMessage}`
      : tutorialText ?? `> ${step.title}\n${step.body}\nHANDS: ${step.hands}`;

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
        'Scan a sector, then pick up a cube on the tray to see it here.',
      );
      this.setText(
        this.telemetryPanel,
        'InspectorScience',
        `Compress (${scenario.budget.onboardProcess.powerCost} Wh): any cube with evidence shrinks to ${scenario.budget.onboardProcess.compressedStorageCost} memory block / ${scenario.budget.onboardProcess.compressedTransmitSec.toFixed(1)}s. It cannot rescue a blocked [X] scan.`,
      );
      this.setText(this.telemetryPanel, 'InspectorCost', '');
      this.setBg(this.telemetryPanel, 'CubeInspectorCard', '#152238');
      this.setText(
        this.telemetryPanel,
        'Lbl_ProcessCube',
        `COMPRESS SELECTED CUBE (-${scenario.budget.onboardProcess.powerCost} Wh)`,
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
        `${selectedPkt.id} | ${selectedPkt.sectorCode} ${selectedPkt.sectorName} | ${selectedPkt.sensorMode} | ${procTag}`,
      );
      // Confidence is a property of the observation. Compression changes size and cost only.
      this.setText(
        this.telemetryPanel,
        'InspectorConfidence',
        `${selectedPkt.confidenceBadge} | ${confPct}% sure (simulated)${selectedPkt.processed ? ' | compression did not change this' : ''}`,
      );
      this.setText(
        this.telemetryPanel,
        'InspectorCost',
        `${selectedPkt.storageCost} memory | ${mb} MB | ${selectedPkt.transmitSec.toFixed(1)}s to send | ${selectedPkt.satisfiesRequestId ? `answers ${selectedPkt.satisfiesRequestId.replace('_', ' ')}` : 'answers no request'} | ${selectedPkt.headline}`,
      );
      this.setText(
        this.telemetryPanel,
        'InspectorScience',
        // One readable sentence in the headset; the full caveat stays in the desktop inspector.
        clipText(selectedPkt.scientificReason, 150),
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
          ? `${selectedPkt.id} IS ALREADY COMPRESSED`
          : selectedPkt.confidence === 'UNVERIFIED'
            ? 'THIS SCAN SAW NOTHING: DISCARD IT INSTEAD'
            : `COMPRESS ${selectedPkt.id} (-${scenario.budget.onboardProcess.powerCost} Wh, then ${scenario.budget.onboardProcess.compressedTransmitSec.toFixed(1)}s to send)`,
      );

      this.setText(
        this.telemetryPanel,
        'Lbl_QueueCube',
        selectedPkt.queued
          ? `REMOVE ${selectedPkt.id} FROM DOWNLINK SLOT #${(selectedPkt.queueIndex ?? 0) + 1}`
          : `LOAD ${selectedPkt.id} INTO THE DOWNLINK BAY (${selectedPkt.transmitSec.toFixed(1)}s to send)`,
      );
    }
    this.setText(
      this.telemetryPanel,
      'Lbl_DiscardCube',
      this.isDiscardArmed() ? 'PINCH AGAIN TO DISCARD' : 'DISCARD SELECTED CUBE',
    );
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
          : `DOWNLINK BAY (${state.queuePacketIds.length}/${this.engine.getActiveScenario().budget.maxQueueSlots} SLOTS | ${state.downlinkCommittedSec.toFixed(1)}s / ${state.downlinkWindowSec.toFixed(1)}s)`,
      );
      // The lever label must describe what pressing it does right now (see handleCommitDownlinkButton).
      this.setText(
        this.debriefPanel,
        'Lbl_CommitDownlink',
        state.phase === 'DOWNLINK'
          ? 'CLOSE LINK NOW (END PASS)'
          : isPassStalled(state, this.engine.getActiveCustomScenario())
            ? 'ABORT PASS (NOTHING LEFT TO SEND)'
            : `OPEN DOWNLINK (${state.downlinkWindowSec.toFixed(1)}s WINDOW)`,
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
      this.setDisplay(this.debriefPanel, 'DecisionReviewCard', 'none');
      for (const id of DEBRIEF_PANEL_OPERATIONS_ONLY) this.setDisplay(this.debriefPanel, id, 'flex');
    } else {
      const d = state.debrief;
      const debriefRate = d.downlinkThroughputMbps ?? rateOf(this.engine.getActiveScenario().budget);
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
          ? `1/1 Training Target Verified | ${d.transmittedPayloadMb ?? 0} MB (${d.downlinkUsedSec.toFixed(1)}s/${d.downlinkWindowSec.toFixed(1)}s @ ${debriefRate} MB/s) | ${d.powerRemaining} Wh Left | Ready for OP 01: FIRELINE`
          : `${d.requestsVerifiedCount}/${Object.keys(getScenarioRequests(state.scenarioId, this.engine.getActiveScenario())).length} Verified | ${d.transmittedPayloadMb ?? 0} MB (${d.downlinkUsedSec.toFixed(1)}s/${d.downlinkWindowSec.toFixed(1)}s @ ${debriefRate} MB/s) | ${d.powerRemaining} Wh Left`,
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
          `${ev.shortLabel}: ${ev.statusBadge} - ${clipText(ev.groundConsequence, 120)}`,
        );
      }
      // Same evidence-grounded notes the desktop debrief shows (scoring.describeRequestDecision).
      const notes = isAcademyPass ? [] : d.evaluations.map((ev) => ev.decisionNote ?? '');
      const hasNotes = notes.some((note) => note.length > 0);
      for (let i = 0; i < 3; i++) {
        const ev = d.evaluations[i];
        this.setText(this.debriefPanel, `DecisionNote${i + 1}`, hasNotes && ev && notes[i] ? `${ev.shortLabel}: ${notes[i]}` : '');
      }
      this.setDisplay(this.debriefPanel, 'DecisionReviewCard', hasNotes ? 'flex' : 'none');
      // After downlink the bay slots and the commit/reorder buttons carry no decisions; the results do.
      for (const id of DEBRIEF_PANEL_OPERATIONS_ONLY) this.setDisplay(this.debriefPanel, id, 'none');
      // Secondary readouts only take space when they have something to say.
      this.setDisplay(this.debriefPanel, 'ReplayTimeline', this.replayIndex >= 0 ? 'flex' : 'none');
      this.setDisplay(this.debriefPanel, 'MedalsReadout', this.earnedMedals.length > 0 ? 'flex' : 'none');
      const outcomeBorder = d.outcome === 'SUCCESS' ? '#10b981' : d.outcome === 'PARTIAL_SUCCESS' ? '#f59e0b' : '#ef4444';
      if (this.debriefBorder !== outcomeBorder) {
        this.debriefBorder = outcomeBorder;
        this.debriefPanel.getElementById('DebriefRoot')?.setProperties({ borderColor: outcomeBorder });
      }
      // Retry guidance and the achievable ceiling, trimmed to fit the spatial panel. The desktop debrief shows the full text.
      const diagPrefix =
        d.outcome !== 'SUCCESS' && d.failureExplanation
          ? (() => {
              const g = retryGuidanceFor(d);
              return g ? `${g.title}. ${clipText(g.body, 150)} ` : '';
            })()
          : '';
      this.setText(
        this.debriefPanel,
        'DebriefAdviceText',
        `${diagPrefix}${clipText(d.deterministicRecommendation, 150)} | CEILING ${d.achievableScore}/100 (${d.benchmarkDownlinkSec.toFixed(1)}s, ${d.benchmarkPowerUsed} Wh)`,
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

  private setDisplay(panel: UIKitMLAsset, id: string, display: 'flex' | 'none'): void {
    let values = this.panelValues.get(panel);
    if (!values) { values = new Map(); this.panelValues.set(panel, values); }
    if (values.get(`${id}:display`) === display) return;
    const el = panel.getElementById(id);
    if (!el) return;
    values.set(`${id}:display`, display);
    el.setProperties({ display });
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
    const scannerObj = this.sceneObject('scanner-tool');
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
      // A merged static part (e.g. a cube's frame) is never tinted, and a clone would drop its shader patch.
      if (!Array.isArray(child.material) && isBakedStaticMaterial(child.material)) return;
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
    // Only colours and intensities change here: three.js uploads them as uniforms every frame, so no
    // material.needsUpdate (which would re-check the shader program of every tinted material each frame).

    // Evidence cubes: the frame (and the highway line) glow in the cube's colour, the inner parts get a faint
    // glow. The front and top display plates hide the core, so the frame is what shows the colour. Parts are
    // named explicitly; the scene renames the asset root ("Evidence Cube 1"), so a cube is found by its frame.
    let isCube = this.evidenceCubeRoots.get(root);
    if (isCube === undefined) {
      isCube = Boolean(root.getObjectByName('CubeConfidenceCore') && root.getObjectByName('CubeOuterFrame'));
      this.evidenceCubeRoots.set(root, isCube);
    }
    if (isCube) {
      for (const name of CUBE_FULL_TINT_PARTS) {
        const part = this.childByName(root, name);
        if (!(part instanceof Mesh) || !(part.material instanceof MeshStandardMaterial)) continue;
        part.material.color.copy(color);
        part.material.emissive.copy(color);
        part.material.emissiveIntensity = emissiveIntensity;
      }
      for (const name of CUBE_FAINT_TINT_PARTS) {
        const part = this.childByName(root, name);
        if (!(part instanceof Mesh) || !(part.material instanceof MeshStandardMaterial)) continue;
        part.material.emissive.copy(color).multiplyScalar(0.18);
        part.material.emissiveIntensity = emissiveIntensity * 0.3;
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
    }
  }
}
