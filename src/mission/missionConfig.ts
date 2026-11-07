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
 * Physical Downlink Channel & Solid-State Storage Model (Karachi Ground Station S-Band Link):
 *   t_transmission = (payloadMb / throughputMbps) + protocolOverheadSec
 *   Authoritative Solid-State Storage Unit: 1 STR = 18.0 MB (physical flash block allocation: Math.ceil(payloadMb / 18))
 * - Optical Raw:   40.0 MB @ 10.0 MB/s = 4.0s Tx (8 Wh capacitor energy, 3 STR buffer)
 * - Thermal IR:    42.0 MB @ 10.0 MB/s = 4.2s Tx (11 Wh capacitor energy, 3 STR buffer)
 * - SAR Radar Raw: 45.0 MB @ 10.0 MB/s = 4.5s Tx (14 Wh capacitor energy, 3 STR buffer)
 * - Compressed:    18.0 MB @ 10.0 MB/s = 1.8s Tx (6 Wh compute cost, 1 STR buffer)
 */
export const STORAGE_UNIT_MB = 18.0;
export const DOWNLINK_THROUGHPUT_MBPS = 10.0;
export const PROTOCOL_OVERHEAD_SEC = 0.0;

export function computeTransmissionSeconds(
  payloadMb: number,
  throughputMbps: number = DOWNLINK_THROUGHPUT_MBPS,
  overheadSec: number = PROTOCOL_OVERHEAD_SEC,
): number {
  const safeThroughput = throughputMbps > 0 ? throughputMbps : DOWNLINK_THROUGHPUT_MBPS;
  return Number((payloadMb / safeThroughput + overheadSec).toFixed(2));
}

export function deriveSensorScientificCaveat(
  sensorMode: SensorMode,
  confidence: ConfidenceLevel,
  phenomenologyTag: string,
): { observationConfidencePct: number; scientificCaveat: string } {
  if (sensorMode === 'RADAR') {
    if (confidence === 'CONFIRMED') {
      return {
        observationConfidencePct: 91,
        scientificCaveat:
          'NASA SAR Note: Smooth open water acts as a specular reflector (dark low-backscatter return), whereas flooded vegetation or embankments produce strong double-bounce returns. Single-pass SAR amplitude cannot measure water depth directly.',
      };
    }
    if (confidence === 'PROBABLE') {
      return {
        observationConfidencePct: 68,
        scientificCaveat: phenomenologyTag.includes('DIHEDRAL')
          ? 'NASA SAR Note (Sim. Obs. Conf. 68%): Steel bridge trusses and water surfaces form dihedral corner reflectors that create bright multipath glare, masking fine deck inundation.'
          : 'NASA SAR Note (Sim. Obs. Conf. 68%): Side-looking radar geometry over steep terrain introduces foreshortening, layover, and shadow; pre/post-event multi-temporal baseline differencing or optical verification reduces ambiguity.',
      };
    }
    return {
      observationConfidencePct: 18,
      scientificCaveat:
        'NASA SAR Note: Microwave radar measures surface dielectric roughness and geometry rather than radiative temperature, so it cannot isolate sub-canopy thermal hotspots.',
    };
  }

  if (sensorMode === 'THERMAL') {
    if (confidence === 'CONFIRMED') {
      return {
        observationConfidencePct: 89,
        scientificCaveat:
          'NASA FIRMS Note: Mid-wave/long-wave IR (3.9–11 um) penetrates thin biomass smoke aerosols to detect radiative heat anomalies, though sub-canopy smoldering and coarse pixel footprints remain bounded.',
      };
    }
    if (confidence === 'PROBABLE') {
      return {
        observationConfidencePct: 64,
        scientificCaveat:
          'NASA FIRMS Note: Spaceborne thermal IR has coarser diffraction-limited spatial resolution (20 m) than visible optical sensors (0.75 m), blending narrow structural features with background temperatures.',
      };
    }
    return {
      observationConfidencePct: 14,
      scientificCaveat:
        'NASA FIRMS Note: While thermal IR penetrates thin smoke haze, optically thick water-droplet storm clouds and dense mineral dust plumes absorb terrestrial IR emission.',
    };
  }

  // OPTICAL
  if (confidence === 'CONFIRMED') {
    return {
      observationConfidencePct: 95,
      scientificCaveat:
        'Optical Remote Sensing Note: 0.75 m Ground Sample Distance (GSD) visible/near-IR imagery detects major road blockages, substantial visible structural changes, and large bridge damage indicators under clear skies (effective spatial resolution is bounded by optical MTF blur and SNR, and cannot resolve fine cracks or subsurface load capacity).',
    };
  }
  if (confidence === 'PROBABLE') {
    return {
      observationConfidencePct: 65,
      scientificCaveat:
        'Optical Remote Sensing Note: Partial atmospheric haze or oblique viewing geometry reduces surface contrast.',
    };
  }
  return {
    observationConfidencePct: 10,
    scientificCaveat:
      'Optical Remote Sensing Note: Passive visible/near-IR wavelengths (0.4–0.9 um) suffer severe Mie scattering from cloud water droplets and dense smoke aerosols.',
  };
}

export const MISSION_BUDGET: ResourceBudgetConfig = {
  initialPower: 55,
  maxStorage: 9,
  downlinkDurationSec: 10.0,
  downlinkThroughputMbps: DOWNLINK_THROUGHPUT_MBPS,
  protocolOverheadSec: PROTOCOL_OVERHEAD_SEC,
  maxQueueSlots: 3,
  opticalScan: {
    powerCost: 8,
    storageCost: 3,
    payloadMb: 40.0,
    transmitSec: computeTransmissionSeconds(40.0),
  },
  radarScan: {
    powerCost: 14,
    storageCost: 3,
    payloadMb: 45.0,
    transmitSec: computeTransmissionSeconds(45.0),
  },
  thermalScan: {
    powerCost: 11,
    storageCost: 3,
    payloadMb: 42.0,
    transmitSec: computeTransmissionSeconds(42.0),
  },
  onboardProcess: {
    powerCost: 6,
    compressedStorageCost: 1,
    compressedPayloadMb: 18.0,
    compressedTransmitSec: computeTransmissionSeconds(18.0),
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
      THERMAL: {
        confidence: 'CONFIRMED',
        confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
        headline: 'Cool Reservoir Thermal Signature - No Convoy Route',
        finding: 'Thermal IR measures uniform 287 K reservoir water surface; no emergency transport corridor in Sector A.',
        scientificReason: 'Long-wave thermal infrared distinguishes cool deep water from sun-warmed concrete headworks, but does not address the 3 priority ground requests.',
        satisfiesRequestId: null,
        snrDb: 22.4,
        swathWidthKm: 20.0,
        resolutionMeters: 20.0,
        phenomenologyTag: 'THERMAL_INERTIA_WATER_BOUNDARY',
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
      THERMAL: {
        confidence: 'UNVERIFIED',
        confidenceBadge: CONFIDENCE_BADGES.UNVERIFIED,
        headline: 'Cold Convective Cloud Tops - Surface Blocked',
        finding: 'Thermal IR records 225 K upper-tropospheric cloud tops; dense water-droplet clouds absorb surface thermal emission.',
        scientificReason: 'While mid-wave IR can penetrate thin smoke aerosols, optically thick water-droplet storm clouds are opaque to thermal infrared wavelengths. Use active SAR Radar.',
        satisfiesRequestId: null,
        snrDb: 4.5,
        swathWidthKm: 20.0,
        resolutionMeters: 20.0,
        phenomenologyTag: 'CLOUD_TOP_THERMAL_ABSORPTION',
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
      THERMAL: {
        confidence: 'PROBABLE',
        confidenceBadge: CONFIDENCE_BADGES.PROBABLE,
        headline: 'Warm Bridge Corridor - Coarse 20m Pixel Blur',
        finding: 'Thermal IR detects warm dry asphalt on approach embankments, but 20m spatial resolution blends bridge deck with river channel.',
        scientificReason: 'Spaceborne thermal IR sensors have coarser diffraction-limited spatial resolution (20 m) than visible optical cameras (0.75 m), leaving narrow bridge deck clearance only [?] PROBABLE.',
        satisfiesRequestId: 'REQ_2',
        snrDb: 17.4,
        swathWidthKm: 20.0,
        resolutionMeters: 20.0,
        phenomenologyTag: 'COARSE_THERMAL_MIXED_PIXEL_BLUR',
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
      THERMAL: {
        confidence: 'PROBABLE',
        confidenceBadge: CONFIDENCE_BADGES.PROBABLE,
        headline: 'Cool River Plume Over Submerged Causeway',
        finding: 'Thermal band shows unbroken cool river plume across the masonry causeway alignment.',
        scientificReason: 'Absence of warm exposed roadway confirms water overtopping, though Sector D is not a requested evacuation target.',
        satisfiesRequestId: null,
        snrDb: 16.2,
        swathWidthKm: 20.0,
        resolutionMeters: 20.0,
        phenomenologyTag: 'THERMAL_PLUME_OVERTOPPING',
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
      THERMAL: {
        confidence: 'UNVERIFIED',
        confidenceBadge: CONFIDENCE_BADGES.UNVERIFIED,
        headline: 'Orographic Cloud Opacity - Thermal Blocked',
        finding: 'Dense water-droplet ridge clouds block surface thermal emission from Shelter Ridge Spur.',
        scientificReason: 'Optically thick orographic cloud banks absorb terrestrial infrared radiation. Active microwave SAR is required to image through storm clouds.',
        satisfiesRequestId: null,
        snrDb: 4.2,
        swathWidthKm: 20.0,
        resolutionMeters: 20.0,
        phenomenologyTag: 'CLOUD_TOP_THERMAL_ABSORPTION',
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
      THERMAL: {
        confidence: 'CONFIRMED',
        confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
        headline: 'Evaporative Cooling Across Retention Basin',
        finding: 'Thermal IR confirms uniform cool water sheet across unmanned southern retention fields.',
        scientificReason: 'High thermal inertia of shallow sheet water confirms basin inundation outside primary evacuation corridors.',
        satisfiesRequestId: null,
        snrDb: 21.8,
        swathWidthKm: 20.0,
        resolutionMeters: 20.0,
        phenomenologyTag: 'THERMAL_INERTIA_WATER_BOUNDARY',
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
    targetDescription: 'Sector B (East Levee Highway) - under a dense monsoon storm deck. Needs CONFIRMED evidence.',
    stakeLabel: 'Relief convoy of 40 trucks heading for this road',
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
    targetDescription: 'Sector C (Steel Truss Crossing) - clear sky over a metal bridge. Needs CONFIRMED evidence.',
    stakeLabel: 'Medical units waiting to cross the river',
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
    targetDescription: 'Sector E (Shelter Ridge Spur) - steep ridge under storm clouds. PROBABLE evidence is enough.',
    stakeLabel: 'Evacuees walking to the hill shelter',
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

export const FIRELINE_REQUESTS: Record<GroundRequestId, GroundRequest> = {
  REQ_1: {
    id: 'REQ_1',
    shortLabel: 'REQ 1 | CANYON FIRELINE',
    title: 'Locate Active Crown-Fire Front Along Canyon Highway',
    question: 'Where has the active 860 K wildfire front encroached on the Sector B evacuation highway?',
    targetDescription: 'Sector B (Bolan Canyon Highway) - buried under thick wildfire smoke. Needs CONFIRMED evidence.',
    priorityPoints: 40,
    stakeLabel: '1,200 evacuees driving through the canyon',
    minimumConfidence: 'CONFIRMED',
    requiredBadge: '[OK] CONFIRMED',
    targetSectorId: 'B',
    recommendedSensor: 'THERMAL',
    consequenceOnSuccess:
      'Thermal IR radiative hotspot telemetry pinpointed the active flame boundary across Sector B; forestry convoys diverted ahead of canyon pinch-point.',
    consequenceOnPartial:
      'SAR terrain return mapped canyon geometry without thermal fire-line intensity; ground crews proceeded under precautionary speed restriction.',
    consequenceOnFailure:
      'Opaque smoke plume left Sector B fire front unmapped; evacuation transport held at upper valley staging point.',
  },
  REQ_2: {
    id: 'REQ_2',
    shortLabel: 'REQ 2 | VIADUCT FIREBREAK',
    title: 'Verify Upwind Viaduct Deck & Firebreak Clearance',
    question: 'Does the clear-sky Sector C viaduct show unobstructed roadway and cleared firebreak buffer?',
    targetDescription: 'Sector C (Bolan Viaduct) - clear upwind sky over a narrow bridge deck. Needs CONFIRMED evidence.',
    priorityPoints: 25,
    stakeLabel: 'Water tankers need the viaduct open',
    minimumConfidence: 'CONFIRMED',
    requiredBadge: '[OK] CONFIRMED',
    targetSectorId: 'C',
    recommendedSensor: 'OPTICAL',
    consequenceOnSuccess:
      'High-resolution 0.75m Optical imagery verified intact viaduct roadway and cleared 40m mineral-soil firebreak in Sector C.',
    consequenceOnPartial:
      'Coarse 20m Thermal or multipath SAR return could not resolve fine-scale viaduct deck debris; engineers dispatched for visual check.',
    consequenceOnFailure:
      'No viaduct clearance telemetry received before horizon cutoff; heavy tanker units delayed.',
  },
  REQ_3: {
    id: 'REQ_3',
    shortLabel: 'REQ 3 | RIDGE DEPOT',
    title: 'Assess Smoke-Locked Juniper Ridge Fuel Depot Perimeter',
    question: 'Has the wind-driven spot-fire perimeter reached the Sector E highland fuel and medical depot?',
    targetDescription: 'Sector E (Juniper Ridge Depot) - dense smoke plume over a fuel depot. Needs CONFIRMED evidence.',
    priorityPoints: 35,
    stakeLabel: 'Fuel and medical depot with 60 staff',
    minimumConfidence: 'CONFIRMED',
    requiredBadge: '[OK] CONFIRMED',
    targetSectorId: 'E',
    recommendedSensor: 'THERMAL',
    consequenceOnSuccess:
      'Mid-Wave Thermal IR penetrated dense smoke aerosol in Sector E, confirming a 600m buffer between spot fires and the ridge depot.',
    consequenceOnPartial:
      'Partial smoke attenuation left spot-fire perimeter resolution degraded; aerial retardant drop scheduled defensively.',
    consequenceOnFailure:
      'No smoke-penetrating thermal telemetry downlinked for Sector E; ridge depot evacuated preemptively.',
  },
};

export const AFTERSHOCK_REQUESTS: Record<GroundRequestId, GroundRequest> = {
  REQ_1: {
    id: 'REQ_1',
    shortLabel: 'REQ 1 | LANDSLIDE DAM',
    title: 'Map Seismic Landslide Scarp & Valley Impoundment',
    question: 'Has post-earthquake slope failure blocked the Sector B valley spillway channel?',
    targetDescription: 'Sector B (Hanna Valley Gorge) - hidden under a post-quake dust veil. Needs CONFIRMED evidence.',
    priorityPoints: 40,
    stakeLabel: 'Landslide dam above a village of 3,000',
    minimumConfidence: 'CONFIRMED',
    requiredBadge: '[OK] CONFIRMED',
    targetSectorId: 'B',
    recommendedSensor: 'RADAR',
    consequenceOnSuccess:
      'SAR backscatter penetrated the suspended dust veil and mapped the 4.2m landslide toe across Sector B; hydro-engineers mobilized.',
    consequenceOnPartial:
      'Unprocessed or low-contrast return left landslide crest height uncertain; drone survey requested.',
    consequenceOnFailure:
      'No verified radar survey downlinked for Sector B; downstream valley settlements placed on precautionary alert.',
  },
  REQ_2: {
    id: 'REQ_2',
    shortLabel: 'REQ 2 | HOSPITAL VIADUCT',
    title: 'Inspect Clear-Sky Hospital Viaduct Span Alignment',
    question: 'Are the Sector C hospital access viaduct expansion joints aligned without visible span offset?',
    targetDescription: 'Sector C (Quetta Medical Viaduct) - clear sky over a concrete bridge. Needs CONFIRMED evidence.',
    priorityPoints: 30,
    stakeLabel: 'Only road to the regional hospital',
    minimumConfidence: 'CONFIRMED',
    requiredBadge: '[OK] CONFIRMED',
    targetSectorId: 'C',
    recommendedSensor: 'OPTICAL',
    consequenceOnSuccess:
      'Sub-meter Optical pass confirmed continuous roadway alignment across Sector C viaduct; surgical supply units cleared to cross.',
    consequenceOnPartial:
      'Coarse resolution or radar corner-reflector glare masked expansion-joint alignment; bridge structural team dispatched.',
    consequenceOnFailure:
      'Viaduct inspection frame missed downlink window; emergency medical units routed via long mountain bypass.',
  },
  REQ_3: {
    id: 'REQ_3',
    shortLabel: 'REQ 3 | FAULT SUBSTATION',
    title: 'Detect Substation Thermal Rupture & Fault Offset',
    question: 'Does the dust-shrouded Sector E fault corridor show active transformer overheating or liquefaction?',
    targetDescription: 'Sector E (Chaman Fault Substation) - dust haze over an overheating transformer yard. Needs CONFIRMED evidence.',
    priorityPoints: 30,
    stakeLabel: 'Power for the city water pumps',
    minimumConfidence: 'CONFIRMED',
    requiredBadge: '[OK] CONFIRMED',
    targetSectorId: 'E',
    recommendedSensor: 'THERMAL',
    consequenceOnSuccess:
      'Multi-sensor change detection isolated the 740 K transformer anomaly in Sector E; grid engineers isolated the faulted busbar.',
    consequenceOnPartial:
      'Raw unprocessed radar return detected fault-scarp roughness without isolating the thermal transformer anomaly.',
    consequenceOnFailure:
      'Sector E telemetry omitted from downlink pass; regional grid restoration held pending ground reconnaissance.',
  },
};

export const MISSION_SCENARIOS: Record<MissionScenarioId, MissionScenarioConfig> = {
  STANDARD_INDUS_PASS: {
    id: 'STANDARD_INDUS_PASS',
    operationCode: 'OP 02: MONSOON SHIELD',
    name: 'Monsoon Shield',
    subtitle: 'Indus Basin Flood Triage — SAR Cloud Penetration vs. Optical Resolution [SIMULATED]',
    briefing: '[SIMULATED SCENARIO] A monsoon levee breach is flooding the Indus basin. Two targets sit under storm clouds; the river bridge is in a clear gap. Three raw scans will not fit the downlink window.',
    storyLine: 'Levees have failed across the Indus basin. Ground teams need three answers before the satellite drops below the horizon.',
    budget: MISSION_BUDGET,
    availableSensors: ['RADAR', 'OPTICAL'],
    requests: GROUND_REQUESTS,
    passDurationSec: 150,
    successScore: 75,
    partialScore: 50,
  },
  MONSOON_SUPERCELL_PASS: {
    id: 'MONSOON_SUPERCELL_PASS',
    operationCode: 'OP 02B: SUPERCELL SURGE',
    name: 'Monsoon Supercell Penetration',
    subtitle: 'Severe convective cloud wall spanning Sectors B, C, and E [SIMULATED].',
    briefing: '[SIMULATED SCENARIO TELEMETRY] Damage-limitation mission: 54 Wh Power, 9 STR Buffer, 9.0s Downlink (10.0 MB/s). Radar sees through all three storm targets, but bridge glare prevents full certainty. Preserve the strongest evidence; 100/100 is not achievable on this pass.',
    budget: {
      ...MISSION_BUDGET,
      initialPower: 54,
      maxStorage: 9,
      downlinkDurationSec: 9.0,
    },
    availableSensors: ['RADAR', 'OPTICAL'],
    requests: GROUND_REQUESTS,
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
          THERMAL: {
            confidence: 'UNVERIFIED',
            confidenceBadge: CONFIDENCE_BADGES.UNVERIFIED,
            headline: 'Convective Cloud Top Opacity',
            finding: 'Thick convective cloud wall blocks surface thermal emission over Sector C.',
            scientificReason: 'Optically thick water-droplet cloud cover absorbs terrestrial thermal radiation.',
            satisfiesRequestId: null,
            snrDb: 4.0,
            swathWidthKm: 20.0,
            resolutionMeters: 20.0,
            phenomenologyTag: 'CLOUD_TOP_THERMAL_ABSORPTION',
          },
        },
      },
    },
  },
  SOLAR_BROWNOUT_PASS: {
    id: 'SOLAR_BROWNOUT_PASS',
    operationCode: 'OP 02C: ECLIPSE BROWNOUT',
    name: 'Eclipse Orbit Solar Brownout',
    subtitle: 'Battery drain & degraded solid-state storage partition [SIMULATED].',
    briefing: '[SIMULATED SCENARIO TELEMETRY] Sequence puzzle: 50 Wh Power, 6 STR Partition, 8.0s Downlink (10.0 MB/s). Tight 6-unit storage partition requires mid-pass cradle compression between scans to avoid memory exhaustion. Razor-thin 2 Wh margin. Evidence order matters as much as downlink order.',
    budget: {
      ...MISSION_BUDGET,
      initialPower: 50,
      maxStorage: 6,
      downlinkDurationSec: 8.0,
    },
    availableSensors: ['RADAR', 'OPTICAL'],
    requests: GROUND_REQUESTS,
  },
  ORBITAL_ACADEMY: {
    id: 'ORBITAL_ACADEMY',
    operationCode: 'OP 00: ORBITAL ACADEMY',
    name: 'Orbital Academy: Workstation Qualification',
    subtitle: 'Guided 9-Step Hand Gesture & Satellite Triage Training Pass [SIMULATED]',
    briefing:
      '[SIMULATED TRAINING TELEMETRY] Complete the 9-step Orbital Academy qualification pass: target Sector B, arm Thermal IR (3.9 um), fire scan, grab and inspect the 3D Data Cube, compress in the Amber Processing Cradle (3 STR -> 1 STR), dock into Downlink Bay Slot #1, and commit transmission.',
    storyLine: 'Training pass, no clock. Learn the five moves: aim, scan, inspect, compress, transmit. Smoke over Sector B hides a fire front.',
    budget: {
      ...MISSION_BUDGET,
      initialPower: 52,
      maxStorage: 9,
      downlinkDurationSec: 10.0,
    },
    availableSensors: ['RADAR', 'OPTICAL', 'THERMAL'],
    requests: FIRELINE_REQUESTS,
  },
  FIRELINE_PASS: {
    id: 'FIRELINE_PASS',
    operationCode: 'OP 01: FIRELINE',
    name: 'Fireline Pass',
    subtitle: 'Bolan Fireline Emergency Zone — Thermal IR Smoke Penetration & Optical Triage [SIMULATED]',
    briefing: '[SIMULATED SCENARIO] A wildfire is racing through the Bolan canyon. Thick smoke covers the highway and the ridge depot; the viaduct sits in clear upwind air. A heat report from Sector D may be a false alarm.',
    storyLine: 'A wildfire is racing through the Bolan canyon. Evacuees, a fuel depot and a water route all need answers. Save the most important ones first.',
    budget: {
      ...MISSION_BUDGET,
      initialPower: 52,
      maxStorage: 9,
      downlinkDurationSec: 10.0,
    },
    availableSensors: ['RADAR', 'OPTICAL', 'THERMAL'],
    requests: FIRELINE_REQUESTS,
    passDurationSec: 150,
    successScore: 75,
    partialScore: 40,
    sectorOverrides: {
      A: {
        name: 'Ziarat Upper Watershed',
        terrainSummary: 'Upwind limestone plateau beneath optically thick meteorological cloud cover.',
        cloudCover: 'CONVECTIVE_CLOUD',
        outcomes: {
          OPTICAL: {
            confidence: 'UNVERIFIED',
            confidenceBadge: CONFIDENCE_BADGES.UNVERIFIED,
            headline: 'Optically Thick Cloud Deck - Watershed Obscured',
            finding: 'Meteorological water/ice cloud cover (tau > 12) blocks visible reflectance over Sector A.',
            scientificReason: 'Simulated gameplay value (11% confidence): Passive visible/near-IR sensors cannot penetrate optically thick meteorological clouds.',
            satisfiesRequestId: null,
            snrDb: 3.9,
            swathWidthKm: 18.5,
            resolutionMeters: 0.75,
            phenomenologyTag: 'CLOUD_TOP_MIE_SCATTERING_OCCLUSION',
            observationConfidencePct: 11,
            scientificCaveat: 'Optical Remote Sensing Note (Sim. Obs. Conf. 11%): Thick water/ice cloud decks scatter visible light completely.',
          },
          RADAR: {
            confidence: 'CONFIRMED',
            confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
            headline: 'Watershed Slopes Stable - No Evacuation Corridor Here',
            finding: '5.4 GHz SAR penetrates cloud deck and confirms stable upland terrain with no priority road request.',
            scientificReason: 'Simulated gameplay value (74% confidence): Microwave SAR penetrates meteorological clouds to map terrain geometry, though it cannot sense fire temperature.',
            satisfiesRequestId: null,
            snrDb: 21.4,
            swathWidthKm: 24.0,
            resolutionMeters: 5.0,
            phenomenologyTag: 'SAR_CLOUD_PENETRATION_NO_THERMAL',
            observationConfidencePct: 74,
            scientificCaveat: 'NASA SAR Note (Sim. Obs. Conf. 74%): C-band SAR penetrates thick cloud cover for terrain geometry but is insensitive to radiative temperature.',
          },
          THERMAL: {
            confidence: 'UNVERIFIED',
            confidenceBadge: CONFIDENCE_BADGES.UNVERIFIED,
            headline: 'Optically Thick Meteorological Cloud Deck - Thermal IR Blocked',
            finding: 'Dense water/ice cloud cover (230 K cloud tops) absorbs surface 3.9 um thermal emission over Sector A.',
            scientificReason: 'Simulated gameplay value (18% confidence): Per NASA FIRMS and NOAA OSPO physical limits, while 3.9 um thermal IR penetrates thin biomass smoke, optically thick meteorological water/ice clouds (tau_3.9 > 4.0) block thermal fire detections.',
            satisfiesRequestId: null,
            snrDb: 4.4,
            swathWidthKm: 20.0,
            resolutionMeters: 12.0,
            phenomenologyTag: 'CLOUD_TOP_THERMAL_ABSORPTION',
            observationConfidencePct: 18,
            scientificCaveat: 'NASA FIRMS Caveat (Sim. Obs. Conf. 18%): Optically thick meteorological cloud cover blocks both visible and mid-wave infrared fire detection from orbit.',
          },
        },
      },
      B: {
        name: 'Bolan Canyon Highway',
        terrainSummary: 'Primary mountain evacuation route beneath dense pyroconvective biomass smoke plume.',
        cloudCover: 'DENSE_SMOKE',
        outcomes: {
          OPTICAL: {
            confidence: 'UNVERIFIED',
            confidenceBadge: CONFIDENCE_BADGES.UNVERIFIED,
            headline: 'Smoke Plume Mie Scattering - Highway Obscured',
            finding: 'Thick grey-brown biomass smoke reflects visible wavelengths (0.4-0.9 um); highway flame line invisible.',
            scientificReason: 'Simulated gameplay value (12% confidence): Sub-micron smoke aerosols scatter visible light strongly via Mie scattering (tau_0.55 = 3.8). Switch to Mid-Wave Thermal Infrared (3.9 um) to penetrate smoke and detect fire radiative power.',
            satisfiesRequestId: null,
            snrDb: 4.8,
            swathWidthKm: 18.5,
            resolutionMeters: 0.75,
            phenomenologyTag: 'BIOMASS_SMOKE_MIE_SCATTERING',
            observationConfidencePct: 12,
            scientificCaveat: 'Optical Remote Sensing Note (Sim. Obs. Conf. 12%): Dense pyroconvective smoke plumes scatter visible photons, masking the underlying flame front.',
          },
          RADAR: {
            confidence: 'PROBABLE',
            confidenceBadge: CONFIDENCE_BADGES.PROBABLE,
            headline: 'Canyon Road Geometry Intact - Blind to Thermal Flame Front',
            finding: 'SAR maps canyon highway topography through smoke, but microwave backscatter cannot measure active fire temperature.',
            scientificReason: 'Simulated gameplay value (68% confidence): C-band SAR (5.0 m GSD) is sensitive to surface dielectric roughness rather than thermal emission, leaving active flame boundary only [?] PROBABLE.',
            satisfiesRequestId: 'REQ_1',
            snrDb: 15.8,
            swathWidthKm: 24.0,
            resolutionMeters: 5.0,
            phenomenologyTag: 'SAR_TOPOGRAPHY_THERMAL_BLINDNESS',
            observationConfidencePct: 68,
            scientificCaveat: 'NASA SAR Note (Sim. Obs. Conf. 68%): SAR penetrates smoke unimpeded but cannot measure combustion temperature.',
          },
          THERMAL: {
            confidence: 'CONFIRMED',
            confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
            headline: '860 K Active Flame Front Flanking Km 14 Switchback',
            finding: 'Mid-Wave Thermal IR penetrates dense canyon smoke plume (tau_3.9 = 0.48) and isolates a 1.8 km active crown-fire front approaching the highway.',
            scientificReason: 'Simulated gameplay value (84% confidence): Longer mid-wave infrared wavelengths (3.9 um, 12.0 m GSD) penetrate biomass smoke far better than visible light, though thick vertically developed pyroconvective plumes (tau_3.9 = 0.48) partially attenuate mid-IR radiance (84% simulated confidence vs. 92% in moderate laminar smoke).',
            satisfiesRequestId: 'REQ_1',
            snrDb: 15.8,
            swathWidthKm: 20.0,
            resolutionMeters: 12.0,
            phenomenologyTag: 'MWIR_THERMAL_RADIANCE_HOTSPOT',
            observationConfidencePct: 84,
            scientificCaveat: 'NOAA OSPO / NASA FIRMS Note (Sim. Obs. Conf. 84%): 3.9 um MWIR penetrates smoke to detect intense 860 K sub-plume combustion, though thick vertically developed pyroconvective plumes partially attenuate mid-IR radiance.',
          },
        },
      },
      C: {
        name: 'Bolan Viaduct & Firebreak',
        terrainSummary: 'Upwind concrete viaduct and 40m mineral-soil firebreak in clear air.',
        cloudCover: 'CLEAR',
        outcomes: {
          OPTICAL: {
            confidence: 'CONFIRMED',
            confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
            headline: 'Viaduct Deck Clear & 40m Firebreak Intact',
            finding: '0.75m GSD optical pass detects no major road blockages and confirms cleared 40m mineral-soil firebreak and unobstructed viaduct lanes.',
            scientificReason: 'Simulated gameplay value (94% confidence): Clear upwind visibility (tau_0.55 = 0.08) allows 0.75 m GSD optical imagery to detect major road blockages and firebreak boundaries that 12.0 m thermal pixels blur together.',
            satisfiesRequestId: 'REQ_2',
            snrDb: 29.5,
            swathWidthKm: 18.5,
            resolutionMeters: 0.75,
            phenomenologyTag: 'VISIBLE_NEAR_INFRARED_REFLECTANCE',
            observationConfidencePct: 94,
            scientificCaveat: 'Optical Remote Sensing Note (Sim. Obs. Conf. 94%): 0.75 m GSD visible/near-IR reflectance detects major road blockages and cleared 40 m firebreak boundaries under clear skies (GSD is pixel sample spacing rather than fine crack resolving power).',
          },
          RADAR: {
            confidence: 'PROBABLE',
            confidenceBadge: CONFIDENCE_BADGES.PROBABLE,
            headline: 'Viaduct Girder Multipath Glare',
            finding: 'SAR corner-reflector glare along viaduct piers obscures fine firebreak clearance.',
            scientificReason: 'Simulated gameplay value (66% confidence): Metallic bridge railings produce dihedral multipath returns at 5.0 m SAR resolution that mask roadway surface clearance.',
            satisfiesRequestId: 'REQ_2',
            snrDb: 18.1,
            swathWidthKm: 24.0,
            resolutionMeters: 5.0,
            phenomenologyTag: 'METALLIC_DIHEDRAL_MULTIPATH_RADAR',
            observationConfidencePct: 66,
            scientificCaveat: 'NASA SAR Note (Sim. Obs. Conf. 66%): Steel viaduct trusses create dihedral corner-reflector glare.',
          },
          THERMAL: {
            confidence: 'PROBABLE',
            confidenceBadge: CONFIDENCE_BADGES.PROBABLE,
            headline: 'Ambient Background Temperature - Coarse 12m Resolution',
            finding: 'Thermal IR shows no active flame on the viaduct (301 K), but 12.0 m pixel footprint cannot resolve narrow deck barriers.',
            scientificReason: 'Simulated gameplay value (34% structural-clearance confidence): Thermal infrared confirms absence of high-temperature combustion, but coarse 12.0 m spatial resolution cannot verify physical roadway or expansion-joint clearance at ambient temperature.',
            satisfiesRequestId: 'REQ_2',
            snrDb: 17.6,
            swathWidthKm: 20.0,
            resolutionMeters: 12.0,
            phenomenologyTag: 'COARSE_THERMAL_MIXED_PIXEL_BLUR',
            observationConfidencePct: 34,
            scientificCaveat: 'NASA FIRMS / Sensor Resolution Note (Sim. Obs. Conf. 34%): Spaceborne thermal IR (12.0 m GSD) is far coarser than visible optical imagery (0.75 m GSD) and cannot resolve unheated structural bridge detail.',
          },
        },
      },
      D: {
        name: 'Sibi Basalt & Kiln Flats',
        terrainSummary: 'Thermal anomaly detected (~345 K) near brick kilns & dark basalt; surface signature resembles industrial surface heating rather than active vegetation combustion.',
        cloudCover: 'CLEAR',
        outcomes: {
          OPTICAL: {
            confidence: 'CONFIRMED',
            confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
            headline: 'Industrial Kilns & Dark Basalt - No Wildfire Front',
            finding: '0.75m visible frame confirms stationary industrial brick kilns and bare basalt; no vegetation fire here.',
            scientificReason: 'Simulated gameplay value (93% confidence): High-resolution 0.75 m optical imagery distinguishes industrial smokestacks and dark solar-heated rock from spreading biomass wildfire.',
            satisfiesRequestId: null,
            snrDb: 28.0,
            swathWidthKm: 18.5,
            resolutionMeters: 0.75,
            phenomenologyTag: 'VISIBLE_FALSE_POSITIVE_REJECTION',
            observationConfidencePct: 93,
            scientificCaveat: 'Optical Remote Sensing Note (Sim. Obs. Conf. 93%): Sub-meter visible context rejects static industrial thermal false positives.',
          },
          RADAR: {
            confidence: 'CONFIRMED',
            confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
            headline: 'Static Industrial Compounds - No Evacuation Route',
            finding: 'SAR maps permanent kiln masonry outside the Bolan evacuation corridor.',
            scientificReason: 'Simulated gameplay value (86% confidence): Corner-reflector returns correspond to fixed industrial compounds unrelated to the 3 priority wildfire requests.',
            satisfiesRequestId: null,
            snrDb: 22.0,
            swathWidthKm: 24.0,
            resolutionMeters: 5.0,
            phenomenologyTag: 'STATIC_INDUSTRIAL_BACKSCATTER',
            observationConfidencePct: 86,
            scientificCaveat: 'NASA SAR Note (Sim. Obs. Conf. 86%): High-backscatter masonry compounds remain static across passes.',
          },
          THERMAL: {
            confidence: 'UNVERIFIED',
            confidenceBadge: CONFIDENCE_BADGES.UNVERIFIED,
            headline: 'Static Industrial Kiln & Solar Basalt False-Positive Anomaly (345 K)',
            finding: 'Thermal IR detects a 345 K surface anomaly over dark basalt and industrial brick kilns — non-wildfire false positive.',
            scientificReason: 'Simulated gameplay value (15% wildfire confidence): Per NASA FIRMS interpretation caveats, thermal anomalies are not necessarily wildfires; sun-baked dark basalt outcrops and static industrial brick kilns emit elevated thermal radiance that causes false positives without optical context.',
            satisfiesRequestId: null,
            snrDb: 16.2,
            swathWidthKm: 20.0,
            resolutionMeters: 12.0,
            phenomenologyTag: 'THERMAL_SOLAR_KILN_FALSE_POSITIVE',
            observationConfidencePct: 15,
            scientificCaveat: 'NASA FIRMS False-Positive Caveat (Sim. Obs. Conf. 15%): Static industrial heat sources and solar-heated dark rock trigger thermal false positives that do not represent active wildfires.',
          },
        },
      },
      E: {
        name: 'Juniper Ridge Fuel Depot',
        terrainSummary: 'Highland emergency fuel & medical depot beneath moderate laminar downwind smoke plume.',
        cloudCover: 'MODERATE_SMOKE',
        outcomes: {
          OPTICAL: {
            confidence: 'UNVERIFIED',
            confidenceBadge: CONFIDENCE_BADGES.UNVERIFIED,
            headline: 'Moderate Smoke Plume - Optical Contrast Degraded',
            finding: 'Advected laminar smoke plume obscures Juniper Ridge Depot perimeter in visible bands.',
            scientificReason: 'Simulated gameplay value (24% confidence): Moderate smoke aerosol optical depth (tau_0.55 = 1.95) scatters visible reflectance, leaving spot-fire distance unverified.',
            satisfiesRequestId: null,
            snrDb: 6.2,
            swathWidthKm: 18.5,
            resolutionMeters: 0.75,
            phenomenologyTag: 'BIOMASS_SMOKE_MIE_SCATTERING',
            observationConfidencePct: 24,
            scientificCaveat: 'Optical Remote Sensing Note (Sim. Obs. Conf. 24%): Moderate smoke haze reduces visible surface contrast below operational verification thresholds.',
          },
          RADAR: {
            confidence: 'UNVERIFIED',
            confidenceBadge: CONFIDENCE_BADGES.UNVERIFIED,
            headline: 'Canopy Backscatter Masks Ground Ember Perimeter',
            finding: 'C-band radar scatters off pine canopy needles and cannot detect sub-canopy thermal spot fires.',
            scientificReason: 'Simulated gameplay value (22% confidence): Microwave radar (5.0 m GSD) measures structural geometry rather than temperature, failing to detect advancing ground embers.',
            satisfiesRequestId: null,
            snrDb: 7.4,
            swathWidthKm: 24.0,
            resolutionMeters: 5.0,
            phenomenologyTag: 'CANOPY_VOLUME_SCATTERING_MASK',
            observationConfidencePct: 22,
            scientificCaveat: 'NASA SAR Note (Sim. Obs. Conf. 22%): Forest canopy volume scattering masks ground-level thermal spot fires.',
          },
          THERMAL: {
            confidence: 'CONFIRMED',
            confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
            headline: 'Spot-Fire Perimeter Mapped 600m South of Depot',
            finding: 'Thermal IR penetrates moderate laminar ridge smoke (tau_3.9 = 0.18) and maps 790 K spot-fire hotspots 600m south of the intact depot perimeter.',
            scientificReason: 'Simulated gameplay value (92% confidence): Moderate laminar downwind smoke (PM2.5 particle radius << 3.9 um, tau_3.9 = 0.18) is highly transparent in mid-wave IR (12.0 m GSD), yielding 92% simulated confidence (higher than the 84% confidence through Sector B dense pyroconvective smoke).',
            satisfiesRequestId: 'REQ_3',
            snrDb: 18.6,
            swathWidthKm: 20.0,
            resolutionMeters: 12.0,
            phenomenologyTag: 'MWIR_SMOKE_PENETRATION_ANOMALY',
            observationConfidencePct: 92,
            scientificCaveat: 'NOAA OSPO / NASA FIRMS Note (Sim. Obs. Conf. 92%): Moderate laminar smoke plumes have low optical depth at 3.9 um (tau_3.9 = 0.18), allowing high-confidence thermal hotspot localization.',
          },
        },
      },
      F: {
        name: 'Kachhi Agricultural Plain',
        terrainSummary: 'Downwind irrigated agricultural plain under thin peripheral drift smoke.',
        cloudCover: 'THIN_SMOKE',
        outcomes: {
          OPTICAL: {
            confidence: 'PROBABLE',
            confidenceBadge: CONFIDENCE_BADGES.PROBABLE,
            headline: 'Thin Drift Smoke Over Irrigated Fields - No Evacuation Target',
            finding: '0.75m optical pass sees through thin drift haze (tau_0.55 = 0.55) showing unburned agricultural plots.',
            scientificReason: 'Simulated gameplay value (58% confidence): Thin drift smoke partially reduces visible contrast, and Sector F contains no requested evacuation routes.',
            satisfiesRequestId: null,
            snrDb: 14.5,
            swathWidthKm: 18.5,
            resolutionMeters: 0.75,
            phenomenologyTag: 'THIN_SMOKE_PARTIAL_TRANSMISSION',
            observationConfidencePct: 58,
            scientificCaveat: 'Optical Remote Sensing Note (Sim. Obs. Conf. 58%): Thin drift smoke allows partial visible surface observation with reduced contrast.',
          },
          RADAR: {
            confidence: 'CONFIRMED',
            confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
            headline: 'Irrigated Polders Intact - Outside Fire Corridor',
            finding: 'SAR confirms undisturbed agricultural fields south of the canyon.',
            scientificReason: 'Simulated gameplay value (88% confidence): C-band SAR penetrates thin smoke haze, confirming normal agricultural terrain unrelated to priority requests.',
            satisfiesRequestId: null,
            snrDb: 23.0,
            swathWidthKm: 24.0,
            resolutionMeters: 5.0,
            phenomenologyTag: 'AGRICULTURAL_SURFACE_BACKSCATTER',
            observationConfidencePct: 88,
            scientificCaveat: 'NASA SAR Note (Sim. Obs. Conf. 88%): Radar backscatter confirms normal soil moisture and crop structure.',
          },
          THERMAL: {
            confidence: 'CONFIRMED',
            confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
            headline: 'Thin Drift Smoke Penetrated - Ambient 301 K Plain (No Fire)',
            finding: '3.9 um Thermal IR penetrates thin drift haze (tau_3.9 = 0.10) and measures uniform 301 K irrigated fields with no active wildfire front.',
            scientificReason: 'Simulated gameplay value (28% wildfire-relevance confidence): Thin peripheral smoke haze is transparent to mid-wave IR, confirming ambient 301 K background terrain with no active combustion in Sector F.',
            satisfiesRequestId: null,
            snrDb: 19.8,
            swathWidthKm: 20.0,
            resolutionMeters: 12.0,
            phenomenologyTag: 'AMBIENT_BACKGROUND_UNDER_DRIFT_SMOKE',
            observationConfidencePct: 28,
            scientificCaveat: 'NOAA OSPO Note (Sim. Obs. Conf. 28%): Thin drift smoke travels tens of kilometers downwind over cool unburned terrain.',
          },
        },
      },
    },
  },
  AFTERSHOCK_PASS: {
    id: 'AFTERSHOCK_PASS',
    operationCode: 'OP 03: AFTERSHOCK',
    name: 'Aftershock Pass',
    subtitle: 'Quetta Fault Seismic Crisis — Multi-Sensor Change Detection & 6-STR Buffer [SIMULATED]',
    briefing: '[SIMULATED SCENARIO] An earthquake struck the Quetta fault. A solar storm damaged the battery and memory: there is not enough power to confirm all three requests. Choose which two matter most.',
    storyLine: 'An earthquake hit the Quetta fault and a solar storm crippled your battery. You cannot answer all three requests. Decide who gets the evidence.',
    budget: {
      ...MISSION_BUDGET,
      initialPower: 42,
      maxStorage: 6,
      downlinkDurationSec: 9.0,
    },
    availableSensors: ['RADAR', 'OPTICAL', 'THERMAL'],
    performsChangeDetection: true,
    requests: AFTERSHOCK_REQUESTS,
    passDurationSec: 140,
    successScore: 65,
    partialScore: 30,
    sectorOverrides: {
      B: {
        name: 'Hanna Valley Gorge',
        terrainSummary: 'Steep limestone gorge obscured by post-seismic dust plume.',
        cloudCover: 'SEISMIC_DUST',
        outcomes: {
          OPTICAL: {
            confidence: 'UNVERIFIED',
            confidenceBadge: CONFIDENCE_BADGES.UNVERIFIED,
            headline: 'Suspended Silicate Dust Plume - Gorge Obscured',
            finding: 'Post-tremor rockfall dust veil blocks visible observation of the Hanna Valley spillway.',
            scientificReason: 'Dense suspended mineral dust scatters visible light. Use active microwave SAR Radar to penetrate the dust veil.',
            satisfiesRequestId: null,
            snrDb: 4.3,
            swathWidthKm: 18.5,
            resolutionMeters: 0.75,
            phenomenologyTag: 'SILICATE_DUST_MIE_OCCLUSION',
          },
          RADAR: {
            confidence: 'CONFIRMED',
            confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
            headline: '4.2m Landslide Toe Blocking Valley Spillway',
            finding: 'C-band SAR penetrates seismic dust plume and resolves a high-backscatter rubble dam across the gorge.',
            scientificReason: 'Centimeter-scale radar wavelengths pass unimpeded through mineral dust aerosols and produce strong rough-surface backscatter off angular landslide debris.',
            satisfiesRequestId: 'REQ_1',
            snrDb: 23.4,
            swathWidthKm: 24.0,
            resolutionMeters: 2.2,
            phenomenologyTag: 'SAR_DEBRIS_ROUGHNESS_BACKSCATTER',
          },
          THERMAL: {
            confidence: 'UNVERIFIED',
            confidenceBadge: CONFIDENCE_BADGES.UNVERIFIED,
            headline: 'Isothermal Rockfall Debris - No Thermal Contrast',
            finding: 'Ambient-temperature limestone rubble blends thermally with valley walls under silicate dust haze.',
            scientificReason: 'Silicate dust absorbs 8-12 um thermal bands and rockfall debris shares ambient ground temperature.',
            satisfiesRequestId: null,
            snrDb: 6.1,
            swathWidthKm: 20.0,
            resolutionMeters: 20.0,
            phenomenologyTag: 'SILICATE_DUST_THERMAL_ATTENUATION',
          },
        },
      },
      C: {
        name: 'Quetta Medical Viaduct',
        terrainSummary: 'Reinforced concrete hospital access bridge in clear upwind air.',
        cloudCover: 'CLEAR',
        outcomes: {
          OPTICAL: {
            confidence: 'CONFIRMED',
            confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
            headline: 'Viaduct Span Alignment Intact - No Major Road Blockage',
            finding: '0.75m GSD nadir optical pass detects no major span misalignment, collapsed approaches, or surface debris blockage across all 6 piers.',
            scientificReason: '0.75 m GSD optical imagery detects substantial visible structural changes and major bridge damage indicators under clear skies (effective spatial resolution depends on sensor MTF and SNR, and cannot resolve fine surface cracks).',
            satisfiesRequestId: 'REQ_2',
            snrDb: 29.1,
            swathWidthKm: 18.5,
            resolutionMeters: 0.75,
            phenomenologyTag: 'VISIBLE_NEAR_INFRARED_REFLECTANCE',
          },
          RADAR: {
            confidence: 'PROBABLE',
            confidenceBadge: CONFIDENCE_BADGES.PROBABLE,
            headline: 'Reinforced Concrete Corner-Reflector Glare',
            finding: 'SAR detects standing viaduct piers, but multipath glare masks deck alignment (upgradeable via Cradle pre/post-event SAR backscatter comparison).',
            scientificReason: 'Single-pass radar intensity suffers from corner-reflector glare; pre-event and post-event SAR backscatter comparison in the Processing Cradle subtracts static clutter to identify potential surface-change evidence.',
            satisfiesRequestId: 'REQ_2',
            snrDb: 18.3,
            swathWidthKm: 24.0,
            resolutionMeters: 2.2,
            phenomenologyTag: 'METALLIC_DIHEDRAL_MULTIPATH_RADAR',
          },
          THERMAL: {
            confidence: 'PROBABLE',
            confidenceBadge: CONFIDENCE_BADGES.PROBABLE,
            headline: 'Intact Thermal Deck Profile - Coarse 20m Pixel',
            finding: 'Thermal band shows continuous warm asphalt ribbon, but coarse 20m pixels cannot resolve viaduct span alignment or surface debris blockages.',
            scientificReason: 'Coarse thermal spatial resolution requires baseline change-detection or optical sub-meter verification.',
            satisfiesRequestId: 'REQ_2',
            snrDb: 17.0,
            swathWidthKm: 20.0,
            resolutionMeters: 20.0,
            phenomenologyTag: 'COARSE_THERMAL_MIXED_PIXEL_BLUR',
          },
        },
      },
      E: {
        name: 'Chaman Fault Substation',
        terrainSummary: 'Regional high-voltage grid substation along dust-shrouded fault trace.',
        cloudCover: 'SEISMIC_DUST',
        outcomes: {
          OPTICAL: {
            confidence: 'UNVERIFIED',
            confidenceBadge: CONFIDENCE_BADGES.UNVERIFIED,
            headline: 'Fault-Zone Dust Veil Blocks Optical Camera',
            finding: 'Suspended fault-rupture dust plume obscures substation transformers in visible bands.',
            scientificReason: 'Visible wavelengths scatter off suspended fault-scarp dust particles.',
            satisfiesRequestId: null,
            snrDb: 4.0,
            swathWidthKm: 18.5,
            resolutionMeters: 0.75,
            phenomenologyTag: 'SILICATE_DUST_MIE_OCCLUSION',
          },
          RADAR: {
            confidence: 'PROBABLE',
            confidenceBadge: CONFIDENCE_BADGES.PROBABLE,
            headline: 'Surface Fault Scarp Candidate - Pre/Post Baseline Needed',
            finding: 'Raw single-pass SAR detects fault-trace roughness near substation; process in Cradle for Multi-Temporal Change Detection to confirm potential surface-change evidence.',
            scientificReason: 'Single-pass SAR backscatter is ambiguous around steel transformer yards; pre-event and post-event SAR backscatter comparison against the onboard archive subtracts static clutter to highlight potential surface-change evidence (does not independently measure exact displacement without interferometric phase).',
            satisfiesRequestId: 'REQ_3',
            snrDb: 16.8,
            swathWidthKm: 24.0,
            resolutionMeters: 2.2,
            phenomenologyTag: 'MULTI_TEMPORAL_BASELINE_CANDIDATE',
          },
          THERMAL: {
            confidence: 'CONFIRMED',
            confidenceBadge: CONFIDENCE_BADGES.CONFIRMED,
            headline: '740 K Transformer Oil Fire & Cool Liquefaction Seepage',
            finding: 'Mid-Wave Thermal IR pierces fault dust haze, isolating an overheating north transformer bank and cool groundwater liquefaction.',
            scientificReason: 'Intense 3.9 um thermal radiance from the 740 K transformer fault easily penetrates thin mineral dust haze.',
            satisfiesRequestId: 'REQ_3',
            snrDb: 25.1,
            swathWidthKm: 20.0,
            resolutionMeters: 20.0,
            phenomenologyTag: 'MWIR_SUBSTATION_THERMAL_ANOMALY',
          },
        },
      },
    },
  },
  DEFENSE_SHIELD_PASS: {
    id: 'DEFENSE_SHIELD_PASS',
    operationCode: 'OP 03: AFTERSHOCK',
    name: 'Operation 03: Aftershock (Seismic Archive)',
    subtitle: 'Quetta Fault Seismic Crisis — Multi-Sensor Change Detection & 6-STR Buffer [SIMULATED]',
    briefing: '[SIMULATED SCENARIO TELEMETRY] Humanitarian seismic change-detection pass: 50 Wh Power, 6 STR Partition, 9.0s Downlink.',
    budget: {
      ...MISSION_BUDGET,
      initialPower: 50,
      maxStorage: 6,
      downlinkDurationSec: 9.0,
    },
    availableSensors: ['RADAR', 'OPTICAL', 'THERMAL'],
    performsChangeDetection: true,
    requests: AFTERSHOCK_REQUESTS,
  },
};

// Ensure ORBITAL_ACADEMY and DEFENSE_SHIELD_PASS share their target sectorOverrides
MISSION_SCENARIOS.ORBITAL_ACADEMY.sectorOverrides = MISSION_SCENARIOS.FIRELINE_PASS.sectorOverrides;
MISSION_SCENARIOS.DEFENSE_SHIELD_PASS.sectorOverrides = MISSION_SCENARIOS.AFTERSHOCK_PASS.sectorOverrides;

/** The single player-facing campaign order (landing, campaign menu, NEXT PASS). */
export const CAMPAIGN_OPERATIONS: readonly MissionScenarioId[] = [
  'FIRELINE_PASS',
  'STANDARD_INDUS_PASS',
  'AFTERSHOCK_PASS',
] as const;

export const MAX_EVIDENCE_CUBES = 3;

/**
 * Scoring rules: single source of truth for the engine, planner, debrief and every UI surface.
 */
export const SCORING = {
  /** Points for a VERIFIED request when the scenario does not weight its requests. */
  defaultRequestPoints: 30,
  /** Share of a request's value earned by PARTIAL (probable-but-not-enough) evidence. */
  partialShare: 0.6,
  /** Unweighted scenarios only. */
  allVerifiedBonus: 10,
  twoVerifiedBonus: 5,
  defaultSuccessScore: 75,
  defaultPartialScore: 50,
  /** Points deducted per ARIA-7 hint. */
  hintPenalty: 5,
  /** Grade S needs this much spare link time (seconds). */
  linkSafetyMarginSec: 0.35,
  gradeSFloorSec: 7.8,
} as const;

export function isWeightedScenario(requests: Record<GroundRequestId, GroundRequest>): boolean {
  return Object.values(requests).every((r) => typeof r.priorityPoints === 'number');
}

/** Points a request is worth when VERIFIED. */
export function requestValue(request: GroundRequest): number {
  return request.priorityPoints ?? SCORING.defaultRequestPoints;
}

/** Points earned by a request for a given evaluation status. */
export function requestPointsFor(request: GroundRequest, status: 'VERIFIED' | 'PARTIAL' | 'UNVERIFIED'): number {
  const value = requestValue(request);
  return status === 'VERIFIED' ? value : status === 'PARTIAL' ? Math.round(value * SCORING.partialShare) : 0;
}

/** Bonus for verifying several requests (unweighted scenarios only). */
export function verificationBonus(
  requests: Record<GroundRequestId, GroundRequest>,
  verifiedCount: number,
  droppedCount: number,
): number {
  if (droppedCount > 0 || isWeightedScenario(requests)) return 0;
  return verifiedCount === 3 ? SCORING.allVerifiedBonus : verifiedCount >= 2 ? SCORING.twoVerifiedBonus : 0;
}

export function getScenarioThresholds(
  scenarioId: MissionScenarioId,
  customScenario?: MissionScenarioConfig | null,
): { successScore: number; partialScore: number } {
  const scenario = customScenario ?? MISSION_SCENARIOS[scenarioId];
  return {
    successScore: scenario?.successScore ?? SCORING.defaultSuccessScore,
    partialScore: scenario?.partialScore ?? SCORING.defaultPartialScore,
  };
}

export function getScanCost(budget: ResourceBudgetConfig, mode: SensorMode) {
  return mode === 'OPTICAL'
    ? budget.opticalScan
    : mode === 'THERMAL'
      ? (budget.thermalScan ?? MISSION_BUDGET.thermalScan!)
      : budget.radarScan;
}

/** Plain-language description of what each sensor can and cannot see (shown on sensor chips). */
export const SENSOR_PLAIN_GUIDE: Record<SensorMode, { label: string; sees: string; blind: string }> = {
  OPTICAL: { label: 'OPTICAL CAMERA', sees: 'Sharpest detail in clear sky', blind: 'Blind in clouds, smoke and dust' },
  THERMAL: { label: 'THERMAL IR', sees: 'Sees heat through smoke', blind: 'Blocked by thick cloud and dust; coarse detail' },
  RADAR: { label: 'RADAR (SAR)', sees: 'Sees through cloud and dust', blind: 'Blurry on metal bridges and steep slopes; no heat' },
};

/** Plain-language weather label shown for each sector (the clue, never the answer). */
export function describeWeather(cloudCover: SectorConfig['cloudCover']): string {
  switch (cloudCover) {
    case 'CLEAR': return 'Clear sky';
    case 'DENSE_STORM': return 'Dense storm clouds';
    case 'CONVECTIVE_CLOUD': return 'Thick cloud deck';
    case 'THIN_SMOKE': return 'Thin smoke haze';
    case 'MODERATE_SMOKE': return 'Wildfire smoke';
    case 'DENSE_SMOKE': return 'Thick wildfire smoke';
    case 'SEISMIC_DUST': return 'Earthquake dust veil';
    default: return 'Unknown';
  }
}

export function getScenarioSector(
  scenarioId: MissionScenarioId,
  sectorId: SectorId,
  customScenario?: MissionScenarioConfig | null,
): SectorConfig {
  const base = SECTORS[sectorId];
  const scenario = customScenario ?? MISSION_SCENARIOS[scenarioId];
  const override = scenario?.sectorOverrides?.[sectorId];
  const merged: SectorConfig = override
    ? { ...base, ...override, outcomes: { ...base.outcomes, ...override.outcomes } }
    : base;
  const enrichOutcome = (mode: SensorMode) => {
    const raw = merged.outcomes[mode] ?? merged.outcomes.OPTICAL;
    const derived = deriveSensorScientificCaveat(mode, raw.confidence, raw.phenomenologyTag);
    return {
      ...raw,
      observationConfidencePct: raw.observationConfidencePct ?? derived.observationConfidencePct,
      scientificCaveat: raw.scientificCaveat ?? derived.scientificCaveat,
    };
  };
  return {
    ...merged,
    outcomes: {
      OPTICAL: enrichOutcome('OPTICAL'),
      RADAR: enrichOutcome('RADAR'),
      THERMAL: enrichOutcome('THERMAL'),
    },
  };
}

export function getScenarioRequests(
  scenarioId: MissionScenarioId,
  customScenario?: MissionScenarioConfig | null,
): Record<GroundRequestId, GroundRequest> {
  const scenario = customScenario ?? MISSION_SCENARIOS[scenarioId];
  return scenario?.requests ?? GROUND_REQUESTS;
}

export function getRecommendedSensor(
  scenarioId: MissionScenarioId,
  sectorId: SectorId,
  customScenario?: MissionScenarioConfig | null,
): SensorMode {
  const sector = getScenarioSector(scenarioId, sectorId, customScenario);
  const scenario = customScenario ?? MISSION_SCENARIOS[scenarioId];
  const available = scenario?.availableSensors ?? ['RADAR', 'OPTICAL'];
  const rank = { UNVERIFIED: 0, PROBABLE: 1, CONFIRMED: 2 };
  const cost = {
    OPTICAL: scenario?.budget.opticalScan.powerCost ?? 8,
    THERMAL: scenario?.budget.thermalScan?.powerCost ?? 11,
    RADAR: scenario?.budget.radarScan.powerCost ?? 14,
  };

  let bestMode: SensorMode = available[0] ?? 'RADAR';
  let bestRank = -1;
  let bestCost = Infinity;

  for (const mode of available) {
    const outcome = sector.outcomes[mode] ?? sector.outcomes.OPTICAL;
    const r = rank[outcome.confidence];
    const c = cost[mode];
    if (r > bestRank || (r === bestRank && c < bestCost)) {
      bestRank = r;
      bestCost = c;
      bestMode = mode;
    }
  }
  return bestMode;
}
