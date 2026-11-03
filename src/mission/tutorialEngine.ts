/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Operation 00: Orbital Academy — Pure Deterministic 9-Step Interactive Tutorial Engine
 * (Zero Three.js / WebXR imports)
 */

import type { MissionState, SectorId, SensorMode } from './types';

export type TutorialStepId =
  | 'STEP_1_ENVIRONMENT'
  | 'STEP_2_POINT'
  | 'STEP_3_PINCH'
  | 'STEP_4_GRAB'
  | 'STEP_5_INSPECT'
  | 'STEP_6_PROCESS'
  | 'STEP_7_STAGE'
  | 'STEP_8_TRANSMIT'
  | 'STEP_9_DEBRIEF'
  | 'COMPLETED';

export interface TutorialStepSpec {
  readonly index: number;
  readonly id: Exclude<TutorialStepId, 'COMPLETED'>;
  readonly title: string;
  readonly vrInstruction: string;
  readonly desktopInstruction: string;
  readonly scientificNote: string;
  readonly ghostHandTarget:
    | 'GLOBE_GIMBAL'
    | 'SECTOR_B'
    | 'SENSOR_AND_SCAN'
    | 'EVIDENCE_CUBE'
    | 'CUBE_INSPECT'
    | 'PROCESSING_CRADLE'
    | 'DOWNLINK_BAY'
    | 'COMMIT_LEVER'
    | 'DEBRIEF_PANEL';
}

export const TUTORIAL_STEPS: readonly TutorialStepSpec[] = [
  {
    index: 1,
    id: 'STEP_1_ENVIRONMENT',
    title: 'STEP 1/9: SEATED ENVELOPE & HAND TRACKING RECOVERY',
    vrInstruction: 'Hold both hands 35-60 cm in front of your headset inside the console arc and touch the Globe Gimbal Ring. If hand tracking ever loses your pinch, bring your hand back to chest height — dropped cubes automatically snap back to their tray slot.',
    desktopInstruction: 'Drag the 3D Earth Globe or click any Sector Beacon to orient the orbital console (dropped cubes auto-return to their slot).',
    scientificNote: 'ORBIT ZERO flies a sun-synchronous low-Earth orbit. Every pass over Karachi Ground Station has a finite S-Band horizon window (10.0 MB/s).',
    ghostHandTarget: 'GLOBE_GIMBAL',
  },
  {
    index: 2,
    id: 'STEP_2_POINT',
    title: 'STEP 2/9: HOW TO POINT (SECTOR AIM & RAY LOCK)',
    vrInstruction: 'HOW TO POINT: Aim your index finger or wrist ray directly at Sector B on the 3D Earth Globe until the cyan targeting reticle locks, then pinch or poke to select Sector B.',
    desktopInstruction: 'Point and click Sector B on the 3D Globe (or press [2]) to lock target telemetry.',
    scientificNote: 'Each ground emergency request targets a specific geographic sector with distinct cloud, smoke, or terrain backscatter physics.',
    ghostHandTarget: 'SECTOR_B',
  },
  {
    index: 3,
    id: 'STEP_3_PINCH',
    title: 'STEP 3/9: HOW TO PINCH (SENSOR TOGGLE & FIRE SWATH)',
    vrInstruction: 'HOW TO PINCH: Bring your thumb and index finger together (or poke directly with your index fingertip) on the Sensor Mode button to match Sector B weather, then pinch/press FIRE SWATH.',
    desktopInstruction: 'Select the optimal sensor mode for Sector B and click FIRE SWATH (or press [Space]) to materialize a 3D Data Cube.',
    scientificNote: 'Optical (8 Wh, 40 MB / 4.0s) needs clear skies; Thermal IR (11 Wh, 42 MB / 4.2s) pierces thin smoke; SAR Radar (14 Wh, 45 MB / 4.5s) pierces storm clouds.',
    ghostHandTarget: 'SENSOR_AND_SCAN',
  },
  {
    index: 4,
    id: 'STEP_4_GRAB',
    title: 'STEP 4/9: HOW TO GRAB A 3D DATA CUBE',
    vrInstruction: 'HOW TO GRAB: Reach to the left Evidence Tray (within 45 cm), close your thumb and index/middle fingers around the glowing 3D Data Cube, and hold the pinch to lift it.',
    desktopInstruction: 'Click or drag-hold the glowing 3D Data Cube in the left Evidence Tray.',
    scientificNote: 'Each raw scan occupies 1 of 3 physical tray slots and 3 STR (40-45 MB) of onboard solid-state memory.',
    ghostHandTarget: 'EVIDENCE_CUBE',
  },
  {
    index: 5,
    id: 'STEP_5_INSPECT',
    title: 'STEP 5/9: INSPECT HOLOGRAM & SCIENTIFIC CAVEATS',
    vrInstruction: 'Hold the Data Cube up to inspect its internal 3D confidence hologram ([OK] CONFIRMED vs [?] PROBABLE), observation confidence %, and NASA remote-sensing caveat.',
    desktopInstruction: 'Inspect the selected Data Cube badge, MB payload size, and scientific caveat on the HUD.',
    scientificNote: 'Cloud-blocked [X] UNVERIFIED frames contain zero ground signal and cannot be salvaged by onboard compression.',
    ghostHandTarget: 'CUBE_INSPECT',
  },
  {
    index: 6,
    id: 'STEP_6_PROCESS',
    title: 'STEP 6/9: HOW TO PLACE & RELEASE IN THE CRADLE',
    vrInstruction: 'HOW TO PLACE & RELEASE: Carry the valid Data Cube into the center amber Processing Cradle (15 cm magnetic snap ring). When the ring flares gold, open your thumb and fingers to release and compress (45 MB -> 18 MB / 1.8s, -6 Wh).',
    desktopInstruction: 'Drag and release the Data Cube into the center Processing Cradle (or click PROCESS / press [P]) to compress 3 STR -> 1 STR (-6 Wh).',
    scientificNote: 'Onboard feature extraction strips redundant background pixels, cutting payload to 18 MB (1.8s @ 10.0 MB/s) at a 6 Wh compute cost.',
    ghostHandTarget: 'PROCESSING_CRADLE',
  },
  {
    index: 7,
    id: 'STEP_7_STAGE',
    title: 'STEP 7/9: HOW TO DOCK IN THE DOWNLINK BAY',
    vrInstruction: 'HOW TO DOCK: Grab the compressed gold Data Cube, move it into Slot #1 of the right-hand Downlink Bay (18 cm magnetic capture zone), and open your fingers to release. If tracking drops mid-carry, the cube safely returns to its slot.',
    desktopInstruction: 'Drag and release the compressed Data Cube into Slot #1 of the right-hand Downlink Bay (or click QUEUE / press [Q]).',
    scientificNote: 'Packets transmit sequentially in Slot 1 -> 2 -> 3 order at 10.0 MB/s. Any packet exceeding the pass horizon cutoff is dropped.',
    ghostHandTarget: 'DOWNLINK_BAY',
  },
  {
    index: 8,
    id: 'STEP_8_TRANSMIT',
    title: 'STEP 8/9: COMMIT LIVE S-BAND DOWNLINK',
    vrInstruction: 'Point or reach to the green COMMIT DOWNLINK lever on the right console and pinch/press to stream your queued evidence to Karachi Ground Station.',
    desktopInstruction: 'Click COMMIT DOWNLINK (or press [T]) to initiate the live 10.0 MB/s S-Band transmission.',
    scientificNote: 'Once S-Band transmission begins, orbital sensors lock and queued packets stream to the ground dish in real time.',
    ghostHandTarget: 'COMMIT_LEVER',
  },
  {
    index: 9,
    id: 'STEP_9_DEBRIEF',
    title: 'STEP 9/9: DEBRIEF & LAUNCH OPERATION 01: FIRELINE',
    vrInstruction: 'Review the After-Action Debrief (Outcome, Score, Wh & MB/s stats) and pinch/press NEXT OPERATION or REPLAY PASS.',
    desktopInstruction: 'Review your After-Action Debrief and click NEXT OPERATION or REPLAY PASS.',
    scientificNote: 'Orbital Academy gesture certification complete. You are cleared for Operation 01: Fireline.',
    ghostHandTarget: 'DEBRIEF_PANEL',
  },
] as const;

export type TutorialInputSource = 'xr-hand' | 'desktop';

export interface TutorialStepVerificationEntry {
  stepId: Exclude<TutorialStepId, 'COMPLETED'>;
  source: TutorialInputSource | 'mission-state';
  trigger: string;
  verifiedState: string;
}

export interface TutorialProgressState {
  active: boolean;
  vrMode: boolean;
  currentStepId: TutorialStepId;
  completedStepIds: Exclude<TutorialStepId, 'COMPLETED'>[];
  globeInteracted: boolean;
  sectorBPointed: boolean;
  pinchScanVerified: boolean;
  cubeGrabbedOrSelected: boolean;
  cubeInspected: boolean;
  cradleReleaseVerified: boolean;
  downlinkBayReleaseVerified: boolean;
  transmitActivated: boolean;
  stepVerificationLog: TutorialStepVerificationEntry[];
}

export class TutorialEngine {
  private state: TutorialProgressState = {
    active: false,
    vrMode: false,
    currentStepId: 'STEP_1_ENVIRONMENT',
    completedStepIds: [],
    globeInteracted: false,
    sectorBPointed: false,
    pinchScanVerified: false,
    cubeGrabbedOrSelected: false,
    cubeInspected: false,
    cradleReleaseVerified: false,
    downlinkBayReleaseVerified: false,
    transmitActivated: false,
    stepVerificationLog: [],
  };

  public start(vrMode = false): TutorialProgressState {
    this.state = {
      active: true,
      vrMode,
      currentStepId: 'STEP_1_ENVIRONMENT',
      completedStepIds: [],
      globeInteracted: false,
      sectorBPointed: false,
      pinchScanVerified: false,
      cubeGrabbedOrSelected: false,
      cubeInspected: false,
      cradleReleaseVerified: false,
      downlinkBayReleaseVerified: false,
      transmitActivated: false,
      stepVerificationLog: [],
    };
    return this.getState();
  }

  public setVrMode(vrMode: boolean): void {
    this.state.vrMode = vrMode;
  }

  public skip(): TutorialProgressState {
    this.state.active = false;
    this.state.currentStepId = 'COMPLETED';
    this.state.completedStepIds = TUTORIAL_STEPS.map((s) => s.id);
    return this.getState();
  }

  public isActive(): boolean {
    return this.state.active && this.state.currentStepId !== 'COMPLETED';
  }

  public getCurrentStepSpec(): TutorialStepSpec | null {
    if (!this.state.active || this.state.currentStepId === 'COMPLETED') return null;
    return TUTORIAL_STEPS.find((s) => s.id === this.state.currentStepId) ?? null;
  }

  private acceptsSource(source: TutorialInputSource): boolean {
    if (this.state.vrMode && source !== 'xr-hand') {
      return false;
    }
    return true;
  }

  public notifyGlobeInteraction(source: TutorialInputSource = 'desktop'): void {
    if (!this.acceptsSource(source)) return;
    this.state.globeInteracted = true;
  }

  public notifySectorPointed(sectorId: SectorId, source: TutorialInputSource = 'desktop'): void {
    if (!this.acceptsSource(source)) return;
    this.state.globeInteracted = true;
    if (sectorId === 'B') {
      this.state.sectorBPointed = true;
    }
  }

  public notifyPinchScan(source: TutorialInputSource = 'desktop'): void {
    if (!this.acceptsSource(source)) return;
    this.state.pinchScanVerified = true;
  }

  public notifyCubeGrabOrSelect(confidenceValid = true, source: TutorialInputSource = 'desktop'): void {
    if (!this.acceptsSource(source)) return;
    this.state.cubeGrabbedOrSelected = true;
    if (confidenceValid) {
      this.state.cubeInspected = true;
    }
  }

  public notifyCubeInspected(source: TutorialInputSource = 'desktop'): void {
    if (!this.acceptsSource(source)) return;
    this.state.cubeInspected = true;
  }

  public notifyCradleRelease(source: TutorialInputSource = 'desktop'): void {
    if (!this.acceptsSource(source)) return;
    this.state.cradleReleaseVerified = true;
  }

  public notifyDownlinkBayRelease(source: TutorialInputSource = 'desktop'): void {
    if (!this.acceptsSource(source)) return;
    this.state.downlinkBayReleaseVerified = true;
  }

  public notifyTransmitActivated(source: TutorialInputSource = 'desktop'): void {
    if (!this.acceptsSource(source)) return;
    this.state.transmitActivated = true;
  }

  public syncWithMissionState(
    mission: MissionState,
    recentAction?: { type: string; sectorId?: SectorId; sensorMode?: SensorMode },
    source: TutorialInputSource = 'desktop',
  ): TutorialProgressState {
    if (!this.state.active || this.state.currentStepId === 'COMPLETED') {
      return this.getState();
    }

    const sourceAccepted = this.acceptsSource(source);

    if (sourceAccepted && recentAction?.type === 'SELECT_SECTOR') {
      this.state.globeInteracted = true;
      if (recentAction.sectorId === 'B' || mission.selectedSectorId === 'B') {
        this.state.sectorBPointed = true;
      }
    }
    if (sourceAccepted && recentAction?.type === 'SCAN') {
      this.state.pinchScanVerified = true;
    }
    // IMPORTANT: Never auto-complete STEP_4_GRAB merely because mission.selectedPacketId !== null
    // after a scan. An explicit grab or SELECT_PACKET action is required after scanning.
    if (sourceAccepted && recentAction?.type === 'SELECT_PACKET' && mission.packets.length > 0) {
      this.state.cubeGrabbedOrSelected = true;
      const validPkt = mission.packets.find((p) => p.confidence !== 'UNVERIFIED');
      if (validPkt) this.state.cubeInspected = true;
    }

    const activeSource: TutorialInputSource = this.state.vrMode ? 'xr-hand' : source;

    let advanced = true;
    while (advanced && (this.state.currentStepId as TutorialStepId) !== 'COMPLETED') {
      advanced = false;
      switch (this.state.currentStepId) {
        case 'STEP_1_ENVIRONMENT':
          if (this.state.globeInteracted || (!this.state.vrMode && mission.stepCounter > 0)) {
            this.markStepComplete(
              'STEP_1_ENVIRONMENT',
              'STEP_2_POINT',
              activeSource,
              this.state.vrMode ? 'hand_presence_globe_touch' : 'globe_interaction',
              `globeInteracted=${this.state.globeInteracted}`,
            );
            advanced = true;
          }
          break;
        case 'STEP_2_POINT':
          if (
            mission.selectedSectorId === 'B' &&
            (this.state.sectorBPointed || (!this.state.vrMode && (this.state.globeInteracted || mission.stepCounter > 0)))
          ) {
            this.markStepComplete(
              'STEP_2_POINT',
              'STEP_3_PINCH',
              activeSource,
              this.state.vrMode ? 'hand_point_and_lock_sector_B' : 'select_sector_B',
              `selectedSectorId=${mission.selectedSectorId}`,
            );
            advanced = true;
          }
          break;
        case 'STEP_3_PINCH':
          if (
            mission.packets.some((p) => p.confidence !== 'UNVERIFIED') &&
            (this.state.pinchScanVerified || !this.state.vrMode)
          ) {
            // Reset any pre-scan grab flags so STEP_4_GRAB strictly requires grabbing the newly materialized cube
            this.state.cubeGrabbedOrSelected = false;
            this.state.cubeInspected = false;
            this.markStepComplete(
              'STEP_3_PINCH',
              'STEP_4_GRAB',
              activeSource,
              this.state.vrMode ? 'hand_pinch_scan_trigger' : 'scan_valid_packet',
              `packets=${mission.packets.length},validPacket=true`,
            );
            advanced = true;
          }
          break;
        case 'STEP_4_GRAB':
          if (this.state.cubeGrabbedOrSelected && mission.packets.length > 0) {
            this.markStepComplete(
              'STEP_4_GRAB',
              'STEP_5_INSPECT',
              activeSource,
              this.state.vrMode ? 'hand_pinch_grab_3d_cube' : 'cube_grab_or_select',
              `cubeGrabbed=true,selectedPacketId=${mission.selectedPacketId ?? 'none'}`,
            );
            advanced = true;
          }
          break;
        case 'STEP_5_INSPECT':
          if (this.state.cubeInspected && mission.packets.some((p) => p.confidence !== 'UNVERIFIED')) {
            this.markStepComplete(
              'STEP_5_INSPECT',
              'STEP_6_PROCESS',
              activeSource,
              this.state.vrMode ? 'hand_hold_inspect_hologram' : 'inspect_valid_cube',
              `cubeInspected=true,confidence=VALID`,
            );
            advanced = true;
          }
          break;
        case 'STEP_6_PROCESS':
          if (
            mission.packets.some((p) => p.processed) &&
            (this.state.cradleReleaseVerified || !this.state.vrMode)
          ) {
            this.markStepComplete(
              'STEP_6_PROCESS',
              'STEP_7_STAGE',
              activeSource,
              this.state.vrMode ? 'hand_release_in_processing_cradle' : 'process_packet_in_cradle',
              `processed=true,storageCost=1,cradleRelease=${this.state.cradleReleaseVerified}`,
            );
            advanced = true;
          }
          break;
        case 'STEP_7_STAGE':
          if (
            mission.queuePacketIds.length > 0 &&
            (this.state.downlinkBayReleaseVerified || !this.state.vrMode)
          ) {
            this.markStepComplete(
              'STEP_7_STAGE',
              'STEP_8_TRANSMIT',
              activeSource,
              this.state.vrMode ? 'hand_release_in_downlink_bay_slot' : 'queue_packet_in_downlink_bay',
              `queuePacketIds=[${mission.queuePacketIds.join(',')}],bayRelease=${this.state.downlinkBayReleaseVerified}`,
            );
            advanced = true;
          }
          break;
        case 'STEP_8_TRANSMIT':
          if (
            (mission.phase === 'DOWNLINK' || mission.phase === 'DEBRIEF') &&
            (this.state.transmitActivated || !this.state.vrMode)
          ) {
            this.markStepComplete(
              'STEP_8_TRANSMIT',
              'STEP_9_DEBRIEF',
              activeSource,
              this.state.vrMode ? 'hand_activate_commit_downlink' : 'commit_downlink',
              `phase=${mission.phase}`,
            );
            advanced = true;
          }
          break;
        case 'STEP_9_DEBRIEF':
          if (mission.phase === 'DEBRIEF' && mission.debrief !== null) {
            this.markStepComplete(
              'STEP_9_DEBRIEF',
              'COMPLETED',
              'mission-state',
              'debrief_reached',
              `outcome=${mission.debrief.outcome},score=${mission.debrief.totalScore}`,
            );
            this.state.active = false;
            advanced = false;
          }
          break;
      }
    }

    return this.getState();
  }

  private markStepComplete(
    completed: Exclude<TutorialStepId, 'COMPLETED'>,
    next: TutorialStepId,
    source: TutorialInputSource | 'mission-state' = 'desktop',
    trigger = 'state_sync',
    verifiedState = 'verified',
  ): void {
    if (!this.state.completedStepIds.includes(completed)) {
      this.state.completedStepIds.push(completed);
      this.state.stepVerificationLog.push({
        stepId: completed,
        source,
        trigger,
        verifiedState,
      });
    }
    this.state.currentStepId = next;
  }

  public getState(): TutorialProgressState {
    return {
      ...this.state,
      completedStepIds: [...this.state.completedStepIds],
      stepVerificationLog: [...this.state.stepVerificationLog],
    };
  }
}
