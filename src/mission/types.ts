/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Pure, deterministic mission simulation types (Zero Three.js / WebXR imports).
 */

export type SectorId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type SensorMode = 'OPTICAL' | 'RADAR';

export type ConfidenceLevel = 'CONFIRMED' | 'PROBABLE' | 'UNVERIFIED';

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
}

export interface SectorConfig {
  id: SectorId;
  code: string;
  name: string;
  terrainSummary: string;
  cloudCover: 'CLEAR' | 'DENSE_STORM';
  globeNormalizedPosition: [number, number, number];
  outcomes: Record<SensorMode, SensorScanOutcome>;
}

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
  compressionAlgorithm?: 'NDWI_WATER_MASK_EXTRACTION' | 'EDGE_TRUSS_VECTORIZATION';
  storageCost: number;
  transmitSec: number;
  rawStorageCost: number;
  rawTransmitSec: number;
  compressionRatio: number;
  ambiguityReason: string;
  provenanceLineage: string;
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
  maxQueueSlots: number;
  opticalScan: {
    powerCost: number;
    storageCost: number;
    transmitSec: number;
  };
  radarScan: {
    powerCost: number;
    storageCost: number;
    transmitSec: number;
  };
  onboardProcess: {
    powerCost: number;
    compressedStorageCost: number;
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

export type MissionScenarioId =
  | 'STANDARD_INDUS_PASS'
  | 'MONSOON_SUPERCELL_PASS'
  | 'SOLAR_BROWNOUT_PASS';

export interface MissionScenarioConfig {
  id: MissionScenarioId;
  name: string;
  subtitle: string;
  briefing: string;
  budget: ResourceBudgetConfig;
  sectorOverrides?: Partial<Record<SectorId, Partial<SectorConfig>>>;
}

export interface EvidenceProvenanceRecord {
  packetId: string;
  sectorCode: string;
  sensorMode: SensorMode;
  confidence: ConfidenceLevel;
  confidenceBadge: string;
  processed: boolean;
  transmitted: boolean;
  provenance: string;
  ambiguityReason: string;
}

export interface DebriefReport {
  missionRank: 'OPTIMAL TRIAGE' | 'BEST POSSIBLE TRIAGE' | 'PARTIAL DOWNLINK' | 'CRITICAL GAP';
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
