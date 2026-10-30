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
  Raycaster,
  Vector2,
  Vector3,
  VisibilityState,
  type WebGLRenderer,
  type World,
} from '@iwsdk/core';
import type { MissionEngine } from '../mission/missionEngine';
import type { MissionState, SectorId, SensorMode } from '../mission/types';
import { MISSION_SCENARIOS, SECTORS } from '../mission/missionConfig';

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
  processSelected: () => void;
  queueSelected: () => void;
  discardSelected: () => void;
  commitDownlink: () => void;
  restartMission: () => void;
  nextMission: () => void;
  togglePause: () => void;
  reorderQueue: () => void;
  playCue: (cue: string) => void;
  getSceneObject: (id: string) => Object3D | undefined;
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
  private raycaster = new Raycaster();
  private mouse = new Vector2();
  private containerEl?: HTMLDivElement;
  private bannerEl?: HTMLDivElement;
  private toolbarEl?: HTMLDivElement;
  private diagEl?: HTMLDivElement;
  private toastEl?: HTMLDivElement;
  private helpModalEl?: HTMLDivElement;
  private toastTimer = 0;
  private tutorialStep: TutorialStep = 'INTRO';
  private tutorialActive = true;
  private showDiagnostics = false;
  private showHelp = false;
  private lastActionMessage = 'System Ready';
  private lastActionOk = true;
  private cleanupCallbacks: (() => void)[] = [];

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
    const onPointerMove = (e: MouseEvent) => this.handlePointerMove(e);
    const onPointerDown = (e: MouseEvent) => this.handlePointerDown(e);
    const onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);

    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    this.cleanupCallbacks.push(() => {
      canvas.removeEventListener('mousemove', onPointerMove);
      canvas.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
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

  private handlePointerMove(e: MouseEvent): void {
    if (this.host.world.renderer.xr.isPresenting) return;
    this.updateMouseNdc(e);
    this.raycaster.setFromCamera(this.mouse, this.host.camera);

    const hits = this.raycaster.intersectObjects([this.host.scene], true);
    let interactiveHit = false;

    for (const hit of hits) {
      if (this.isInteractiveObject(hit.object)) {
        interactiveHit = true;
        break;
      }
    }

    this.host.renderer.domElement.style.cursor = interactiveHit ? 'pointer' : 'default';
  }

  private handlePointerDown(e: MouseEvent): void {
    if (this.host.world.renderer.xr.isPresenting) return;
    if (e.button !== 0) return; // Only primary left-click
    this.updateMouseNdc(e);
    this.raycaster.setFromCamera(this.mouse, this.host.camera);

    const hits = this.raycaster.intersectObjects([this.host.scene], true);
    for (const hit of hits) {
      if (this.dispatchObjectClick(hit.object, hit.point)) {
        e.preventDefault();
        break;
      }
    }
  }

  private isInteractiveObject(obj: Object3D): boolean {
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
        return true;
      }
      curr = curr.parent;
    }
    return false;
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
      if (name === 'earth-globe' || name === 'TacticalEarthGlobe') {
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
      case 'Q':
      case 'Enter': {
        e.preventDefault();
        this.queuePacket();
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
    if (this.tutorialStep === 'SELECT_SECTOR' && id === 'B') {
      this.advanceTutorial('SELECT_SENSOR');
    }
    this.updateHud();
  }

  public toggleSensor(): void {
    this.host.toggleSensor();
    const mode = this.host.engine.getState().activeSensorMode;
    const desc = mode === 'RADAR' ? 'MICROWAVE RADAR (SAR - Cloud Penetrating)' : 'OPTICAL CAMERA (High-Res Daylight)';
    this.notifyAction(`Sensor Mode: ${desc}`);
    if (this.tutorialStep === 'SELECT_SENSOR' && mode === 'RADAR') {
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
    this.host.queueSelected();
    const state = this.host.engine.getState();
    if (state.lastActionOk) {
      const queuedPackets = state.packets.filter((p) => state.queuePacketIds.includes(p.id));
      const count = queuedPackets.length;
      const totalTx = queuedPackets.reduce((acc, p) => acc + p.transmitSec, 0).toFixed(1);
      this.notifyAction(`✓ QUEUED TO BAY: Slot ${count} occupied (${totalTx}s / ${state.downlinkWindowSec}s window)`, true);
      if (this.tutorialStep === 'QUEUE_BAY') {
        this.advanceTutorial('MULTI_TARGET');
      }
    } else {
      this.notifyAction(`⚠️ QUEUE REJECTED: ${state.lastStatusMessage}`, false);
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
    this.bannerEl.style.cssText = `
      position: absolute;
      top: 14px; left: 50%;
      transform: translateX(-50%);
      background: rgba(11, 18, 32, 0.94);
      border: 1px solid #38bdf8;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65), 0 0 16px rgba(56, 189, 248, 0.25);
      border-radius: 10px;
      padding: 12px 20px;
      min-width: 520px;
      max-width: 780px;
      color: #f8fafc;
      pointer-events: none;
      text-align: center;
      transition: all 0.2s ease;
    `;
    this.containerEl.appendChild(this.bannerEl);

    // 2. Action Toast Notification Pill
    this.toastEl = document.createElement('div');
    this.toastEl.style.cssText = `
      position: absolute;
      bottom: 84px; left: 50%;
      transform: translate(-50%, 12px);
      background: rgba(6, 78, 59, 0.95);
      border: 1px solid #34d399;
      color: #f8fafc;
      padding: 8px 18px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.3px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      opacity: 0;
      transition: opacity 0.25s ease, transform 0.25s ease;
      pointer-events: none;
    `;
    this.toastEl.innerText = 'Desktop Operator Mode Initialized';
    this.containerEl.appendChild(this.toastEl);

    // 3. Bottom Desktop Controls Toolbar
    this.toolbarEl = document.createElement('div');
    this.toolbarEl.style.cssText = `
      position: absolute;
      bottom: 14px; left: 50%;
      transform: translateX(-50%);
      background: rgba(11, 18, 32, 0.94);
      border: 1px solid rgba(56, 189, 248, 0.4);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65);
      border-radius: 10px;
      padding: 8px 14px;
      display: flex;
      gap: 8px;
      align-items: center;
      pointer-events: none;
    `;
    this.containerEl.appendChild(this.toolbarEl);

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
          MISSION AFTER-ACTION REVIEW (AAR)
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
      const progress = Math.min(100, (state.downlinkElapsedSec / state.downlinkWindowSec) * 100).toFixed(0);
      this.bannerEl.innerHTML = `
        <div style="font-size: 11px; color: #34d399; font-weight: 700; letter-spacing: 1px;">
          S-BAND DOWNLINK ACTIVE — TRANSMITTING TO GROUND STATION
        </div>
        <div style="font-size: 16px; font-weight: 700; margin: 4px 0;">
          HORIZON WINDOW: ${elapsed}s / ${total}s (${progress}%)
        </div>
        <div style="font-size: 12px; color: #94a3b8;">
          Carrier frequency locked. Data packets streaming over telemetry downlink.
        </div>
      `;
      return;
    }

    const scenarioTitle = MISSION_SCENARIOS[state.scenarioId]?.name ?? state.scenarioId;

    // OPERATIONS Phase: Guided Tutorial vs Operator Mode
    if (this.tutorialActive) {
      let stepBadge = 'STEP 1 / 6';
      let title = 'SELECT TARGET SECTOR B';
      let prompt = 'Road inundation reported in Sector B. Click the Sector B beacon on the globe or press <b>[2]</b>.';
      let tip = 'Ground rescue teams require evidence of road passability.';

      switch (this.tutorialStep) {
        case 'INTRO':
          stepBadge = 'BRIEFING';
          title = 'MONSOON CRISIS: INDUS BASIN';
          prompt = 'Severe flooding has cut off communications. Three ground requests require satellite evidence before the downlink window closes.';
          tip = 'Click Sector B on the globe or press <b>[2]</b> to begin.';
          break;
        case 'SELECT_SECTOR':
          stepBadge = 'STEP 1';
          title = 'SELECT TARGET SECTOR B';
          prompt = 'Target road inundation in Sector B. Click the glowing marker on the globe or press <b>[2]</b>.';
          tip = 'Notice Sector B is covered by thick storm clouds.';
          break;
        case 'SELECT_SENSOR':
          stepBadge = 'STEP 2';
          title = 'SWITCH TO MICROWAVE RADAR (SAR)';
          prompt = 'Sector B has dense clouds! Optical cameras cannot penetrate storm clouds. Press <b>[M]</b> or click the RADAR switch.';
          tip = 'Microwave radar penetrates cloud cover day or night.';
          break;
        case 'SCAN_SECTOR':
          stepBadge = 'STEP 3';
          title = 'PERFORM ACTIVE RADAR SCAN';
          prompt = 'Fire the satellite microwave swath! Press <b>[SPACE]</b> or click the <b>SCAN</b> button. (Costs 14 Power).';
          tip = 'Watch the satellite beam scan Sector B and spawn an evidence cube.';
          break;
        case 'SELECT_CUBE':
          stepBadge = 'STEP 4';
          title = 'SELECT THE EVIDENCE CUBE';
          prompt = 'Evidence acquired! Click the blue data cube on the tray or press <b>[1]</b>.';
          tip = 'Raw packet requires 4.5s transmission! Uncompressed packets will overflow the 10.0s window!';
          break;
        case 'PROCESS_CRADLE':
          stepBadge = 'STEP 5';
          title = 'COMPRESS IN PROCESSING CRADLE';
          prompt = 'Extract features and compress the packet. Press <b>[P]</b> or click <b>PROCESS</b>. (Costs 6 Power).';
          tip = 'Compression reduces transmit duration from 4.5s to 1.8s (saves 2.7s downlink!).';
          break;
        case 'QUEUE_BAY':
          stepBadge = 'STEP 6';
          title = 'QUEUE TO DOWNLINK BAY';
          prompt = 'Data is compressed! Press <b>[Q]</b> or click <b>QUEUE</b> to stage it into Downlink Bay Slot 1.';
          tip = 'Slot 1 now scheduled for horizon transmission.';
          break;
        case 'MULTI_TARGET':
          stepBadge = 'MISSION READY';
          title = 'CONTINUE TRIAGE OR TRANSMIT';
          prompt = 'Great job! Now scan Sector C (clear sky -> Optical [M]) and Sector E (storm -> Radar), or press <b>[T]</b> to transmit now!';
          tip = 'Ensure total transmission duration does not exceed the 10.0s window.';
          break;
      }

      this.bannerEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <span style="font-size: 10px; color: #38bdf8; font-weight: 700; letter-spacing: 1px; background: rgba(56, 189, 248, 0.15); padding: 2px 6px; border-radius: 4px;">${stepBadge}</span>
          <span style="font-size: 11px; color: #94a3b8;">${scenarioTitle}</span>
          <button id="btn-skip-tut" style="background: none; border: none; color: #94a3b8; font-size: 11px; cursor: pointer; text-decoration: underline;">Skip Guide [Esc]</button>
        </div>
        <div style="font-size: 15px; font-weight: 700; color: #f8fafc; margin-bottom: 3px;">${title}</div>
        <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 4px;">${prompt}</div>
        <div style="font-size: 11px; color: #f59e0b; font-style: italic;">Tip: ${tip}</div>
      `;
      this.bannerEl.querySelector('#btn-skip-tut')?.addEventListener('click', () => this.skipTutorial());
    } else {
      // Free Operator Mode Banner
      this.bannerEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: #38bdf8; font-weight: 700;">${scenarioTitle}</span>
          <span style="font-size: 11px; color: #cbd5e1;">PWR: <b style="color: #38bdf8">${state.power}</b>/${state.maxPower} | STORAGE: <b style="color: #f59e0b">${state.storageUsed}</b>/${state.maxStorage} MB | WINDOW: <b style="color: #34d399">${state.downlinkWindowSec}s</b></span>
          <button id="btn-replay-tut" style="background: none; border: none; color: #94a3b8; font-size: 11px; cursor: pointer; text-decoration: underline;">Replay Guide</button>
        </div>
      `;
      this.bannerEl.querySelector('#btn-replay-tut')?.addEventListener('click', () => this.replayTutorial());
    }
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
        <button id="tb-queue" style="${this.btnStyle('#10b981', selectedPkt !== undefined)}">QUEUE [Q]</button>
        <button id="tb-discard" style="${this.btnStyle('#ef4444', hasPackets)}">DISCARD [X]</button>
      </div>

      <button id="tb-transmit" style="${this.btnStyle('#34d399', hasQueue)}">TRANSMIT [T]</button>
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
