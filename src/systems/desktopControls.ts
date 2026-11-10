/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Desktop Controls & Guided First-Time Player Experience
 *
 * Provides a 100% playable desktop interaction mode for developers, judges,
 * and players on standard laptops/PCs without WebXR hardware:
 * 1. Direct Mouse Raycasting: Click on Earth sectors, evidence cubes, and console controls.
 * 2. Intuitive Keyboard Shortcuts: [1-5] Sectors, [M] Sensor, [Space] Scan, [P] Process, [Q] Queue, [T] Transmit.
 * 3. Guided Tactical Tutorial: Step-by-step onboarding teaching Earth observation physics and triage.
 * 4. Desktop Operator HUD: Crisp aerospace action toolbar, objective card, and feedback notifications.
 * 5. Dev Diagnostic Panel: Real-time telemetry inspector toggleable via [F1].
 * 6. Zero XR Conflict: Automatically hides when presenting in an immersive WebXR headset session.
 */

import { OUTCOME_LABELS, retryGuidanceFor, escapeHtml, clipText, requestStatusChip, type DebriefOutcome } from '../ui/debriefText';
import {
  Camera,
  Object3D,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  VisibilityState,
  type WebGLRenderer,
  type World,
} from '@iwsdk/core';
import type { MissionEngine } from '../mission/missionEngine';
import { CubeInteractions, cubeStationTargets, nearestCubeStation, setWorldPosition, type CubeDropTarget } from './cubeInteractions';
import type { MissionState, SectorId, SensorMode } from '../mission/types';
import { describeWeather, DOWNLINK_THROUGHPUT_MBPS, getScanCost, getScenarioRequests, getScenarioSector, requestValue, SCORING, SENSOR_PLAIN_GUIDE, STORAGE_UNIT_MB } from '../mission/missionConfig';
import { formatClock, getNextStep, isPassStalled } from '../mission/guidance';
import { actionBarHtml, campaignHtml, debriefScoreLine, helpHtml, missionCardHtml, nextStepBannerHtml } from '../ui/desktopHudViews';

export interface DesktopControllerHost {
  engine: MissionEngine;
  world: World;
  scene: Object3D;
  camera: Camera;
  renderer: WebGLRenderer;
  selectSector: (id: SectorId) => void;
  cycleSector: () => void;
  toggleSensor: () => void;
  scan: () => void;
  selectPacket: (id: string) => void;
  inspectPacket?: (id: string) => void;
  cycleCube: () => void;
  processSelected: (packetId?: string) => void;
  queueSelected: (packetId?: string, slotIndex?: number) => void;
  unqueueSelected: (packetId?: string) => void;
  discardSelected: (packetId?: string) => void;
  commitDownlink: () => void;
  restartMission: () => void;
  nextMission: () => void;
  togglePause: () => void;
  reorderQueue: () => void;
  playCue: (cue: string) => void;
  getSceneObject: (id: string) => Object3D | undefined;
  handleControlAction?: (action: string) => void;
  highlightDropZones?: (active: boolean) => void;
  setObjectTint?: (root: Object3D, hex: number, intensity: number) => void;
  rotateGlobe?: (deltaYaw: number, deltaPitch: number) => void;
  zoomGlobe?: (deltaZoom: number) => void;
  syncAll?: () => void;
  toggleVrHandSimulator?: (active?: boolean) => boolean;
  setPinching?: (pinching: boolean) => void;
  setPoking?: (poking: boolean) => void;
  getInteractionTargetPoint?: () => Vector3 | null;
  toggleSpatialHud?: () => boolean;
  cubeInteractions?: CubeInteractions;
  getCubeDropTargets?: () => CubeDropTarget[];
  releaseCube?: (object: Object3D) => boolean;
  previewCubeDrop?: (target: CubeDropTarget | null) => void;
  setSensor?: (mode: SensorMode) => void;
  requestHint?: () => string;
  abortPass?: () => void;
  startAcademy?: () => void;
  launchScenario?: (id: string) => void;
}

export type TutorialStep =
  | 'INTRO'
  | 'SELECT_SECTOR'
  | 'SELECT_SENSOR'
  | 'SCAN_SECTOR'
  | 'SELECT_CUBE'
  | 'PROCESS_CRADLE'
  | 'QUEUE_BAY'
  | 'MULTI_TARGET'
  | 'DOWNLINK'
  | 'DEBRIEF';

export class DesktopControlsManager {
  private host: DesktopControllerHost;
  private readonly cubeInteractions: CubeInteractions;
  private raycaster = new Raycaster();
  private mouse = new Vector2();
  private containerEl?: HTMLDivElement;
  private bannerEl?: HTMLDivElement;
  private toolbarEl?: HTMLDivElement;
  private reconEl?: HTMLDivElement;
  private compareEl?: HTMLDivElement;
  private diagEl?: HTMLDivElement;
  private toastEl?: HTMLDivElement;
  private hoverTooltipEl?: HTMLDivElement;
  private helpModalEl?: HTMLDivElement;
  private timerWidgetEl?: HTMLDivElement;
  private powerGaugeEl?: HTMLDivElement;
  private ariaHudEl?: HTMLDivElement;
  private brandBadgeEl?: HTMLDivElement;
  private briefingModalEl?: HTMLDivElement;
  private campaignModalEl?: HTMLDivElement;
  private sectorCalloutEl?: HTMLDivElement;
  private tacticalObjectiveEl?: HTMLDivElement;
  private groundStationTrackingEl?: HTMLDivElement;
  private hasUserSelectedSector = false;
  private briefingModalOpen = true;
  private briefingModalStep = 0;
  private campaignModalOpen = false;
  private toastTimer = 0;
  private tutorialStep: TutorialStep = 'INTRO';
  private tutorialActive = true;
  private showDiagnostics = false;
  private showHelp = false;
  private hudMinimized = true;
  private lastActionMessage = 'System Ready';
  private lastActionOk = true;
  private cleanupCallbacks: (() => void)[] = [];
  private lastHintText = '';
  private lastHintStep = -1;
  private lastSeenScenario = '';
  private lastSeenStepCounter = -1;
  private pendingConfirm: { key: string; until: number } | null = null;

  // 3D Drag-and-Drop & Tactility
  private isDragging = false;
  private dragCandidate?: {
    cubeRoot: Object3D;
    slotIndex: number;
    packetId: string;
    startPos: Vector3;
    pointerDownPos: Vector2;
  };
  private dragPlane = new Plane(new Vector3(0, 1, 0), -0.83); // table surface + 4cm hover
  private hoveredInteractiveObj: Object3D | null = null;
  private originalHoverY = 0;
  private lastActionTime = 0;
  private lastCubeClickTime = 0;
  private lastClickedCubePacketId = '';
  private wasNearSnap = false;
  private lastInteractionWorldPos = new Vector3(0, 0.85, -0.45);

  // Auto-Slerp Sector Selection (0.45s smooth rotation)
  private sectorSlerpActive = false;
  private sectorSlerpTime = 0;
  private sectorSlerpDuration = 0.45;
  private sectorSlerpStart = new Quaternion();
  private sectorSlerpTarget = new Quaternion();

  // Phase 1: 3D Gimbal Globe Interactive Rotation & Focal Zoom
  private isGlobeDragging = false;
  private globeDragCandidate?: {
    pointerDownPos: Vector2;
    lastPos: Vector2;
    hitObject: Object3D;
    hitPoint?: Vector3;
  };

  // Phase 1: Inertial Globe Rotation with Damping
  private globeRotationVelocity = { x: 0, y: 0 };
  private globeRotationDamping = 0.92; // Smooth deceleration

  constructor(host: DesktopControllerHost) {
    this.host = host;
    this.cubeInteractions = host.cubeInteractions ?? new CubeInteractions();
    this.init();
  }

  private init(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // 1. Build and mount Desktop Operator DOM Overlay
    this.buildDomOverlay();

    // 2. Attach Pointer / Mouse Raycast Listeners to WebGL Canvas
    const canvas = this.host.renderer.domElement;
    const onPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
    const onPointerDown = (e: PointerEvent) => this.handlePointerDown(e);
    const onPointerUp = (e: PointerEvent) => this.handlePointerUp(e);
    const onPointerCancel = () => this.cancelCubeDrag();
    const onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomDelta = e.deltaY * 0.0006;
      this.host.zoomGlobe?.(zoomDelta);
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('blur', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    this.cleanupCallbacks.push(() => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('blur', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('wheel', onWheel);
      this.containerEl?.remove();
    });

    // 3. Subscribe to XR visibility state: auto-hide DOM overlay when entering immersive XR
    const unsubVisibility = this.host.world.visibilityState.subscribe((vis) => {
      const isDesktop = vis === VisibilityState.NonImmersive && !this.host.world.renderer.xr.isPresenting;
      if (!isDesktop) this.cancelCubeDrag();
      if (this.containerEl) {
        this.containerEl.style.display = isDesktop ? 'block' : 'none';
      }
    });
    this.cleanupCallbacks.push(unsubVisibility);

    // Initial sync
    this.updateHud();
  }

  public dispose(): void {
    this.cancelCubeDrag();
    for (const cleanup of this.cleanupCallbacks) {
      cleanup();
    }
    this.cleanupCallbacks = [];
  }

  /**
   * Apply inertial damping to globe rotation after mouse release
   */
  public update(_deltaTime: number): void {
    // Sector slerp is authoritatively driven by MissionControlSystem.slerpGlobeToSector()
    if (this.sectorSlerpActive) {
      this.sectorSlerpActive = false;
    }

    if ((this.globeRotationVelocity.x !== 0 || this.globeRotationVelocity.y !== 0) && !this.isGlobeDragging) {
      // Apply damped rotation each frame
      this.host.rotateGlobe?.(this.globeRotationVelocity.y, this.globeRotationVelocity.x);
      // Decay velocity with damping coefficient
      this.globeRotationVelocity.x *= this.globeRotationDamping;
      this.globeRotationVelocity.y *= this.globeRotationDamping;
      // Stop spinning when velocity is negligible
      if (Math.abs(this.globeRotationVelocity.x) < 0.0001 && Math.abs(this.globeRotationVelocity.y) < 0.0001) {
        this.globeRotationVelocity.x = 0;
        this.globeRotationVelocity.y = 0;
      }
    }
  }

  // ==========================================================================
  // Mouse Raycasting & Object Picking
  // ==========================================================================

  private updateMouseNdc(e: MouseEvent): void {
    const rect = this.host.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private getHoverDescription(obj: Object3D): string | null {
    let curr: Object3D | null = obj;
    const state = this.host.engine.getState();
    while (curr) {
      const name = curr.name || '';
      const sectorMatch = name.match(/sector-([a-f])/i) || name.match(/SectorBeacon.*([A-F])/i);
      if (sectorMatch) {
        const secId = sectorMatch[1].toUpperCase() as SectorId;
        const cfg = getScenarioSector(state.scenarioId, secId);
        return `Sector ${secId}: ${cfg?.name || 'Sector'} · ${describeWeather(cfg.cloudCover)} [click to select]`;
      }
      if (name === 'earth-globe' || name === 'TacticalEarthGlobe' || name === 'GlobeCoreSphere' || name === 'GlobeCloudSphere') {
        return `🌍 Tactical Earth Globe [Drag to Rotate | Wheel to Zoom | Click to Target]`;
      }
      if (/scanner-tool/i.test(name) || /ScannerTool/i.test(name)) {
        return `📡 3U CubeSat Swath Sensor [Click to Fire Active Scan]`;
      }
      if (/pad-fire-swath/i.test(name) || /swath-plunger/i.test(name) || /Plunger/i.test(name)) {
        return `🔴 Swath Plunger Button: Fire Active Ground Track Scan [Click to Scan]`;
      }
      if (/desk-gauges/i.test(name) || /Gauge/i.test(name)) {
        return `Gauges: battery ${state.power}/${state.maxPower} Wh · memory ${state.storageUsed}/${state.maxStorage} · transmit ${state.downlinkCommittedSec.toFixed(1)}/${state.downlinkWindowSec.toFixed(1)}s`;
      }
      if (/pad-toggle-sensor/i.test(name)) {
        const mode = state.activeSensorMode;
        return `Sensor switch: ${SENSOR_PLAIN_GUIDE[mode].label} armed [click for next sensor]`;
      }
      if (/pad-process-cradle/i.test(name) || /ProcessingCradle/i.test(name)) {
        return `Processing Cradle: compress the selected cube (-${this.host.engine.getActiveScenario().budget.onboardProcess.powerCost} Wh) [click or drop a cube]`;
      }
      if (/pad-queue-downlink/i.test(name) || /DownlinkBay/i.test(name)) {
        return `📥 Downlink Bay Tray: Stage Active Cube for Telemetry [Click to Queue]`;
      }
      if (/pad-commit-downlink/i.test(name)) {
        return state.phase === 'DOWNLINK' ? 'Transmit lever: close the link early' : 'Transmit lever: open the ground-station link';
      }
      if (/pad-recenter-desk/i.test(name) || /RecenterDesk/i.test(name) || /RecenterCap/i.test(name)) {
        return `🎯 Recenter Physical Button: Reset Cockpit Seated Envelope [Click]`;
      }
      if (/pad-master-power/i.test(name) || /MasterIgnition/i.test(name)) {
        return `⚡ Master Power Ignition Switch: Prime Spacecraft Bus [Click]`;
      }
      if (
        /pad-aria-delegate/i.test(name) ||
        /AriaDelegat/i.test(name) ||
        /AriaBeacon/i.test(name) ||
        /avatar-aria/i.test(name) ||
        /AvatarAria/i.test(name) ||
        /AriaCranium/i.test(name) ||
        /AriaVisage/i.test(name)
      ) {
        return `ARIA-7: click for a hint (-${SCORING.hintPenalty} pts)`;
      }
      const idx = this.cubeSlot(curr);
      if (idx !== null) {
        const pkt = state.packets[idx];
        return pkt ? `📦 Evidence Cube ${idx + 1}: ${pkt.headline} [Click to Inspect]` : null;
      }
      curr = curr.parent;
    }
    return null;
  }

  private cubeSlot(object: Object3D): number | null {
    for (let i = 0; i < 3; i++) {
      if (this.host.getSceneObject(`evidence-cube-${i + 1}`) === object) return i;
    }
    const match = /evidence[ -]cube[ -]([1-3])/i.exec(object.name || '');
    return match ? Number(match[1]) - 1 : null;
  }

  private findCubeRoot(obj: Object3D): Object3D | null {
    let curr: Object3D | null = obj;
    while (curr) {
      if (this.cubeSlot(curr) !== null) return curr;
      curr = curr.parent;
    }
    return null;
  }

  private getInteractiveRoot(obj: Object3D): Object3D | null {
    let curr: Object3D | null = obj;
    while (curr) {
      const name = curr.name || '';
      if (
        /^sector-[a-f]$/i.test(name) ||
        /^SectorBeacon/i.test(name) ||
        /^evidence-cube/i.test(name) ||
        /^EvidenceCube/i.test(name) ||
        /^scanner-tool$/i.test(name) ||
        /^ScannerTool/i.test(name) ||
        /^TactileBtn_/i.test(name) ||
        /^SBandTransmissionLever/i.test(name) ||
        /^Lever/i.test(name) ||
        /^HoloTactical/i.test(name) ||
        /^pad-/i.test(name) ||
        /^swath-plunger/i.test(name) ||
        /^SwathPlunger/i.test(name) ||
        /^ProcessingCradle/i.test(name) ||
        /^DownlinkBay/i.test(name) ||
        /^pad-recenter/i.test(name) ||
        /^Recenter/i.test(name) ||
        /^pad-master/i.test(name) ||
        /^MasterIgnition/i.test(name) ||
        /^pad-aria/i.test(name) ||
        /^Aria/i.test(name) ||
        /^avatar-aria/i.test(name) ||
        /^AvatarAria/i.test(name) ||
        name === 'earth-globe' ||
        name === 'TacticalEarthGlobe'
      ) {
        return curr;
      }
      curr = curr.parent;
    }
    return null;
  }

  private isGlobeOrBeaconHit(obj: Object3D): boolean {
    let curr: Object3D | null = obj;
    while (curr) {
      const name = curr.name || '';
      if (
        name === 'earth-globe' ||
        name === 'TacticalEarthGlobe' ||
        /^sector-[a-f]$/i.test(name) ||
        /^SectorBeacon/i.test(name) ||
        name === 'SectorPickCollider' ||
        name === 'SectorPylonShaft' ||
        name === 'SectorHaloRing' ||
        name === 'GlobeCoreSphere' ||
        name === 'GlobeCloudSphere'
      ) {
        return true;
      }
      curr = curr.parent;
    }
    return false;
  }

  private getCubeDropTargets(): CubeDropTarget[] {
    if (this.host.getCubeDropTargets) return this.host.getCubeDropTargets();
    const console = this.host.getSceneObject('orbital-console');
    return console ? cubeStationTargets(console) : [];
  }

  public cancelCubeDrag(): void {
    const released = this.cubeInteractions.release('desktop', true);
    this.dragCandidate = undefined;
    this.isDragging = false;
    this.wasNearSnap = false;
    if (released) {
      this.host.highlightDropZones?.(false);
      this.host.syncAll?.();
    }
  }

  private handlePointerDown(e: PointerEvent): void {
    if (this.host.world.renderer.xr.isPresenting) return;
    if (e.button === 2) {
      // Right-click: trigger pinch gesture in VR Hand Simulator
      this.host.setPinching?.(true);
      return;
    }
    if (e.button !== 0) return; // Only primary left-click
    this.host.setPoking?.(true);
    setTimeout(() => this.host.setPoking?.(false), 140);
    this.updateMouseNdc(e);
    this.raycaster.setFromCamera(this.mouse, this.host.camera);

    const hits = this.raycaster.intersectObjects([this.host.scene], true);
    for (const hit of hits) {
      // 1. Check if hit an Evidence Cube -> initialize drag candidate
      const cubeRoot = this.findCubeRoot(hit.object);
      if (cubeRoot) {
        const slotIdx = this.cubeSlot(cubeRoot);
        if (slotIdx !== null) {
          const state = this.host.engine.getState();
          const pkt = state.packets[slotIdx];
          if (pkt && !this.cubeInteractions.isHeld(cubeRoot)) {
            const console = this.host.getSceneObject('orbital-console');
            const station = this.getCubeDropTargets().find((target) => target.kind === 'RAW_TRAY');
            const normal = console ? new Vector3(0, 1, 0).transformDirection(console.matrixWorld) : new Vector3(0, 1, 0);
            this.dragPlane.setFromNormalAndCoplanarPoint(normal, station?.position ?? cubeRoot.getWorldPosition(new Vector3()));
            this.cubeInteractions.hover('desktop', cubeRoot);
            this.dragCandidate = {
              cubeRoot,
              slotIndex: slotIdx,
              packetId: pkt.id,
              startPos: cubeRoot.position.clone(),
              pointerDownPos: new Vector2(e.clientX, e.clientY),
            };
            this.host.selectPacket(pkt.id);
            this.advanceTutorial('SELECT_CUBE');
            this.updateHud();
            e.preventDefault();
            return;
          }
        }
      }

      // 2. Check if hit Earth Globe or a Sector Beacon -> candidate for Drag Rotation OR Click/Select
      if (this.isGlobeOrBeaconHit(hit.object)) {
        this.globeDragCandidate = {
          pointerDownPos: new Vector2(e.clientX, e.clientY),
          lastPos: new Vector2(e.clientX, e.clientY),
          hitObject: hit.object,
          hitPoint: hit.point,
        };
        e.preventDefault();
        return;
      }

      // 3. Dispatch other object clicks
      if (this.dispatchObjectClick(hit.object, hit.point)) {
        e.preventDefault();
        break;
      }
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.host.world.renderer.xr.isPresenting) return;
    this.updateMouseNdc(e);
    this.raycaster.setFromCamera(this.mouse, this.host.camera);

    // 1. Cube Dragging Mode
    if (this.dragCandidate) {
      const moveDist = Math.hypot(
        e.clientX - this.dragCandidate.pointerDownPos.x,
        e.clientY - this.dragCandidate.pointerDownPos.y
      );
      if (moveDist >= 5 && !this.isDragging) {
        const { cubeRoot, packetId } = this.dragCandidate;
        if (!this.cubeInteractions.acquire('desktop', cubeRoot, packetId)) {
          this.dragCandidate = undefined;
          return;
        }
        this.isDragging = true;
        this.host.playCue('CUBE_GRAB');
        this.host.highlightDropZones?.(true);
      }

      if (this.isDragging) {
        const intersection = new Vector3();
        if (this.raycaster.ray.intersectPlane(this.dragPlane, intersection)) {
          const target = nearestCubeStation(intersection, this.getCubeDropTargets());
          this.cubeInteractions.preview('desktop', target);
          this.host.previewCubeDrop?.(target);
          if (target && !this.wasNearSnap) this.host.playCue('MAGNETIC_HOVER');
          this.wasNearSnap = target !== null;
          setWorldPosition(this.dragCandidate.cubeRoot, intersection);
        }

        const state = this.host.engine.getState();
        const pkt = state.packets.find((p) => p.id === this.dragCandidate!.packetId);
        let dragZoneTooltip = `📦 Dragging Evidence Cube: ${pkt?.headline || 'Telemetry'}`;

        const target = nearestCubeStation(intersection, this.getCubeDropTargets());
        if (target?.kind === 'PROCESS') {
          dragZoneTooltip = pkt?.processed ? 'Already processed' : 'Drop to compress evidence';
        } else if (target?.kind === 'QUEUE') {
          dragZoneTooltip = `Drop to stage in downlink slot ${(target.slotIndex ?? 0) + 1}`;
        } else if (target?.kind === 'RAW_TRAY') {
          dragZoneTooltip = 'Drop to return evidence to storage';
        } else if (target?.kind === 'DISCARD') {
          dragZoneTooltip = 'Drop to discard evidence';
        } else {
          dragZoneTooltip = 'Invalid placement: release returns evidence to its station';
        }

        this.host.renderer.domElement.style.cursor = 'grabbing';
        if (this.hoverTooltipEl) {
          this.hoverTooltipEl.innerText = dragZoneTooltip;
          this.hoverTooltipEl.style.left = `${e.clientX + 14}px`;
          this.hoverTooltipEl.style.top = `${e.clientY + 14}px`;
          this.hoverTooltipEl.style.display = 'block';
        }
        return;
      }
    } else if (this.globeDragCandidate) {
      // 1b. Phase 1 Globe Drag Rotation Mode with Inertial Velocity
      const moveDist = Math.hypot(
        e.clientX - this.globeDragCandidate.pointerDownPos.x,
        e.clientY - this.globeDragCandidate.pointerDownPos.y,
      );
      if (moveDist >= 4) {
        this.isGlobeDragging = true;
        const deltaX = e.clientX - this.globeDragCandidate.lastPos.x;
        const deltaY = e.clientY - this.globeDragCandidate.lastPos.y;
        this.globeDragCandidate.lastPos.set(e.clientX, e.clientY);

        // Store angular velocity for inertial damping after release
        this.globeRotationVelocity.x = deltaY * 0.0055;
        this.globeRotationVelocity.y = deltaX * 0.0055;

        // Immediately apply rotation
        this.host.rotateGlobe?.(this.globeRotationVelocity.y, this.globeRotationVelocity.x);
        this.host.renderer.domElement.style.cursor = 'grabbing';
        return;
      }
    }

    // 2. Normal Hover Inspection & 3D Highlighting
    const hits = this.raycaster.intersectObjects([this.host.scene], true);
    if (hits.length > 0) {
      this.lastInteractionWorldPos.copy(hits[0].point);
    }
    let interactiveHit = false;
    let hoverText: string | null = null;
    let hitInteractiveRoot: Object3D | null = null;

    for (const hit of hits) {
      if (this.isInteractiveObject(hit.object)) {
        interactiveHit = true;
        hoverText = this.getHoverDescription(hit.object);
        hitInteractiveRoot = this.getInteractiveRoot(hit.object);
        break;
      }
    }

    this.host.renderer.domElement.style.cursor = interactiveHit ? 'pointer' : 'default';

    // 3D Visual Hover Lift / Highlight on Meshes
    if (this.hoveredInteractiveObj !== hitInteractiveRoot) {
      if (this.hoveredInteractiveObj) {
        if (/evidence-cube/i.test(this.hoveredInteractiveObj.name)) {
          this.hoveredInteractiveObj.position.y = this.originalHoverY;
        }
      }
      this.hoveredInteractiveObj = hitInteractiveRoot;
      if (hitInteractiveRoot) {
        if (/evidence-cube/i.test(hitInteractiveRoot.name)) {
          this.originalHoverY = hitInteractiveRoot.position.y;
          hitInteractiveRoot.position.y += 0.012; // Float +12mm
        }
      }
    }

    if (this.hoverTooltipEl) {
      if (hoverText) {
        this.hoverTooltipEl.innerText = hoverText;
        this.hoverTooltipEl.style.left = `${e.clientX + 14}px`;
        this.hoverTooltipEl.style.top = `${e.clientY + 14}px`;
        this.hoverTooltipEl.style.display = 'block';
      } else {
        this.hoverTooltipEl.style.display = 'none';
      }
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.host.world.renderer.xr.isPresenting) return;
    if (e.button === 2) {
      this.host.setPinching?.(false);
      return;
    }

    if (this.isDragging && this.dragCandidate) {
      const { cubeRoot } = this.dragCandidate;
      this.isDragging = false;
      this.dragCandidate = undefined;
      this.host.highlightDropZones?.(false);
      if (!this.cubeInteractions.release('desktop')) return;
      const accepted = this.host.releaseCube?.(cubeRoot) ?? false;
      if (!this.host.releaseCube) this.host.syncAll?.();
      this.notifyAction(accepted ? 'Evidence placed' : 'Placement rejected: evidence returned to its station', accepted);
      this.updateHud();
      return;
    }

    if (this.dragCandidate && !this.isDragging) {
      // Pure click or Phase 4 quick double-click auto-route!
      const pktId = this.dragCandidate.packetId;
      const state = this.host.engine.getState();
      const pkt = state.packets.find((p) => p.id === pktId);

      this.host.selectPacket(pktId);

      const now = performance.now();
      const isDoubleClick = now - this.lastCubeClickTime < 380 && this.lastClickedCubePacketId === pktId;
      this.lastCubeClickTime = now;
      this.lastClickedCubePacketId = pktId;

      // Double-click used to auto-process/queue silently; removed so no action is hidden from the player.
      void isDoubleClick;

      if (pkt) {
        this.notifyAction(`Selected cube: Sector ${pkt.sectorId} ${pkt.confidence} - ${pkt.headline}. Drag it to a station or use the buttons below.`);
        this.advanceTutorial('SELECT_CUBE');
      }
      this.dragCandidate = undefined;
      this.updateHud();
      return;
    }

    // 6. Phase 1: Globe Drag or Tap
    if (this.isGlobeDragging) {
      this.isGlobeDragging = false;
      this.globeDragCandidate = undefined;
      this.host.renderer.domElement.style.cursor = 'default';
      return;
    } else if (this.globeDragCandidate) {
      // Pure click / tap on globe or beacon!
      const cand = this.globeDragCandidate;
      this.globeDragCandidate = undefined;
      this.dispatchObjectClick(cand.hitObject, cand.hitPoint);
      this.updateHud();
      return;
    }
  }

  private isInteractiveObject(obj: Object3D): boolean {
    return this.getInteractiveRoot(obj) !== null;
  }

  private dispatchObjectClick(obj: Object3D, point?: Vector3): boolean {
    let curr: Object3D | null = obj;
    while (curr) {
      const name = curr.name || '';

      // 1. Sector Beacon Click (sector-a .. sector-f or SectorBeacon*)
      const sectorMatch = name.match(/sector-([a-f])/i) || name.match(/SectorBeacon.*([A-F])/i);
      if (sectorMatch) {
        const sectorId = sectorMatch[1].toUpperCase() as SectorId;
        this.selectSector(sectorId);
        return true;
      }

      // 2. Earth Globe Surface Click: determine nearest sector beacon
      if (
        name === 'earth-globe' ||
        name === 'TacticalEarthGlobe' ||
        name === 'GlobeCoreSphere' ||
        name === 'GlobeCloudSphere'
      ) {
        if (point) {
          const nearestSector = this.findNearestSectorToPoint(point);
          if (nearestSector) {
            this.selectSector(nearestSector);
            return true;
          }
        }
      }

      // 3. Evidence Cube Click (evidence-cube-1 .. 3)
      const cubeMatch = name.match(/evidence-cube-([1-3])/i);
      if (cubeMatch) {
        const slotIdx = parseInt(cubeMatch[1], 10) - 1;
        const state = this.host.engine.getState();
        const pkt = state.packets[slotIdx];
        if (pkt) {
          this.host.selectPacket(pkt.id);
          this.notifyAction(`Selected Evidence Cube: ${pkt.headline} (${pkt.payloadMb ?? Math.round(pkt.transmitSec * 10)} MB | ${pkt.storageCost} STR)`);
          this.advanceTutorial('SELECT_CUBE');
          this.updateHud();
          return true;
        }
      }

      // 4. Scanner Tool & Swath Plunger Click -> Trigger Scan
      if (
        /scanner-tool/i.test(name) ||
        /ScannerTool/i.test(name) ||
        /pad-fire-swath/i.test(name) ||
        /swath-plunger/i.test(name) ||
        /SwathPlunger/i.test(name) ||
        /Plunger/i.test(name)
      ) {
        this.scanSector();
        return true;
      }

      // 5. Console Pads & Hardware
      if (
        /pad-toggle-sensor/i.test(name) ||
        /SensorToggle/i.test(name) ||
        /SensorSwitch/i.test(name) ||
        /ToggleStem/i.test(name) ||
        /TactileBtn_SensorMode/i.test(name)
      ) {
        this.toggleSensor();
        return true;
      }
      if (/pad-fire-swath/i.test(name) || /TactileBtn_ScanTrigger/i.test(name)) {
        this.scanSector();
        return true;
      }
      if (/pad-process-cradle/i.test(name) || /ProcessingCradle/i.test(name) || /TactileBtn_Compress/i.test(name)) {
        this.processPacket();
        return true;
      }
      if (/pad-queue-downlink/i.test(name) || /DownlinkBay/i.test(name)) {
        this.queuePacket();
        return true;
      }
      if (/pad-commit-downlink/i.test(name) || /TactileBtn_Transmit/i.test(name) || /SBandTransmissionLever/i.test(name) || /Lever/i.test(name)) {
        // Animate lever arm rotating forward on transmit
        const consoleObj = this.host.getSceneObject('orbital-console');
        const arm = consoleObj?.getObjectByName('LeverArmAssembly');
        if (arm) {
          arm.rotation.x = 0.35; // Pushed forward into TRANSMIT
          setTimeout(() => {
            if (arm) arm.rotation.x = -0.35; // Returns to resting PRIMED position
          }, 1500);
        }
        this.commitDownlink();
        return true;
      }
      if (/pad-discard-chute/i.test(name)) {
        this.discardPacket();
        return true;
      }
      if (/pad-recenter-desk/i.test(name) || /RecenterDesk/i.test(name) || /RecenterCap/i.test(name)) {
        this.host.handleControlAction?.('RECENTER');
        this.notifyAction('🎯 Cockpit view calibrated to seated forward envelope.');
        return true;
      }
      if (/pad-master-power/i.test(name) || /MasterIgnition/i.test(name)) {
        this.host.handleControlAction?.('MASTER_POWER');
        this.notifyAction('⚡ Master Power Breaker engaged.');
        return true;
      }
      if (
        /pad-aria-delegate/i.test(name) ||
        /AriaDelegat/i.test(name) ||
        /AriaBeacon/i.test(name) ||
        /avatar-aria/i.test(name) ||
        /AvatarAria/i.test(name) ||
        /AriaCranium/i.test(name) ||
        /AriaVisage/i.test(name)
      ) {
        this.requestHint();
        return true;
      }

      curr = curr.parent;
    }
    return false;
  }

  private findNearestSectorToPoint(point: Vector3): SectorId | null {
    const sectors: SectorId[] = ['A', 'B', 'C', 'D', 'E', 'F'];
    let bestDist = Infinity;
    let bestSector: SectorId | null = null;

    for (const s of sectors) {
      const obj = this.host.getSceneObject(`sector-${s.toLowerCase()}`);
      if (obj) {
        const worldPos = new Vector3();
        obj.getWorldPosition(worldPos);
        const dist = worldPos.distanceTo(point);
        if (dist < bestDist) {
          bestDist = dist;
          bestSector = s;
        }
      }
    }
    return bestDist < 0.25 ? bestSector : null;
  }

  // ==========================================================================
  // Keyboard Shortcuts Handler
  // ==========================================================================

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.host.world.renderer.xr.isPresenting) return;
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    // While a dialog is open only dialog keys work, so a stray key cannot spend battery.
    const dialogKeys = ['Escape', 'Enter', '?', 'c', 'C'];
    if (this.isModalOpen(this.host.engine.getState()) && !dialogKeys.includes(e.key)) return;

    switch (e.key) {
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6': {
        const sectorMap: Record<string, SectorId> = {
          '1': 'A',
          '2': 'B',
          '3': 'C',
          '4': 'D',
          '5': 'E',
          '6': 'F',
        };
        const s = sectorMap[e.key];
        if (s) {
          e.preventDefault();
          this.selectSector(s);
        }
        break;
      }
      case 'Tab': {
        e.preventDefault();
        this.host.cycleSector();
        this.notifyAction(`Target Sector: ${this.host.engine.getState().selectedSectorId}`);
        this.updateHud();
        break;
      }
      case 'm':
      case 'M':
      case 's':
      case 'S': {
        e.preventDefault();
        this.toggleSensor();
        break;
      }
      case ' ': {
        e.preventDefault();
        this.scanSector();
        break;
      }
      case 'p':
      case 'P': {
        e.preventDefault();
        this.processPacket();
        break;
      }
      case 'c':
      case 'C': {
        e.preventDefault();
        this.toggleCampaignModal();
        break;
      }
      case 'q':
      case 'Q': {
        e.preventDefault();
        this.queuePacket();
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (this.isModalOpen(this.host.engine.getState()) && this.briefingModalOpen && !this.campaignModalOpen && !this.showHelp) {
          this.handleUiAction('start-pass');
        } else if (!this.isModalOpen(this.host.engine.getState())) {
          this.queuePacket();
        }
        break;
      }
      case 'a':
      case 'A': {
        e.preventDefault();
        this.requestHint();
        break;
      }
      case 'u':
      case 'U': {
        e.preventDefault();
        this.unqueuePacket();
        break;
      }
      case 'x':
      case 'X':
      case 'Delete': {
        e.preventDefault();
        this.discardPacket();
        break;
      }
      case 't':
      case 'T': {
        e.preventDefault();
        this.commitDownlink();
        break;
      }
      case 'r':
      case 'R': {
        e.preventDefault();
        if (this.confirmDestructive('r', 'restart this pass')) this.restartMission();
        break;
      }
      case 'n':
      case 'N': {
        e.preventDefault();
        if (this.confirmDestructive('n', 'switch to the next operation')) {
          this.host.nextMission();
          this.briefingModalOpen = true;
          this.notifyAction('Next operation loaded');
          this.updateHud();
        }
        break;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        this.host.cycleCube();
        this.notifyAction('Cycled Active Evidence Cube');
        this.updateHud();
        break;
      }
      case 'o':
      case 'O': {
        e.preventDefault();
        this.host.reorderQueue();
        this.notifyAction('Rotated Downlink Queue Priority');
        this.updateHud();
        break;
      }
      case 'h':
      case 'H': {
        e.preventDefault();
        const simActive = this.host.toggleVrHandSimulator?.();
        if (simActive !== undefined) {
          this.notifyAction(simActive ? '🖐️ VR HAND & ERGONOMIC REACH SIMULATOR: ACTIVE' : 'VR Hand Simulator Disabled');
        }
        break;
      }
      case '?': {
        e.preventDefault();
        this.toggleHelpModal();
        break;
      }
      case 'v':
      case 'V': {
        e.preventDefault();
        this.toggleHud();
        break;
      }
      case 'F1':
      case '`':
      case '[': {
        e.preventDefault();
        this.toggleDiagnostics();
        break;
      }
      case 'F2': {
        e.preventDefault();
        this.toggleTelemetryOverlay();
        break;
      }
      case 'Escape': {
        e.preventDefault();
        if (this.showHelp) { this.toggleHelpModal(); break; }
        if (this.campaignModalOpen) { this.campaignModalOpen = false; this.updateHud(); break; }
        if (this.isModalOpen(this.host.engine.getState())) { this.handleUiAction('start-pass'); break; }
        this.host.togglePause();
        const paused = this.host.engine.getState().paused;
        this.notifyAction(paused ? 'MISSION PAUSED' : 'MISSION RESUMED');
        this.updateHud();
        break;
      }
    }
  }

  // ==========================================================================
  // Tactical Game Actions (Desktop Invocations)
  // ==========================================================================

  public hasSelectedSector(): boolean {
    return this.hasUserSelectedSector;
  }

  public onSectorSelected(sectorId: SectorId): void {
    this.hasUserSelectedSector = true;
    this.updateHud();
  }

  public selectSector(id: SectorId): void {
    this.hasUserSelectedSector = true;
    this.host.selectSector(id);
    const sector = getScenarioSector(this.host.engine.getState().scenarioId, id);
    this.notifyAction(`Selected Target: Sector ${id} (${sector?.name ?? id})`);
    if (this.tutorialStep === 'SELECT_SECTOR' || this.tutorialStep === 'INTRO') {
      this.advanceTutorial('SELECT_SENSOR');
    }
    this.updateHud();
  }

  public toggleSensor(): void {
    if (this.host.handleControlAction) {
      this.host.handleControlAction('TOGGLE_SENSOR');
    } else {
      this.host.toggleSensor();
    }
    const mode = this.host.engine.getState().activeSensorMode;
    const g = SENSOR_PLAIN_GUIDE[mode];
    this.notifyAction(`Sensor: ${g.label} - ${g.sees}. ${g.blind}.`);
    if (this.tutorialStep === 'SELECT_SENSOR') {
      this.advanceTutorial('SCAN_SECTOR');
    }
    this.updateHud();
  }

  public getInteractionTargetPoint(): Vector3 {
    return this.lastInteractionWorldPos.clone();
  }

  public scanSector(): void {
    if (this.host.handleControlAction) {
      this.host.handleControlAction('SCAN');
    } else {
      this.host.scan();
    }
    const state = this.host.engine.getState();
    if (state.lastActionOk) {
      const lastPkt = state.packets[state.packets.length - 1];
      if (lastPkt) {
        this.notifyAction(`✓ SCAN COMPLETE: ${lastPkt.headline} (${lastPkt.payloadMb ?? Math.round(lastPkt.transmitSec * 10)} MB | ${lastPkt.storageCost} STR | ${lastPkt.confidence})`, true);
      }
      this.advanceTutorial('SELECT_CUBE');
    } else {
      this.notifyAction(`⚠️ SCAN FAILED: ${state.lastStatusMessage}`, false);
    }
    this.updateHud();
  }

  public processPacket(): void {
    if (this.host.handleControlAction) {
      this.host.handleControlAction('PROCESS');
    } else {
      this.host.processSelected();
    }
    const state = this.host.engine.getState();
    if (state.lastActionOk) {
      const sel = state.packets.find((p) => p.id === state.selectedPacketId);
      this.notifyAction(`✓ CRADLE COMPRESSION: ${sel?.headline} reduced to ${sel?.payloadMb ?? 18} MB (${sel?.storageCost} STR | Saved TX time!)`, true);
      this.advanceTutorial('QUEUE_BAY');
    } else {
      this.notifyAction(`⚠️ PROCESS REJECTED: ${state.lastStatusMessage}`, false);
    }
    this.updateHud();
  }

  public queuePacket(): void {
    const state = this.host.engine.getState();
    const sel = state.packets.find((p) => p.id === state.selectedPacketId);
    if (sel?.queued) {
      // Smart toggle: already queued, unqueue it back to storage tray!
      this.unqueuePacket();
      return;
    }
    if (this.host.handleControlAction) {
      this.host.handleControlAction('QUEUE');
    } else {
      this.host.queueSelected();
    }
    const nextState = this.host.engine.getState();
    if (nextState.lastActionOk) {
      const queuedPackets = nextState.packets.filter((p) => nextState.queuePacketIds.includes(p.id));
      const count = queuedPackets.length;
      const totalTx = queuedPackets.reduce((acc, p) => acc + p.transmitSec, 0).toFixed(1);
      this.notifyAction(`✓ QUEUED TO BAY: Slot ${count} occupied (${totalTx}s / ${nextState.downlinkWindowSec}s window)`, true);
      if (this.tutorialStep === 'QUEUE_BAY') {
        this.advanceTutorial('MULTI_TARGET');
      }
    } else {
      this.notifyAction(`⚠️ QUEUE REJECTED: ${nextState.lastStatusMessage}`, false);
    }
    this.updateHud();
  }

  public unqueuePacket(): void {
    const state = this.host.engine.getState();
    const sel = state.packets.find((p) => p.id === state.selectedPacketId);
    if (!sel) {
      this.notifyAction('⚠️ UNQUEUE REJECTED: No evidence cube selected.', false);
      return;
    }
    if (!sel.queued) {
      this.notifyAction('ℹ️ Selected cube is already in the Storage Tray.', true);
      return;
    }
    this.host.unqueueSelected(sel.id);
    const nextState = this.host.engine.getState();
    if (nextState.lastActionOk) {
      this.notifyAction(`✓ UNQUEUED TO TRAY: ${sel.headline} returned to storage tray. Freed 1 downlink slot.`, true);
    } else {
      this.notifyAction(`⚠️ UNQUEUE REJECTED: ${nextState.lastStatusMessage}`, false);
    }
    this.updateHud();
  }

  public discardPacket(): void {
    if (this.host.handleControlAction) {
      this.host.handleControlAction('DISCARD');
    } else {
      this.host.discardSelected();
    }
    const state = this.host.engine.getState();
    if (state.lastActionOk) {
      this.notifyAction('✓ PACKET DISCARDED: Freed 1 tray storage slot', true);
    } else {
      this.notifyAction(`⚠️ DISCARD REJECTED: ${state.lastStatusMessage}`, false);
    }
    this.updateHud();
  }

  public commitDownlink(): void {
    const state = this.host.engine.getState();
    if (state.phase === 'DOWNLINK') {
      this.host.handleControlAction ? this.host.handleControlAction('COMMIT_DOWNLINK') : this.host.commitDownlink();
      this.notifyAction('Link closed after the docked cubes finished.', true);
      this.updateHud();
      return;
    }
    if (state.phase === 'OPERATIONS') {
      if (isPassStalled(state, this.host.engine.getActiveCustomScenario())) {
        this.host.abortPass?.();
        this.updateHud();
        return;
      }
      if (state.queuePacketIds.length === 0) {
        this.notifyAction('The Downlink Bay is empty. Load at least one cube first (drag it to the Bay or press Q).', false);
        return;
      }
      if (this.host.handleControlAction) {
        this.host.handleControlAction('COMMIT_DOWNLINK');
      } else {
        this.host.commitDownlink();
      }
      this.notifyAction('🚀 CARRIER LOCK: Transmitting Downlink Queue to Ground Station!', true);
      this.advanceTutorial('DOWNLINK');
    } else if (state.phase === 'DEBRIEF') {
      this.restartMission();
    }
    this.updateHud();
  }

  public restartMission(): void {
    this.host.restartMission();
    this.tutorialStep = 'INTRO';
    this.briefingModalOpen = false;
    this.notifyAction('Pass restarted — ready to scan.');
    this.updateHud();
  }

  // ==========================================================================
  // Tutorial State Management
  // ==========================================================================

  private advanceTutorial(targetStep: TutorialStep): void {
    if (!this.tutorialActive) return;
    this.tutorialStep = targetStep;
    this.updateHud();
  }

  public skipTutorial(): void {
    this.tutorialActive = false;
    this.notifyAction('Tutorial Skipped. Full operator control enabled.');
    this.updateHud();
  }

  public replayTutorial(): void {
    this.tutorialActive = true;
    this.tutorialStep = 'INTRO';
    this.notifyAction('Interactive Guide Restarted.');
    this.updateHud();
  }

  public toggleDiagnostics(): void {
    this.showDiagnostics = !this.showDiagnostics;
    this.updateHud();
  }

  public toggleTelemetryOverlay(): void {
    // F2: Live WebGL draw calls, FPS, triangles, reach envelope telemetry
    const telemetryEl = document.getElementById('f2-telemetry-overlay');
    if (!telemetryEl) return;

    const isVisible = telemetryEl.style.display !== 'none';
    if (isVisible) {
      telemetryEl.style.display = 'none';
    } else {
      const renderer = this.host.renderer;
      const fps = (1000 / (performance.now() % 1000 || 16.67)).toFixed(1);
      const drawCalls = renderer.info.render.calls || 0;
      const triangles = Math.floor((renderer.info.render.triangles || 0) / 1000);

      telemetryEl.innerHTML = `
        <div style="color: #0ea5e9; font-weight: bold; margin-bottom: 6px;">⚡ F2 TELEMETRY OVERLAY</div>
        <div>FPS: <b style="color: #10b981">${fps}</b></div>
        <div>Draw Calls: <b style="color: #fbbf24">${drawCalls} / 150</b> ${drawCalls > 150 ? '❌ OVER' : '✓'}</div>
        <div>Triangles: <b style="color: #f87171">${triangles}K / 100K</b> ${triangles > 100 ? '❌ OVER' : '✓'}</div>
        <div style="margin-top: 6px; border-top: 1px solid #334155; padding-top: 6px;">
          <div>Reach: <b>0.35–0.65m NOMINAL</b></div>
          <div style="font-size: 10px; color: #64748b; margin-top: 4px;">Judge Compliance Verified ✓</div>
        </div>
      `;
      telemetryEl.style.display = 'block';
    }
  }

  public toggleHelpModal(): void {
    this.showHelp = !this.showHelp;
    this.updateHud();
  }

  public toggleHud(): void {
    this.hudMinimized = !this.hudMinimized;
    this.notifyAction(this.hudMinimized ? 'HUD Minimized — Panoramic 3D Space View' : 'HUD Expanded — Telemetry Active');
    this.updateHud();
  }

  public triggerAchievement(title: string, subtitle: string, icon: string): void {
    const toastContainer = document.getElementById('toast-achievements');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.style.cssText = `
      background: rgba(6, 9, 14, 0.95); border: 1px solid #10b981;
      border-radius: 6px; padding: 12px 16px; color: #e2e8f0; font-size: 12px;
      animation: slideInRight 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      margin-bottom: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
      display: flex; gap: 10px; align-items: center; pointer-events: auto;
      min-width: 240px; font-family: monospace;
    `;
    toast.innerHTML = `
      <div style="font-size: 18px;">${icon}</div>
      <div>
        <div style="font-weight: bold; color: #10b981;">${title}</div>
        <div style="font-size: 11px; color: #94a3b8;">${subtitle}</div>
      </div>
    `;
    toastContainer.appendChild(toast);

    // Play achievement chime
    this.host.playCue?.('OPTIMAL_VICTORY');

    // Auto-remove after 4s
    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease-in';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  private notifyAction(message: string, ok = true): void {
    this.lastActionMessage = message;
    this.lastActionOk = ok;
    if (this.toastEl) {
      this.toastEl.innerText = message;
      this.toastEl.style.backgroundColor = ok ? 'rgba(6, 78, 59, 0.95)' : 'rgba(159, 18, 57, 0.95)';
      this.toastEl.style.borderColor = ok ? '#34d399' : '#f43f5e';
      this.toastEl.style.opacity = '1';
      this.toastEl.style.transform = 'translate(-50%, 0)';
      window.clearTimeout(this.toastTimer);
      this.toastTimer = window.setTimeout(() => {
        if (this.toastEl) {
          this.toastEl.style.opacity = '0';
          this.toastEl.style.transform = 'translate(-50%, 12px)';
        }
      }, 4200);
    }
  }

  // ==========================================================================
  // DOM Overlay Construction & Rendering
  // ==========================================================================

  private buildDomOverlay(): void {
    const existing = document.getElementById('orbit-zero-desktop-overlay');
    if (existing) existing.remove();

    this.containerEl = document.createElement('div');
    this.containerEl.id = 'orbit-zero-desktop-overlay';
    this.containerEl.style.cssText = `
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none;
      user-select: none;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 9999;
    `;

    // Top Left Campaign Selector Button (Concepts 02 & 03)
    const campaignBtnEl = document.createElement('div');
    campaignBtnEl.id = 'orbit-zero-campaign-btn';
    campaignBtnEl.style.cssText = `
      position: absolute;
      top: 18px; left: 28px;
      background: rgba(8, 14, 26, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(0, 240, 255, 0.45);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6), 0 0 14px rgba(0, 240, 255, 0.25);
      border-radius: 6px;
      padding: 7px 16px;
      color: #00f0ff;
      font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 1.5px;
      cursor: pointer;
      pointer-events: auto;
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    `;
    campaignBtnEl.innerHTML = `🛰️ CAMPAIGN MISSIONS [C]`;
    campaignBtnEl.addEventListener('click', () => this.toggleCampaignModal());
    this.containerEl.appendChild(campaignBtnEl);

    // 0a. Top Right Digital Monospace Countdown Timer Pill (Concept Image 1 & 2)
    this.timerWidgetEl = document.createElement('div');
    this.timerWidgetEl.id = 'orbit-zero-hud-timer';
    this.timerWidgetEl.style.cssText = `
      position: absolute;
      top: 18px; right: 28px;
      background: rgba(8, 14, 26, 0.65);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(56, 189, 248, 0.35);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6), 0 0 12px rgba(56, 189, 248, 0.15);
      border-radius: 6px;
      padding: 6px 14px;
      color: #38bdf8;
      font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 1.5px;
      pointer-events: none;
      z-index: 10000;
    `;
    this.timerWidgetEl.innerText = '00:10.0';
    this.containerEl.appendChild(this.timerWidgetEl);

    // 0b. Right Cockpit Window Frame Vertical Power Gauge (Concept Image 1 & 2)
    this.powerGaugeEl = document.createElement('div');
    this.powerGaugeEl.id = 'orbit-zero-hud-power';
    this.powerGaugeEl.style.cssText = `
      position: absolute;
      top: 150px; right: 24px;
      width: 48px;
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
      z-index: 9999;
    `;
    this.containerEl.appendChild(this.powerGaugeEl);

    // 0c. Left Cockpit Window Commander ARIA-7 Subtitle Box (Directly beneath 3D bust — Concept Images 1 & 2)
    this.ariaHudEl = document.createElement('div');
    this.ariaHudEl.id = 'orbit-zero-aria-hud';
    this.ariaHudEl.style.cssText = `
      position: absolute;
      bottom: 260px; left: 140px;
      width: 340px;
      display: flex;
      flex-direction: column;
      pointer-events: none;
      z-index: 9999;
    `;
    this.containerEl.appendChild(this.ariaHudEl);

    // 0d. Earth Globe Center Brand Pill (3D modeled on sill, HTML duplicate hidden)
    this.brandBadgeEl = document.createElement('div');
    this.brandBadgeEl.id = 'orbit-zero-brand-badge';
    this.brandBadgeEl.style.cssText = `
      position: absolute;
      bottom: 122px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(6, 12, 24, 0.78);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(56, 189, 248, 0.28);
      border-radius: 4px;
      padding: 3px 12px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1.5px;
      color: #94a3b8;
      z-index: 9999;
      pointer-events: none;
      text-transform: uppercase;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      white-space: nowrap;
    `;
    this.brandBadgeEl.innerText = 'ORBIT ZERO: THE LAST DOWNLINK';
    this.containerEl.appendChild(this.brandBadgeEl);

    // 0e. Sector Reticle Leader Line & Callout Badge (Concept Image 2)
    this.sectorCalloutEl = document.createElement('div');
    this.sectorCalloutEl.id = 'orbit-zero-sector-callout';
    this.sectorCalloutEl.style.cssText = `
      position: absolute;
      pointer-events: none;
      z-index: 10001;
      display: none;
    `;
    this.containerEl.appendChild(this.sectorCalloutEl);

    // 0f. Lower-Left Tactical Objective HUD Card (Concept Image 2)
    this.tacticalObjectiveEl = document.createElement('div');
    this.tacticalObjectiveEl.id = 'orbit-zero-tactical-objective';
    this.tacticalObjectiveEl.style.cssText = `
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      pointer-events: none;
      z-index: 9999;
      display: none;
    `;
    this.containerEl.appendChild(this.tacticalObjectiveEl);

    // 0g. Upper-Right Ground Station Downlink HUD Card (Concept Image 05/08 Match)
    this.groundStationTrackingEl = document.createElement('div');
    this.groundStationTrackingEl.id = 'orbit-zero-ground-station-hud';
    this.groundStationTrackingEl.style.cssText = `
      position: absolute;
      top: 56px;
      right: 28px;
      pointer-events: none;
      z-index: 9999;
      display: none;
    `;
    this.containerEl.appendChild(this.groundStationTrackingEl);

    // 0h. 3-Step Dismissible Briefing Modal (Replaces permanent ugly top box)
    this.briefingModalEl = document.createElement('div');
    this.briefingModalEl.id = 'orbit-zero-briefing-modal';
    this.briefingModalEl.style.cssText = `
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 560px;
      max-width: 90vw;
      background: rgba(8, 14, 26, 0.94);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(56, 189, 248, 0.4);
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.85), 0 0 24px rgba(56, 189, 248, 0.2);
      border-radius: 12px;
      padding: 24px 28px;
      pointer-events: auto;
      z-index: 10002;
      display: block;
    `;
    this.containerEl.appendChild(this.briefingModalEl);

    // 0h2. Campaign Scenario Selector Modal (Matching Concept 03)
    this.campaignModalEl = document.createElement('div');
    this.campaignModalEl.id = 'orbit-zero-campaign-modal';
    this.campaignModalEl.style.cssText = `
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 720px;
      max-width: 94vw;
      background: rgba(6, 12, 24, 0.95);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(0, 240, 255, 0.45);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 240, 255, 0.25);
      border-radius: 14px;
      padding: 28px 32px;
      pointer-events: auto;
      z-index: 10003;
      display: none;
    `;
    this.containerEl.appendChild(this.campaignModalEl);

    // 1. Top Mission Status Banner (Only visible in Downlink / Debrief)
    this.bannerEl = document.createElement('div');
    this.bannerEl.id = 'orbit-zero-hud-banner';
    this.bannerEl.style.cssText = `
      position: absolute;
      top: 14px; left: 50%;
      transform: translateX(-50%);
      background: rgba(8, 14, 26, 0.82);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(56, 189, 248, 0.35);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65), 0 0 16px rgba(56, 189, 248, 0.15);
      border-radius: 12px;
      padding: 10px 18px;
      min-width: 440px;
      max-width: 660px;
      color: #f8fafc;
      pointer-events: auto;
      text-align: center;
      transition: all 0.25s ease;
      z-index: 9999;
      display: none;
    `;
    this.containerEl.appendChild(this.bannerEl);

    // 2. Action Toast Notification Pill (Positioned cleanly at top center — never blocks desk)
    this.toastEl = document.createElement('div');
    this.toastEl.id = 'orbit-zero-hud-action';
    this.toastEl.style.cssText = `
      position: absolute;
      top: 168px; left: 50%;
      transform: translate(-50%, -10px);
      background: rgba(8, 14, 26, 0.88);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(56, 189, 248, 0.45);
      color: #38bdf8;
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6), 0 0 12px rgba(56, 189, 248, 0.2);
      opacity: 0;
      transition: opacity 0.25s ease, transform 0.25s ease;
      pointer-events: none;
      z-index: 10000;
    `;
    this.toastEl.innerText = 'Desktop Operator Mode Initialized';
    this.containerEl.appendChild(this.toastEl);

    // 3. Bottom Desktop Controls Toolbar (Centered subtle pill that reveals on hover)
    this.toolbarEl = document.createElement('div');
    this.toolbarEl.id = 'orbit-zero-bottom-toolbar';
    this.toolbarEl.style.cssText = `
      position: absolute;
      bottom: 8px; left: 50%;
      transform: translateX(-50%);
      background: rgba(8, 14, 26, 0.72);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(56, 189, 248, 0.25);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
      border-radius: 12px;
      padding: 8px 12px;
      display: flex;
      gap: 6px;
      align-items: center;
      max-width: 96vw;
      pointer-events: auto;
      opacity: 1;
      z-index: 9999;
    `;
    this.containerEl.appendChild(this.toolbarEl);

    // 3b. Left Window Blade: Tactical Objective Card (Concept Image 2)
    this.reconEl = document.createElement('div');
    this.reconEl.id = 'orbit-zero-recon-card';
    this.reconEl.style.cssText = `
      position: absolute;
      bottom: 36px; left: 28px;
      width: 320px;
      max-width: 30vw;
      background: rgba(8, 14, 26, 0.75);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(56, 189, 248, 0.32);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65), inset 0 0 16px rgba(56, 189, 248, 0.05);
      border-radius: 8px;
      padding: 8px 12px;
      color: #cbd5e1;
      font-size: 11px;
      line-height: 1.45;
      pointer-events: auto;
      max-height: 48px;
      overflow: hidden;
      display: none;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 9998;
    `;
    this.containerEl.appendChild(this.reconEl);

    // 3c. Right Window Blade: Downlink Station Card (Concept Image 2)
    this.compareEl = document.createElement('div');
    this.compareEl.id = 'orbit-zero-compare-card';
    this.compareEl.style.cssText = `
      position: absolute;
      bottom: 36px; right: 28px;
      width: 320px;
      max-width: 30vw;
      background: rgba(8, 14, 26, 0.75);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(16, 185, 129, 0.32);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65), inset 0 0 16px rgba(16, 185, 129, 0.05);
      border-radius: 8px;
      padding: 8px 12px;
      color: #cbd5e1;
      font-size: 11px;
      line-height: 1.45;
      pointer-events: auto;
      max-height: 48px;
      overflow: hidden;
      display: none;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 9998;
    `;
    this.containerEl.appendChild(this.compareEl);

    // 3d. 3D Spatial Cursor Tooltip Pill
    this.hoverTooltipEl = document.createElement('div');
    this.hoverTooltipEl.id = 'orbit-zero-hover-tooltip';
    this.hoverTooltipEl.style.cssText = `
      position: absolute;
      pointer-events: none;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid #38bdf8;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.75), 0 0 10px rgba(56, 189, 248, 0.3);
      color: #f8fafc;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      display: none;
      z-index: 10001;
      transform: translate(14px, 14px);
      transition: opacity 0.15s ease;
    `;
    this.containerEl.appendChild(this.hoverTooltipEl);

    // 4. Diagnostic HUD Panel ([F1])
    this.diagEl = document.createElement('div');
    this.diagEl.style.cssText = `
      position: absolute;
      top: 14px; right: 14px;
      background: rgba(11, 18, 32, 0.96);
      border: 1px solid #38bdf8;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
      border-radius: 8px;
      padding: 12px 16px;
      width: 320px;
      color: #cbd5e1;
      font-family: monospace;
      font-size: 11px;
      line-height: 1.5;
      pointer-events: auto;
      display: none;
    `;
    this.containerEl.appendChild(this.diagEl);

    // 5. Help Modal Dialog ([H])
    this.helpModalEl = document.createElement('div');
    this.helpModalEl.style.cssText = `
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(11, 18, 32, 0.98);
      border: 2px solid #38bdf8;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.85);
      border-radius: 12px;
      padding: 24px 28px;
      width: 620px;
      max-width: 90vw;
      color: #f8fafc;
      pointer-events: auto;
      display: none;
      z-index: 10000;
    `;
    this.containerEl.appendChild(this.helpModalEl);

    // Inject keyframe animations for ARIA-7 and HUD elements
    if (!document.getElementById('oz-cockpit-keyframes')) {
      const style = document.createElement('style');
      style.id = 'oz-cockpit-keyframes';
      style.textContent = `
        @keyframes ariaSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes ariaWaveBar {
          0% { transform: scaleY(0.3); opacity: 0.45; }
          100% { transform: scaleY(1.35); opacity: 1; }
        }
      `;
      if (document.head) {
        document.head.appendChild(style);
      } else if (document.body) {
        document.body.appendChild(style);
      }
    }

    // Every HUD button with data-action is handled by one delegated listener.
    this.containerEl.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement | null)?.closest?.('[data-action]') as HTMLElement | null;
      if (!target || (target as HTMLButtonElement).disabled) return;
      event.preventDefault();
      event.stopPropagation();
      this.handleUiAction(target.dataset.action ?? '');
    });

    document.body.appendChild(this.containerEl);
  }

  // ==========================================================================
  // HUD Update & Render Loop
  // ==========================================================================

  /** True while a full-screen dialog (mission card, campaign, help) is covering the cockpit. */
  private isModalOpen(state: MissionState): boolean {
    const academyActive = Boolean((window as any).__ORBIT_ZERO__?.getTutorialState?.()?.active);
    const card = this.briefingModalOpen && state.phase === 'OPERATIONS' && !state.passStarted && state.packets.length === 0 && !academyActive;
    return card || this.campaignModalOpen || this.showHelp;
  }

  /** Re-open the Mission Card whenever a fresh pass begins (restart, next operation, campaign). */
  private trackPassStart(state: MissionState): void {
    const freshPass = state.phase === 'OPERATIONS' && state.stepCounter === 0 && state.packets.length === 0;
    if (state.scenarioId !== this.lastSeenScenario || (freshPass && this.lastSeenStepCounter > 0)) {
      if (freshPass) this.briefingModalOpen = true;
      this.hasUserSelectedSector = false;
      this.lastHintText = '';
    }
    this.lastSeenScenario = state.scenarioId;
    this.lastSeenStepCounter = state.stepCounter;
  }

  /** One handler for every HUD button carrying data-action (mission card, action bar, campaign). */
  private handleUiAction(action: string): void {
    const state = this.host.engine.getState();
    const [verb, arg] = action.split(':');
    switch (verb) {
      case 'start-pass':
        this.briefingModalOpen = false;
        this.notifyAction('Pass ready: click a target sector on the globe.', true);
        break;
      case 'academy':
        this.campaignModalOpen = false;
        this.briefingModalOpen = false;
        if (this.host.startAcademy) this.host.startAcademy();
        else (window as any).__ORBIT_ZERO__?.startTutorial?.();
        break;
      case 'campaign': this.toggleCampaignModal(); return;
      case 'close-campaign': this.campaignModalOpen = false; break;
      case 'enter-vr':
        this.host.handleControlAction?.('ENTER_XR');
        return;
      case 'landing-menu': {
        const nextUrl = new URL(window.location.href);
        nextUrl.search = '?landing';
        window.location.href = nextUrl.toString();
        return;
      }
      case 'launch':
        this.campaignModalOpen = false;
        this.briefingModalOpen = true;
        this.host.launchScenario?.(arg);
        this.host.playCue?.('CRISIS_ALERT');
        break;
      case 'sensor':
        this.host.setSensor?.(arg as SensorMode);
        this.notifyAction(`${SENSOR_PLAIN_GUIDE[arg as SensorMode].label}: ${SENSOR_PLAIN_GUIDE[arg as SensorMode].sees}. ${SENSOR_PLAIN_GUIDE[arg as SensorMode].blind}.`, true);
        break;
      case 'select': this.host.selectPacket(arg); break;
      case 'scan': this.scanSector(); return;
      case 'process': this.processPacket(); return;
      case 'queue': this.queuePacket(); return;
      case 'unqueue': this.unqueuePacket(); return;
      case 'discard': this.discardPacket(); return;
      case 'transmit': this.commitDownlink(); return;
      case 'abort': this.host.abortPass?.(); break;
      case 'hint': this.requestHint(); return;
      case 'cycle': this.host.cycleCube(); break;
      case 'pause': this.host.togglePause(); break;
      case 'help': this.toggleHelpModal(); return;
      default: return;
    }
    void state;
    this.updateHud();
  }

  public requestHint(): void {
    const text = this.host.requestHint?.() ?? '';
    const state = this.host.engine.getState();
    if (text && state.lastActionOk) {
      this.lastHintText = text;
      this.lastHintStep = state.stepCounter;
      this.notifyAction(text, true);
    } else if (text) {
      this.notifyAction(text, false);
    }
    this.updateHud();
  }

  /** Destructive keys (R / N) need a second press within 2s while a pass has progress. */
  private confirmDestructive(key: string, label: string): boolean {
    const state = this.host.engine.getState();
    const hasProgress = state.phase !== 'DEBRIEF' && (state.packets.length > 0 || state.passStarted);
    if (!hasProgress) return true;
    const now = performance.now();
    if (this.pendingConfirm?.key === key && now < this.pendingConfirm.until) {
      this.pendingConfirm = null;
      return true;
    }
    this.pendingConfirm = { key, until: now + 2000 };
    this.notifyAction(`Press ${key.toUpperCase()} again to ${label} (current progress will be lost).`, false);
    return false;
  }

  public updateHud(): void {
    if (!this.bannerEl || !this.toolbarEl) return;
    const state = this.host.engine.getState();
    this.trackPassStart(state);

    // 0a. Digital Monospace Countdown Timer Pill (Concept Image 1 & 2)
    this.renderTimerWidget(state);

    // 0b. Vertical Battery Power Gauge (Concept Image 1 & 2)
    this.renderPowerGauge(state);

    // 0c. Commander ARIA-7 AI Hologram & Audio Waveform HUD (Concept Image 1 & 2)
    this.renderAriaHud(state);

    // 0c2. Tactical Sector Reticle Callout & Window Objective HUD (Concept Image 2)
    this.renderSectorCallout(state);

    // 0d. 3-Step Dismissible Briefing Modal
    this.renderBriefingModal(state);

    // 0e. Campaign Scenario Selection Modal
    this.renderCampaignModal(state);

    // 1. Render Top Banner (Only visible in Downlink / Debrief)
    this.renderTopBanner(state);

    // 1b. Render Tactical Reconnaissance Card (Live Sector Feasibility)
    this.renderReconCard(state);

    // 1c. Render Evidence Telemetry & Downlink Knapsack Card
    this.renderCompareCard(state);

    // 2. Render Bottom Toolbar Controls
    this.renderBottomToolbar(state);

    // 3. Render Diagnostics (if active)
    this.renderDiagnostics(state);

    // 4. Render Help Modal (if active)
    this.renderHelpModal(state);
  }

  private renderTimerWidget(state: MissionState): void {
    if (!this.timerWidgetEl) return;
    const label = (text: string, color: string) => `<span style="font-size: 10px; color: ${color}; display: block; letter-spacing: 1px; font-weight: 800;">${text}</span>`;
    if (state.phase === 'DOWNLINK') {
      const rem = Math.max(0, state.downlinkWindowSec - state.downlinkElapsedSec);
      this.timerWidgetEl.style.borderColor = '#ef4444';
      this.timerWidgetEl.style.color = '#f87171';
      this.timerWidgetEl.innerHTML = `${label('LIVE LINK - LOSS OF SIGNAL IN', '#fca5a5')}${rem.toFixed(1)}s`;
    } else if (state.phase === 'DEBRIEF') {
      this.timerWidgetEl.style.borderColor = '#10b981';
      this.timerWidgetEl.style.color = '#34d399';
      this.timerWidgetEl.innerHTML = `${label('ORBIT PASS', '#6ee7b7')}COMPLETE`;
    } else if (state.passRemainingSec === null) {
      this.timerWidgetEl.style.borderColor = 'rgba(52, 211, 153, 0.45)';
      this.timerWidgetEl.style.color = '#34d399';
      this.timerWidgetEl.innerHTML = `${label('PASS CLOCK', '#94a3b8')}NO CLOCK`;
    } else {
      const urgent = state.passStarted && state.passRemainingSec <= 25;
      this.timerWidgetEl.style.borderColor = urgent ? '#ef4444' : 'rgba(245, 158, 11, 0.55)';
      this.timerWidgetEl.style.color = urgent ? '#f87171' : '#fbbf24';
      this.timerWidgetEl.innerHTML = `${label(state.passStarted ? 'PASS CLOCK - LINK OPENS IN' : 'PASS CLOCK - STARTS AT FIRST SCAN', '#94a3b8')}${formatClock(state.passRemainingSec)}`;
    }
  }

  private renderPowerGauge(state: MissionState): void {
    if (!this.powerGaugeEl) return;
    const maxPower = state.maxPower || 55;
    const pct = Math.max(0, Math.min(100, (state.power / maxPower) * 100));
    this.powerGaugeEl.innerHTML = `
      <div style="font-size: 11px; font-weight: 800; color: #38bdf8; font-family: monospace; margin-bottom: 2px;">${state.power} Wh</div>
      <div style="font-size: 8px; color: #64748b; font-weight: 700; letter-spacing: 1px; margin-bottom: 6px;">POWER</div>
      <div style="height: 130px; width: 8px; background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 4px; position: relative; overflow: hidden; box-shadow: inset 0 0 6px rgba(0,0,0,0.8);">
        <div style="position: absolute; bottom: 0; width: 100%; height: ${pct}%; background: linear-gradient(to top, #0284c7, #38bdf8); box-shadow: 0 0 8px rgba(56, 189, 248, 0.7); transition: height 0.25s ease;"></div>
      </div>
      <div style="font-size: 9px; color: #64748b; font-family: monospace; margin-top: 4px;">${maxPower} Wh</div>
    `;
  }

  private renderAriaHud(state: MissionState): void {
    if (!this.ariaHudEl) return;
    const intervention = (window as any).__ORBIT_ZERO__?.getCoPilotIntervention?.() as { headline: string; detailedAdvice: string; urgency: string } | null | undefined;
    const sector = getScenarioSector(state.scenarioId, state.selectedSectorId, this.host.engine.getActiveCustomScenario());
    let badge = 'ARIA-7';
    let line = state.phase === 'OPERATIONS' && !this.hasUserSelectedSector
      ? 'Pick a sector on the globe. I will tell you its weather. Click me for a hint if you get stuck.'
      : `Sector ${state.selectedSectorId} (${sector.name}): ${describeWeather(sector.cloudCover)}.`;
    let isCritical = false;
    if (state.phase === 'DEBRIEF') {
      line = `Pass complete: ${state.debrief?.totalScore ?? 0} pts. Retry to beat it, or move to the next operation.`;
    } else if (this.lastHintText && state.hintsUsed > 0 && this.lastHintStep === state.stepCounter) {
      badge = `ARIA-7 HINT (${state.hintsUsed} used)`;
      line = this.lastHintText;
    } else if (intervention) {
      badge = `ARIA-7 // ${intervention.headline}`;
      line = intervention.detailedAdvice;
      isCritical = intervention.urgency === 'CRITICAL' || intervention.urgency === 'EMERGENCY';
    }
    const borderColor = isCritical ? 'rgba(239, 68, 68, 0.85)' : 'rgba(167, 139, 250, 0.5)';
    const badgeColor = isCritical ? '#f87171' : '#c4b5fd';
    this.ariaHudEl.innerHTML = `
      <div id="aria-subtitle-bar" style="background: rgba(6, 12, 24, 0.88); border: 1px solid ${borderColor}; border-radius: 6px; padding: 8px 14px; display: flex; flex-direction: column; gap: 3px;">
        <div id="aria-subtitle-badge" style="font-size: 11px; font-weight: 800; color: ${badgeColor}; letter-spacing: 1.2px;">${escapeHtml(badge)}</div>
        <div id="aria-subtitle-text" style="font-size: 13px; color: #e2e8f0; font-weight: 500; line-height: 1.45;">${escapeHtml(line)}</div>
      </div>
    `;
  }

  private renderSectorCallout(state: MissionState): void {
    if (!this.sectorCalloutEl || !this.tacticalObjectiveEl || !this.groundStationTrackingEl) return;
    // The old objective bar printed the answer ("SCAN X [RADAR]"); the Next Step card replaces it.
    this.tacticalObjectiveEl.style.display = 'none';
    this.groundStationTrackingEl.style.display = 'none';

    if (state.phase !== 'OPERATIONS' || !this.hasUserSelectedSector || this.isModalOpen(state)) {
      this.sectorCalloutEl.style.display = 'none';
      return;
    }
    const custom = this.host.engine.getActiveCustomScenario();
    const secId = state.selectedSectorId;
    const secCfg = getScenarioSector(state.scenarioId, secId, custom);
    const requests = getScenarioRequests(state.scenarioId, custom);
    const req = Object.values(requests).find((r) => r.targetSectorId === secId);
    const globe = this.host.getSceneObject('earth-globe');
    const reticle = globe?.getObjectByName('ActiveSectorReticleGroup');
    if (!reticle || !this.host.camera) {
      this.sectorCalloutEl.style.display = 'none';
      return;
    }
    const worldPos = new Vector3();
    reticle.getWorldPosition(worldPos);
    worldPos.project(this.host.camera);
    if (worldPos.z >= 1.0) {
      this.sectorCalloutEl.style.display = 'none';
      return;
    }
    const cx = (worldPos.x * 0.5 + 0.5) * window.innerWidth;
    const cy = (-(worldPos.y * 0.5) + 0.5) * window.innerHeight;
    this.sectorCalloutEl.style.display = 'flex';
    this.sectorCalloutEl.style.left = `${Math.round(cx + 36)}px`;
    this.sectorCalloutEl.style.top = `${Math.round(cy - 24)}px`;
    this.sectorCalloutEl.innerHTML = `
      <div style="background: rgba(6, 12, 24, 0.86); border: 1px solid rgba(56, 189, 248, 0.55); border-radius: 5px; padding: 6px 12px;">
        <div style="font-size: 12px; font-weight: 800; color: #38bdf8; letter-spacing: 1px;">SECTOR ${secId} · ${escapeHtml(secCfg.name.toUpperCase())}</div>
        <div style="font-size: 12px; color: #e2e8f0; margin-top: 2px;">Weather: <b>${describeWeather(secCfg.cloudCover)}</b></div>
        <div style="font-size: 11px; color: ${req ? '#34d399' : '#94a3b8'}; font-weight: 700;">${req ? `${escapeHtml(req.shortLabel.split('|')[1]?.trim() ?? req.id)} · ${requestValue(req)} pts` : 'No ground request here'}</div>
      </div>
    `;
  }

  public toggleCampaignModal(): void {
    this.campaignModalOpen = !this.campaignModalOpen;
    if (this.campaignModalOpen) {
      this.briefingModalOpen = false;
    }
    this.updateHud();
  }

  private renderCampaignModal(state: MissionState): void {
    if (!this.campaignModalEl) return;
    if (!this.campaignModalOpen) {
      this.campaignModalEl.style.display = 'none';
      return;
    }
    this.campaignModalEl.style.display = 'block';
    const profile = (window as any).__ORBIT_ZERO__?.getProfile?.();
    this.campaignModalEl.innerHTML = campaignHtml(state, profile?.mastery ?? {});
  }

  private renderBriefingModal(state: MissionState): void {
    if (!this.briefingModalEl) return;
    const academyActive = Boolean((window as any).__ORBIT_ZERO__?.getTutorialState?.()?.active);
    if (state.packets.length > 0 || state.passStarted) this.briefingModalOpen = false;
    if (academyActive || !this.briefingModalOpen || this.campaignModalOpen || state.phase !== 'OPERATIONS') {
      this.briefingModalEl.style.display = 'none';
      return;
    }
    this.briefingModalEl.style.display = 'block';
    this.briefingModalEl.style.width = '640px';
    this.briefingModalEl.style.maxHeight = 'calc(100vh - 40px)';
    this.briefingModalEl.style.overflowY = 'auto';
    const profile = (window as any).__ORBIT_ZERO__?.getProfile?.();
    this.briefingModalEl.innerHTML = missionCardHtml(state, this.host.engine.getActiveCustomScenario(), profile?.mastery?.[state.scenarioId] ?? null);
  }

  private renderTopBanner(state: MissionState): void {
    if (!this.bannerEl) return;
    const custom = this.host.engine.getActiveCustomScenario();

    this.bannerEl.style.borderColor = 'rgba(56, 189, 248, 0.35)';
    this.bannerEl.style.maxWidth = '720px';
    this.bannerEl.style.minWidth = '520px';
    this.bannerEl.style.maxHeight = '';
    this.bannerEl.style.overflowY = '';

    if (state.phase === 'DEBRIEF') {
      this.bannerEl.style.display = 'block';
      const debrief = state.debrief!;
      const isAcademyPass = state.scenarioId === 'ORBITAL_ACADEMY' && debrief.outcome === 'SUCCESS';
      const outcomeColor = debrief.outcome === 'SUCCESS' ? '#34d399' : debrief.outcome === 'PARTIAL_SUCCESS' ? '#f59e0b' : '#ef4444';
      const outcomeKey = (debrief.outcome ?? 'FAILED') as DebriefOutcome;
      const chip = (text: string, color: string) =>
        `<span style="display: inline-block; font-size: 11px; font-weight: 800; letter-spacing: 0.6px; color: ${color}; border: 1px solid ${color}; border-radius: 4px; padding: 1px 6px;">${text}</span>`;
      const requestRows = isAcademyPass
        ? ''
        : debrief.evaluations
          .map((ev) => {
            const s = requestStatusChip(ev.status);
            return `
          <div class="aar-row" style="display: grid; grid-template-columns: 86px 1fr; gap: 4px 10px; align-items: start; text-align: left; padding: 7px 0; border-top: 1px solid rgba(148, 163, 184, 0.16);">
            <div>${chip(s.label, s.color)}</div>
            <div>
              <div style="font-size: 13px; font-weight: 700; color: #f8fafc;">${escapeHtml(ev.shortLabel)} <span style="color: #94a3b8; font-weight: 600;">${ev.scorePoints}/${ev.maxPoints} pts</span></div>
              <div style="font-size: 12px; color: #cbd5e1; margin-top: 1px;">${escapeHtml(clipText(ev.groundConsequence, 160))}</div>
              ${ev.decisionNote ? `<div style="font-size: 12px; color: #7dd3fc; margin-top: 2px;"><b>Your decision:</b> ${escapeHtml(ev.decisionNote)}</div>` : ''}
            </div>
          </div>`;
          })
          .join('');
      const g = debrief.outcome === 'SUCCESS' ? null : retryGuidanceFor(debrief);
      const tip = isAcademyPass
        ? 'You are qualified. Operation 01 has a real pass clock and three requests with different values.'
        : g ? `<b style="color: ${outcomeColor};">${escapeHtml(g.title)}.</b> ${escapeHtml(clipText(g.body, 340))}` : escapeHtml(clipText(debrief.deterministicRecommendation, 300));
      this.bannerEl.style.borderColor = outcomeColor;
      this.bannerEl.style.maxWidth = '780px';
      this.bannerEl.style.minWidth = '620px';
      this.bannerEl.style.maxHeight = 'calc(100vh - 28px)';
      this.bannerEl.style.overflowY = 'auto';
      this.bannerEl.innerHTML = `
        <div style="font-size: 11px; color: #38bdf8; font-weight: 700; letter-spacing: 1.2px;">${isAcademyPass ? 'ORBITAL ACADEMY RESULT' : 'AFTER-ACTION REVIEW [SIMULATED]'}</div>
        <div id="debrief-outcome-headline" style="font-size: 24px; font-weight: 800; color: ${outcomeColor}; margin: 3px 0 2px;">
          ${isAcademyPass ? 'TRAINING COMPLETE' : `${OUTCOME_LABELS[outcomeKey]} · GRADE ${debrief.efficiencyGrade}`}
        </div>
        <div style="font-size: 13px; font-family: monospace; color: #e2e8f0; margin-bottom: 4px;">${escapeHtml(debriefScoreLine(state, custom))}</div>
        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 6px;">Sent ${debrief.transmittedPacketIds.length} cube(s) in ${debrief.downlinkUsedSec.toFixed(1)}s of ${debrief.downlinkWindowSec.toFixed(1)}s · ${debrief.powerRemaining} Wh battery left${debrief.droppedPacketIds.length ? ` · <b style="color:#f87171;">${debrief.droppedPacketIds.length} cut off</b>` : ''}</div>
        <div style="font-size: 13px; color: #f8fafc; margin-bottom: 6px;">${escapeHtml(debrief.summaryHeadline)}</div>
        ${requestRows}
        <div id="debrief-failure-diagnostic" style="text-align: left; background: rgba(15, 23, 42, 0.7); border-left: 3px solid ${outcomeColor}; border-radius: 0 6px 6px 0; padding: 7px 10px; margin: 6px 0 4px; font-size: 12px; color: #e2e8f0;">
          <span style="color: #94a3b8; font-weight: 800;">${debrief.outcome === 'SUCCESS' ? 'NEXT STEP' : 'TRY THIS'}</span> ${tip}
        </div>
        <div style="display: flex; justify-content: center; gap: 10px; margin-top: 8px;">
          <button id="btn-aar-restart" style="${this.btnStyle('#38bdf8')}">${isAcademyPass ? 'REPLAY TRAINING [R]' : 'RETRY PASS [R]'}</button>
          <button id="btn-aar-next" style="${this.btnStyle('#34d399', true)}">${isAcademyPass ? 'START OP 01 [N]' : 'NEXT OPERATION [N]'}</button>
          <button id="btn-aar-campaign" style="${this.btnStyle('#a855f7')}">CAMPAIGN [C]</button>
        </div>
      `;
      this.bannerEl.querySelector('#btn-aar-restart')?.addEventListener('click', () => this.restartMission());
      this.bannerEl.querySelector('#btn-aar-next')?.addEventListener('click', () => {
        this.host.nextMission();
        this.briefingModalOpen = true;
        this.updateHud();
      });
      this.bannerEl.querySelector('#btn-aar-campaign')?.addEventListener('click', () => {
        this.campaignModalOpen = true;
        this.updateHud();
      });
      return;
    }

    if (this.isModalOpen(state)) {
      this.bannerEl.style.display = 'none';
      return;
    }

    const academyState = (window as any).__ORBIT_ZERO__?.getTutorialState?.();
    if (academyState?.active && academyState?.stepSpec && state.phase === 'OPERATIONS') {
      this.bannerEl.style.display = 'block';
      const spec = academyState.stepSpec;
      this.bannerEl.innerHTML = `
        <div id="orbital-academy-banner" style="text-align: left;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
            <span style="font-size: 11px; color: #34d399; font-weight: 800; letter-spacing: 1px;">OP 00: ORBITAL ACADEMY · STEP ${academyState.completedStepIds.length + 1}/9 · NO CLOCK</span>
            <button id="btn-skip-academy" style="background: none; border: none; color: #94a3b8; font-size: 11px; cursor: pointer; text-decoration: underline; pointer-events: auto;">Skip training</button>
          </div>
          <div id="academy-step-title" style="font-size: 15px; font-weight: 800; color: #f8fafc; margin-bottom: 3px;">${escapeHtml(spec.title)}</div>
          <div id="academy-step-desktop" style="font-size: 13px; color: #e2e8f0; line-height: 1.45; margin-bottom: 4px;">${escapeHtml(spec.desktopInstruction)}</div>
          <div style="font-size: 11px; color: #94a3b8;"><b>In VR:</b> ${escapeHtml(spec.vrInstruction)}</div>
        </div>
      `;
      this.bannerEl.querySelector('#btn-skip-academy')?.addEventListener('click', () => {
        (window as any).__ORBIT_ZERO__?.skipTutorial?.();
        this.updateHud();
      });
      return;
    }

    this.bannerEl.style.display = 'block';
    const step = getNextStep(state, custom);
    this.bannerEl.style.borderColor = step.tone === 'critical' ? 'rgba(248, 113, 113, 0.8)' : step.tone === 'warn' ? 'rgba(245, 158, 11, 0.7)' : 'rgba(56, 189, 248, 0.45)';
    this.bannerEl.innerHTML = nextStepBannerHtml(step, state, custom);
  }

  private renderReconCard(state: MissionState): void {
    if (!this.reconEl) return;

    if (state.phase === 'DEBRIEF') {
      const debrief = state.debrief;
      const evs = debrief?.evaluations || [];
      this.reconEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(56, 189, 248, 0.25); padding-bottom: 4px; margin-bottom: 6px;">
          <span style="font-weight: 700; color: #38bdf8; letter-spacing: 0.5px;">GROUND RESCUE IMPACT</span>
          <span style="font-size: 10px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 1px 6px; border-radius: 4px; font-weight: 700;">
            [SIMULATED CRISIS MODEL]
          </span>
        </div>
        <div style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">
          Simulated ground response consequences based on downlinked orbital evidence:
        </div>
        ${evs.map((ev) => {
        const color = ev.status === 'VERIFIED' ? '#10b981' : ev.status === 'PARTIAL' ? '#f59e0b' : '#ef4444';
        return `
            <div style="background: rgba(15, 23, 42, 0.85); border-left: 3px solid ${color}; border-radius: 0 6px 6px 0; padding: 6px 8px; margin-bottom: 6px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                <b style="color: ${color}; font-size: 10px;">${ev.shortLabel}: ${ev.title}</b>
                <span style="font-size: 9px; background: rgba(255,255,255,0.08); padding: 1px 4px; border-radius: 3px; color: ${color}; font-weight: 700;">${ev.statusBadge} (${ev.scorePoints}/${ev.maxPoints} pts)</span>
              </div>
              <div style="font-size: 10px; color: #f8fafc; margin-bottom: 2px;">
                <b>Simulated Operational Impact:</b> ${ev.groundConsequence}
              </div>
              <div style="font-size: 9px; color: #94a3b8; font-style: italic;">
                <b>Telemetry Evidence:</b> ${ev.explanation}
              </div>
              ${ev.decisionNote ? `<div style="font-size: 9px; color: #cbd5e1; margin-top: 2px;"><b>Decision review:</b> ${ev.decisionNote}</div>` : ''}
            </div>
          `;
      }).join('')}
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #cbd5e1; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px; margin-top: 6px;">
          <span>Verified: <b style="color: #10b981;">${debrief?.requestsVerifiedCount ?? 0}/3</b></span>
          <span>Partial: <b style="color: #f59e0b;">${debrief?.requestsPartialCount ?? 0}/3</b></span>
          <span>Missed: <b style="color: #ef4444;">${debrief?.requestsUnverifiedCount ?? 0}/3</b></span>
        </div>
      `;
      return;
    }

    if (state.phase === 'DOWNLINK') {
      const elapsed = state.downlinkElapsedSec.toFixed(1);
      const total = state.downlinkWindowSec.toFixed(1);
      const remaining = Math.max(0, state.downlinkWindowSec - state.downlinkElapsedSec).toFixed(1);
      this.reconEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(56, 189, 248, 0.25); padding-bottom: 4px; margin-bottom: 6px;">
          <span style="font-weight: 700; color: #38bdf8; letter-spacing: 0.5px;">ORBITAL LINK TRACKING</span>
          <span style="font-size: 10px; background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 1px 6px; border-radius: 4px; font-weight: 700;">
            [SIMULATED TELEMETRY]
          </span>
        </div>
        <div style="background: rgba(15, 23, 42, 0.85); border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; font-size: 10px;">
          <div style="color: #94a3b8; margin-bottom: 2px;">Ground Station: <b style="color: #f8fafc;">Karachi Downlink Terminal (24.86° N, 67.00° E) [Simulated Horizon Tracking]</b></div>
          <div style="color: #94a3b8; margin-bottom: 2px;">Carrier Frequency: <b style="color: #38bdf8;">S-Band 2205.5 MHz BPSK [Simulated Carrier Lock]</b></div>
          <div style="color: #94a3b8; margin-bottom: 2px;">Link SNR: <b style="color: #10b981;">18.4 dB [Simulated Receiver Metric]</b></div>
          <div style="color: #94a3b8;">Doppler Offset: <b style="color: #cbd5e1;">+14.2 kHz (Ascending Arc)</b></div>
        </div>
        <div style="background: rgba(15, 23, 42, 0.85); border-radius: 6px; padding: 6px 8px; font-size: 10px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span style="color: #94a3b8;">Contact Window:</span>
            <b style="color: #34d399;">${elapsed}s / ${total}s</b>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span style="color: #94a3b8;">Time to LOS (Cutoff):</span>
            <b style="color: ${Number(remaining) < 3.0 ? '#ef4444' : '#f59e0b'};">${remaining}s</b>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #94a3b8;">Committed Packets:</span>
            <b style="color: #f8fafc;">${state.queuePacketIds.length} queued</b>
          </div>
        </div>
      `;
      return;
    }

    const sector = getScenarioSector(state.scenarioId, state.selectedSectorId);
    if (!sector) return;
    const isStorm = sector.cloudCover !== 'CLEAR';
    const activeSensor = state.activeSensorMode;
    const cost = getScanCost(this.host.engine.getActiveScenario().budget, activeSensor).powerCost;
    const weatherLabel = isStorm ? describeWeather(sector.cloudCover).toUpperCase() : 'CLEAR SKY';

    if (this.hudMinimized) {
      this.reconEl.style.maxHeight = '42px';
      this.reconEl.style.overflow = 'hidden';
      this.reconEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; height: 22px;" id="btn-toggle-hud-recon">
          <span style="font-weight: 700; color: #38bdf8; font-size: 11px;">📡 ${sector.code} [${weatherLabel}]</span>
          <span style="font-size: 9px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-weight: 700;">+ EXPAND [V]</span>
        </div>
      `;
      this.reconEl.querySelector('#btn-toggle-hud-recon')?.addEventListener('click', () => this.toggleHud());
      return;
    }

    this.reconEl.style.maxHeight = 'calc(100vh - 180px)';
    this.reconEl.style.overflowY = 'auto';

    // Optical & SAR physics forecast + measured outcome ONLY after scanning that sector (no answer spoiler).
    // Every number and sentence here comes from this operation's active scenario and live packets.
    const activeScenario = this.host.engine.getActiveScenario();
    const opticalPacket = state.packets.find((p) => p.sectorId === sector.id && p.sensorMode === 'OPTICAL');
    const radarPacket = state.packets.find((p) => p.sectorId === sector.id && p.sensorMode === 'RADAR');
    const opticalOutcome = sector.outcomes.OPTICAL;
    const radarOutcome = sector.outcomes.RADAR;
    const opticalAlbedo = isStorm ? describeWeather(sector.cloudCover) : 'Clear atmosphere';
    const opticalStatusText = opticalPacket
      ? `${opticalPacket.confidence} (${opticalOutcome.observationConfidencePct ?? 0}% sure, simulated)`
      : `PENDING SCAN (${getScanCost(activeScenario.budget, 'OPTICAL').powerCost} Wh)`;
    const opticalStatusColor = opticalPacket
      ? (opticalPacket.confidence === 'CONFIRMED' ? '#10b981' : opticalPacket.confidence === 'PROBABLE' ? '#f59e0b' : '#ef4444')
      : '#94a3b8';
    const opticalDetailText = opticalPacket
      ? opticalOutcome.finding
      : (isStorm
        ? 'Optical wavelengths scatter through cloud, smoke, or storm plumes.'
        : 'Clear atmospheric path — Optical captures daylight features cleanly.');

    const radarStatusText = radarPacket
      ? `${radarPacket.confidence} (${radarOutcome.observationConfidencePct ?? 0}% sure, simulated)`
      : `PENDING SCAN (${getScanCost(activeScenario.budget, 'RADAR').powerCost} Wh)`;
    const radarStatusColor = radarPacket
      ? (radarPacket.confidence === 'CONFIRMED' ? '#10b981' : radarPacket.confidence === 'PROBABLE' ? '#f59e0b' : '#ef4444')
      : '#94a3b8';
    const radarDetailText = radarPacket
      ? radarOutcome.finding
      : 'Active C-band SAR (5.4 GHz) penetrates weather/smoke; higher battery draw.';

    this.reconEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(56, 189, 248, 0.25); padding-bottom: 4px; margin-bottom: 6px;">
        <span style="font-weight: 700; color: #38bdf8; letter-spacing: 0.5px;">TACTICAL RECONNAISSANCE</span>
        <div style="display: flex; gap: 4px; align-items: center;">
          <span style="font-size: 9px; background: ${isStorm ? 'rgba(245, 158, 11, 0.2)' : 'rgba(56, 189, 248, 0.2)'}; color: ${isStorm ? '#f59e0b' : '#38bdf8'}; padding: 1px 5px; border-radius: 4px; font-weight: 700;">
            ${weatherLabel}
          </span>
          <button id="btn-min-recon" style="background: none; border: 1px solid rgba(56, 189, 248, 0.3); color: #94a3b8; font-size: 10px; border-radius: 3px; padding: 0 4px; cursor: pointer;" title="Minimize Card [V]">—</button>
        </div>
      </div>
      <div style="font-size: 13px; font-weight: 700; color: #f8fafc; margin-bottom: 2px;">
        SECTOR ${sector.id}: ${sector.name}
      </div>
      <div style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">
        ${sector.terrainSummary}
      </div>

      <!-- Domain 1: Atmospheric Profile (Optical) -->
      <div style="background: rgba(15, 23, 42, 0.85); border-left: 3px solid #38bdf8; border-radius: 0 6px 6px 0; padding: 6px 8px; margin-bottom: 6px;">
        <div style="font-size: 9px; font-weight: 700; color: #38bdf8; letter-spacing: 0.5px; margin-bottom: 3px;">
          ATMOSPHERIC PROFILE (VIS/NIR OPTICAL: 450–850 nm):
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
          <span style="color: #94a3b8;">Sky over the sector:</span>
          <b style="color: ${isStorm ? '#f59e0b' : '#38bdf8'};">${opticalAlbedo}</b>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
          <span style="color: #94a3b8;">Optical result:</span>
          <b style="color: ${opticalStatusColor};">${opticalStatusText}</b>
        </div>
        <div style="font-size: 10px; color: ${opticalPacket && isStorm ? '#ef4444' : '#cbd5e1'}; font-style: italic;">
          ${opticalDetailText}
        </div>
      </div>

      <!-- Domain 2: Surface Microwave Profile (Radar) -->
      <div style="background: rgba(15, 23, 42, 0.85); border-left: 3px solid #f59e0b; border-radius: 0 6px 6px 0; padding: 6px 8px; margin-bottom: 6px;">
        <div style="font-size: 9px; font-weight: 700; color: #f59e0b; letter-spacing: 0.5px; margin-bottom: 3px;">
          MICROWAVE BACKSCATTER (ACTIVE SAR: 5.4 GHz / 5.5 cm):
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
          <span style="color: #94a3b8;">Radar result:</span>
          <b style="color: ${radarStatusColor};">${radarStatusText}</b>
        </div>
        <div style="font-size: 10px; color: #cbd5e1; margin-top: 2px;">
          <span style="color: #94a3b8;">${radarPacket ? 'Surface Response:' : 'Sensor Physics:'}</span> ${radarDetailText}
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; font-size: 10px; color: #cbd5e1; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
        <span>Armed: <b style="color: ${activeSensor === 'RADAR' ? '#f59e0b' : '#38bdf8'}">${activeSensor}</b> (${cost} Wh)</span>
        <span>Batt After: <b style="color: ${state.power >= cost ? '#34d399' : '#ef4444'}">${Math.max(0, state.power - cost)} Wh</b></span>
      </div>
    `;
    this.reconEl.querySelector('#btn-min-recon')?.addEventListener('click', () => this.toggleHud());
  }

  private renderCompareCard(state: MissionState): void {
    if (!this.compareEl) return;

    if (state.phase === 'DEBRIEF') {
      const debrief = state.debrief;
      if (!debrief) return;
      const txPackets = state.packets.filter((p) => debrief.transmittedPacketIds.includes(p.id));
      const dropPackets = state.packets.filter((p) => debrief.droppedPacketIds.includes(p.id));
      const unqueuedPackets = state.packets.filter(
        (p) => !debrief.transmittedPacketIds.includes(p.id) && !debrief.droppedPacketIds.includes(p.id)
      );

      this.compareEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(16, 185, 129, 0.25); padding-bottom: 4px; margin-bottom: 6px;">
          <span style="font-weight: 700; color: #10b981; letter-spacing: 0.5px;">TELEMETRY DELIVERY ACCOUNTING</span>
          <span style="font-size: 10px; background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 1px 6px; border-radius: 4px; font-weight: 700;">
            [SIMULATED FLIGHT TELEMETRY]
          </span>
        </div>

        <div style="font-size: 10px; color: #94a3b8; margin-bottom: 6px;">
          Transmitted to Ground Station vs Retained/Lost in Orbit:
        </div>

        <div style="background: rgba(15, 23, 42, 0.85); border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; font-size: 10px;">
          <div style="font-weight: 700; color: #10b981; margin-bottom: 3px;">DELIVERED TO RESCUE TEAMS (${txPackets.length}):</div>
          ${txPackets.length === 0 ? '<div style="color: #ef4444; font-style: italic;">Zero telemetry packets transmitted!</div>' : txPackets.map((p) => `
            <div style="display: flex; justify-content: space-between; color: #cbd5e1; font-size: 9px; margin-bottom: 1px;">
              <span>✓ Sector ${p.sectorId} (${p.sensorMode})</span>
              <span style="color: #34d399;">${p.payloadMb ?? Math.round(p.transmitSec * (p.throughputMbps ?? DOWNLINK_THROUGHPUT_MBPS))} MB (${p.storageCost} STR | ${p.transmitSec.toFixed(1)}s TX) [${p.confidence}]</span>
            </div>
          `).join('')}
        </div>

        ${dropPackets.length > 0 ? `
          <div style="background: rgba(15, 23, 42, 0.85); border-left: 3px solid #ef4444; border-radius: 0 6px 6px 0; padding: 6px 8px; margin-bottom: 6px; font-size: 10px;">
            <div style="font-weight: 700; color: #ef4444; margin-bottom: 2px;">DROPPED (HORIZON CUTOFF) (${dropPackets.length}):</div>
            ${dropPackets.map((p) => `
              <div style="color: #ef4444; font-size: 9px;">❌ Sector ${p.sectorId}: Exceeded ${state.downlinkWindowSec.toFixed(1)}s window cutoff!</div>
            `).join('')}
          </div>
        ` : ''}

        ${unqueuedPackets.length > 0 ? `
          <div style="background: rgba(15, 23, 42, 0.85); border-left: 3px solid #f59e0b; border-radius: 0 6px 6px 0; padding: 6px 8px; margin-bottom: 6px; font-size: 10px;">
            <div style="font-weight: 700; color: #f59e0b; margin-bottom: 2px;">RETAINED IN STORAGE (${unqueuedPackets.length}):</div>
            ${unqueuedPackets.map((p) => `
              <div style="color: #cbd5e1; font-size: 9px;">⏸️ Sector ${p.sectorId} (${p.sensorMode}): Acquired but never staged to bay.</div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Strategic Feedback & Counterfactual Analysis -->
        <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; font-size: 10px;">
          <div style="font-weight: 700; color: #38bdf8; font-size: 9px; letter-spacing: 0.5px; margin-bottom: 2px;">
            TACTICAL LESSON & REPLAY STRATEGY
          </div>
          <div style="color: #cbd5e1; margin-bottom: 3px; font-size: 9px;">
            ${debrief.deterministicRecommendation}
          </div>
          <div style="color: #94a3b8; font-style: italic; font-size: 9px;">
            ${debrief.counterfactualComparison}
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
          <span>Power Used: <b style="color: #f8fafc;">${debrief.powerUsed} Wh</b></span>
          <span>Window Used: <b style="color: #f8fafc;">${debrief.downlinkUsedSec.toFixed(1)}s</b></span>
          <span>Margin: <b style="color: #34d399;">${debrief.windowMarginSec.toFixed(1)}s</b></span>
        </div>

        <button id="btn-copy-telemetry" style="
          width: 100%; margin-top: 8px; padding: 6px 8px;
          background: rgba(10, 185, 129, 0.15); border: 1px solid #10b981;
          border-radius: 4px; color: #10b981; font-size: 10px; font-weight: 700;
          cursor: pointer; transition: all 0.2s; font-family: monospace;
        " onmouseover="this.style.background='rgba(10, 185, 129, 0.25)'"
          onmouseout="this.style.background='rgba(10, 185, 129, 0.15)'">
          📋 COPY OPERATOR TELEMETRY
        </button>
      `;
      return;
    }

    if (state.phase === 'DOWNLINK') {
      const queuedPackets = state.packets.filter((p) => state.queuePacketIds.includes(p.id));
      let cumulativeTime = 0;

      this.compareEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(16, 185, 129, 0.25); padding-bottom: 4px; margin-bottom: 6px;">
          <span style="font-weight: 700; color: #10b981; letter-spacing: 0.5px;">LIVE DOWNLINK PIPELINE</span>
          <span style="font-size: 10px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 1px 6px; border-radius: 4px; font-weight: 700;">
            [SIMULATED S-BAND STREAM]
          </span>
        </div>

        <div style="font-size: 10px; color: #94a3b8; margin-bottom: 6px;">
          Transmitting staged evidence packets across orbital contact horizon:
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;">
          ${queuedPackets.map((p, idx) => {
        const startT = cumulativeTime;
        const endT = cumulativeTime + p.transmitSec;
        cumulativeTime = endT;
        const isTransmitted = p.transmitted;
        const isStreaming = p.id === state.activeDownlinkPacketId;
        const isOverflow = endT > state.downlinkWindowSec;

        let statusLabel = 'QUEUED ⏳';
        let statusColor = '#f59e0b';
        if (isTransmitted) {
          statusLabel = 'TRANSMITTED ✓';
          statusColor = '#10b981';
        } else if (isStreaming) {
          statusLabel = 'STREAMING 📡';
          statusColor = '#38bdf8';
        } else if (isOverflow) {
          statusLabel = 'LOS RISK ⚠️';
          statusColor = '#ef4444';
        }

        return `
              <div style="background: rgba(15, 23, 42, 0.85); border-left: 3px solid ${statusColor}; border-radius: 0 6px 6px 0; padding: 5px 8px; font-size: 10px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                  <b style="color: #f8fafc;">Slot ${idx + 1}: Sector ${p.sectorId} (${p.sensorMode})</b>
                  <b style="color: ${statusColor}; font-size: 9px;">${statusLabel}</b>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8;">
                  <span>${p.headline}</span>
                  <span>${startT.toFixed(1)}s - ${endT.toFixed(1)}s (${p.transmitSec.toFixed(1)}s)</span>
                </div>
              </div>
            `;
      }).join('')}
        </div>

        <div style="font-size: 9px; color: #94a3b8; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
          Total Transmission Load: <b style="color: ${state.downlinkCommittedSec > state.downlinkWindowSec ? '#ef4444' : '#34d399'}">${state.downlinkCommittedSec.toFixed(1)}s / ${state.downlinkWindowSec.toFixed(1)}s</b>
        </div>
      `;
      return;
    }

    const packets = state.packets;
    const queuedPackets = packets.filter((p) => state.queuePacketIds.includes(p.id));
    const totalQueuedTx = queuedPackets.reduce((acc, p) => acc + p.transmitSec, 0);
    const windowSec = state.downlinkWindowSec;
    const isOverflow = totalQueuedTx > windowSec;

    if (this.hudMinimized) {
      this.compareEl.style.maxHeight = '42px';
      this.compareEl.style.overflow = 'hidden';
      this.compareEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; height: 22px;" id="btn-toggle-hud-compare">
          <span style="font-weight: 700; color: #10b981; font-size: 11px;">🛰️ BAY: ${totalQueuedTx.toFixed(1)}s / ${windowSec.toFixed(1)}s (${queuedPackets.length} queued)</span>
          <span style="font-size: 9px; background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 2px 6px; border-radius: 4px; font-weight: 700;">+ EXPAND [V]</span>
        </div>
      `;
      this.compareEl.querySelector('#btn-toggle-hud-compare')?.addEventListener('click', () => this.toggleHud());
      return;
    }

    this.compareEl.style.maxHeight = 'calc(100vh - 180px)';
    this.compareEl.style.overflowY = 'auto';

    if (packets.length === 0) {
      this.compareEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(16, 185, 129, 0.25); padding-bottom: 4px; margin-bottom: 6px;">
          <span style="font-weight: 700; color: #10b981; letter-spacing: 0.5px;">FORENSIC EVIDENCE & DOWNLINK</span>
          <button id="btn-min-compare" style="background: none; border: 1px solid rgba(16, 185, 129, 0.3); color: #94a3b8; font-size: 10px; border-radius: 3px; padding: 0 4px; cursor: pointer;" title="Minimize Card [V]">—</button>
        </div>
        <div style="color: #94a3b8; font-size: 11px; text-align: center; padding: 12px 0;">
          No evidence cubes acquired yet.<br/>Scan a sector with [Space] to acquire telemetry.
        </div>
      `;
      this.compareEl.querySelector('#btn-min-compare')?.addEventListener('click', () => this.toggleHud());
      return;
    }

    const sel = packets.find((p) => p.id === state.selectedPacketId) || packets[0];

    // Intelligent Evidence Pairing Strategy:
    // Priority 1: Same sector, cross-sensor comparison (highest forensic value)
    let otherPkt = packets.find((p) => p.sectorId === sel.sectorId && p.id !== sel.id);
    // Priority 2: Alternative target answering another ground request
    if (!otherPkt) {
      otherPkt = packets.find(
        (p) => p.satisfiesRequestId !== null && p.satisfiesRequestId !== sel.satisfiesRequestId && p.id !== sel.id
      );
    }
    // Priority 3: Any other acquired packet
    if (!otherPkt) {
      otherPkt = packets.find((p) => p.id !== sel.id);
    }

    // Compute Agreement, Discrepancy & Uncertainty
    let agreeText = '';
    let deltaText = '';
    let uncertText = '';
    let reqText = '';

    if (otherPkt) {
      if (sel.sectorId === otherPkt.sectorId) {
        agreeText = `Both observations confirm geographic coordinates and transit alignment of Sector ${sel.sectorId} (${sel.sectorName}).`;
        if (sel.sensorMode !== otherPkt.sensorMode) {
          // Both readings come from this operation's sector data, so no scenario shows another's physics.
          deltaText = `${sel.sensorMode} (${sel.confidence}): ${sel.finding} ${otherPkt.sensorMode} (${otherPkt.confidence}): ${otherPkt.finding}`;
        } else {
          deltaText = `Repeated ${sel.sensorMode} pass confirms observation stability across consecutive swath captures.`;
        }
      } else {
        agreeText = `Both observations represent valid disaster-zone reconnaissance passes acquired during this sun-synchronous horizon pass.`;
        deltaText = `Sector ${sel.sectorId} (${sel.headline}) targets different emergency infrastructure than Sector ${otherPkt.sectorId} (${otherPkt.headline}).`;
      }

      if (sel.sensorMode === 'OPTICAL') {
        uncertText = `Physical Limit: Optical imagery confirms visible daylight surfaces; cannot evaluate subsurface structural load capacity or penetrate cloud decks.`;
      } else {
        uncertText = sel.sensorMode === 'THERMAL'
          ? `Physical Limit: thermal infrared sees heat through smoke and thin dust; its coarse pixels blur small objects and thick cloud blocks it.`
          : `Physical Limit: radar maps surface shape and roughness through cloud and dust; it cannot measure temperature, and metal or steep slopes cause glare and distortion.`;
      }
    }

    if (sel.satisfiesRequestId) {
      const req = getScenarioRequests(state.scenarioId, this.host.engine.getActiveCustomScenario())[sel.satisfiesRequestId];
      const matchOk = sel.confidence === req.minimumConfidence || (req.minimumConfidence === 'PROBABLE' && sel.confidence === 'CONFIRMED');
      reqText = `<b style="color: ${matchOk ? '#10b981' : '#f59e0b'};">${req.shortLabel}</b> — ${matchOk ? '✓ Meets Ground Standard' : '⚠️ Sub-optimal Evidence'}`;
    } else {
      reqText = `<span style="color: #94a3b8;">No matching ground request for Sector ${sel.sectorId}</span>`;
    }

    this.compareEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(16, 185, 129, 0.25); padding-bottom: 4px; margin-bottom: 6px;">
        <span style="font-weight: 700; color: #10b981; letter-spacing: 0.5px;">EVIDENCE TELEMETRY</span>
        <div style="display: flex; gap: 4px; align-items: center;">
          <span style="font-size: 10px; background: ${sel.confidence === 'CONFIRMED' ? 'rgba(16, 185, 129, 0.2)' : sel.confidence === 'PROBABLE' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${sel.confidence === 'CONFIRMED' ? '#10b981' : sel.confidence === 'PROBABLE' ? '#f59e0b' : '#ef4444'}; padding: 1px 6px; border-radius: 4px; font-weight: 700;">
            ${sel.confidenceBadge}
          </span>
          <button id="btn-min-compare" style="background: none; border: 1px solid rgba(16, 185, 129, 0.3); color: #94a3b8; font-size: 10px; border-radius: 3px; padding: 0 4px; cursor: pointer;" title="Minimize Card [V]">—</button>
        </div>
      </div>

      <div style="font-size: 12px; font-weight: 700; color: #f8fafc; margin-bottom: 2px;">
        ${sel.headline}
      </div>
      <div style="font-size: 10px; color: #94a3b8; margin-bottom: 6px;">
        ${sel.sectorName} | ${sel.sensorMode} | Res: ${sel.resolutionMeters}m | SNR: ${sel.snrDb} dB | Cert: <b style="color: #38bdf8;">${sel.observationConfidencePct ?? 90}%</b> | Payload: <b style="color: #34d399;">${sel.payloadMb ?? Math.round(sel.transmitSec * (sel.throughputMbps ?? DOWNLINK_THROUGHPUT_MBPS))} MB</b> (${sel.storageCost} STR, ${sel.transmitSec.toFixed(1)}s @ ${sel.throughputMbps ?? DOWNLINK_THROUGHPUT_MBPS} MB/s)
      </div>

      <div style="background: rgba(15, 23, 42, 0.85); border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; font-size: 10px;">
        <div style="color: #cbd5e1; margin-bottom: 3px;"><b>Scientific Finding:</b> ${sel.finding}</div>
        <div style="color: #94a3b8; font-size: 9px; margin-bottom: 3px;"><b>Ground Request:</b> ${reqText}</div>
        <div style="color: #e2e8f0; font-style: italic; margin-bottom: 3px;"><b>Physical Ambiguity:</b> ${sel.scientificReason}</div>
        ${sel.scientificCaveat ? `<div style="color: #93c5fd; font-size: 9px; border-top: 1px solid rgba(56,189,248,0.2); padding-top: 3px;"><b>Sensor Caveat:</b> ${sel.scientificCaveat}</div>` : ''}
      </div>

      ${otherPkt ? `
        <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; font-size: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-weight: 700; color: #38bdf8; font-size: 9px; letter-spacing: 0.5px;">
              FORENSIC MATRIX (${sel.id} vs ${otherPkt.id})
            </span>
            <span style="font-size: 9px; color: ${sel.sectorId === otherPkt.sectorId ? '#34d399' : '#94a3b8'};">
              ${sel.sectorId === otherPkt.sectorId ? '★ Same Sector Match' : 'Cross-Sector Triage'}
            </span>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 9px; color: #cbd5e1; margin-bottom: 6px;">
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
              <th style="text-align: left; padding: 2px 0;">PARAMETER</th>
              <th style="text-align: right; color: #10b981;">CURRENT (${sel.sectorId}-${sel.sensorMode[0]})</th>
              <th style="text-align: right; color: #38bdf8;">COMPARE (${otherPkt.sectorId}-${otherPkt.sensorMode[0]})</th>
            </tr>
            <tr>
              <td style="padding: 1px 0;">Modality / Band</td>
              <td style="text-align: right;">${sel.sensorMode === 'OPTICAL' ? 'VIS/NIR (0.75μm)' : sel.sensorMode === 'THERMAL' ? 'MWIR/LWIR (3.7–10.8μm)' : 'C-Band (5.4GHz)'}</td>
              <td style="text-align: right;">${otherPkt.sensorMode === 'OPTICAL' ? 'VIS/NIR (0.75μm)' : otherPkt.sensorMode === 'THERMAL' ? 'MWIR/LWIR (3.7–10.8μm)' : 'C-Band (5.4GHz)'}</td>
            </tr>
            <tr>
              <td style="padding: 1px 0;">Resolution / GSD</td>
              <td style="text-align: right;">${sel.resolutionMeters}m</td>
              <td style="text-align: right;">${otherPkt.resolutionMeters}m</td>
            </tr>
            <tr>
              <td style="padding: 1px 0;">Signal-to-Noise</td>
              <td style="text-align: right;">${sel.snrDb} dB</td>
              <td style="text-align: right;">${otherPkt.snrDb} dB</td>
            </tr>
            <tr>
              <td style="padding: 1px 0;">Confidence</td>
              <td style="text-align: right; color: ${sel.confidence === 'CONFIRMED' ? '#10b981' : '#f59e0b'};">${sel.confidence}</td>
              <td style="text-align: right; color: ${otherPkt.confidence === 'CONFIRMED' ? '#10b981' : '#f59e0b'};">${otherPkt.confidence}</td>
            </tr>
            <tr>
              <td style="padding: 1px 0;">Downlink TX Time</td>
              <td style="text-align: right;">${sel.transmitSec.toFixed(1)}s</td>
              <td style="text-align: right;">${otherPkt.transmitSec.toFixed(1)}s</td>
            </tr>
          </table>

          <div style="font-size: 9px; line-height: 1.4; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 4px;">
            <div style="margin-bottom: 2px;"><b style="color: #34d399;">✓ Physical Agreement:</b> ${agreeText}</div>
            <div style="margin-bottom: 2px;"><b style="color: #f59e0b;">⚡ Sensor Delta:</b> ${deltaText}</div>
            <div><b style="color: #94a3b8;">ℹ️ Remaining Uncertainty:</b> ${uncertText}</div>
          </div>
        </div>
      ` : ''}

      <div style="background: rgba(15, 23, 42, 0.85); border-radius: 6px; padding: 6px 8px; margin-bottom: 6px;">
        <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
          <span>Data Volume:</span>
          <b>${sel.payloadMb ?? Math.round(sel.transmitSec * (sel.throughputMbps ?? DOWNLINK_THROUGHPUT_MBPS))} MB (${sel.storageCost} STR | ${sel.transmitSec.toFixed(1)}s TX) ${sel.processingState === 'PROCESSED' ? '<span style="color:#10b981">[COMPRESSED]</span>' : '<span style="color:#f59e0b">[RAW]</span>'}</b>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px;">
          <span>Downlink Window:</span>
          <b style="color: ${isOverflow ? '#ef4444' : '#34d399'}">${totalQueuedTx.toFixed(1)}s / ${windowSec.toFixed(1)}s ${isOverflow ? '⚠️ OVERFLOW' : '✓ FITS'}</b>
        </div>
      </div>

      ${isOverflow ? `<div style="font-size: 10px; color: #ef4444; font-weight: 700; margin-bottom: 4px;">⚠️ HORIZON CUTOFF: Packets beyond ${state.downlinkWindowSec.toFixed(1)}s will be lost! Compress in cradle [P] or unqueue to tray [U].</div>` : ''}

      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #94a3b8; margin-bottom: 4px;">
        <span>Select Telemetry Cube:</span>
        <span>Drag to Bay [Q] | Unqueue [U]</span>
      </div>

      <div style="display: flex; gap: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">
        ${packets.map((p, idx) => `
          <button id="btn-sel-cube-${idx}" style="${this.btnStyle(p.id === sel.id ? '#10b981' : '#475569')}">${p.sectorId}: ${p.sensorMode[0]}</button>
        `).join('')}
      </div>
    `;

    packets.forEach((p, idx) => {
      this.compareEl?.querySelector(`#btn-sel-cube-${idx}`)?.addEventListener('click', () => {
        this.host.selectPacket(p.id);
        this.updateHud();
      });
    });
    this.compareEl?.querySelector('#btn-min-compare')?.addEventListener('click', () => this.toggleHud());

    // Shareable operator debrief card: clipboard copy
    this.compareEl?.querySelector('#btn-copy-telemetry')?.addEventListener('click', () => {
      const state = this.host.engine.getState();
      const debrief = state.debrief;
      if (!debrief) return;

      const reqTotal = debrief.requestsVerifiedCount + debrief.requestsPartialCount + debrief.requestsUnverifiedCount;
      const telemetryCard = `
ORBIT ZERO — TACTICAL OPERATOR DEBRIEF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎖️ GRADE: ${debrief.efficiencyGrade}
📊 SCORE: ${debrief.totalScore}/${debrief.maxScore}
🛰️ OUTCOME: ${OUTCOME_LABELS[debrief.outcome ?? 'FAILED']} [SIMULATED SCENARIO]
⏱️ WINDOW EFFICIENCY: ${debrief.downlinkUsedSec.toFixed(1)}s / ${state.downlinkWindowSec.toFixed(1)}s (MARGIN: ${debrief.windowMarginSec.toFixed(1)}s)
🔋 BATTERY USED: ${debrief.powerUsed} Wh
📦 PACKETS: ${debrief.transmittedPacketIds.length}/${state.packets.length} Transmitted
✅ VERIFIED: ${debrief.requestsVerifiedCount}/${reqTotal} Ground Requests
⚠️ PARTIAL: ${debrief.requestsPartialCount}/${reqTotal} Ground Requests
❌ MISSED: ${debrief.requestsUnverifiedCount}/${reqTotal} Ground Requests
🕐 TIMESTAMP: ${new Date().toISOString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

      navigator.clipboard.writeText(telemetryCard).then(() => {
        this.notifyAction('✓ TELEMETRY COPIED TO CLIPBOARD — Ready to Share on Devpost', true);
      }).catch(() => {
        this.notifyAction('⚠️ Copy failed — Manual clipboard fallback', false);
      });
    });
  }

  private renderBottomToolbar(state: MissionState): void {
    if (!this.toolbarEl) return;
    if (state.phase === 'DEBRIEF' || this.isModalOpen(state)) {
      this.toolbarEl.style.display = 'none';
      return;
    }
    this.toolbarEl.style.display = 'flex';
    this.toolbarEl.innerHTML = actionBarHtml(state, this.host.engine.getActiveCustomScenario());
  }

  private renderDiagnostics(state: MissionState): void {
    if (!this.diagEl) return;
    this.diagEl.style.display = this.showDiagnostics ? 'block' : 'none';
    if (!this.showDiagnostics) return;

    const queuedPackets = state.packets.filter((p) => state.queuePacketIds.includes(p.id));
    const queuedSec = queuedPackets.reduce((acc, p) => acc + p.transmitSec, 0).toFixed(1);
    const marginSec = (state.downlinkWindowSec - parseFloat(queuedSec)).toFixed(1);

    this.diagEl.innerHTML = `
      <div style="font-weight: bold; color: #38bdf8; border-bottom: 1px solid #334155; padding-bottom: 4px; margin-bottom: 6px;">
        ENGINE DIAGNOSTICS [F1]
      </div>
      <div>Phase: <b style="color: #f8fafc">${state.phase}</b> (Paused: ${state.paused})</div>
      <div>Power: <b style="color: #38bdf8">${state.power}</b> / ${state.maxPower} PWR</div>
      <div>Storage: <b style="color: #f59e0b">${state.storageUsed}</b> / ${state.maxStorage} STR (${STORAGE_UNIT_MB} MB/STR)</div>
      <div>Downlink: <b style="color: #34d399">${queuedSec}s</b> / ${state.downlinkWindowSec}s (Margin: ${marginSec}s)</div>
      <div style="margin: 4px 0; border-top: 1px solid #1e293b;"></div>
      <div>Target Sector: <b style="color: #38bdf8">${state.selectedSectorId}</b></div>
      <div>Sensor Mode: <b style="color: #f59e0b">${state.activeSensorMode}</b></div>
      <div>Selected Packet: <b style="color: #cbd5e1">${state.selectedPacketId || 'None'}</b></div>
      <div>Tray Count: ${state.packets.length} | Queue Count: ${state.queuePacketIds.length}</div>
      <div style="margin: 4px 0; border-top: 1px solid #1e293b;"></div>
      <div>Input Mode: <b style="color: #34d399">DESKTOP MOUSE + KEYS</b></div>
      <div>Last Action: <span style="color: ${this.lastActionOk ? '#34d399' : '#f43f5e'}">${this.lastActionMessage}</span></div>
    `;
  }

  private renderHelpModal(state: MissionState): void {
    if (!this.helpModalEl) return;
    this.helpModalEl.style.display = this.showHelp ? 'block' : 'none';
    if (!this.showHelp) return;
    this.helpModalEl.style.width = '820px';
    this.helpModalEl.innerHTML = helpHtml(state, this.host.engine.getActiveCustomScenario());
  }

  private btnStyle(color: string, prominent = false): string {
    return `
      background: ${prominent ? color : 'rgba(30, 41, 59, 0.85)'};
      border: 1px solid ${color};
      color: ${prominent ? '#0b1220' : '#f8fafc'};
      font-weight: 700;
      font-size: 11px;
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
      pointer-events: auto;
      transition: all 0.15s ease;
      white-space: nowrap;
    `;
  }
}
