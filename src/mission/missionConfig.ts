/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Canonical deterministic mission configuration, sector physics, and resource balance.
 * Note: This scenario is a fictional Earth-observation triage simulation. Sensor behaviors
 * reflect real physical trade-offs (optical cloud obscuration vs. microwave SAR backscatter
 * and geometric/metallic ambiguity), while Power, Storage, and Downlink seconds are explicit
 * gameplay balance parameters.
 */

import type {
  ConfidenceLevel,
  GroundRequest,
  GroundRequestId,
  MissionScenarioConfig,
  MissionScenarioId,
  ResourceBudgetConfig,
  SectorConfig,
  SectorId,
  SensorMode,
} from './types';

export const CONFIDENCE_BADGES: Record<ConfidenceLevel, string> = {
  CONFIRMED: '[OK] CONFIRMED',
  PROBABLE: '[?] PROBABLE',
  UNVERIFIED: '[X] UNVERIFIED',
};

/**
 * Verified gameplay resource arithmetic:
 * - Required optimal scans:
 *   - Sector B (RADAR): 14 Power, 3 Storage, 4.5s Tx -> [OK] CONFIRMED (Request 1)
 *   - Sector C (OPTICAL): 8 Power, 3 Storage, 4.0s Tx -> [OK] CONFIRMED (Request 2)
 *   - Sector E (RADAR): 14 Power, 3 Storage, 4.5s Tx -> [?] PROBABLE (Request 3)
 *   Total scan cost = 14 + 8 + 14 = 36 Power, 9/9 Storage, 13.0s raw Tx (> 10.0s window!).
 * - Onboard Processing (6 Power each):
 *   - Process 2 packets (6 + 6 = 12 Power): compresses each from 3 Storage -> 1 Storage and 4.5s -> 1.8s Tx.
 *   - Total Power used = 36 + 12 = 48 / 55 Power (7 Power margin for 1 exploratory scan or 3rd compression).
 *   - Total Tx time = 1.8s + 4.0s + 1.8s = 7.6s <= 10.0s downlink window!
 */
export const MISSION_BUDGET: ResourceBudgetConfig = {
  initialPower: 55,
  maxStorage: 9,
  downlinkDurationSec: 10.0,
  maxQueueSlots: 3,
  opticalScan: {
    powerCost: 8,
    storageCost: 3,
    transmitSec: 4.0,
  },
  radarScan: {
    powerCost: 14,
    storageCost: 3,
    transmitSec: 4.5,
  },
  onboardProcess: {
    powerCost: 6,
    compressedStorageCost: 1,
    compressedTransmitSec: 1.8,
  },
};

export const SECTOR_ORDER: SectorId[] = ['A', 'B', 'C', 'D', 'E', 'F'];

export const SECTORS: Record<SectorId, SectorConfig> = {
  A: {
    id: 'A',
    code: 'SEC-A',
    name: 'Indus Barrage North',
    terrainSummary: 'Headworks reservoir & primary northern spillway gates.',
    cloudCover: 'CLEAR',
    globeNormalizedPosition: [-0.52, 0.58, 0.62],
    outcomes: {
      OPTICAL: {
        confidence: 'CONFIRMED',
        confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
        headline: 'Spillway Intact - No Access Road Here',
        finding: 'Clear optical pass shows northern headworks holding steady; no convoy road in this sector.',
        scientificReason: 'Cloud-free nadir optical frame confirms concrete spillway integrity, but does not answer convoy road or crossing requests.',
        satisfiesRequestId: null,
        snrDb: 28.5,
        swathWidthKm: 18.5,
        resolutionMeters: 0.75,
        phenomenologyTag: 'VISIBLE_NEAR_INFRARED_REFLECTANCE',
      },
      RADAR: {
        confidence: 'CONFIRMED',
        confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
        headline: 'Reservoir Surface Stable',
        finding: 'SAR backscatter shows calm upstream impoundment; no emergency convoy route located here.',
        scientificReason: 'Low-backscatter specular water return confirms normal reservoir boundaries outside the flooded access corridor.',
        satisfiesRequestId: null,
        snrDb: 24.1,
        swathWidthKm: 24.0,
        resolutionMeters: 2.2,
        phenomenologyTag: 'SPECULAR_RESERVOIR_BACKSCATTER',
      },
    },
  },
  B: {
    id: 'B',
    code: 'SEC-B',
    name: 'East Levee Highway',
    terrainSummary: 'Primary convoy access arterial beneath dense monsoon cloud deck.',
    cloudCover: 'DENSE_STORM',
    globeNormalizedPosition: [0.48, 0.52, 0.70],
    outcomes: {
      OPTICAL: {
        confidence: 'UNVERIFIED',
        confidenceBadge: CONFIDENCE_BADGES.UNVERIFIED,
        headline: 'Opaque Cloud Deck - Ground Obscured',
        finding: 'High cloud-top reflectance blocks passive optical visibility of the East Levee Highway.',
        scientificReason: 'Passive visible/near-IR sensors cannot image through thick water-droplet cloud cover. Switch to active microwave Radar/SAR.',
        satisfiesRequestId: null,
        snrDb: 4.1,
        swathWidthKm: 18.5,
        resolutionMeters: 0.75,
        phenomenologyTag: 'CLOUD_TOP_MIE_SCATTERING_OCCLUSION',
      },
      RADAR: {
        confidence: 'CONFIRMED',
        confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
        headline: 'East Levee Breach & Highway Inundation',
        finding: 'Microwave SAR images through cloud cover: dark specular flood sheet covers 2.4 km of East Levee Highway.',
        scientificReason: 'Active microwave SAR is largely unaffected by cloud cover compared to optical sensors; smooth floodwater reflects pulses away from the antenna, creating a distinct dark inundation signature.',
        satisfiesRequestId: 'REQ_1',
        snrDb: 22.8,
        swathWidthKm: 24.0,
        resolutionMeters: 2.2,
        phenomenologyTag: 'SPECULAR_WATER_DOUBLE_BOUNCE_SAR',
      },
    },
  },
  C: {
    id: 'C',
    code: 'SEC-C',
    name: 'Steel Truss Crossing',
    terrainSummary: 'High-clearance cantilevered river bridge under clear sky slot.',
    cloudCover: 'CLEAR',
    globeNormalizedPosition: [-0.64, 0.08, 0.76],
    outcomes: {
      OPTICAL: {
        confidence: 'CONFIRMED',
        confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
        headline: 'Deck & Approaches Visible - Free of Standing Water',
        finding: 'High-resolution optical frame shows dry approaches and visible deck alignment without surface floodwater.',
        scientificReason: 'Cloud-free visible/near-IR nadir frame shows unobstructed roadway surfaces above water level. Spaceborne imagery cannot evaluate sub-surface structural load capacity.',
        satisfiesRequestId: 'REQ_2',
        snrDb: 29.2,
        swathWidthKm: 18.5,
        resolutionMeters: 0.75,
        phenomenologyTag: 'VISIBLE_NEAR_INFRARED_REFLECTANCE',
      },
      RADAR: {
        confidence: 'PROBABLE',
        confidenceBadge: CONFIDENCE_BADGES.PROBABLE,
        headline: 'Engineered Structure Return - Multipath Glare Ambiguity',
        finding: 'SAR detects high-backscatter alignment consistent with an engineered structure; dihedral multipath scattering leaves road deck and approach flood state ambiguous.',
        scientificReason: 'Perpendicular structural members and surrounding terrain act as corner reflectors, producing bright returns that mask fine-scale deck inundation. Strong return is consistent with an engineered structure; flood state remains ambiguous.',
        satisfiesRequestId: 'REQ_2',
        snrDb: 18.5,
        swathWidthKm: 24.0,
        resolutionMeters: 2.2,
        phenomenologyTag: 'METALLIC_DIHEDRAL_MULTIPATH_RADAR',
      },
    },
  },
  D: {
    id: 'D',
    code: 'SEC-D',
    name: 'Old Masonry Causeway',
    terrainSummary: 'Low-water stone crossing across the central braided channel.',
    cloudCover: 'CLEAR',
    globeNormalizedPosition: [0.18, -0.05, 0.98],
    outcomes: {
      OPTICAL: {
        confidence: 'CONFIRMED',
        confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
        headline: 'Causeway Washed Out - Impassable',
        finding: 'Turbid brown floodwater overtops the masonry causeway with visible central span collapse.',
        scientificReason: 'Optical contrast between sediment-laden torrent and broken stone piers confirms this crossing cannot carry rescue vehicles.',
        satisfiesRequestId: null,
        snrDb: 27.8,
        swathWidthKm: 18.5,
        resolutionMeters: 0.75,
        phenomenologyTag: 'VISIBLE_SEDIMENT_CONTRAST',
      },
      RADAR: {
        confidence: 'PROBABLE',
        confidenceBadge: CONFIDENCE_BADGES.PROBABLE,
        headline: 'Submerged Causeway - High Current Turbulence',
        finding: 'Bragg scattering indicates broken water over submerged stone piers; crossing is impassable.',
        scientificReason: 'Surface wave roughness increases radar backscatter, indicating turbulent flow over the collapsed causeway rather than a passable bridge.',
        satisfiesRequestId: null,
        snrDb: 16.9,
        swathWidthKm: 24.0,
        resolutionMeters: 2.2,
        phenomenologyTag: 'BRAGG_TURBULENT_WATER_SCATTERING',
      },
    },
  },
  E: {
    id: 'E',
    code: 'SEC-E',
    name: 'Shelter Ridge Spur',
    terrainSummary: 'Elevated evacuation spur road under heavy orographic cloud cover.',
    cloudCover: 'DENSE_STORM',
    globeNormalizedPosition: [-0.36, -0.58, 0.72],
    outcomes: {
      OPTICAL: {
        confidence: 'UNVERIFIED',
        confidenceBadge: CONFIDENCE_BADGES.UNVERIFIED,
        headline: 'Orographic Cloud Bank - Zero Ground Contact',
        finding: 'Thick ridge cloud cover blocks passive optical observation of Shelter Ridge Spur.',
        scientificReason: 'Passive optical sensors only capture cloud-top albedo here; onboard compression cannot recover unrecorded ground features.',
        satisfiesRequestId: null,
        snrDb: 3.9,
        swathWidthKm: 18.5,
        resolutionMeters: 0.75,
        phenomenologyTag: 'CLOUD_TOP_MIE_SCATTERING_OCCLUSION',
      },
      RADAR: {
        confidence: 'PROBABLE',
        confidenceBadge: CONFIDENCE_BADGES.PROBABLE,
        headline: 'Ridge Spur Above Floodline - Slope Layover Zone',
        finding: 'SAR images through ridge cloud bank: spur corridor remains above flood level, with steep-slope layover near Km 4.',
        scientificReason: 'Microwave radar observes the elevated corridor through cloud cover, though steep terrain geometry introduces side-looking foreshortening that limits confidence to [?] PROBABLE.',
        satisfiesRequestId: 'REQ_3',
        snrDb: 15.2,
        swathWidthKm: 24.0,
        resolutionMeters: 2.2,
        phenomenologyTag: 'OROGRAPHIC_PENETRATION_TERRAIN_LAYOVER',
      },
    },
  },
  F: {
    id: 'F',
    code: 'SEC-F',
    name: 'Southern Retention Basin',
    terrainSummary: 'Agricultural overflow plain south of the inhabited districts.',
    cloudCover: 'CLEAR',
    globeNormalizedPosition: [0.54, -0.52, 0.66],
    outcomes: {
      OPTICAL: {
        confidence: 'CONFIRMED',
        confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
        headline: 'Retention Plain Flooding as Designed',
        finding: 'Clear optical frame shows agricultural retention polders absorbing downstream runoff.',
        scientificReason: 'Expected overflow storage zone; contains no evacuation crossings or shelter spur routes.',
        satisfiesRequestId: null,
        snrDb: 28.0,
        swathWidthKm: 18.5,
        resolutionMeters: 0.75,
        phenomenologyTag: 'VISIBLE_NEAR_INFRARED_REFLECTANCE',
      },
      RADAR: {
        confidence: 'CONFIRMED',
        confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
        headline: 'Retention Basin Sheet Water',
        finding: 'Uniform low-backscatter water sheet across unmanned southern retention fields.',
        scientificReason: 'Confirms southern basin is flooded as planned, but provides no actionable triage evidence for the 3 ground requests.',
        satisfiesRequestId: null,
        snrDb: 23.5,
        swathWidthKm: 24.0,
        resolutionMeters: 2.2,
        phenomenologyTag: 'INUNDATED_VEGETATION_BACKSCATTER',
      },
    },
  },
};

export const GROUND_REQUESTS: Record<GroundRequestId, GroundRequest> = {
  REQ_1: {
    id: 'REQ_1',
    shortLabel: 'REQ 1 | ROAD INUNDATION',
    title: 'Assess Highway Surface Inundation',
    question: 'Which primary transport corridor shows specular floodwater encroachment?',
    targetDescription: 'Sector B (East Levee Highway) - Cloud-obscured; requires active microwave SAR for [OK] CONFIRMED.',
    minimumConfidence: 'CONFIRMED',
    requiredBadge: '[OK] CONFIRMED',
    targetSectorId: 'B',
    recommendedSensor: 'RADAR',
    consequenceOnSuccess:
      'Emergency convoys alerted to Sector B surface water encroachment; transport rerouted before reaching flooded road segments.',
    consequenceOnPartial:
      'Unverified cloud imagery left levee road inundation depth uncertain; scouts dispatched for physical ground inspection.',
    consequenceOnFailure:
      'No verified remote-sensing evidence downlinked for Sector B; relief convoy delayed reversing from inundated roadway.',
  },
  REQ_2: {
    id: 'REQ_2',
    shortLabel: 'REQ 2 | CROSSING APPROACH',
    title: 'Assess River Crossing Approach Clearance',
    question: 'Does the Sector C crossing approach show clear, unflooded roadway access?',
    targetDescription: 'Sector C (Steel Truss Crossing) - Clear sky slot; requires high-res OPTICAL for [OK] CONFIRMED.',
    minimumConfidence: 'CONFIRMED',
    requiredBadge: '[OK] CONFIRMED',
    targetSectorId: 'C',
    recommendedSensor: 'OPTICAL',
    consequenceOnSuccess:
      'Optical pass confirms Sector C bridge deck and approach ramps appear clear of standing floodwater; engineers cleared for access check.',
    consequenceOnPartial:
      'Radar metallic dihedral glare left deck surface conditions ambiguous; crossing passability remains unverified pending visual confirmation.',
    consequenceOnFailure:
      'Crossing observation not downlinked before cutoff; heavy medical units held at staging depot.',
  },
  REQ_3: {
    id: 'REQ_3',
    shortLabel: 'REQ 3 | SHELTER SPUR',
    title: 'Evaluate Highland Evacuation Spur Floodline',
    question: 'Does the cloud-locked highland evacuation spur show terrain elevated above the standing water boundary?',
    targetDescription: 'Sector E (Shelter Ridge Spur) - Cloud-obscured; requires active microwave SAR for [?] PROBABLE.',
    minimumConfidence: 'PROBABLE',
    requiredBadge: '[?] PROBABLE',
    targetSectorId: 'E',
    recommendedSensor: 'RADAR',
    consequenceOnSuccess:
      'SAR telemetry indicates Sector E ridge spur remains elevated above the low-backscatter flood sheet; scouts proceed with radar slope map.',
    consequenceOnPartial:
      'Steep-slope radar layover obscured lower spur switchbacks; ground scouts deployed with caution for physical route check.',
    consequenceOnFailure:
      'No radar telemetry downlinked for Sector E; highland evacuation staging postponed.',
  },
};

export const GROUND_REQUEST_ORDER: GroundRequestId[] = ['REQ_1', 'REQ_2', 'REQ_3'];

export const MISSION_SCENARIOS: Record<MissionScenarioId, MissionScenarioConfig> = {
  STANDARD_INDUS_PASS: {
    id: 'STANDARD_INDUS_PASS',
    name: 'Indus Basin Daylight Pass',
    subtitle: 'Standard sun-synchronous pass over Sindh & Punjab headworks.',
    briefing: 'Optimal pass window: 55 PWR, 9 STR, 10.0s window. Sectors B & E under monsoon storm clouds; Sector C in clear slot.',
    budget: MISSION_BUDGET,
  },
  MONSOON_SUPERCELL_PASS: {
    id: 'MONSOON_SUPERCELL_PASS',
    name: 'Monsoon Supercell Penetration',
    subtitle: 'Severe convective cloud wall spanning Sectors B, C, and E.',
    briefing: 'Damage-limitation mission: 54 power units, 9 storage units, 9.0s window. Radar sees through all three storm targets, but bridge glare prevents full certainty. Preserve the strongest evidence; 100/100 is not achievable on this pass.',
    budget: {
      ...MISSION_BUDGET,
      initialPower: 54,
      maxStorage: 9,
      downlinkDurationSec: 9.0,
    },
    sectorOverrides: {
      C: {
        cloudCover: 'DENSE_STORM',
        outcomes: {
          OPTICAL: {
            confidence: 'UNVERIFIED',
            confidenceBadge: CONFIDENCE_BADGES.UNVERIFIED,
            headline: 'Convective Cell Obscuration',
            finding: 'Expanding storm cloud wall covers Sector C; optical bridge deck obscured.',
            scientificReason: 'Thick storm cloud deck blocks visible-spectrum observation of bridge abutments.',
            satisfiesRequestId: null,
            snrDb: 3.8,
            swathWidthKm: 18.5,
            resolutionMeters: 0.75,
            phenomenologyTag: 'CLOUD_TOP_MIE_SCATTERING_OCCLUSION',
          },
          RADAR: {
            confidence: 'PROBABLE',
            confidenceBadge: CONFIDENCE_BADGES.PROBABLE,
            headline: 'Engineered Structure Return - Multipath Glare Ambiguity',
            finding: 'SAR penetrates convective storm cell: strong return consistent with an engineered structure, but intense multipath glare leaves flood state ambiguous.',
            scientificReason: 'Steel girders and water surface act as dihedral corner reflectors at microwave wavelengths, causing bright multipath returns that obscure deck inundation status. Flood state remains ambiguous; visual inspection required.',
            satisfiesRequestId: 'REQ_2',
            snrDb: 18.5,
            swathWidthKm: 24.0,
            resolutionMeters: 2.2,
            phenomenologyTag: 'METALLIC_DIHEDRAL_MULTIPATH_RADAR',
          },
        },
      },
    },
  },
  SOLAR_BROWNOUT_PASS: {
    id: 'SOLAR_BROWNOUT_PASS',
    name: 'Eclipse Orbit Solar Brownout',
    subtitle: 'Battery drain & degraded solid-state storage partition.',
    briefing: 'Sequence puzzle: 50 power units, 6 storage units, 8.0s window. Tight 6-unit storage partition requires mid-pass cradle compression between scans to avoid memory exhaustion. Razor-thin 2 PWR margin. Evidence order matters as much as downlink order.',
    budget: {
      ...MISSION_BUDGET,
      initialPower: 50,
      maxStorage: 6,
      downlinkDurationSec: 8.0,
    },
  },
};

export const MAX_EVIDENCE_CUBES = 3;

export function getScenarioSector(scenarioId: MissionScenarioId, sectorId: SectorId): SectorConfig {
  const base = SECTORS[sectorId];
  const override = MISSION_SCENARIOS[scenarioId].sectorOverrides?.[sectorId];
  return override
    ? { ...base, ...override, outcomes: { ...base.outcomes, ...override.outcomes } }
    : base;
}

export function getRecommendedSensor(scenarioId: MissionScenarioId, sectorId: SectorId): SensorMode {
  const sector = getScenarioSector(scenarioId, sectorId);
  const rank = { UNVERIFIED: 0, PROBABLE: 1, CONFIRMED: 2 };
  const optical = sector.outcomes.OPTICAL;
  const radar = sector.outcomes.RADAR;
  if (rank[optical.confidence] !== rank[radar.confidence]) {
    return rank[optical.confidence] > rank[radar.confidence] ? 'OPTICAL' : 'RADAR';
  }
  return sector.cloudCover === 'DENSE_STORM' ? 'RADAR' : 'OPTICAL';
}
