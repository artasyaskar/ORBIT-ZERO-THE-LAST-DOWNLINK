/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Pure, deterministic state machine for the orbital emergency-intelligence triage loop:
 * SCAN -> INTERPRET -> PROCESS -> PRIORITIZE -> TRANSMIT -> REVIEW
 */

import {
  CAMPAIGN_OPERATIONS,
  computeTransmissionSeconds,
  CONFIDENCE_BADGES,
  DOWNLINK_THROUGHPUT_MBPS,
  getScenarioSector,
  MAX_EVIDENCE_CUBES,
  MISSION_SCENARIOS,
  PROTOCOL_OVERHEAD_SEC,
  SECTOR_ORDER,
} from './missionConfig';
import { generateProceduralCrisis, type ThreatVector } from './proceduralCrisis';
import { buildDebriefReport } from './scoring';
import type {
  ActionResult,
  ActionResultCode,
  DataPacket,
  DebriefReport,
  MissionAction,
  MissionJournalEntry,
  MissionScenarioId,
  MissionState,
  SectorId,
  SensorMode,
} from './types';

function isValidSectorId(value: unknown): value is SectorId {
  return typeof value === 'string' && (SECTOR_ORDER as readonly string[]).includes(value);
}

function isValidSensorMode(value: unknown): value is SensorMode {
  return value === 'OPTICAL' || value === 'RADAR' || value === 'THERMAL';
}

export class MissionEngine {
  private state: MissionState;
  private nextPacketNumber = 1;
  private currentScenarioId: MissionScenarioId = 'STANDARD_INDUS_PASS';
  private journal: MissionJournalEntry[] = [];
  private activeCustomScenario?: ReturnType<typeof generateProceduralCrisis>['config'];
  private activeThreat?: ThreatVector;

  constructor(initialScenarioId: MissionScenarioId = 'STANDARD_INDUS_PASS') {
    this.currentScenarioId = initialScenarioId;
    this.state = this.createInitialState();
  }

  public getActiveScenario() {
    return (
      this.activeCustomScenario ??
      MISSION_SCENARIOS[this.currentScenarioId] ??
      MISSION_SCENARIOS.STANDARD_INDUS_PASS
    );
  }

  public getActiveCustomScenario(): typeof this.activeCustomScenario {
    return this.activeCustomScenario;
  }

  public startProceduralCrisis(seedInput?: string | number): MissionState {
    const crisis = generateProceduralCrisis(seedInput ?? Date.now());
    this.activeCustomScenario = crisis.config;
    this.activeThreat = crisis.threat;
    this.currentScenarioId = crisis.config.id;
    this.state = this.createInitialState();
    return this.getState();
  }

  public getActiveThreat(): ThreatVector | null {
    return this.activeThreat ?? null;
  }

  private createInitialState(): MissionState {
    this.nextPacketNumber = 1;
    this.journal = [];
    const scenario = this.getActiveScenario();
    const budget = scenario.budget;
    return {
      scenarioId: this.currentScenarioId,
      phase: 'OPERATIONS',
      paused: false,
      selectedSectorId: 'B',
      activeSensorMode: 'RADAR',
      selectedPacketId: null,
      power: budget.initialPower,
      maxPower: budget.initialPower,
      storageUsed: 0,
      maxStorage: budget.maxStorage,
      downlinkWindowSec: budget.downlinkDurationSec,
      downlinkRemainingSec: budget.downlinkDurationSec,
      downlinkElapsedSec: 0,
      downlinkCommittedSec: 0,
      activeDownlinkPacketId: null,
      packets: [],
      queuePacketIds: [],
      lastStatusMessage:
        `PASS ACTIVE (${scenario.name}): 1) Select Sector | 2) Choose Sensor & Scan | 3) Process & Queue before ${budget.downlinkDurationSec.toFixed(1)}s Downlink.`,
      lastActionOk: true,
      stepCounter: 0,
      debrief: null,
    };
  }

  public setScenario(scenarioId: MissionScenarioId): MissionState {
    if (!MISSION_SCENARIOS[scenarioId]) {
      this.state.lastStatusMessage = `Invalid scenario ID "${String(scenarioId)}".`;
      this.state.lastActionOk = false;
      return this.getState();
    }
    this.activeCustomScenario = undefined;
    this.activeThreat = undefined;
    this.currentScenarioId = scenarioId;
    this.state = this.createInitialState();
    return this.getState();
  }

  public cycleScenario(): MissionState {
    if (this.currentScenarioId === 'ORBITAL_ACADEMY') {
      return this.setScenario('FIRELINE_PASS');
    }
    const scenarioKeys: MissionScenarioId[] = [
      'STANDARD_INDUS_PASS',
      'MONSOON_SUPERCELL_PASS',
      'SOLAR_BROWNOUT_PASS',
    ];
    const curIdx = scenarioKeys.indexOf(this.currentScenarioId);
    const nextScenario = scenarioKeys[(curIdx + 1) % scenarioKeys.length];
    return this.setScenario(nextScenario);
  }

  public cycleCampaignOperation(): MissionState {
    const campaignKeys: MissionScenarioId[] = [
      'FIRELINE_PASS',
      'STANDARD_INDUS_PASS',
      'AFTERSHOCK_PASS',
    ];
    const curIdx = campaignKeys.indexOf(this.currentScenarioId);
    const nextScenario =
      curIdx === -1 ? campaignKeys[0] : campaignKeys[(curIdx + 1) % campaignKeys.length];
    return this.setScenario(nextScenario);
  }

  public getState(): MissionState {
    return {
      ...this.state,
      scenarioId: this.currentScenarioId,
      packets: this.state.packets.map((p) => ({ ...p })),
      queuePacketIds: [...this.state.queuePacketIds],
      debrief: this.state.debrief
        ? {
            ...this.state.debrief,
            transmittedPacketIds: [...this.state.debrief.transmittedPacketIds],
            droppedPacketIds: [...this.state.debrief.droppedPacketIds],
            evaluations: this.state.debrief.evaluations.map((e) => ({ ...e })),
          }
        : null,
    };
  }

  public reset(): MissionState {
    this.state = this.createInitialState();
    return this.getState();
  }

  public selectSector(sectorId: SectorId): MissionState {
    if (this.state.phase !== 'OPERATIONS' || this.state.paused) {
      this.fail('INVALID_PHASE', 'Sector selection is locked during downlink or pause.');
      return this.getState();
    }
    if (!isValidSectorId(sectorId)) {
      this.state.lastStatusMessage = `Invalid sector ID "${String(sectorId)}". Valid sectors are A through F.`;
      this.state.lastActionOk = false;
      return this.getState();
    }
    const sector = getScenarioSector(this.currentScenarioId, sectorId, this.activeCustomScenario);
    this.state.selectedSectorId = sectorId;
    this.state.stepCounter += 1;
    const cloudTag =
      sector.cloudCover === 'DENSE_STORM' || sector.cloudCover === 'CONVECTIVE_CLOUD'
        ? 'DENSE STORM CLOUDS (RADAR rec.)'
        : sector.cloudCover === 'MODERATE_SMOKE' ||
            sector.cloudCover === 'DENSE_SMOKE' ||
            sector.cloudCover === 'THIN_SMOKE'
          ? 'BIOMASS SMOKE PLUME (THERMAL IR rec.)'
          : sector.cloudCover === 'SEISMIC_DUST'
            ? 'SEISMIC DUST PLUME (RADAR / THERMAL rec.)'
            : 'CLEAR SKY (OPTICAL rec.)';
    this.state.lastStatusMessage = `Selected ${sector.code} ${sector.name} - ${cloudTag}.`;
    this.state.lastActionOk = true;
    return this.getState();
  }

  public setSensorMode(mode: SensorMode): MissionState {
    if (this.state.phase !== 'OPERATIONS' || this.state.paused) {
      this.fail('INVALID_PHASE', 'Sensor selection is locked during downlink or pause.');
      return this.getState();
    }
    if (!isValidSensorMode(mode)) {
      this.state.lastStatusMessage = `Invalid sensor mode "${String(mode)}". Choose OPTICAL, THERMAL, or RADAR.`;
      this.state.lastActionOk = false;
      return this.getState();
    }
    this.state.activeSensorMode = mode;
    this.state.stepCounter += 1;
    const budget = this.getActiveScenario().budget;
    const cost =
      mode === 'OPTICAL'
        ? budget.opticalScan
        : mode === 'THERMAL'
          ? (budget.thermalScan ?? { powerCost: 11, storageCost: 3, payloadMb: 42.0, transmitSec: 4.2 })
          : budget.radarScan;
    const mb = cost.payloadMb ?? Number((cost.transmitSec * DOWNLINK_THROUGHPUT_MBPS).toFixed(1));
    this.state.lastStatusMessage =
      mode === 'OPTICAL'
        ? `Sensor switched to OPTICAL (${cost.powerCost} Wh, ${cost.storageCost} STR, ${mb} MB / ${cost.transmitSec.toFixed(1)}s Tx @ 10 MB/s) - High detail in clear skies; blocked by dense clouds and smoke.`
        : mode === 'THERMAL'
          ? `Sensor switched to THERMAL IR (${cost.powerCost} Wh, ${cost.storageCost} STR, ${mb} MB / ${cost.transmitSec.toFixed(1)}s Tx @ 10 MB/s) - Penetrates thin smoke to detect heat anomalies; blocked by thick clouds; coarse 20m resolution.`
          : `Sensor switched to RADAR / SAR (${cost.powerCost} Wh, ${cost.storageCost} STR, ${mb} MB / ${cost.transmitSec.toFixed(1)}s Tx @ 10 MB/s) - Penetrates clouds; subject to specular dark water vs double-bounce vegetation/metal glare.`;
    this.state.lastActionOk = true;
    return this.getState();
  }

  public toggleSensorMode(forceThreeWay = false): MissionState {
    const available: SensorMode[] = forceThreeWay
      ? ['RADAR', 'OPTICAL', 'THERMAL']
      : (this.getActiveScenario().availableSensors ?? ['RADAR', 'OPTICAL']);
    const curIdx = available.indexOf(this.state.activeSensorMode);
    const nextMode: SensorMode =
      curIdx === -1 ? available[0] : available[(curIdx + 1) % available.length];
    return this.setSensorMode(nextMode);
  }

  public selectPacket(packetId: string | null): MissionState {
    if (this.state.phase === 'DOWNLINK' || this.state.paused) {
      this.fail('INVALID_PHASE', 'Evidence is locked during downlink or pause.');
      return this.getState();
    }
    if (packetId === null) {
      this.state.selectedPacketId = null;
      this.state.lastActionOk = true;
      return this.getState();
    }
    const pkt = this.state.packets.find((p) => p.id === packetId);
    if (pkt) {
      this.state.selectedPacketId = pkt.id;
      this.state.lastStatusMessage = `Inspecting ${pkt.id} (${pkt.sectorCode} ${pkt.sensorMode} | ${pkt.confidenceBadge} | ${pkt.storageCost} STR | ${pkt.transmitSec.toFixed(1)}s Tx).`;
      this.state.lastActionOk = true;
    } else {
      this.state.lastStatusMessage = `Packet "${packetId}" not found in onboard storage.`;
      this.state.lastActionOk = false;
    }
    return this.getState();
  }

  public scanSector(
    sectorId: SectorId = this.state.selectedSectorId,
    sensorMode: SensorMode = this.state.activeSensorMode,
  ): ActionResult {
    if (this.state.phase !== 'OPERATIONS' || this.state.paused) {
      return this.fail(
        'INVALID_PHASE',
        'Cannot initiate new sensor scan after downlink window has committed.',
      );
    }

    if (!isValidSectorId(sectorId)) {
      return this.fail(
        'INVALID_SECTOR',
        `Invalid target sector "${String(sectorId)}". Choose a valid sector A-F.`,
      );
    }

    if (!isValidSensorMode(sensorMode)) {
      return this.fail(
        'INVALID_SENSOR',
        `Invalid sensor mode "${String(sensorMode)}". Choose OPTICAL, THERMAL, or RADAR.`,
      );
    }

    this.state.selectedSectorId = sectorId;
    this.state.activeSensorMode = sensorMode;

    const scenario = this.getActiveScenario();
    const budget = scenario.budget;

    const scanCost =
      sensorMode === 'OPTICAL'
        ? budget.opticalScan
        : sensorMode === 'THERMAL'
          ? (budget.thermalScan ?? { powerCost: 11, storageCost: 3, payloadMb: 42.0, transmitSec: 4.2 })
          : budget.radarScan;

    if (this.state.power < scanCost.powerCost) {
      return this.fail(
        'INSUFFICIENT_POWER',
        `Insufficient Power for ${sensorMode} scan: requires ${scanCost.powerCost} Wh, only ${this.state.power} Wh remaining.`,
      );
    }

    if (this.state.storageUsed + scanCost.storageCost > this.state.maxStorage) {
      return this.fail(
        'INSUFFICIENT_STORAGE',
        `Onboard Storage full (${this.state.storageUsed}/${this.state.maxStorage} STR). Process a valid cube (3->1 STR) or discard an unverified cube first.`,
      );
    }

    if (this.state.packets.length >= MAX_EVIDENCE_CUBES) {
      return this.fail(
        'TRAY_FULL',
        'TRAY FULL - all three evidence cubes are occupied. Discard an unnecessary cube before scanning again; compression frees memory, not a physical cube.',
      );
    }


    const sector = getScenarioSector(this.currentScenarioId, sectorId, this.activeCustomScenario);
    const outcome = sector.outcomes[sensorMode] ?? sector.outcomes.OPTICAL;
    const packetId = `PKT-${this.nextPacketNumber++}`;

    this.state.power -= scanCost.powerCost;
    this.state.storageUsed += scanCost.storageCost;
    this.state.stepCounter += 1;

    const throughputMbps = budget.downlinkThroughputMbps ?? DOWNLINK_THROUGHPUT_MBPS;
    const protocolOverheadSec = budget.protocolOverheadSec ?? PROTOCOL_OVERHEAD_SEC;
    const payloadMb = scanCost.payloadMb ?? Number((scanCost.transmitSec * throughputMbps).toFixed(1));
    const computedTxSec = computeTransmissionSeconds(payloadMb, throughputMbps, protocolOverheadSec);

    const packet: DataPacket = {
      id: packetId,
      sectorId: sector.id,
      sectorCode: sector.code,
      sectorName: sector.name,
      sensorMode,
      confidence: outcome.confidence,
      confidenceBadge: outcome.confidenceBadge,
      headline: outcome.headline,
      finding: outcome.finding,
      scientificReason: outcome.scientificReason,
      satisfiesRequestId: outcome.satisfiesRequestId,
      snrDb: outcome.snrDb,
      swathWidthKm: outcome.swathWidthKm,
      resolutionMeters: outcome.resolutionMeters,
      phenomenologyTag: outcome.phenomenologyTag,
      observationConfidencePct: outcome.observationConfidencePct,
      scientificCaveat: outcome.scientificCaveat,
      storageCost: scanCost.storageCost,
      transmitSec: computedTxSec,
      rawStorageCost: scanCost.storageCost,
      rawTransmitSec: computedTxSec,
      payloadMb,
      rawPayloadMb: payloadMb,
      throughputMbps,
      protocolOverheadSec,
      compressionRatio: 1.0,
      ambiguityReason:
        outcome.confidence === 'UNVERIFIED'
          ? 'Dense cloud cover blocks visible-band optical reflection.'
          : outcome.confidence === 'PROBABLE'
            ? 'Microwave backscatter ambiguity (multipath corner reflection or terrain layover).'
            : 'Clear sensor line-of-sight with high SNR and consistent terrain backscatter.',
      provenanceLineage: `OBS[SEC-${sector.id}|${sensorMode}|STEP-${this.state.stepCounter}]`,
      evidenceId: `EVID-${sector.code}-${sensorMode}-${this.nextPacketNumber - 1}`,
      observationId: `OBS-${this.currentScenarioId.slice(0, 3)}-${this.state.stepCounter}`,
      parentEvidenceId: null,
      observationTimestampSec: this.state.downlinkElapsedSec,
      observationCondition:
        sector.cloudCover === 'DENSE_STORM' || sector.cloudCover === 'CONVECTIVE_CLOUD'
          ? 'DENSE_MONSOON_CLOUD_COVER'
          : sector.cloudCover === 'DENSE_SMOKE'
            ? 'DENSE_PYROCONVECTIVE_SMOKE'
            : sector.cloudCover === 'MODERATE_SMOKE'
              ? 'MODERATE_LAMINAR_SMOKE'
              : sector.cloudCover === 'THIN_SMOKE'
                ? 'THIN_DRIFT_SMOKE_HAZE'
                : sector.cloudCover === 'SEISMIC_DUST'
                  ? 'SEISMIC_SILICATE_DUST_PLUME'
                  : 'CLEAR_SKY_DAYLIGHT',
      processingState: 'RAW',
      processingOperation: null,
      interpretationCategory:
        outcome.confidence === 'CONFIRMED'
          ? 'CONFIRMED'
          : outcome.confidence === 'PROBABLE'
            ? 'PROBABLE'
            : sector.cloudCover === 'DENSE_STORM' && sensorMode === 'OPTICAL'
              ? 'INSUFFICIENT_EVIDENCE'
              : 'AMBIGUOUS',
      knownUncertainty:
        outcome.confidence === 'UNVERIFIED'
          ? 'Optical Mie scattering total cloud attenuation'
          : outcome.confidence === 'PROBABLE'
            ? 'Dihedral corner multipath reflection and terrain layover'
            : 'None - unambiguous clear detection',
      associatedRequestId: outcome.satisfiesRequestId,
      transmissionState: 'UNQUEUED',
      provenanceChain: [
        {
          stage: 'OBSERVE',
          timestampSec: this.state.downlinkElapsedSec,
          step: this.state.stepCounter,
          operation: `${sensorMode}_SCAN`,
          details: outcome.headline,
        },
      ],
      processed: false,
      queued: false,
      queueIndex: null,
      transmitted: false,
      droppedByWindow: false,
      createdAtStep: this.state.stepCounter,
    };

    this.state.packets.push(packet);
    this.state.selectedPacketId = packet.id;

    const msg = `Scanned ${sector.code} (${sensorMode}): ${outcome.confidenceBadge} - ${outcome.headline} (-${scanCost.powerCost} Wh, +${scanCost.storageCost} STR, ${payloadMb} MB / ${computedTxSec.toFixed(1)}s Tx).`;
    this.state.lastStatusMessage = msg;
    this.state.lastActionOk = true;

    return {
      ok: true,
      code: 'OK',
      message: msg,
      packet: { ...packet },
    };
  }

  public processPacket(
    packetId: string | null = this.state.selectedPacketId,
  ): ActionResult {
    if (this.state.phase !== 'OPERATIONS' || this.state.paused) {
      return this.fail(
        'INVALID_PHASE',
        'Cannot run onboard processing while downlink is transmitting or completed.',
      );
    }

    const pkt = this.state.packets.find((p) => p.id === packetId);
    if (!pkt) {
      return this.fail(
        'PACKET_NOT_FOUND',
        'Select a data cube before activating the Processing Cradle.',
      );
    }

    if (pkt.processed) {
      return this.fail(
        'ALREADY_PROCESSED',
        `${pkt.id} (${pkt.sectorCode}) is already compressed to ${pkt.storageCost} STR / ${pkt.transmitSec.toFixed(1)}s Tx.`,
      );
    }

    if (pkt.confidence === 'UNVERIFIED') {
      return this.fail(
        'CANNOT_PROCESS_UNVERIFIED',
        `Processing rejected for ${pkt.id}: Onboard feature extraction cannot fabricate missing ground data from an [X] UNVERIFIED cloud-blocked frame. Discard this cube to free 3 STR.`,
      );
    }

    const scenario = this.getActiveScenario();
    const procCost = scenario.budget.onboardProcess;
    if (this.state.power < procCost.powerCost) {
      return this.fail(
        'INSUFFICIENT_POWER',
        `Insufficient Power for onboard processing: requires ${procCost.powerCost} Wh, only ${this.state.power} Wh remaining.`,
      );
    }

    const storageDelta = pkt.storageCost - procCost.compressedStorageCost;
    this.state.power -= procCost.powerCost;
    this.state.storageUsed = Math.max(0, this.state.storageUsed - storageDelta);
    const compressedPayloadMb = procCost.compressedPayloadMb ?? 18.0;
    const throughputMbps = pkt.throughputMbps ?? scenario.budget.downlinkThroughputMbps ?? DOWNLINK_THROUGHPUT_MBPS;
    const protocolOverheadSec = pkt.protocolOverheadSec ?? scenario.budget.protocolOverheadSec ?? PROTOCOL_OVERHEAD_SEC;
    pkt.storageCost = procCost.compressedStorageCost;
    pkt.payloadMb = compressedPayloadMb;
    pkt.transmitSec = computeTransmissionSeconds(compressedPayloadMb, throughputMbps, protocolOverheadSec);
    pkt.compressionRatio = 3.0;
    pkt.processed = true;
    pkt.processingState = 'PROCESSED';
    const upgradedByChangeDetection = Boolean(
      scenario.performsChangeDetection &&
      pkt.sensorMode === 'RADAR' &&
      pkt.confidence === 'PROBABLE' &&
      pkt.satisfiesRequestId,
    );
    if (upgradedByChangeDetection) {
      pkt.confidence = 'CONFIRMED';
      pkt.confidenceBadge = CONFIDENCE_BADGES.CONFIRMED;
      pkt.interpretationCategory = 'CONFIRMED';
      pkt.observationConfidencePct = 90;
      pkt.snrDb = Number((pkt.snrDb + 6.5).toFixed(1));
      pkt.scientificCaveat =
        'Potential surface-change evidence detected through pre-event and post-event SAR backscatter comparison (simulated gameplay heuristic: +6.5 dB static-clutter rejection contrast gain; 68% -> 90% simulated gameplay confidence estimate; does not independently measure exact ground displacement without interferometric phase).';
    }
    pkt.compressionAlgorithm = upgradedByChangeDetection
      ? 'MULTI_TEMPORAL_CHANGE_DETECTION'
      : pkt.sensorMode === 'OPTICAL'
        ? pkt.sectorId === 'C'
          ? 'OPTICAL_ROAD_EDGE_ENCODING'
          : 'OPTICAL_EVIDENCE_COMPRESSION'
        : pkt.sensorMode === 'THERMAL'
          ? 'THERMAL_RADIOMETRIC_ENCODING'
          : pkt.sectorId === 'C'
            ? 'SAR_AMBIGUITY_METADATA_ENCODING'
            : 'SAR_BACKSCATTER_EVIDENCE_COMPRESSION';
    pkt.processingOperation = pkt.compressionAlgorithm;
    pkt.provenanceLineage = `${pkt.provenanceLineage} -> CRADLE[${pkt.compressionAlgorithm}]`;
    if (!pkt.provenanceChain) pkt.provenanceChain = [];
    pkt.provenanceChain.push({
      stage: 'PROCESS',
      timestampSec: this.state.downlinkElapsedSec,
      step: this.state.stepCounter,
      operation: pkt.compressionAlgorithm,
      details: `Compressed 3 STR -> 1 STR (${(pkt.rawPayloadMb ?? 45).toFixed(0)} MB -> ${compressedPayloadMb.toFixed(0)} MB), ${pkt.rawTransmitSec.toFixed(1)}s -> ${pkt.transmitSec.toFixed(1)}s Tx @ ${throughputMbps.toFixed(1)} MB/s`,
    });
    this.state.selectedPacketId = pkt.id;
    this.state.stepCounter += 1;

    this.recalculateQueueTiming();

    const msg = `Processed ${pkt.id} (${pkt.sectorCode} ${pkt.sensorMode} [${pkt.compressionAlgorithm}]): compressed to 1 STR (${compressedPayloadMb.toFixed(0)} MB / 1.8s Tx @ 10 MB/s, -${procCost.powerCost} Wh, freed ${storageDelta} STR).`;
    this.state.lastStatusMessage = msg;
    this.state.lastActionOk = true;

    return {
      ok: true,
      code: 'OK',
      message: msg,
      packet: { ...pkt },
    };
  }

  public discardPacket(
    packetId: string | null = this.state.selectedPacketId,
  ): ActionResult {
    if (this.state.phase !== 'OPERATIONS' || this.state.paused) {
      return this.fail('INVALID_PHASE', 'Cannot discard packets after downlink has started.');
    }

    const index = this.state.packets.findIndex((p) => p.id === packetId);
    if (index === -1) {
      return this.fail('PACKET_NOT_FOUND', 'Select a data cube to discard.');
    }

    const [removed] = this.state.packets.splice(index, 1);
    this.state.storageUsed = Math.max(0, this.state.storageUsed - removed.storageCost);
    this.state.queuePacketIds = this.state.queuePacketIds.filter((id) => id !== removed.id);
    this.recalculateQueueTiming();

    if (this.state.selectedPacketId === removed.id) {
      this.state.selectedPacketId =
        this.state.packets[this.state.packets.length - 1]?.id ?? null;
    }

    this.state.stepCounter += 1;
    const msg = `Discarded ${removed.id} (${removed.sectorCode} ${removed.sensorMode}) - freed ${removed.storageCost} STR.`;
    this.state.lastStatusMessage = msg;
    this.state.lastActionOk = true;

    return {
      ok: true,
      code: 'OK',
      message: msg,
      packet: { ...removed },
    };
  }

  public queuePacket(
    packetId: string | null = this.state.selectedPacketId,
    preferredSlotIndex?: number,
  ): ActionResult {
    if (this.state.phase !== 'OPERATIONS' || this.state.paused) {
      return this.fail('INVALID_PHASE', 'Downlink queue is locked during transmission.');
    }

    const pkt = this.state.packets.find((p) => p.id === packetId);
    if (!pkt) {
      return this.fail('PACKET_NOT_FOUND', 'Select a data cube to place in the Downlink Bay.');
    }

    // If already queued and a slot index is provided, move it to that slot without duplicating
    if (pkt.queued) {
      if (
        typeof preferredSlotIndex === 'number' &&
        preferredSlotIndex >= 0
      ) {
        this.state.queuePacketIds = this.state.queuePacketIds.filter((id) => id !== pkt.id);
        const clampedIdx = Math.min(preferredSlotIndex, this.state.queuePacketIds.length);
        this.state.queuePacketIds.splice(clampedIdx, 0, pkt.id);
        this.recalculateQueueTiming();
      }
      this.state.selectedPacketId = pkt.id;
      this.state.stepCounter += 1;
      const msg = `${pkt.id} (${pkt.sectorCode}) prioritized in Downlink Slot #${(pkt.queueIndex ?? 0) + 1} (Queue: ${this.state.downlinkCommittedSec.toFixed(1)}s / ${this.state.downlinkWindowSec.toFixed(1)}s).`;
      this.state.lastStatusMessage = msg;
      this.state.lastActionOk = true;
      return {
        ok: true,
        code: 'OK',
        message: msg,
        packet: { ...pkt },
      };
    }

    const maxSlots = Math.min(MAX_EVIDENCE_CUBES, this.getActiveScenario().budget.maxQueueSlots);
    if (this.state.queuePacketIds.length >= maxSlots) {
      return this.fail('QUEUE_FULL', `Downlink Bay full (${maxSlots} slots max). Unqueue or discard a slot cube first.`);
    }

    if (
      typeof preferredSlotIndex === 'number' &&
      preferredSlotIndex >= 0 &&
      preferredSlotIndex <= this.state.queuePacketIds.length
    ) {
      this.state.queuePacketIds.splice(preferredSlotIndex, 0, pkt.id);
    } else {
      this.state.queuePacketIds.push(pkt.id);
    }

    this.state.selectedPacketId = pkt.id;
    this.state.stepCounter += 1;
    this.recalculateQueueTiming();
    pkt.transmissionState = 'QUEUED';
    if (!pkt.provenanceChain) pkt.provenanceChain = [];
    pkt.provenanceChain.push({
      stage: 'QUEUE',
      timestampSec: this.state.downlinkElapsedSec,
      step: this.state.stepCounter,
      operation: `BAY_SCHEDULE_SLOT_${(pkt.queueIndex ?? 0) + 1}`,
      details: `Scheduled for S-band Tx (${pkt.transmitSec.toFixed(1)}s duration)`,
    });
    if (!pkt.provenanceLineage.includes('BAY[')) {
      pkt.provenanceLineage = `${pkt.provenanceLineage} -> BAY[SLOT-${(pkt.queueIndex ?? 0) + 1}]`;
    }

    const overflowWarn =
      this.state.downlinkCommittedSec > this.state.downlinkWindowSec
        ? ` WARNING: Queue takes ${this.state.downlinkCommittedSec.toFixed(1)}s (> ${this.state.downlinkWindowSec.toFixed(1)}s window); process cubes to compress!`
        : '';
    const msg = `Queued ${pkt.id} (${pkt.sectorCode} ${pkt.confidenceBadge}) in Slot #${(pkt.queueIndex ?? 0) + 1}. Total queue: ${this.state.downlinkCommittedSec.toFixed(1)}s / ${this.state.downlinkWindowSec.toFixed(1)}s.${overflowWarn}`;
    this.state.lastStatusMessage = msg;
    this.state.lastActionOk = true;

    return {
      ok: true,
      code: 'OK',
      message: msg,
      packet: { ...pkt },
    };
  }

  public unqueuePacket(
    packetId: string | null = this.state.selectedPacketId,
  ): ActionResult {
    if (this.state.phase !== 'OPERATIONS' || this.state.paused) {
      return this.fail('INVALID_PHASE', 'Cannot modify queue after downlink starts.');
    }

    const pkt = this.state.packets.find((p) => p.id === packetId);
    if (!pkt) {
      return this.fail('PACKET_NOT_FOUND', 'Packet not found.');
    }

    if (!pkt.queued) {
      return this.fail('NOT_QUEUED', `${pkt.id} is not currently in the Downlink Bay.`);
    }

    this.state.queuePacketIds = this.state.queuePacketIds.filter((id) => id !== pkt.id);
    pkt.queued = false;
    pkt.queueIndex = null;
    pkt.transmissionState = 'UNQUEUED';
    this.state.stepCounter += 1;
    this.recalculateQueueTiming();

    const msg = `Removed ${pkt.id} (${pkt.sectorCode}) from Downlink Bay. Queue now ${this.state.downlinkCommittedSec.toFixed(1)}s / ${this.state.downlinkWindowSec.toFixed(1)}s.`;
    this.state.lastStatusMessage = msg;
    this.state.lastActionOk = true;

    return {
      ok: true,
      code: 'OK',
      message: msg,
      packet: { ...pkt },
    };
  }

  public moveQueuedPacketUp(packetId: string): ActionResult {
    if (this.state.phase !== 'OPERATIONS' || this.state.paused) {
      return this.fail('INVALID_PHASE', 'Queue is locked during downlink or pause.');
    }
    const idx = this.state.queuePacketIds.indexOf(packetId);
    if (idx === -1) {
      return this.fail('NOT_QUEUED', `Packet ${packetId} is not in the Downlink Bay.`);
    }
    if (idx === 0) {
      return this.queuePacket(packetId, 0);
    }
    return this.queuePacket(packetId, idx - 1);
  }

  public reorderQueue(orderedPacketIds: string[]): ActionResult {
    if (this.state.phase !== 'OPERATIONS' || this.state.paused) {
      return this.fail('INVALID_PHASE', 'Cannot reorder queue after downlink starts.');
    }
    const validIds: string[] = [];
    for (const id of orderedPacketIds) {
      if (this.state.queuePacketIds.includes(id) && !validIds.includes(id)) {
        validIds.push(id);
      }
    }
    for (const existingId of this.state.queuePacketIds) {
      if (!validIds.includes(existingId)) {
        validIds.push(existingId);
      }
    }
    this.state.queuePacketIds = validIds;
    this.state.stepCounter += 1;
    this.recalculateQueueTiming();
    const msg = `Reordered Downlink Bay queue: ${this.state.queuePacketIds.join(' -> ')}.`;
    this.state.lastStatusMessage = msg;
    this.state.lastActionOk = true;
    return {
      ok: true,
      code: 'OK',
      message: msg,
    };
  }

  /**
   * Starts the live 10.0-second downlink transmission window.
   * Rejects empty queues or invalid phases so the player cannot accidentally end the pass with 0 queued packets.
   */
  public startDownlink(): ActionResult {
    if (this.state.phase !== 'OPERATIONS' || this.state.paused) {
      return this.fail(
        'INVALID_PHASE',
        'Downlink transmission has already been committed for this orbital pass.',
      );
    }

    if (this.state.queuePacketIds.length === 0) {
      return this.fail(
        'EMPTY_QUEUE',
        'Downlink Bay is empty! Queue at least 1 evidence cube before transmitting.',
      );
    }

    this.state.phase = 'DOWNLINK';
    this.state.downlinkElapsedSec = 0;
    this.state.downlinkRemainingSec = this.state.downlinkWindowSec;
    this.state.activeDownlinkPacketId = this.state.queuePacketIds[0] ?? null;
    this.state.stepCounter += 1;

    for (const pkt of this.state.packets) {
      pkt.transmitted = false;
      pkt.droppedByWindow = false;
    }

    const msg = `DOWNLINK STARTED: Transmitting ${this.state.queuePacketIds.length} queued packet(s) across ${this.state.downlinkWindowSec.toFixed(1)}s horizon window...`;
    this.state.lastStatusMessage = msg;
    this.state.lastActionOk = true;

    return {
      ok: true,
      code: 'OK',
      message: msg,
    };
  }

  /**
   * Advances an active DOWNLINK transmission by deltaSec seconds.
   * Marks queued packets as transmitted as their cumulative transmit time completes within the 10.0s window,
   * and finalizes the DEBRIEF report once all queued packets complete or the 10.0s window closes.
   */
  public tickDownlink(deltaSec: number): MissionState {
    if (this.state.phase !== 'DOWNLINK' || this.state.paused || !Number.isFinite(deltaSec) || deltaSec <= 0) {
      return this.getState();
    }

    this.state.downlinkElapsedSec = Math.min(this.state.downlinkWindowSec, this.state.downlinkElapsedSec + deltaSec);

    let cumulativeSec = 0;
    let allQueuedFinished = true;
    let activeId: string | null = null;

    for (const pktId of this.state.queuePacketIds) {
      const pkt = this.state.packets.find((p) => p.id === pktId);
      if (!pkt) continue;

      const finishTime = Number((cumulativeSec + pkt.transmitSec).toFixed(3));
      if (finishTime <= this.state.downlinkWindowSec + 1e-6) {
        if (this.state.downlinkElapsedSec + 1e-6 >= finishTime) {
          pkt.transmitted = true;
          pkt.droppedByWindow = false;
          pkt.transmissionState = 'TRANSMITTED';
        } else {
          pkt.transmitted = false;
          allQueuedFinished = false;
          if (!activeId) {
            activeId = pkt.id;
          }
        }
        cumulativeSec = finishTime;
      } else {
        // This packet cannot fit within the 10.0s window
        pkt.transmitted = false;
        if (this.state.downlinkElapsedSec + 1e-6 >= this.state.downlinkWindowSec) {
          pkt.droppedByWindow = true;
          pkt.transmissionState = 'DROPPED_WINDOW';
        } else {
          allQueuedFinished = false;
          if (!activeId) {
            activeId = pkt.id;
          }
        }
      }
      cumulativeSec = finishTime;
    }

    const usedSec = Math.min(this.state.downlinkElapsedSec, cumulativeSec, this.state.downlinkWindowSec);
    this.state.downlinkRemainingSec = Number(
      Math.max(0, this.state.downlinkWindowSec - this.state.downlinkElapsedSec).toFixed(1),
    );
    this.state.activeDownlinkPacketId = activeId;

    const windowExpired = this.state.downlinkElapsedSec + 1e-6 >= this.state.downlinkWindowSec;

    if (allQueuedFinished || windowExpired) {
      this.finalizeDownlink();
    } else if (activeId) {
      const activePkt = this.state.packets.find((p) => p.id === activeId);
      this.state.lastStatusMessage = `TRANSMITTING ${activeId} (${activePkt?.sectorCode ?? ''} ${activePkt?.sensorMode ?? ''}) - ${this.state.downlinkRemainingSec.toFixed(1)}s window remaining (${usedSec.toFixed(1)}s elapsed)...`;
    }

    return this.getState();
  }

  /**
   * Deterministic instant-completion helper: starts downlink (if in OPERATIONS) and resolves the full pass window.
   * Returns the DebriefReport if valid, or null if the queue is empty or phase is invalid.
   */
  public commitDownlink(): DebriefReport | null {
    if (this.state.phase === 'OPERATIONS') {
      const startRes = this.startDownlink();
      if (!startRes.ok) {
        return null;
      }
    } else if (this.state.phase === 'DEBRIEF') {
      this.fail(
        'INVALID_PHASE',
        'Downlink pass has already completed. Reset mission to run a new pass.',
      );
      return null;
    }

    this.tickDownlink(this.state.downlinkWindowSec);
    return this.state.debrief ? { ...this.state.debrief } : null;
  }

  private finalizeDownlink(): void {
    let cumulativeSec = 0;
    const transmittedPackets: DataPacket[] = [];
    const droppedPackets: DataPacket[] = [];

    for (const pktId of this.state.queuePacketIds) {
      const pkt = this.state.packets.find((p) => p.id === pktId);
      if (!pkt) continue;
      cumulativeSec = Number((cumulativeSec + pkt.transmitSec).toFixed(6));
      pkt.transmitted = cumulativeSec <= this.state.downlinkWindowSec + 1e-6;
      pkt.droppedByWindow = !pkt.transmitted;
      if (pkt.transmitted) {
        if (!pkt.provenanceLineage.includes('S-BAND-TX')) {
          pkt.provenanceLineage = `${pkt.provenanceLineage} -> S-BAND-TX[OK]`;
        }
        transmittedPackets.push(pkt);
      } else {
        if (!pkt.provenanceLineage.includes('DROPPED')) {
          pkt.provenanceLineage = `${pkt.provenanceLineage} -> DROPPED[WINDOW-EXPIRED]`;
        }
        droppedPackets.push(pkt);
      }
    }

    const usedSec = Math.min(cumulativeSec, this.state.downlinkWindowSec);
    this.state.downlinkRemainingSec = Number((this.state.downlinkWindowSec - usedSec).toFixed(6));
    this.state.downlinkElapsedSec = usedSec;
    this.state.activeDownlinkPacketId = null;

    const scenario = this.getActiveScenario();

    const debrief = buildDebriefReport({
      allPackets: this.state.packets,
      transmittedPackets,
      droppedPackets,
      powerRemaining: this.state.power,
      storageUsed: this.state.storageUsed,
      downlinkUsedSec: usedSec,
      initialPower: scenario.budget.initialPower,
      downlinkWindowSec: scenario.budget.downlinkDurationSec,
      scenarioId: this.currentScenarioId,
      customScenario: this.activeCustomScenario,
    });

    this.state.phase = 'DEBRIEF';
    this.state.debrief = debrief;
    this.state.lastStatusMessage = `DOWNLINK COMPLETE (${usedSec.toFixed(1)}s / ${this.state.downlinkWindowSec.toFixed(1)}s): ${debrief.missionRank} - ${debrief.requestsVerifiedCount}/3 Requests Verified (${debrief.totalScore}/100 pts).`;
    this.state.lastActionOk = true;
  }

  private recalculateQueueTiming(): void {
    let totalSec = 0;
    for (let i = 0; i < this.state.packets.length; i++) {
      const p = this.state.packets[i];
      const qIdx = this.state.queuePacketIds.indexOf(p.id);
      if (qIdx !== -1) {
        p.queued = true;
        p.queueIndex = qIdx;
        totalSec += p.transmitSec;
      } else {
        p.queued = false;
        p.queueIndex = null;
      }
    }
    this.state.downlinkCommittedSec = Number(totalSec.toFixed(1));
  }

  public getJournal(): MissionJournalEntry[] {
    return this.journal.map((entry) => ({ ...entry, action: structuredClone(entry.action) }));
  }

  public getStateHash(): string {
    const state = this.getState();
    const serialized = JSON.stringify({
      scenarioId: state.scenarioId, phase: state.phase, paused: state.paused,
      power: state.power, storage: state.storageUsed, selectedSector: state.selectedSectorId,
      sensor: state.activeSensorMode, selectedPacket: state.selectedPacketId,
      elapsed: Number(state.downlinkElapsedSec.toFixed(3)), packets: state.packets,
      queue: state.queuePacketIds, score: state.debrief?.totalScore ?? null,
    });
    let hash = 2166136261;
    for (let i = 0; i < serialized.length; i++) hash = Math.imul(hash ^ serialized.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  public dispatch(action: MissionAction, elapsedSec?: number): ActionResult | MissionState {
    const phaseBeforeAction = this.state.phase;
    let result: ActionResult | MissionState;
    switch (action.type) {
      case 'SELECT_SECTOR': result = this.selectSector(action.sectorId); break;
      case 'SET_SENSOR': result = this.setSensorMode(action.sensorMode); break;
      case 'SELECT_PACKET': result = this.selectPacket(action.packetId); break;
      case 'SCAN': result = this.scanSector(action.sectorId, action.sensorMode); break;
      case 'PROCESS': result = this.processPacket(action.packetId); break;
      case 'DISCARD': result = this.discardPacket(action.packetId); break;
      case 'UNQUEUE': result = this.unqueuePacket(action.packetId); break;
      case 'QUEUE': result = this.queuePacket(action.packetId, action.slotIndex); break;
      case 'REORDER': result = this.reorderQueue(action.packetIds); break;
      case 'COMMIT': result = this.startDownlink(); break;
      case 'PAUSE':
      case 'RESUME':
        if (this.state.phase === 'DEBRIEF') result = this.fail('INVALID_PHASE', 'This pass is complete.');
        else {
          this.state.paused = action.type === 'PAUSE';
          this.state.lastStatusMessage = this.state.paused ? 'PAUSED - the pass clock is held. Resume when ready.' : 'PASS RESUMED - your evidence and window are preserved.';
          this.state.lastActionOk = true;
          result = this.getState();
        }
        break;
      case 'TICK': result = this.tickDownlink(action.seconds); break;
    }
    if (action.type === 'TICK' && (phaseBeforeAction !== 'DOWNLINK' || !Number.isFinite(action.seconds) || action.seconds <= 0 || this.state.paused)) return result;
    const previous = this.journal[this.journal.length - 1];
    const entry: MissionJournalEntry = {
      sequence: this.journal.length, elapsedSec: elapsedSec ?? this.state.downlinkElapsedSec,
      action: structuredClone(action), ok: 'ok' in result ? result.ok : result.lastActionOk,
      stateHash: this.getStateHash(),
    };
    if (action.type === 'TICK' && previous?.action.type === 'TICK') {
      previous.action.seconds += action.seconds;
      previous.elapsedSec = entry.elapsedSec;
      previous.stateHash = entry.stateHash;
    } else this.journal.push(entry);
    return result;
  }

  private fail(code: ActionResultCode, message: string): ActionResult {
    this.state.lastStatusMessage = message;
    this.state.lastActionOk = false;
    return {
      ok: false,
      code,
      message,
    };
  }
}

export function replayMission(scenarioId: MissionScenarioId, journal: MissionJournalEntry[]): MissionEngine {
  const engine = new MissionEngine(scenarioId);
  for (const entry of journal) {
    engine.dispatch(entry.action, entry.elapsedSec);
    if (engine.getStateHash() !== entry.stateHash) {
      throw new Error(`Replay diverged at action ${entry.sequence}: ${entry.action.type}`);
    }
  }
  return engine;
}
