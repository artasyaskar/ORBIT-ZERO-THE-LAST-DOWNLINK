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

import {
  Camera,
  Object3D,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  VisibilityState,
  type WebGLRenderer,
  type World,
} from '@iwsdk/core';
import type { MissionEngine } from '../mission/missionEngine';
import type { MissionState, SectorId, SensorMode } from '../mission/types';
import { GROUND_REQUESTS, MISSION_SCENARIOS, SECTORS } from '../mission/missionConfig';

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
  highlightDropZones?: (active: boolean) => void;
  setObjectTint?: (root: Object3D, hex: number, intensity: number) => void;
  rotateGlobe?: (deltaYaw: number, deltaPitch: number) => void;
  zoomGlobe?: (deltaZoom: number) => void;
  syncAll?: () => void;
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

const PROCESS_CRADLE_POS = new Vector3(0.24, 0.79, -0.55);
const DOWNLINK_BAY_CENTER = new Vector3(0.39, 0.79, -0.46);
const RAW_TRAY_CENTER = new Vector3(-0.37, 0.79, -0.43);
const DISCARD_CHUTE_POS = new Vector3(0.49, 0.79, -0.58);
const DOWNLINK_SLOT_POSITIONS: Vector3[] = [
  new Vector3(0.29, 0.79, -0.46),
  new Vector3(0.39, 0.79, -0.46),
  new Vector3(0.49, 0.79, -0.46),
];

export class DesktopControlsManager {
  private host: DesktopControllerHost;
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
  private toastTimer = 0;
  private tutorialStep: TutorialStep = 'INTRO';
  private tutorialActive = true;
  private showDiagnostics = false;
  private showHelp = false;
  private hudMinimized = false;
  private lastActionMessage = 'System Ready';
  private lastActionOk = true;
  private cleanupCallbacks: (() => void)[] = [];

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

  // Phase 1: 3D Gimbal Globe Interactive Rotation & Focal Zoom
  private isGlobeDragging = false;
  private globeDragCandidate?: {
    pointerDownPos: Vector2;
    lastPos: Vector2;
    hitObject: Object3D;
    hitPoint?: Vector3;
  };

  constructor(host: DesktopControllerHost) {
    this.host = host;
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
    const onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomDelta = e.deltaY * 0.0006;
      this.host.zoomGlobe?.(zoomDelta);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    this.cleanupCallbacks.push(() => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('wheel', onWheel);
      this.containerEl?.remove();
    });

    // 3. Subscribe to XR visibility state: auto-hide DOM overlay when entering immersive XR
    const unsubVisibility = this.host.world.visibilityState.subscribe((vis) => {
      const isDesktop = vis === VisibilityState.NonImmersive && !this.host.world.renderer.xr.isPresenting;
      if (this.containerEl) {
        this.containerEl.style.display = isDesktop ? 'block' : 'none';
      }
    });
    this.cleanupCallbacks.push(unsubVisibility);

    // Initial sync
    this.updateHud();
  }

  public dispose(): void {
    for (const cleanup of this.cleanupCallbacks) {
      cleanup();
    }
    this.cleanupCallbacks = [];
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
        const cfg = SECTORS[secId];
        return `🎯 Target Sector ${secId}: ${cfg?.name || 'Sector'} [Click to Lock]`;
      }
      if (name === 'earth-globe' || name === 'TacticalEarthGlobe' || name === 'GlobeCoreSphere' || name === 'GlobeCloudSphere') {
        return `🌍 Tactical Earth Globe [Drag to Rotate | Wheel to Zoom | Click to Target]`;
      }
      if (/scanner-tool/i.test(name) || /ScannerTool/i.test(name)) {
        return `📡 3U CubeSat Swath Sensor [Click to Fire Active Scan]`;
      }
      if (/pad-toggle-sensor/i.test(name)) {
        const mode = state.activeSensorMode;
        return `🔄 Sensor Mode Switch: Armed with ${mode} [Click to Toggle]`;
      }
      if (/pad-process-cradle/i.test(name) || /ProcessingCradle/i.test(name)) {
        return `⚙️ Processing Cradle: Feature Extraction & Compression (6 Wh) [Click to Process]`;
      }
      if (/pad-queue-downlink/i.test(name) || /DownlinkBay/i.test(name)) {
        return `📥 Downlink Bay Tray: Stage Active Cube for Telemetry [Click to Queue]`;
      }
      if (/pad-commit-downlink/i.test(name)) {
        return `🚀 S-Band Telemetry Transmitter [Click to Downlink to Ground]`;
      }
      const cubeMatch = name.match(/evidence-cube-([1-3])/i);
      if (cubeMatch) {
        const idx = parseInt(cubeMatch[1], 10) - 1;
        const pkt = state.packets[idx];
        return pkt ? `📦 Evidence Cube ${idx + 1}: ${pkt.headline} [Click to Inspect]` : null;
      }
      curr = curr.parent;
    }
    return null;
  }

  private findCubeRoot(obj: Object3D): Object3D | null {
    let curr: Object3D | null = obj;
    while (curr) {
      if (/evidence-cube-([1-3])/i.test(curr.name || '')) {
        return curr;
      }
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
        /^pad-/i.test(name) ||
        /^ProcessingCradle/i.test(name) ||
        /^DownlinkBay/i.test(name) ||
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

  private handlePointerDown(e: PointerEvent): void {
    if (this.host.world.renderer.xr.isPresenting) return;
    if (e.button !== 0) return; // Only primary left-click
    this.updateMouseNdc(e);
    this.raycaster.setFromCamera(this.mouse, this.host.camera);

    const hits = this.raycaster.intersectObjects([this.host.scene], true);
    for (const hit of hits) {
      // 1. Check if hit an Evidence Cube -> initialize drag candidate
      const cubeRoot = this.findCubeRoot(hit.object);
      if (cubeRoot) {
        const cubeMatch = cubeRoot.name.match(/evidence-cube-([1-3])/i);
        if (cubeMatch) {
          const slotIdx = parseInt(cubeMatch[1], 10) - 1;
          const state = this.host.engine.getState();
          const pkt = state.packets[slotIdx];
          if (pkt) {
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
        this.isDragging = true;
        this.host.playCue('CUBE_GRAB');
        this.host.highlightDropZones?.(true);
      }

      if (this.isDragging) {
        const intersection = new Vector3();
        if (this.raycaster.ray.intersectPlane(this.dragPlane, intersection)) {
          intersection.x = Math.max(-0.62, Math.min(0.62, intersection.x));
          intersection.z = Math.max(-0.68, Math.min(-0.32, intersection.z));
          intersection.y = 0.83; // Elevated 3D hover height
          this.dragCandidate.cubeRoot.position.copy(intersection);
        }

        const state = this.host.engine.getState();
        const pkt = state.packets.find((p) => p.id === this.dragCandidate!.packetId);
        let dragZoneTooltip = `📦 Dragging Evidence Cube: ${pkt?.headline || 'Telemetry'}`;

        const distCradle = intersection.distanceTo(PROCESS_CRADLE_POS);
        const distBay = intersection.distanceTo(DOWNLINK_BAY_CENTER);
        const distTray = intersection.distanceTo(RAW_TRAY_CENTER);
        const distDiscard = intersection.distanceTo(DISCARD_CHUTE_POS);

        if (distCradle < 0.16) {
          dragZoneTooltip = pkt?.processed
            ? `ℹ️ Already Processed (Compressed to 1.8s Tx)`
            : `⚙️ Drop into Processing Cradle: Compress to 1.8s Tx (-6 Wh)`;
        } else if (distBay < 0.18) {
          dragZoneTooltip = pkt?.queued
            ? `🔄 Drop to Reposition / Reorder in Downlink Bay`
            : `📥 Drop into Downlink Bay: Stage for Ground Transmission`;
        } else if (distTray < 0.20) {
          dragZoneTooltip = pkt?.queued
            ? `📦 Drop onto Raw Storage Tray: Unqueue from Downlink Bay`
            : `📦 Stored in Raw Tray Slot`;
        } else if (distDiscard < 0.15) {
          dragZoneTooltip = `🗑️ Drop into Discard Chute: Purge Packet & Free Storage`;
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
      // 1b. Phase 1 Globe Drag Rotation Mode
      const moveDist = Math.hypot(
        e.clientX - this.globeDragCandidate.pointerDownPos.x,
        e.clientY - this.globeDragCandidate.pointerDownPos.y,
      );
      if (moveDist >= 4) {
        this.isGlobeDragging = true;
        const deltaX = e.clientX - this.globeDragCandidate.lastPos.x;
        const deltaY = e.clientY - this.globeDragCandidate.lastPos.y;
        this.globeDragCandidate.lastPos.set(e.clientX, e.clientY);
        this.host.rotateGlobe?.(deltaX * 0.0055, deltaY * 0.0055);
        this.host.renderer.domElement.style.cursor = 'grabbing';
        return;
      }
    }

    // 2. Normal Hover Inspection & 3D Highlighting
    const hits = this.raycaster.intersectObjects([this.host.scene], true);
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

    if (this.isDragging && this.dragCandidate) {
      this.isDragging = false;
      this.host.highlightDropZones?.(false);
      const cubeRoot = this.dragCandidate.cubeRoot;
      const targetPos = cubeRoot.position;
      const pktId = this.dragCandidate.packetId;
      const state = this.host.engine.getState();
      const pkt = state.packets.find((p) => p.id === pktId);

      const distCradle = targetPos.distanceTo(PROCESS_CRADLE_POS);
      const distBay = targetPos.distanceTo(DOWNLINK_BAY_CENTER);
      const distTray = targetPos.distanceTo(RAW_TRAY_CENTER);
      const distDiscard = targetPos.distanceTo(DISCARD_CHUTE_POS);

      let handled = false;

      // 1. Drop in Processing Cradle
      if (distCradle < 0.16) {
        handled = true;
        if (pkt && !pkt.processed) {
          this.host.processSelected(pkt.id);
          const nextState = this.host.engine.getState();
          if (nextState.lastActionOk) {
            this.notifyAction(`✓ CRADLE COMPRESSION: ${pkt.headline} reduced to 1.8s Tx (-6 Wh)`, true);
            this.advanceTutorial('QUEUE_BAY');
          } else {
            this.notifyAction(`⚠️ PROCESS REJECTED: ${nextState.lastStatusMessage}`, false);
          }
        } else {
          this.notifyAction(`ℹ️ Packet is already compressed in cradle.`, true);
          this.host.syncAll?.();
        }
      }
      // 2. Drop in Downlink Bay
      else if (distBay < 0.18) {
        handled = true;
        let closestSlotIdx = -1;
        let bestSlotDist = 0.22;
        for (let s = 0; s < DOWNLINK_SLOT_POSITIONS.length; s++) {
          const d = targetPos.distanceTo(DOWNLINK_SLOT_POSITIONS[s]);
          if (d < bestSlotDist) {
            bestSlotDist = d;
            closestSlotIdx = s;
          }
        }
        this.host.queueSelected(pktId, closestSlotIdx >= 0 ? closestSlotIdx : undefined);
        const nextState = this.host.engine.getState();
        if (nextState.lastActionOk) {
          const queued = nextState.packets.filter((p) => nextState.queuePacketIds.includes(p.id));
          const totalTx = queued.reduce((acc, p) => acc + p.transmitSec, 0).toFixed(1);
          this.notifyAction(`✓ QUEUED TO BAY: Slot occupied (${totalTx}s / ${nextState.downlinkWindowSec}s window)`, true);
          this.advanceTutorial('MULTI_TARGET');
        } else {
          this.notifyAction(`⚠️ QUEUE REJECTED: ${nextState.lastStatusMessage}`, false);
        }
      }
      // 3. Drop on Raw Storage Tray -> UNQUEUE!
      else if (distTray < 0.20) {
        handled = true;
        if (pkt && pkt.queued) {
          this.host.unqueueSelected(pkt.id);
          const nextState = this.host.engine.getState();
          if (nextState.lastActionOk) {
            this.notifyAction(`✓ UNQUEUED TO TRAY: ${pkt.headline} returned to storage tray. Freed 1 downlink slot.`, true);
          } else {
            this.notifyAction(`⚠️ UNQUEUE REJECTED: ${nextState.lastStatusMessage}`, false);
          }
        } else {
          this.notifyAction(`ℹ️ Packet is already in the Storage Tray.`, true);
          this.host.syncAll?.();
        }
      }
      // 4. Drop in Discard Chute
      else if (distDiscard < 0.15) {
        handled = true;
        this.host.discardSelected(pktId);
        const nextState = this.host.engine.getState();
        if (nextState.lastActionOk) {
          this.notifyAction(`✓ DISCARDED: Freed 1 tray storage slot`, true);
        } else {
          this.notifyAction(`⚠️ DISCARD REJECTED: ${nextState.lastStatusMessage}`, false);
        }
      }

      // 5. Invalid Drop -> return to canonical position
      if (!handled) {
        this.host.playCue('ERROR_REJECT');
        this.host.syncAll?.();
        this.notifyAction(`⚠️ Drop cancelled: Returned to slot. Drag onto Cradle, Bay, or Tray.`, false);
      }

      this.dragCandidate = undefined;
      this.updateHud();
      return;
    }

    if (this.dragCandidate && !this.isDragging) {
      // Pure click!
      const pktId = this.dragCandidate.packetId;
      const state = this.host.engine.getState();
      const pkt = state.packets.find((p) => p.id === pktId);
      if (pkt) {
        this.notifyAction(`Selected Evidence Cube: ${pkt.headline} (${pkt.storageCost} MB)`);
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
          this.notifyAction(`Selected Evidence Cube: ${pkt.headline} (${pkt.storageCost} MB)`);
          this.advanceTutorial('SELECT_CUBE');
          this.updateHud();
          return true;
        }
      }

      // 4. Scanner Tool Click -> Trigger Scan
      if (/scanner-tool/i.test(name) || /ScannerTool/i.test(name)) {
        this.scanSector();
        return true;
      }

      // 5. Console Pads & Hardware
      if (/pad-toggle-sensor/i.test(name)) {
        this.toggleSensor();
        return true;
      }
      if (/pad-process-cradle/i.test(name) || /ProcessingCradle/i.test(name)) {
        this.processPacket();
        return true;
      }
      if (/pad-queue-downlink/i.test(name) || /DownlinkBay/i.test(name)) {
        this.queuePacket();
        return true;
      }
      if (/pad-commit-downlink/i.test(name)) {
        this.commitDownlink();
        return true;
      }
      if (/pad-discard-chute/i.test(name)) {
        this.discardPacket();
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
      case 'P':
      case 'c':
      case 'C': {
        e.preventDefault();
        this.processPacket();
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
        if (this.tutorialActive && this.tutorialStep === 'INTRO') {
          this.advanceTutorial('SELECT_SECTOR');
          this.notifyAction('🚀 CRISIS PASS COMMENCED: Evaluate Target Sectors', true);
        } else {
          this.queuePacket();
        }
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
        this.restartMission();
        break;
      }
      case 'n':
      case 'N': {
        e.preventDefault();
        this.host.nextMission();
        this.notifyAction('Switched to Next Scenario Pass');
        this.updateHud();
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
      case 'H':
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
      case 'Escape': {
        e.preventDefault();
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

  public selectSector(id: SectorId): void {
    this.host.selectSector(id);
    const sector = SECTORS[id];
    this.notifyAction(`Selected Target: Sector ${id} (${sector?.name ?? id})`);
    if (this.tutorialStep === 'SELECT_SECTOR' || this.tutorialStep === 'INTRO') {
      this.advanceTutorial('SELECT_SENSOR');
    }
    this.updateHud();
  }

  public toggleSensor(): void {
    this.host.toggleSensor();
    const mode = this.host.engine.getState().activeSensorMode;
    const desc = mode === 'RADAR' ? 'MICROWAVE RADAR (SAR - Cloud Penetrating)' : 'OPTICAL CAMERA (High-Res Daylight)';
    this.notifyAction(`Sensor Mode: ${desc}`);
    if (this.tutorialStep === 'SELECT_SENSOR') {
      this.advanceTutorial('SCAN_SECTOR');
    }
    this.updateHud();
  }

  public scanSector(): void {
    this.host.scan();
    const state = this.host.engine.getState();
    if (state.lastActionOk) {
      const lastPkt = state.packets[state.packets.length - 1];
      if (lastPkt) {
        this.notifyAction(`✓ SCAN COMPLETE: ${lastPkt.headline} (${lastPkt.storageCost} MB | ${lastPkt.confidence})`, true);
      }
      this.advanceTutorial('SELECT_CUBE');
    } else {
      this.notifyAction(`⚠️ SCAN FAILED: ${state.lastStatusMessage}`, false);
    }
    this.updateHud();
  }

  public processPacket(): void {
    this.host.processSelected();
    const state = this.host.engine.getState();
    if (state.lastActionOk) {
      const sel = state.packets.find((p) => p.id === state.selectedPacketId);
      this.notifyAction(`✓ CRADLE COMPRESSION: ${sel?.headline} reduced to ${sel?.storageCost} MB (Saved TX time!)`, true);
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
    this.host.queueSelected();
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
    this.host.discardSelected();
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
    if (state.phase === 'OPERATIONS') {
      if (state.queuePacketIds.length === 0) {
        this.notifyAction('⚠️ DOWNLINK BLOCKED: Downlink Bay is empty! Queue at least 1 evidence packet [Q].', false);
        return;
      }
      this.host.commitDownlink();
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
    this.notifyAction('Mission Pass Restarted');
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

  public toggleHelpModal(): void {
    this.showHelp = !this.showHelp;
    this.updateHud();
  }

  public toggleHud(): void {
    this.hudMinimized = !this.hudMinimized;
    this.notifyAction(this.hudMinimized ? 'HUD Minimized — Panoramic 3D Space View' : 'HUD Expanded — Telemetry Active');
    this.updateHud();
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

    // 1. Top Tutorial & Mission Objective Banner
    this.bannerEl = document.createElement('div');
    this.bannerEl.id = 'orbit-zero-hud-banner';
    this.bannerEl.style.cssText = `
      position: absolute;
      top: 14px; left: 50%;
      transform: translateX(-50%);
      background: rgba(8, 14, 26, 0.78);
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
    `;
    this.containerEl.appendChild(this.bannerEl);

    // 2. Action Toast Notification Pill
    this.toastEl = document.createElement('div');
    this.toastEl.id = 'orbit-zero-hud-action';
    this.toastEl.style.cssText = `
      position: absolute;
      bottom: 84px; left: 50%;
      transform: translate(-50%, 12px);
      background: rgba(6, 78, 59, 0.92);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid #34d399;
      color: #f8fafc;
      padding: 8px 18px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.3px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
      opacity: 0;
      transition: opacity 0.25s ease, transform 0.25s ease;
      pointer-events: none;
      z-index: 10000;
    `;
    this.toastEl.innerText = 'Desktop Operator Mode Initialized';
    this.containerEl.appendChild(this.toastEl);

    // 3. Bottom Desktop Controls Toolbar
    this.toolbarEl = document.createElement('div');
    this.toolbarEl.id = 'orbit-zero-bottom-toolbar';
    this.toolbarEl.style.cssText = `
      position: absolute;
      bottom: 14px; left: 50%;
      transform: translateX(-50%);
      background: rgba(8, 14, 26, 0.82);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(56, 189, 248, 0.3);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7), 0 0 16px rgba(56, 189, 248, 0.1);
      border-radius: 12px;
      padding: 8px 14px;
      display: flex;
      gap: 8px;
      align-items: center;
      pointer-events: auto;
      z-index: 9999;
    `;
    this.containerEl.appendChild(this.toolbarEl);

    // 3b. Left Tactical Reconnaissance HUD (Live Sector Sensor Feasibility)
    this.reconEl = document.createElement('div');
    this.reconEl.id = 'orbit-zero-recon-card';
    this.reconEl.style.cssText = `
      position: absolute;
      top: 92px; left: 16px;
      width: 285px;
      max-width: 27vw;
      background: rgba(8, 14, 26, 0.75);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(56, 189, 248, 0.28);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), inset 0 0 16px rgba(56, 189, 248, 0.04);
      border-radius: 10px;
      padding: 10px 14px;
      color: #cbd5e1;
      font-size: 11px;
      line-height: 1.45;
      pointer-events: auto;
      max-height: calc(100vh - 180px);
      overflow-y: auto;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 9998;
    `;
    this.containerEl.appendChild(this.reconEl);

    // 3c. Right Evidence Comparison & Knapsack Downlink HUD
    this.compareEl = document.createElement('div');
    this.compareEl.id = 'orbit-zero-compare-card';
    this.compareEl.style.cssText = `
      position: absolute;
      top: 92px; right: 16px;
      width: 295px;
      max-width: 28vw;
      background: rgba(8, 14, 26, 0.75);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(16, 185, 129, 0.28);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), inset 0 0 16px rgba(16, 185, 129, 0.04);
      border-radius: 10px;
      padding: 10px 14px;
      color: #cbd5e1;
      font-size: 11px;
      line-height: 1.45;
      pointer-events: auto;
      max-height: calc(100vh - 180px);
      overflow-y: auto;
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

    document.body.appendChild(this.containerEl);
  }

  // ==========================================================================
  // HUD Update & Render Loop
  // ==========================================================================

  public updateHud(): void {
    if (!this.bannerEl || !this.toolbarEl) return;
    const state = this.host.engine.getState();

    // 1. Render Top Banner (Tutorial or Mission Status)
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

  private renderTopBanner(state: MissionState): void {
    if (!this.bannerEl) return;

    if (state.phase === 'DEBRIEF') {
      const debrief = state.debrief!;
      this.bannerEl.innerHTML = `
        <div style="font-size: 11px; color: #38bdf8; font-weight: 700; letter-spacing: 1px; margin-bottom: 2px;">
          MISSION AFTER-ACTION REVIEW (AAR) — GROUND OUTCOMES
        </div>
        <div style="font-size: 17px; font-weight: 700; color: #34d399; margin-bottom: 4px;">
          GRADE ${debrief.efficiencyGrade} — ${debrief.totalScore}/${debrief.maxScore} POINTS EARNED
        </div>
        <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 8px;">
          ${debrief.summaryHeadline}
        </div>
        <div style="display: flex; justify-content: center; gap: 10px;">
          <button id="btn-aar-restart" style="${this.btnStyle('#38bdf8')}">RESTART PASS [R]</button>
          <button id="btn-aar-next" style="${this.btnStyle('#34d399')}">NEXT PASS [N]</button>
        </div>
      `;
      this.bannerEl.querySelector('#btn-aar-restart')?.addEventListener('click', () => this.restartMission());
      this.bannerEl.querySelector('#btn-aar-next')?.addEventListener('click', () => {
        this.host.nextMission();
        this.updateHud();
      });
      return;
    }

    if (state.phase === 'DOWNLINK') {
      const elapsed = state.downlinkElapsedSec.toFixed(1);
      const total = state.downlinkWindowSec.toFixed(1);
      const remaining = Math.max(0, state.downlinkWindowSec - state.downlinkElapsedSec).toFixed(1);
      const progress = Math.min(100, (state.downlinkElapsedSec / state.downlinkWindowSec) * 100).toFixed(0);
      const activePkt = state.packets.find((p) => p.id === state.activeDownlinkPacketId);
      this.bannerEl.innerHTML = `
        <div style="font-size: 11px; color: #34d399; font-weight: 700; letter-spacing: 1px;">
          S-BAND DOWNLINK ACTIVE — KARACHI GROUND STATION CONTACT
        </div>
        <div style="font-size: 16px; font-weight: 700; margin: 4px 0;">
          HORIZON CONTACT: ${elapsed}s / ${total}s (${progress}%) | LOS IN: ${remaining}s
        </div>
        <div style="font-size: 12px; color: #cbd5e1;">
          ${activePkt ? `📡 Streaming: <b style="color: #38bdf8;">${activePkt.sectorCode}: ${activePkt.headline}</b> (${activePkt.storageCost} MB, ${activePkt.transmitSec.toFixed(1)}s)` : 'Acquiring next queued packet...'}
        </div>
      `;
      return;
    }

    const scenarioTitle = MISSION_SCENARIOS[state.scenarioId]?.name ?? state.scenarioId;

    // OPERATIONS Phase: Guided Tactical Onboarding vs Operator Mode
    if (this.tutorialActive) {
      let stepBadge = 'INVESTIGATE';
      let title = 'EVALUATE SECTORS (INDUS BASIN & LEVEE NETWORK)';
      let prompt = 'Convoys approaching Sector B. Notice the 95% storm clouds. Optical cannot see through clouds; Active Radar (SAR) pierces storm cover.';
      let tip = 'Click Sector B on the globe or press [2].';

      switch (this.tutorialStep) {
        case 'INTRO':
          stepBadge = 'CRISIS BRIEFING';
          title = 'INDUS RIVER BASIN: LEVEE BREACH';
          prompt = 'A Category 4 Monsoon supercell has breached river levees in Sindh. 120,000 residents are trapped by rising waters. Ground rescue teams require verified orbital evidence before the 10.0s contact window closes.';
          tip = 'Press [Enter] or click COMMENCE CRISIS PASS to begin.';
          break;
        case 'SELECT_SECTOR':
          stepBadge = 'STEP 1: TRIAGE EVALUATION';
          title = 'EVALUATE SECTORS (INDUS BASIN & LEVEE NETWORK)';
          prompt = 'Evacuation convoys need route clearance at Sector B (East Levee) and Sector C (Bridge Crossing). Examine the Tactical Reconnaissance Card: notice 95% storm clouds over Sector B versus clear skies over Sector C. Which priority will you evaluate first?';
          tip = 'Click Sector B [2] or Sector C [3] on the globe.';
          break;
        case 'SELECT_SENSOR':
          stepBadge = 'STEP 2: SENSOR TRADE-OFF';
          title = 'SOLVE SENSOR DILEMMA: CLOUD PENETRATION';
          prompt = 'Dense convective nimbus clouds (τ > 15) extinguish optical photons (SNR < 0 dB — Complete Droplet Washout, 8 Wh). Active Microwave Radar (SAR, 14 Wh) pierces clouds with C-band pulses (5.4 GHz) to detect specular floodwaters. Balance your 40 Wh battery reserve against cloud penetration.';
          tip = 'Switch sensor mode to RADAR [M] or click the sensor button.';
          break;
        case 'SCAN_SECTOR':
          stepBadge = 'STEP 3: ACQUIRE RECONNAISSANCE';
          title = 'FIRE SATELLITE SWATH';
          prompt = 'Target armed. Fire active sensor swath (costs 14 Wh). Radar beam pierces storm cover, returning backscatter data and materializing a physical telemetry cube on your tray.';
          tip = 'Press [Space] or click SCAN to fire.';
          break;
        case 'SELECT_CUBE':
          stepBadge = 'STEP 4: FORENSIC INTERPRETATION';
          title = 'EVALUATE TELEMETRY & KNAPSACK COST';
          prompt = 'Specular water boundary detected across 2.4 km of road! Raw packet is 3.0 MB (4.5s transmission — consuming 45% of your 10.0s downlink window). Compress onboard to save contact time for other sectors, or downlink raw?';
          tip = 'Click the data cube on console tray or press [1].';
          break;
        case 'PROCESS_CRADLE':
          stepBadge = 'STEP 5: ONBOARD FEATURE EXTRACTION';
          title = 'STRATEGIC CRADLE COMPRESSION';
          prompt = 'Place cube in Processing Cradle (costs 6 Wh). Onboard AI extracts flood boundaries, reducing packet from 3.0 MB to 1.0 MB (4.5s -> 1.8s TX). Notice: compression shrinks packet size while preserving original observation uncertainty.';
          tip = 'Press [P] or click Cradle to compress.';
          break;
        case 'QUEUE_BAY':
          stepBadge = 'STEP 6: DOWNLINK STAGING';
          title = 'STAGE INTO DOWNLINK BAY';
          prompt = 'Stage compressed telemetry into Downlink Bay. Slot 1 is now locked for transmission, consuming only 1.8s of the 10.0s pass.';
          tip = 'Press [Q] or click Bay to stage.';
          break;
        case 'MULTI_TARGET':
          stepBadge = 'STEP 7: MULTI-TARGET TRIAGE';
          title = 'TRIAGE REMAINING HORIZON CAPACITY';
          prompt = 'You have 8.2s of downlink capacity remaining! Investigate Sector C (Steel Truss Bridge) under clear skies. Compare whether high-res Optical (8 Wh) or Radar (14 Wh) delivers clearer structural clearance evidence to ground engineers.';
          tip = 'Select Sector C [3], evaluate weather, and triage.';
          break;
      }

      this.bannerEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <span style="font-size: 10px; color: #38bdf8; font-weight: 700; letter-spacing: 1px; background: rgba(56, 189, 248, 0.15); padding: 2px 6px; border-radius: 4px;">${stepBadge}</span>
          <span style="font-size: 11px; color: #94a3b8;">${scenarioTitle}</span>
          <button id="btn-skip-tut" style="background: none; border: none; color: #94a3b8; font-size: 11px; cursor: pointer; text-decoration: underline; pointer-events: auto;">Skip Guide [Esc]</button>
        </div>
        <div style="font-size: 15px; font-weight: 700; color: #f8fafc; margin-bottom: 3px;">${title}</div>
        <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 4px;">${prompt}</div>
        <div style="font-size: 11px; color: #f59e0b; font-style: italic;">Tactical Note: ${tip}</div>
        ${this.tutorialStep === 'INTRO' ? `
          <div style="margin-top: 6px;">
            <button id="btn-commence-pass" style="${this.btnStyle('#38bdf8', true)}">COMMENCE CRISIS PASS [Enter / Click]</button>
          </div>
        ` : ''}
      `;
      this.bannerEl.querySelector('#btn-skip-tut')?.addEventListener('click', () => this.skipTutorial());
      this.bannerEl.querySelector('#btn-commence-pass')?.addEventListener('click', () => {
        this.advanceTutorial('SELECT_SECTOR');
        this.notifyAction('🚀 CRISIS PASS COMMENCED: Evaluate Target Sectors', true);
        this.updateHud();
      });
    } else {
      // Free Operator Mode Banner
      this.bannerEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <span style="font-size: 11px; color: #38bdf8; font-weight: 700;">${scenarioTitle}</span>
          <span style="font-size: 11px; color: #cbd5e1;">PWR: <b style="color: #38bdf8">${state.power}</b>/${state.maxPower} | STORAGE: <b style="color: #f59e0b">${state.storageUsed}</b>/${state.maxStorage} MB | WINDOW: <b style="color: #34d399">${state.downlinkWindowSec}s</b></span>
          <button id="btn-replay-tut" style="background: none; border: none; color: #94a3b8; font-size: 11px; cursor: pointer; text-decoration: underline; pointer-events: auto;">Replay Guide</button>
        </div>
        <div style="font-size: 11px; color: #94a3b8;">
          CONSOLE TRIAGE: Drag cube to <b style="color: #38bdf8;">Cradle</b> to compress [P] | Drag to <b style="color: #34d399;">Bay</b> to stage [Q] | Drag to <b style="color: #f59e0b;">Tray</b> or press [U] to unqueue!
        </div>
      `;
      this.bannerEl.querySelector('#btn-replay-tut')?.addEventListener('click', () => this.replayTutorial());
    }
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

    const sector = SECTORS[state.selectedSectorId];
    if (!sector) return;
    const isStorm = sector.cloudCover === 'DENSE_STORM';
    const activeSensor = state.activeSensorMode;
    const cost = activeSensor === 'OPTICAL' ? 8 : 14;

    if (this.hudMinimized) {
      this.reconEl.style.maxHeight = '42px';
      this.reconEl.style.overflow = 'hidden';
      this.reconEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; height: 22px;" id="btn-toggle-hud-recon">
          <span style="font-weight: 700; color: #38bdf8; font-size: 11px;">📡 ${sector.code} [${isStorm ? '95% STORM' : 'CLEAR'}]</span>
          <span style="font-size: 9px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-weight: 700;">+ EXPAND [V]</span>
        </div>
      `;
      this.reconEl.querySelector('#btn-toggle-hud-recon')?.addEventListener('click', () => this.toggleHud());
      return;
    }

    this.reconEl.style.maxHeight = 'calc(100vh - 180px)';
    this.reconEl.style.overflowY = 'auto';

    // Optical atmospheric profile
    const opticalAlbedo = isStorm ? '88% (Convective Nimbus) [Scenario Calibration]' : '< 5% (Clear Atmosphere)';
    const opticalTau = isStorm ? 'τ > 15 (Droplet Mie Scattering Washout)' : 'τ ≈ 0.02 (Direct Solar Illumination)';
    const opticalTrans = isStorm ? 'T = e^(-τ) < 0.001% — Complete Mie Extinction' : 'T = e^(-τ) ≈ 98.02% — High Direct Surface Reflectance';

    // Active microwave SAR profile
    let radarPhenomenology = '';
    if (sector.id === 'B') {
      radarPhenomenology = 'Specular water forward-scatter (σ⁰ < -22 dB [Scenario Calibration]) — dark tone reveals 2.4 km inundated road through clouds (Depth unmeasured by SAR amplitude)';
    } else if (sector.id === 'C') {
      radarPhenomenology = 'Dihedral corner multipath glare on steel truss (σ⁰ > +18.5 dB flare [Scenario Calibration] masks deck water state)';
    } else if (sector.id === 'E') {
      radarPhenomenology = 'Elevated corridor above floodline; steep orographic slope causes geometric layover and foreshortening near Km 4';
    } else if (sector.id === 'A') {
      radarPhenomenology = 'Low-backscatter specular reflection from calm reservoir impoundment';
    } else if (sector.id === 'D') {
      radarPhenomenology = 'Turbulent wave Bragg scattering over submerged broken masonry piers';
    } else {
      radarPhenomenology = 'Inundated vegetation corner backscatter across southern agricultural polders';
    }

    this.reconEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(56, 189, 248, 0.25); padding-bottom: 4px; margin-bottom: 6px;">
        <span style="font-weight: 700; color: #38bdf8; letter-spacing: 0.5px;">TACTICAL RECONNAISSANCE</span>
        <div style="display: flex; gap: 4px; align-items: center;">
          <span style="font-size: 9px; background: ${isStorm ? 'rgba(245, 158, 11, 0.2)' : 'rgba(56, 189, 248, 0.2)'}; color: ${isStorm ? '#f59e0b' : '#38bdf8'}; padding: 1px 5px; border-radius: 4px; font-weight: 700;">
            ${isStorm ? '95% CONVECTIVE STORM' : 'CLEAR SKY SLOT'}
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
          <span style="color: #94a3b8;">Cloud Top Albedo:</span>
          <b style="color: ${isStorm ? '#f59e0b' : '#38bdf8'};">${opticalAlbedo}</b>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
          <span style="color: #94a3b8;">Optical Depth (τ):</span>
          <b style="color: ${isStorm ? '#ef4444' : '#10b981'};">${opticalTau}</b>
        </div>
        <div style="font-size: 10px; color: ${isStorm ? '#ef4444' : '#cbd5e1'}; font-style: italic;">
          ${opticalTrans}
        </div>
      </div>

      <!-- Domain 2: Surface Microwave Profile (Radar) -->
      <div style="background: rgba(15, 23, 42, 0.85); border-left: 3px solid #f59e0b; border-radius: 0 6px 6px 0; padding: 6px 8px; margin-bottom: 6px;">
        <div style="font-size: 9px; font-weight: 700; color: #f59e0b; letter-spacing: 0.5px; margin-bottom: 3px;">
          MICROWAVE BACKSCATTER (ACTIVE SAR: 5.4 GHz / 5.5 cm):
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
          <span style="color: #94a3b8;">Atmospheric Transmission:</span>
          <b style="color: #10b981;">> 98% (Minimal droplet attenuation; rain cores scatter [Scenario Calibration])</b>
        </div>
        <div style="font-size: 10px; color: #cbd5e1; margin-top: 2px;">
          <span style="color: #94a3b8;">Surface Response:</span> ${radarPhenomenology}
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
              <span style="color: #34d399;">${p.storageCost} MB (${p.transmitSec.toFixed(1)}s TX) [${p.confidence}]</span>
            </div>
          `).join('')}
        </div>

        ${dropPackets.length > 0 ? `
          <div style="background: rgba(15, 23, 42, 0.85); border-left: 3px solid #ef4444; border-radius: 0 6px 6px 0; padding: 6px 8px; margin-bottom: 6px; font-size: 10px;">
            <div style="font-weight: 700; color: #ef4444; margin-bottom: 2px;">DROPPED (HORIZON CUTOFF) (${dropPackets.length}):</div>
            ${dropPackets.map((p) => `
              <div style="color: #ef4444; font-size: 9px;">❌ Sector ${p.sectorId}: Exceeded 10.0s window cutoff!</div>
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
          if (sel.sectorId === 'B') {
            deltaText = `Optical is completely blocked by convective cloud deck (τ > 15, SNR 4.1 dB); active C-band SAR pierces clouds to identify 2.4 km smooth water specular forward-scatter across the highway (flood depth unmeasured by amplitude alone).`;
          } else if (sel.sectorId === 'C') {
            deltaText = `Optical achieves 0.75m daylight surface contrast verifying dry deck asphalt; active SAR encounters +18.5 dB metallic dihedral glare leaving road deck flood status ambiguous.`;
          } else {
            deltaText = `${sel.sensorMode} (${sel.confidence}) delivers surface-specific phenomenology contrasting with ${otherPkt.sensorMode} (${otherPkt.confidence}).`;
          }
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
        uncertText = `Physical Limit: SAR single-pass amplitude identifies smooth water sheets and dihedral corner reflectors; cannot measure floodwater depth without in-situ ground validation.`;
      }
    }

    if (sel.satisfiesRequestId) {
      const req = GROUND_REQUESTS[sel.satisfiesRequestId];
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
        ${sel.sectorName} | ${sel.sensorMode} | Res: ${sel.resolutionMeters}m | SNR: ${sel.snrDb} dB [Signal-to-Noise Ratio]
      </div>

      <div style="background: rgba(15, 23, 42, 0.85); border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; font-size: 10px;">
        <div style="color: #cbd5e1; margin-bottom: 3px;"><b>Scientific Finding:</b> ${sel.finding}</div>
        <div style="color: #94a3b8; font-size: 9px; margin-bottom: 3px;"><b>Ground Request:</b> ${reqText}</div>
        <div style="color: #e2e8f0; font-style: italic;"><b>Physical Ambiguity:</b> ${sel.scientificReason}</div>
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
              <td style="text-align: right;">${sel.sensorMode === 'OPTICAL' ? 'VIS/NIR (0.75μm)' : 'C-Band (5.4GHz)'}</td>
              <td style="text-align: right;">${otherPkt.sensorMode === 'OPTICAL' ? 'VIS/NIR (0.75μm)' : 'C-Band (5.4GHz)'}</td>
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
          <b>${sel.storageCost} MB (${sel.transmitSec.toFixed(1)}s TX) ${sel.processingState === 'PROCESSED' ? '<span style="color:#10b981">[COMPRESSED]</span>' : '<span style="color:#f59e0b">[RAW]</span>'}</b>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px;">
          <span>Downlink Window:</span>
          <b style="color: ${isOverflow ? '#ef4444' : '#34d399'}">${totalQueuedTx.toFixed(1)}s / ${windowSec.toFixed(1)}s ${isOverflow ? '⚠️ OVERFLOW' : '✓ FITS'}</b>
        </div>
      </div>

      ${isOverflow ? `<div style="font-size: 10px; color: #ef4444; font-weight: 700; margin-bottom: 4px;">⚠️ HORIZON CUTOFF: Packets beyond 10.0s will be lost! Compress in cradle [P] or unqueue to tray [U].</div>` : ''}

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
  }

  private renderBottomToolbar(state: MissionState): void {
    if (!this.toolbarEl) return;
    const selectedPkt = state.packets.find((p) => p.id === state.selectedPacketId);
    const hasPackets = state.packets.length > 0;
    const hasQueue = state.queuePacketIds.length > 0;
    const sensorLabel = state.activeSensorMode === 'RADAR' ? 'RADAR [M]' : 'OPTICAL [M]';
    const sensorColor = state.activeSensorMode === 'RADAR' ? '#f59e0b' : '#38bdf8';

    this.toolbarEl.innerHTML = `
      <div style="display: flex; gap: 4px; border-right: 1px solid rgba(255,255,255,0.15); padding-right: 8px;">
        <button id="tb-sec-a" style="${this.btnStyle(state.selectedSectorId === 'A' ? '#38bdf8' : '#64748b')}">A [1]</button>
        <button id="tb-sec-b" style="${this.btnStyle(state.selectedSectorId === 'B' ? '#38bdf8' : '#64748b')}">B [2]</button>
        <button id="tb-sec-c" style="${this.btnStyle(state.selectedSectorId === 'C' ? '#38bdf8' : '#64748b')}">C [3]</button>
        <button id="tb-sec-d" style="${this.btnStyle(state.selectedSectorId === 'D' ? '#38bdf8' : '#64748b')}">D [4]</button>
        <button id="tb-sec-e" style="${this.btnStyle(state.selectedSectorId === 'E' ? '#38bdf8' : '#64748b')}">E [5]</button>
      </div>

      <button id="tb-sensor" style="${this.btnStyle(sensorColor)}">${sensorLabel}</button>
      <button id="tb-scan" style="${this.btnStyle('#38bdf8', true)}">SCAN [Space]</button>

      <div style="display: flex; gap: 4px; border-left: 1px solid rgba(255,255,255,0.15); border-right: 1px solid rgba(255,255,255,0.15); padding: 0 8px;">
        <button id="tb-process" style="${this.btnStyle('#f59e0b', selectedPkt !== undefined && selectedPkt.processingState !== 'PROCESSED')}">PROCESS [P]</button>
        <button id="tb-queue" style="${this.btnStyle(selectedPkt?.queued ? '#0284c7' : '#10b981', selectedPkt !== undefined)}">${selectedPkt?.queued ? 'UNQUEUE [U]' : 'QUEUE [Q]'}</button>
        <button id="tb-discard" style="${this.btnStyle('#ef4444', hasPackets)}">DISCARD [X]</button>
      </div>

      <button id="tb-transmit" style="${this.btnStyle('#34d399', hasQueue)}">TRANSMIT [T]</button>
      <button id="tb-aria-comms" style="${this.btnStyle('#06b6d4')}">🔊 ARIA-7</button>
      <button id="tb-hud-view" style="${this.btnStyle(this.hudMinimized ? '#f59e0b' : '#38bdf8')}">${this.hudMinimized ? 'HUD [FULL]' : 'HUD [MIN]'}</button>
      <button id="tb-help" style="${this.btnStyle('#94a3b8')}">HELP [H]</button>
      <button id="tb-diag" style="${this.btnStyle('#94a3b8')}">DEV [F1]</button>
    `;

    // Bind event listeners
    this.toolbarEl.querySelector('#tb-sec-a')?.addEventListener('click', () => this.selectSector('A'));
    this.toolbarEl.querySelector('#tb-sec-b')?.addEventListener('click', () => this.selectSector('B'));
    this.toolbarEl.querySelector('#tb-sec-c')?.addEventListener('click', () => this.selectSector('C'));
    this.toolbarEl.querySelector('#tb-sec-d')?.addEventListener('click', () => this.selectSector('D'));
    this.toolbarEl.querySelector('#tb-sec-e')?.addEventListener('click', () => this.selectSector('E'));
    this.toolbarEl.querySelector('#tb-sensor')?.addEventListener('click', () => this.toggleSensor());
    this.toolbarEl.querySelector('#tb-scan')?.addEventListener('click', () => this.scanSector());
    this.toolbarEl.querySelector('#tb-process')?.addEventListener('click', () => this.processPacket());
    this.toolbarEl.querySelector('#tb-queue')?.addEventListener('click', () => this.queuePacket());
    this.toolbarEl.querySelector('#tb-discard')?.addEventListener('click', () => this.discardPacket());
    this.toolbarEl.querySelector('#tb-transmit')?.addEventListener('click', () => this.commitDownlink());
    this.toolbarEl.querySelector('#tb-aria-comms')?.addEventListener('click', () => {
      const isMuted = (window as any).__ORBIT_ZERO__?.toggleVoiceMute?.();
      this.notifyAction(isMuted ? 'Commander ARIA-7: Radio Voice MUTED (Subtitles Active)' : 'Commander ARIA-7: Radio Voice ACTIVE');
      const btn = this.toolbarEl?.querySelector('#tb-aria-comms') as HTMLButtonElement | null;
      if (btn) btn.innerText = isMuted ? '🔇 ARIA [MUTE]' : '🔊 ARIA-7';
    });
    this.toolbarEl.querySelector('#tb-hud-view')?.addEventListener('click', () => this.toggleHud());
    this.toolbarEl.querySelector('#tb-help')?.addEventListener('click', () => this.toggleHelpModal());
    this.toolbarEl.querySelector('#tb-diag')?.addEventListener('click', () => this.toggleDiagnostics());
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
      <div>Storage: <b style="color: #f59e0b">${state.storageUsed}</b> / ${state.maxStorage} MB</div>
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

  private renderHelpModal(_state: MissionState): void {
    if (!this.helpModalEl) return;
    this.helpModalEl.style.display = this.showHelp ? 'block' : 'none';
    if (!this.showHelp) return;

    this.helpModalEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 10px; margin-bottom: 14px;">
        <div style="font-size: 18px; font-weight: 700; color: #38bdf8;">ORBIT ZERO: MISSION CONTROL MANUAL</div>
        <button id="btn-close-help" style="background: none; border: 1px solid #64748b; color: #cbd5e1; border-radius: 4px; padding: 4px 8px; cursor: pointer;">Close [H]</button>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 12px; line-height: 1.6; color: #cbd5e1;">
        <div>
          <div style="font-weight: 700; color: #f8fafc; margin-bottom: 4px;">CORE STRATEGY & PHYSICS</div>
          <p style="margin: 0 0 8px 0;"><b>1. Optical vs SAR Radar:</b> Optical cameras produce high-confidence surface evidence, but are completely blocked by dense monsoon clouds. Radar (SAR) penetrates storm clouds day or night.</p>
          <p style="margin: 0 0 8px 0;"><b>2. Processing Cradle:</b> Raw radar packets take 4.5s to transmit. Processing compresses them to 1.8 MB (1.8s TX) for 6 Power, allowing multiple packets to fit into the downlink window.</p>
          <p style="margin: 0 0 8px 0;"><b>3. Horizon Window:</b> The ground station window is only 10.0s. Any packets queued beyond 10.0s will be cut off by loss of signal.</p>
        </div>

        <div>
          <div style="font-weight: 700; color: #f8fafc; margin-bottom: 4px;">KEYBOARD & MOUSE CONTROLS</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <tr><td style="color: #38bdf8; padding: 2px 0;"><b>[1] - [5]</b></td><td>Select Sector A through E</td></tr>
            <tr><td style="color: #38bdf8; padding: 2px 0;"><b>[Tab]</b></td><td>Cycle target sector</td></tr>
            <tr><td style="color: #38bdf8; padding: 2px 0;"><b>[M]</b></td><td>Toggle Sensor (Optical <-> Radar)</td></tr>
            <tr><td style="color: #38bdf8; padding: 2px 0;"><b>[Space]</b></td><td>SCAN active sector</td></tr>
            <tr><td style="color: #38bdf8; padding: 2px 0;"><b>[P]</b></td><td>PROCESS evidence in cradle</td></tr>
            <tr><td style="color: #38bdf8; padding: 2px 0;"><b>[Q] / [Enter]</b></td><td>QUEUE evidence to downlink bay</td></tr>
            <tr><td style="color: #38bdf8; padding: 2px 0;"><b>[X]</b></td><td>DISCARD unneeded evidence</td></tr>
            <tr><td style="color: #38bdf8; padding: 2px 0;"><b>[T]</b></td><td>TRANSMIT downlink queue</td></tr>
            <tr><td style="color: #38bdf8; padding: 2px 0;"><b>[R]</b></td><td>RESTART mission pass</td></tr>
            <tr><td style="color: #38bdf8; padding: 2px 0;"><b>[F1]</b></td><td>Toggle developer diagnostics</td></tr>
            <tr><td style="color: #38bdf8; padding: 2px 0;"><b>Mouse Click</b></td><td>Click any 3D sector beacon, cube, or pad!</td></tr>
          </table>
        </div>
      </div>
    `;
    this.helpModalEl.querySelector('#btn-close-help')?.addEventListener('click', () => this.toggleHelpModal());
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
