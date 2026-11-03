/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Pure, deterministic mission simulation types (Zero Three.js / WebXR imports).
 */

export type SectorId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type SensorMode = 'OPTICAL' | 'RADAR' | 'THERMAL';

export type ConfidenceLevel = 'CONFIRMED' | 'PROBABLE' | 'UNVERIFIED';

export type InterpretationCategory =
  | 'CONFIRMED'
  | 'PROBABLE'
  | 'AMBIGUOUS'
  | 'INSUFFICIENT_EVIDENCE';

export interface StructuredProvenanceStep {
  readonly stage: 'OBSERVE' | 'INTERPRET' | 'PROCESS' | 'QUEUE' | 'TRANSMIT' | 'DROP';
  readonly timestampSec: number;
  readonly step: number;
  readonly operation: string;
  readonly details: string;
}

export type MissionPhase = 'BRIEFING' | 'OPERATIONS' | 'DOWNLINK' | 'DEBRIEF';

export type GroundRequestId = 'REQ_1' | 'REQ_2' | 'REQ_3';

export interface SensorScanOutcome {
  confidence: ConfidenceLevel;
  confidenceBadge: string;
  headline: string;
  finding: string;
  scientificReason: string;
  satisfiesRequestId: GroundRequestId | null;
  snrDb: number;
  swathWidthKm: number;
  resolutionMeters: number;
  phenomenologyTag: string;
  observationConfidencePct?: number;
  scientificCaveat?: string;
}

export interface SectorConfig {
  id: SectorId;
  code: string;
  name: string;
  terrainSummary: string;
  cloudCover:
    | 'CLEAR'
    | 'DENSE_STORM'
    | 'CONVECTIVE_CLOUD'
    | 'THIN_SMOKE'
    | 'MODERATE_SMOKE'
    | 'DENSE_SMOKE'
    | 'SEISMIC_DUST';
  globeNormalizedPosition: [number, number, number];
  outcomes: Record<SensorMode, SensorScanOutcome>;
}

export type SectorOverrideConfig = Omit<Partial<SectorConfig>, 'outcomes'> & {
  outcomes?: Partial<Record<SensorMode, SensorScanOutcome>>;
};

export interface GroundRequest {
  id: GroundRequestId;
  shortLabel: string;
  title: string;
  question: string;
  targetDescription: string;
  minimumConfidence: 'CONFIRMED' | 'PROBABLE';
  requiredBadge: string;
  targetSectorId: SectorId;
  recommendedSensor: SensorMode;
  consequenceOnSuccess: string;
  consequenceOnPartial: string;
  consequenceOnFailure: string;
}

export type CompressionAlgorithm =
  | 'OPTICAL_EVIDENCE_COMPRESSION'
  | 'OPTICAL_ROAD_EDGE_ENCODING'
  | 'SAR_BACKSCATTER_EVIDENCE_COMPRESSION'
  | 'SAR_AMBIGUITY_METADATA_ENCODING'
  | 'THERMAL_RADIOMETRIC_ENCODING'
  | 'MULTI_TEMPORAL_CHANGE_DETECTION'
  | 'INTERFEROMETRIC_CHANGE_DETECTION';

export interface DataPacket {
  id: string;
  sectorId: SectorId;
  sectorCode: string;
  sectorName: string;
  sensorMode: SensorMode;
  confidence: ConfidenceLevel;
  confidenceBadge: string;
  headline: string;
  finding: string;
  scientificReason: string;
  satisfiesRequestId: GroundRequestId | null;
  snrDb: number;
  swathWidthKm: number;
  resolutionMeters: number;
  phenomenologyTag: string;
  compressionAlgorithm?: CompressionAlgorithm;
  storageCost: number;
  transmitSec: number;
  rawStorageCost: number;
  rawTransmitSec: number;
  payloadMb?: number;
  rawPayloadMb?: number;
  throughputMbps?: number;
  protocolOverheadSec?: number;
  observationConfidencePct?: number;
  scientificCaveat?: string;
  compressionRatio: number;
  ambiguityReason: string;
  provenanceLineage: string;
  evidenceId?: string;
  observationId?: string;
  parentEvidenceId?: string | null;
  observationTimestampSec?: number;
  observationCondition?: string;
  processingState?: 'RAW' | 'PROCESSED' | 'DISCARDED';
  processingOperation?: string | null;
  interpretationCategory?: InterpretationCategory;
  knownUncertainty?: string;
  associatedRequestId?: GroundRequestId | null;
  transmissionState?: 'UNQUEUED' | 'QUEUED' | 'TRANSMITTED' | 'DROPPED_WINDOW';
  provenanceChain?: StructuredProvenanceStep[];
  processed: boolean;
  queued: boolean;
  queueIndex: number | null;
  transmitted: boolean;
  droppedByWindow: boolean;
  createdAtStep: number;
}

export interface ResourceBudgetConfig {
  initialPower: number;
  maxStorage: number;
  downlinkDurationSec: number;
  downlinkThroughputMbps?: number;
  protocolOverheadSec?: number;
  maxQueueSlots: number;
  opticalScan: {
    powerCost: number;
    storageCost: number;
    payloadMb?: number;
    transmitSec: number;
  };
  radarScan: {
    powerCost: number;
    storageCost: number;
    payloadMb?: number;
    transmitSec: number;
  };
  thermalScan?: {
    powerCost: number;
    storageCost: number;
    payloadMb?: number;
    transmitSec: number;
  };
  onboardProcess: {
    powerCost: number;
    compressedStorageCost: number;
    compressedPayloadMb?: number;
    compressedTransmitSec: number;
  };
}

export type ActionResultCode =
  | 'OK'
  | 'INVALID_PHASE'
  | 'INVALID_SECTOR'
  | 'INVALID_SENSOR'
  | 'INSUFFICIENT_POWER'
  | 'INSUFFICIENT_STORAGE'
  | 'TRAY_FULL'
  | 'PACKET_NOT_FOUND'
  | 'ALREADY_PROCESSED'
  | 'CANNOT_PROCESS_UNVERIFIED'
  | 'QUEUE_FULL'
  | 'NOT_QUEUED'
  | 'EMPTY_QUEUE';

export interface ActionResult {
  ok: boolean;
  code: ActionResultCode;
  message: string;
  packet?: DataPacket;
}

export interface RequestEvaluation {
  requestId: GroundRequestId;
  shortLabel: string;
  title: string;
  status: 'VERIFIED' | 'PARTIAL' | 'UNVERIFIED';
  statusBadge: string;
  scorePoints: number;
  maxPoints: number;
  matchedPacketId: string | null;
  matchedSectorId: SectorId | null;
  matchedSensorMode: SensorMode | null;
  matchedConfidence: ConfidenceLevel | null;
  explanation: string;
  groundConsequence: string;
}

export type EfficiencyGrade = 'S' | 'A' | 'B' | 'C';

export type MissionOutcome = 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';

export type FailureReasonCode =
  | 'NONE'
  | 'WRONG_SENSOR_FOR_WEATHER'
  | 'WINDOW_CUTOFF_DROPPED_PACKETS'
  | 'UNPROCESSED_STORAGE_BOTTLENECK'
  | 'INSUFFICIENT_VERIFIED_EVIDENCE';

export type MissionCertification = 'GOLD' | 'SILVER' | 'BRONZE' | 'NONE';

export type MissionScenarioId =
  | 'ORBITAL_ACADEMY'
  | 'STANDARD_INDUS_PASS'
  | 'MONSOON_SUPERCELL_PASS'
  | 'SOLAR_BROWNOUT_PASS'
  | 'FIRELINE_PASS'
  | 'AFTERSHOCK_PASS'
  | 'DEFENSE_SHIELD_PASS';

export interface MissionScenarioConfig {
  id: MissionScenarioId;
  operationCode?: string;
  name: string;
  subtitle: string;
  briefing: string;
  budget: ResourceBudgetConfig;
  availableSensors?: SensorMode[];
  performsChangeDetection?: boolean;
  requests?: Record<GroundRequestId, GroundRequest>;
  sectorOverrides?: Partial<Record<SectorId, SectorOverrideConfig>>;
}

export interface EvidenceProvenanceRecord {
  packetId: string;
  evidenceId?: string;
  observationId?: string;
  sectorCode: string;
  sensorMode: SensorMode;
  confidence: ConfidenceLevel;
  confidenceBadge: string;
  interpretationCategory?: InterpretationCategory;
  knownUncertainty?: string;
  processed: boolean;
  transmitted: boolean;
  transmissionState?: 'UNQUEUED' | 'QUEUED' | 'TRANSMITTED' | 'DROPPED_WINDOW';
  provenance: string;
  provenanceChain?: StructuredProvenanceStep[];
  ambiguityReason: string;
}

export interface DebriefReport {
  missionRank:
    | 'OPTIMAL TRIAGE'
    | 'BEST POSSIBLE TRIAGE'
    | 'PARTIAL DOWNLINK'
    | 'CRITICAL GAP'
    | 'TRAINING COMPLETE'
    | 'TRAINING COMPLETE — ORBITAL OPERATOR QUALIFIED';
  outcome?: MissionOutcome;
  certification?: MissionCertification;
  failureReasonCode?: FailureReasonCode;
  failureExplanation?: string;
  transmittedPayloadMb?: number;
  downlinkThroughputMbps?: number;
  efficiencyGrade: EfficiencyGrade;
  totalScore: number;
  maxScore: number;
  requestsVerifiedCount: number;
  requestsPartialCount: number;
  requestsUnverifiedCount: number;
  powerRemaining: number;
  powerUsed: number;
  storageUsed: number;
  downlinkUsedSec: number;
  downlinkWindowSec: number;
  transmittedPacketIds: string[];
  droppedPacketIds: string[];
  evaluations: RequestEvaluation[];
  evidenceProvenance?: EvidenceProvenanceRecord[];
  summaryHeadline: string;
  deterministicRecommendation: string;
  counterfactualComparison: string;
  achievableScore: number;
  windowMarginSec: number;
  benchmarkPowerUsed: number;
  benchmarkDownlinkSec: number;
}

export interface MissionState {
  scenarioId: MissionScenarioId;
  phase: MissionPhase;
  paused: boolean;
  selectedSectorId: SectorId;
  activeSensorMode: SensorMode;
  selectedPacketId: string | null;
  power: number;
  maxPower: number;
  storageUsed: number;
  maxStorage: number;
  downlinkWindowSec: number;
  downlinkRemainingSec: number;
  downlinkElapsedSec: number;
  downlinkCommittedSec: number;
  activeDownlinkPacketId: string | null;
  packets: DataPacket[];
  queuePacketIds: string[];
  lastStatusMessage: string;
  lastActionOk: boolean;
  stepCounter: number;
  debrief: DebriefReport | null;
}

export type MissionAction =
  | { type: 'SELECT_SECTOR'; sectorId: SectorId }
  | { type: 'SET_SENSOR'; sensorMode: SensorMode }
  | { type: 'SELECT_PACKET'; packetId: string | null }
  | { type: 'SCAN'; sectorId: SectorId; sensorMode: SensorMode }
  | { type: 'PROCESS' | 'DISCARD' | 'UNQUEUE'; packetId: string | null }
  | { type: 'QUEUE'; packetId: string | null; slotIndex?: number }
  | { type: 'REORDER'; packetIds: string[] }
  | { type: 'COMMIT' | 'PAUSE' | 'RESUME' }
  | { type: 'TICK'; seconds: number };

export interface MissionJournalEntry {
  sequence: number;
  elapsedSec: number;
  action: MissionAction;
  ok: boolean;
  stateHash: string;
}

export interface QueueScheduleEntry {
  packetId: string;
  slotIndex: number;
  startSec: number;
  endSec: number;
  fits: boolean;
  progress: number;
}

export type MissionPlanAction =
  | { type: 'SCAN'; sectorId: SectorId; sensorMode: SensorMode }
  | { type: 'PROCESS' | 'DISCARD' | 'QUEUE' | 'UNQUEUE'; sectorId: SectorId; sensorMode: SensorMode; packetId: string };

export interface MissionSolution {
  score: number;
  verifiedRequests: number;
  partialRequests: number;
  powerUsed: number;
  powerRemaining: number;
  transmitSec: number;
  actions: MissionPlanAction[];
}
