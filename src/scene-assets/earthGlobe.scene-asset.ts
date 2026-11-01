/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Milestone B High-Craft 3D Centerpiece Assets:
 * 1. South Asia / Indus Basin Tactical Earth Globe (GLOBE_ORBIT_ZERO_V2) with surface-conforming
 *    spherical sector boundary polygons (A-F), lower-hemisphere concentric orbital telemetry grid
 *    bands, and dual-shell atmospheric limb glow.
 * 2. Open-Center Surface-Tangent Sector Target Reticles (sector-a .. sector-f) with merged geometry.
 * 3. Precision 3U Earth-Observation CubeSat Spacecraft (ORBIT_ZERO_3U_CubeSat) with matte-black
 *    anodized 3U rails, high-resolution crinkled gold Kapton MLI thermal foil, nadir optical camera
 *    lens, body-mounted solar panels, twin 3x4 deployable photovoltaic wings, and 6 whip antennas.
 */

import {
  BackSide,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import type { SectorId } from '../mission/types';
import {
  alignSpan,
  bevelBox,
  mergeStaticMeshesByMaterial,
} from './lib/hardsurface';

export const GLOBE_RADIUS = 0.195;

// Rotates standard equirectangular UV sphere so Lon +74 deg E, Lat +23 deg N
// (Indus River Basin, Himalayas, Tibetan Plateau, Indian Peninsula & Arabian Sea)
// faces directly toward the seated operator (+Z, pitched slightly upward toward +Y).
export const INDUS_FACING_ROT_Y = -2.862;
export const INDUS_FACING_ROT_X = 0.14;

const GLOBE_EULER = new Euler(INDUS_FACING_ROT_X, INDUS_FACING_ROT_Y, 0, 'XYZ');

/**
 * Converts geographic (latDeg, lonDeg) on the equirectangular NASA Blue Marble texture
 * into a 3D point in the TacticalEarthGlobe local coordinate space at the given radius.
 */
export function latLonToGlobePoint(
  latDeg: number,
  lonDeg: number,
  radius: number = GLOBE_RADIUS,
  target = new Vector3(),
): Vector3 {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const p = target.set(
    radius * Math.cos(lat) * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * Math.cos(lat) * Math.sin(lon),
  );
  p.applyEuler(GLOBE_EULER);
  return p;
}

/**
 * Contiguous spherical sector definitions (A-F) spanning the South Asia / Indus Basin theater.
 * Framed below the high Himalayan crest so the Himalayas and Tibetan Plateau remain open
 * and unobstructed at the top of the globe while the 6 operational flood sectors follow the
 * spherical curvature across the Indus Basin, Arabian Sea, Indian Peninsula, and Bay of Bengal.
 */
export const SECTOR_GEO_DEFINITIONS: Record<
  SectorId,
  {
    centerLatLon: [number, number];
    isStorm: boolean;
    polygonLatLon: Array<[number, number]>;
  }
> = {
  A: {
    centerLatLon: [33.0, 56.0],
    isStorm: false,
    polygonLatLon: [
      [39, 44],
      [40, 68],
      [27, 68],
      [24, 58],
      [24, 42],
    ],
  },
  B: {
    centerLatLon: [31.5, 88.0],
    isStorm: true,
    polygonLatLon: [
      [40, 68],
      [39, 98],
      [24, 98],
      [23, 82],
      [27, 68],
    ],
  },
  C: {
    centerLatLon: [15.5, 48.0],
    isStorm: false,
    polygonLatLon: [
      [24, 42],
      [24, 58],
      [14, 62],
      [4, 58],
      [5, 40],
    ],
  },
  D: {
    centerLatLon: [15.0, 74.0],
    isStorm: false,
    polygonLatLon: [
      [24, 58],
      [27, 68],
      [23, 82],
      [10, 82],
      [4, 72],
      [4, 58],
      [14, 62],
    ],
  },
  E: {
    centerLatLon: [-6.0, 58.0],
    isStorm: true,
    polygonLatLon: [
      [4, 44],
      [4, 58],
      [4, 72],
      [-14, 72],
      [-15, 46],
    ],
  },
  F: {
    centerLatLon: [-4.5, 90.0],
    isStorm: false,
    polygonLatLon: [
      [4, 72],
      [10, 82],
      [24, 98],
      [8, 104],
      [-14, 100],
      [-14, 72],
    ],
  },
};

function applyEarthBaseVertexColors(geo: BufferGeometry): void {
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  if (!pos || !uv) return;

  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = 0.99;
    colors[i * 3 + 1] = 0.995;
    colors[i * 3 + 2] = 1.0;
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
}

/**
 * Builds an ultra-crisp, thin (1.5mm) surface-conforming ribbon mesh and subtle spherical
 * fill patch for a geographic polygon so every segment follows the exact sphere curvature.
 */
function buildSphericalSectorOverlay(
  sectorId: SectorId,
  polygonLatLon: Array<[number, number]>,
  centerLatLon: [number, number],
  isStorm: boolean,
): Group {
  const group = new Group();
  group.name = `SectorOverlay_${sectorId}`;

  const subStepsPerEdge = 8;
  const ringRadius = GLOBE_RADIUS * 1.0045;
  const ribbonHalfWidth = 0.00078;

  const arcPoints: Vector3[] = [];
  for (let i = 0; i < polygonLatLon.length; i++) {
    const [lat1, lon1] = polygonLatLon[i];
    const [lat2, lon2] = polygonLatLon[(i + 1) % polygonLatLon.length];
    const p1 = latLonToGlobePoint(lat1, lon1, 1.0);
    const p2 = latLonToGlobePoint(lat2, lon2, 1.0);

    for (let s = 0; s < subStepsPerEdge; s++) {
      const t = s / subStepsPerEdge;
      const interp = new Vector3().lerpVectors(p1, p2, t).normalize();
      arcPoints.push(interp);
    }
  }

  // 1. Surface-tangent glowing laser ribbon geometry along spherical perimeter
  const nPts = arcPoints.length;
  const ribbonPositions = new Float32Array(nPts * 2 * 3);
  const ribbonNormals = new Float32Array(nPts * 2 * 3);
  const ribbonIndices: number[] = [];

  for (let i = 0; i < nPts; i++) {
    const prev = arcPoints[(i - 1 + nPts) % nPts];
    const curr = arcPoints[i];
    const next = arcPoints[(i + 1) % nPts];

    const tangent = new Vector3().subVectors(next, prev).normalize();
    const normal = curr.clone().normalize();
    const side = new Vector3().crossVectors(normal, tangent).normalize();

    const innerPt = curr
      .clone()
      .multiplyScalar(ringRadius)
      .addScaledVector(side, -ribbonHalfWidth);
    const outerPt = curr
      .clone()
      .multiplyScalar(ringRadius)
      .addScaledVector(side, ribbonHalfWidth);

    const vi = i * 2;
    ribbonPositions[vi * 3] = innerPt.x;
    ribbonPositions[vi * 3 + 1] = innerPt.y;
    ribbonPositions[vi * 3 + 2] = innerPt.z;
    ribbonNormals[vi * 3] = normal.x;
    ribbonNormals[vi * 3 + 1] = normal.y;
    ribbonNormals[vi * 3 + 2] = normal.z;

    ribbonPositions[(vi + 1) * 3] = outerPt.x;
    ribbonPositions[(vi + 1) * 3 + 1] = outerPt.y;
    ribbonPositions[(vi + 1) * 3 + 2] = outerPt.z;
    ribbonNormals[(vi + 1) * 3] = normal.x;
    ribbonNormals[(vi + 1) * 3 + 1] = normal.y;
    ribbonNormals[(vi + 1) * 3 + 2] = normal.z;

    const nextVi = ((i + 1) % nPts) * 2;
    ribbonIndices.push(vi, vi + 1, nextVi);
    ribbonIndices.push(vi + 1, nextVi + 1, nextVi);
  }

  const ribbonGeo = new BufferGeometry();
  ribbonGeo.setAttribute('position', new Float32BufferAttribute(ribbonPositions, 3));
  ribbonGeo.setAttribute('normal', new Float32BufferAttribute(ribbonNormals, 3));
  ribbonGeo.setIndex(ribbonIndices);

  const baseHex = isStorm ? 0xf59e0b : 0x38bdf8;
  const ribbonMat = new MeshStandardMaterial({
    color: baseHex,
    emissive: baseHex,
    emissiveIntensity: 0.95,
    roughness: 0.2,
    metalness: 0.2,
    side: DoubleSide,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  ribbonMat.name = `SectorPolyMat_${sectorId}`;

  const ribbonMesh = new Mesh(ribbonGeo, ribbonMat);
  ribbonMesh.name = `SectorPoly_${sectorId}`;
  ribbonMesh.renderOrder = 3;
  group.add(ribbonMesh);

  // 2. Subtle spherical triangle-fan surface fill mesh (curves over the sphere via radial rings)
  const centerUnit = latLonToGlobePoint(centerLatLon[0], centerLatLon[1], 1.0).normalize();
  const fillRadius = GLOBE_RADIUS * 1.0025;
  const radialRings = 3;
  const fillVerts: number[] = [
    centerUnit.x * fillRadius,
    centerUnit.y * fillRadius,
    centerUnit.z * fillRadius,
  ];
  const fillNorms: number[] = [centerUnit.x, centerUnit.y, centerUnit.z];
  const fillIndices: number[] = [];

  for (let r = 1; r <= radialRings; r++) {
    const rf = r / radialRings;
    for (let i = 0; i < nPts; i++) {
      const u = new Vector3().lerpVectors(centerUnit, arcPoints[i], rf).normalize();
      fillVerts.push(u.x * fillRadius, u.y * fillRadius, u.z * fillRadius);
      fillNorms.push(u.x, u.y, u.z);
    }
  }

  for (let i = 0; i < nPts; i++) {
    const nextI = (i + 1) % nPts;
    fillIndices.push(0, 1 + i, 1 + nextI);
  }
  for (let r = 1; r < radialRings; r++) {
    const ringStart = 1 + (r - 1) * nPts;
    const nextRingStart = 1 + r * nPts;
    for (let i = 0; i < nPts; i++) {
      const nextI = (i + 1) % nPts;
      fillIndices.push(
        ringStart + i,
        nextRingStart + i,
        nextRingStart + nextI,
        ringStart + i,
        nextRingStart + nextI,
        ringStart + nextI,
      );
    }
  }

  const fillGeo = new BufferGeometry();
  fillGeo.setAttribute('position', new Float32BufferAttribute(fillVerts, 3));
  fillGeo.setAttribute('normal', new Float32BufferAttribute(fillNorms, 3));
  fillGeo.setIndex(fillIndices);

  const fillMat = new MeshBasicMaterial({
    color: baseHex,
    transparent: true,
    opacity: isStorm ? 0.055 : 0.035,
    side: DoubleSide,
    depthWrite: false,
  });
  fillMat.name = `SectorFillMat_${sectorId}`;

  const fillMesh = new Mesh(fillGeo, fillMat);
  fillMesh.name = `SectorFill_${sectorId}`;
  fillMesh.renderOrder = 2;
  group.add(fillMesh);

  // 3. Volumetric spherical storm cloud deck hovering over storm sectors (B, C in Monsoon, and E)
  if (isStorm || sectorId === 'C') {
    const stormRadius = GLOBE_RADIUS * 1.015;
    const stormVerts: number[] = [
      centerUnit.x * stormRadius,
      centerUnit.y * stormRadius,
      centerUnit.z * stormRadius,
    ];
    const stormNorms: number[] = [centerUnit.x, centerUnit.y, centerUnit.z];
    const stormIndices: number[] = [];
    const stormRings = 4;
    const stormPuffsPerRing = 16;

    for (let r = 1; r <= stormRings; r++) {
      const rf = (r / stormRings) * 0.82;
      for (let i = 0; i < stormPuffsPerRing; i++) {
        const angleIdx = Math.floor((i / stormPuffsPerRing) * nPts);
        const arcPt = arcPoints[angleIdx % nPts];
        const u = new Vector3().lerpVectors(centerUnit, arcPt, rf).normalize();
        const puffAlt = stormRadius * (1.0 + (i % 2 === 0 ? 0.0035 : -0.0015));
        stormVerts.push(u.x * puffAlt, u.y * puffAlt, u.z * puffAlt);
        stormNorms.push(u.x, u.y, u.z);
      }
    }

    for (let i = 0; i < stormPuffsPerRing; i++) {
      const nextI = (i + 1) % stormPuffsPerRing;
      stormIndices.push(0, 1 + i, 1 + nextI);
    }
    for (let r = 1; r < stormRings; r++) {
      const rStart = 1 + (r - 1) * stormPuffsPerRing;
      const nextRStart = 1 + r * stormPuffsPerRing;
      for (let i = 0; i < stormPuffsPerRing; i++) {
        const nextI = (i + 1) % stormPuffsPerRing;
        stormIndices.push(
          rStart + i,
          nextRStart + i,
          nextRStart + nextI,
          rStart + i,
          nextRStart + nextI,
          rStart + nextI,
        );
      }
    }

    const stormGeo = new BufferGeometry();
    stormGeo.setAttribute('position', new Float32BufferAttribute(stormVerts, 3));
    stormGeo.setAttribute('normal', new Float32BufferAttribute(stormNorms, 3));
    stormGeo.setIndex(stormIndices);

    const stormMat = new MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: 0x93c5fd,
      emissiveIntensity: 0.16,
      roughness: 0.92,
      metalness: 0.02,
      transparent: true,
      opacity: 0.68,
      side: DoubleSide,
      depthWrite: false,
    });
    stormMat.name = `SectorStormCapMat_${sectorId}`;

    const stormMesh = new Mesh(stormGeo, stormMat);
    stormMesh.name = `SectorStormCap_${sectorId}`;
    stormMesh.renderOrder = 3;
    stormMesh.visible = isStorm;
    group.add(stormMesh);
  }

  return group;
}

/**
 * Builds one tilted concentric orbital telemetry grid band around the lower hemisphere/flanks
 * of the Earth globe matching `Earth_globe_showing_South_Asia_15abf24a.jpg`.
 */
function buildOrbitalTelemetryBand(
  name: string,
  innerRadius: number,
  outerRadius: number,
  tiltEuler: [number, number, number],
  yOffset: number,
  accentHex: number,
): Group {
  const band = new Group();
  band.name = name;
  band.position.set(0, yOffset, -0.01);
  band.rotation.set(tiltEuler[0], tiltEuler[1], tiltEuler[2]);

  const midRadius = (innerRadius + outerRadius) * 0.5;
  const ringMat = new MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.75,
    roughness: 0.25,
    metalness: 0.5,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });

  const ringsGroup = new Group();
  ringsGroup.name = `${name}_Rings`;
  for (const [idx, r] of [innerRadius, midRadius, outerRadius].entries()) {
    const tube = idx === 2 ? 0.00085 : 0.0005;
    const torus = new Mesh(new TorusGeometry(r, tube, 6, 64), ringMat); // Reduced from 84 segments
    torus.name = `${name}_Ring_${idx}`;
    ringsGroup.add(torus);
  }
  mergeStaticMeshesByMaterial(ringsGroup);
  band.add(ringsGroup);

  const spokeVerts: number[] = [];
  const spokeCount = 32; // Reduced from 48 for fewer triangles
  for (let i = 0; i < spokeCount; i++) {
    const a = (i / spokeCount) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const r0 = i % 2 === 0 ? innerRadius : midRadius;
    const r1 = outerRadius + (i % 6 === 0 ? 0.004 : 0);
    spokeVerts.push(c * r0, s * r0, 0, c * r1, s * r1, 0);
  }

  const spokeGeo = new BufferGeometry();
  spokeGeo.setAttribute('position', new Float32BufferAttribute(spokeVerts, 3));
  const spokeMat = new LineBasicMaterial({
    color: accentHex,
    transparent: true,
    opacity: 0.34,
  });
  const spokes = new LineSegments(spokeGeo, spokeMat);
  spokes.name = `${name}_Spokes`;
  band.add(spokes);
  spokes.raycast = () => {};

  return band;
}

export function createEarthGlobeAsset(): Object3D {
  const root = new Group();
  root.name = 'TacticalEarthGlobe';

  // 1. Primary Earth Sphere (NASA Blue Marble 2K target mesh)
  const earthSphereGeo = new SphereGeometry(GLOBE_RADIUS, 48, 36);
  applyEarthBaseVertexColors(earthSphereGeo);

  const earthSurfaceMat = new MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.58,
    metalness: 0.06,
  });
  earthSurfaceMat.name = 'EarthSurfaceMaterial';

  const coreSphere = new Mesh(earthSphereGeo, earthSurfaceMat);
  coreSphere.name = 'GlobeCoreSphere';
  coreSphere.rotation.copy(GLOBE_EULER);
  root.add(coreSphere);

  // 2. Dynamic Planetary Cloud Layer Sphere (mapped with windowed NASA cloud texture at runtime)
  const cloudSphereGeo = new SphereGeometry(GLOBE_RADIUS * 1.009, 32, 24);
  const cloudLayerMat = new MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.08,
    roughness: 0.85,
    metalness: 0.0,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  cloudLayerMat.name = 'EarthCloudLayerMaterial';

  const cloudSphere = new Mesh(cloudSphereGeo, cloudLayerMat);
  cloudSphere.name = 'GlobeCloudSphere';
  cloudSphere.renderOrder = 1;
  cloudSphere.rotation.copy(GLOBE_EULER);
  root.add(cloudSphere);

  // 3. Dual-Shell Atmospheric Limb Fresnel Halo (luminous cyan-white polar/horizon glow)
  const innerAtmoGeo = new SphereGeometry(GLOBE_RADIUS * 1.022, 32, 22);
  const innerAtmoMat = new MeshBasicMaterial({
    color: 0x7dd3fc,
    side: BackSide,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
  });
  const innerAtmoShell = new Mesh(innerAtmoGeo, innerAtmoMat);
  innerAtmoShell.name = 'GlobeHorizonHalo';
  innerAtmoShell.renderOrder = 4;
  root.add(innerAtmoShell);

  const outerAtmoGeo = new SphereGeometry(GLOBE_RADIUS * 1.052, 32, 22);
  const outerAtmoMat = new MeshBasicMaterial({
    color: 0x38bdf8,
    side: BackSide,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const outerAtmoShell = new Mesh(outerAtmoGeo, outerAtmoMat);
  outerAtmoShell.name = 'GlobeAtmosphereRim';
  outerAtmoShell.renderOrder = 5;
  root.add(outerAtmoShell);

  // 4. Surface-Conforming Spherical Sector Boundary Polygons (Sectors A-F)
  const sectorOverlayGroup = new Group();
  sectorOverlayGroup.name = 'SphericalSectorBoundaries';
  for (const [id, def] of Object.entries(SECTOR_GEO_DEFINITIONS) as Array<
    [SectorId, (typeof SECTOR_GEO_DEFINITIONS)[SectorId]]
  >) {
    sectorOverlayGroup.add(
      buildSphericalSectorOverlay(id, def.polygonLatLon, def.centerLatLon, def.isStorm),
    );
  }
  root.add(sectorOverlayGroup);

  // 5. Concentric Tilted Orbital Coordinate Grid Bands wrapping the lower hemisphere & flanks
  const primaryBand = buildOrbitalTelemetryBand(
    'EquatorTelemetryRing',
    GLOBE_RADIUS * 1.16,
    GLOBE_RADIUS * 1.26,
    [Math.PI / 2 - 0.46, 0.16, -0.28],
    -0.026,
    0x5eead4,
  );
  root.add(primaryBand);

  const secondaryBand = buildOrbitalTelemetryBand(
    'OuterAzimuthRingGroup',
    GLOBE_RADIUS * 1.21,
    GLOBE_RADIUS * 1.32,
    [Math.PI / 2 - 0.38, -0.18, 0.25],
    -0.022,
    0x38bdf8,
  );
  root.add(secondaryBand);

  // 6. 3D Orbital Pass Ground-Track Meridian Arc & Sub-Satellite Nadir Pip
  const groundTrackPoints: Vector3[] = [];
  const trackSteps = 36;
  const startLat = 40.0;
  const startLon = 77.0;
  const endLat = 14.0;
  const endLon = 66.0;
  const trackRadius = GLOBE_RADIUS * 1.018;

  for (let i = 0; i <= trackSteps; i++) {
    const t = i / trackSteps;
    const lat = startLat + (endLat - startLat) * t;
    const lon = startLon + (endLon - startLon) * t;
    groundTrackPoints.push(latLonToGlobePoint(lat, lon, trackRadius));
  }

  const trackVerts: number[] = [];
  for (let i = 0; i < groundTrackPoints.length - 1; i++) {
    const p1 = groundTrackPoints[i];
    const p2 = groundTrackPoints[i + 1];
    trackVerts.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  }

  const trackGeo = new BufferGeometry();
  trackGeo.setAttribute('position', new Float32BufferAttribute(trackVerts, 3));
  const trackMat = new LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.65,
  });
  const groundTrackLine = new LineSegments(trackGeo, trackMat);
  groundTrackLine.name = 'OrbitalGroundTrackArc';
  root.add(groundTrackLine);
  groundTrackLine.raycast = () => {};

  const pipMat = new MeshStandardMaterial({
    color: 0x5eead4,
    emissive: 0x14b8a6,
    emissiveIntensity: 1.6,
    roughness: 0.2,
    metalness: 0.5,
  });
  pipMat.name = 'SubSatellitePipMat';
  const pipGeo = new CylinderGeometry(0.0032, 0.0012, 0.0055, 4);
  const nadirPip = new Mesh(pipGeo, pipMat);
  nadirPip.name = 'SubSatelliteNadirPip';
  nadirPip.position.copy(groundTrackPoints[0]);
  root.add(nadirPip);

  // 7. Volumetric 3D Orbital Observation Swath Cone (pulses from CubeSat down to target sector)
  const swathGeo = new CylinderGeometry(0.048, 0.008, 1, 24, 1, true);
  const swathMat = new MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.0,
    side: DoubleSide,
    depthWrite: false,
  });
  swathMat.name = 'OrbitalScanSwathConeMat';
  const swathCone = new Mesh(swathGeo, swathMat);
  swathCone.name = 'OrbitalScanSwathCone';
  swathCone.visible = false;
  root.add(swathCone);

  // 8. Phase 5: Karachi Downlink Ground Station Terminal (24.86° N, 67.0° E)
  const karachiGroup = new Group();
  karachiGroup.name = 'KarachiGroundStation';
  const karachiLocal = latLonToGlobePoint(24.86, 67.0, GLOBE_RADIUS);
  karachiGroup.position.copy(karachiLocal);

  // Orient local +Y along globe radial normal outward
  const normalK = karachiLocal.clone().normalize();
  const upHintK = Math.abs(normalK.y) > 0.95 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const xDirK = new Vector3().crossVectors(upHintK, normalK).normalize();
  const zDirK = new Vector3().crossVectors(normalK, xDirK).normalize();
  karachiGroup.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(xDirK, normalK, zDirK));

  const dishMat = new MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1.25,
    roughness: 0.25,
    metalness: 0.75,
  });
  dishMat.name = 'KarachiDishMat';
  const dishMesh = new Mesh(new CylinderGeometry(0.0075, 0.0015, 0.0035, 12), dishMat);
  dishMesh.name = 'KarachiGroundStationDish';
  dishMesh.position.set(0, 0.002, 0);
  karachiGroup.add(dishMesh);

  const hornMesh = new Mesh(new CylinderGeometry(0.0008, 0.0012, 0.006, 8), dishMat);
  hornMesh.name = 'KarachiStationFeedHorn';
  hornMesh.position.set(0, 0.0055, 0);
  karachiGroup.add(hornMesh);

  // Demodulation Shockwave Ripple Ring (pulsing circular dish reception field)
  const shockwaveMat = new MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  shockwaveMat.name = 'KarachiShockwaveMat';
  const shockwaveMesh = new Mesh(new TorusGeometry(0.012, 0.0014, 6, 24), shockwaveMat);
  shockwaveMesh.name = 'KarachiDishShockwave';
  shockwaveMesh.rotation.set(Math.PI / 2, 0, 0);
  shockwaveMesh.position.set(0, 0.0025, 0);
  shockwaveMesh.visible = false;
  karachiGroup.add(shockwaveMesh);

  mergeStaticMeshesByMaterial(karachiGroup, ['KarachiDishShockwave']);
  root.add(karachiGroup);

  // 9. Phase 5: Volumetric Space-to-Ground Downlink Telemetry Laser (CubeSat -> Karachi)
  const laserGroup = new Group();
  laserGroup.name = 'DownlinkLaserBeamGroup';

  const laserCoreMat = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  laserCoreMat.name = 'DownlinkLaserCoreMat';
  const laserCore = new Mesh(new CylinderGeometry(0.0022, 0.0022, 1, 12, 1, true), laserCoreMat);
  laserCore.name = 'DownlinkLaserCore';
  laserCore.visible = false;
  laserGroup.add(laserCore);

  const laserSheathMat = new MeshBasicMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.0,
    side: DoubleSide,
    depthWrite: false,
  });
  laserSheathMat.name = 'DownlinkLaserSheathMat';
  const laserSheath = new Mesh(new CylinderGeometry(0.012, 0.012, 1, 16, 1, true), laserSheathMat);
  laserSheath.name = 'DownlinkLaserSheath';
  laserSheath.visible = false;
  laserGroup.add(laserSheath);

  laserGroup.visible = false;
  root.add(laserGroup);

  return root;
}

const sharedPickColliderMat = new MeshBasicMaterial({
  transparent: true,
  opacity: 0.001,
  depthWrite: false,
});

/**
 * Open-center surface-tangent holographic target reticle for interactive Sectors A-F.
 * Oriented so local +Y points along the outward sphere normal, keeping the terrain inside
 * the reticle completely visible. Merged into 2 draw calls per beacon.
 */
export function createSectorMarkerAsset(
  isCloudCovered: boolean,
  accentHex: number,
): Object3D {
  const root = new Group();
  root.name = isCloudCovered ? 'SectorBeaconCloudy' : 'SectorBeaconClear';

  const baseMat = new MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.3,
    metalness: 0.78,
  });
  const beaconMat = new MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.25,
    roughness: 0.2,
    metalness: 0.35,
  });
  const glowLightMat = new MeshBasicMaterial({
    color: accentHex,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });

  // 1. Surface Ground Anchor Socket (titanium bevel ring flush with globe surface)
  const anchorSocket = new Mesh(
    new CylinderGeometry(0.0055, 0.0075, 0.0025, 12),
    beaconMat,
  );
  anchorSocket.name = 'SectorAnchorSocket';
  anchorSocket.position.set(0, 0.0012, 0);
  root.add(anchorSocket);

  // 2. Elevated Vertical Tactical Holographic Pylon Shaft (extends 32mm radially outward)
  const pylonHeight = 0.032;
  const pylonGeo = new CylinderGeometry(0.0009, 0.0013, pylonHeight, 8);
  const pylonMesh = new Mesh(pylonGeo, beaconMat);
  pylonMesh.name = 'SectorPylonShaft';
  pylonMesh.position.set(0, pylonHeight / 2 + 0.002, 0);
  root.add(pylonMesh);

  // 3. Floating Tactical Collar Ring (hovers along pylon at y = 22mm)
  const collarRing = new Mesh(
    new TorusGeometry(0.0095, 0.0009, 6, 24),
    beaconMat,
  );
  collarRing.name = 'SectorCollarRing';
  collarRing.rotation.set(Math.PI / 2, 0, 0);
  collarRing.position.set(0, 0.022, 0);
  root.add(collarRing);

  if (isCloudCovered) {
    // 4a. Hexagonal tactical radar hazard crown atop the pylon (y = 35mm)
    const reticleRing = new Mesh(
      new TorusGeometry(0.0125, 0.0012, 6, 6),
      beaconMat,
    );
    reticleRing.name = 'SectorHaloRing';
    reticleRing.rotation.set(Math.PI / 2, 0, Math.PI / 6);
    reticleRing.position.set(0, pylonHeight + 0.003, 0);
    root.add(reticleRing);

    // Three radiating radar wave arc brackets (120 deg apart)
    for (let b = 0; b < 3; b++) {
      const arc = new Mesh(
        new TorusGeometry(0.016, 0.0008, 6, 16, Math.PI * 0.42),
        beaconMat,
      );
      arc.name = `SectorBracketArc_${b}`;
      arc.rotation.set(Math.PI / 2, 0, (b * Math.PI * 2) / 3);
      arc.position.set(0, pylonHeight + 0.0032, 0);
      root.add(arc);
    }

    // Faceted triangular hazard beacon core
    const corePip = new Mesh(
      new CylinderGeometry(0.0032, 0.0014, 0.007, 3),
      beaconMat,
    );
    corePip.name = 'SectorBeaconCore';
    corePip.position.set(0, pylonHeight + 0.0055, 0);
    root.add(corePip);
  } else {
    // 4b. Sleek circular optical target reticle crown atop the pylon (y = 35mm)
    const reticleRing = new Mesh(
      new TorusGeometry(0.0118, 0.001, 8, 32),
      beaconMat,
    );
    reticleRing.name = 'SectorHaloRing';
    reticleRing.rotation.set(Math.PI / 2, 0, 0);
    reticleRing.position.set(0, pylonHeight + 0.003, 0);
    root.add(reticleRing);

    // Two outer framing arc brackets (opposite quadrants)
    for (let b = 0; b < 2; b++) {
      const arc = new Mesh(
        new TorusGeometry(0.0155, 0.0007, 6, 18, Math.PI * 0.56),
        beaconMat,
      );
      arc.name = `SectorBracketArc_${b}`;
      arc.rotation.set(Math.PI / 2, 0, b * Math.PI + 0.45);
      arc.position.set(0, pylonHeight + 0.0032, 0);
      root.add(arc);
    }

    // Four precision inward crosshair ticks
    const tickGeo = bevelBox(0.0012, 0.001, 0.0036, 0.0002, 0.0003, 1);
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const dist = 0.0085;
      const tick = new Mesh(tickGeo, beaconMat);
      tick.name = `SectorCrosshairTick_${i}`;
      tick.position.set(Math.sin(angle) * dist, pylonHeight + 0.0032, Math.cos(angle) * dist);
      tick.rotation.set(0, angle, 0);
      root.add(tick);
    }

    // Compact central cylindrical optical lens core
    const corePip = new Mesh(
      new CylinderGeometry(0.0026, 0.0016, 0.006, 6),
      beaconMat,
    );
    corePip.name = 'SectorBeaconCore';
    corePip.position.set(0, pylonHeight + 0.0055, 0);
    root.add(corePip);
  }

  // 5. Generous Semi-Transparent Pick Collider Sphere (r = 28mm)
  // Ensures mouse raycasts and VR index fingers reliably hit the beacon from any orientation
  const pickCollider = new Mesh(
    new SphereGeometry(0.028, 12, 8),
    sharedPickColliderMat,
  );
  pickCollider.name = 'SectorPickCollider';
  pickCollider.position.set(0, 0.020, 0);
  root.add(pickCollider);

  mergeStaticMeshesByMaterial(root);

  return root;
}

/**
 * Builds a deterministic crinkled metallic Kapton MLI foil patch (multi-faceted mesh with
 * per-facet normals and subtle vertex color gold variation) so directional light reflects
 * authentic bright amber-gold spacecraft foil crinkles.
 */
function buildCrinkledKaptonPatch(
  name: string,
  width: number,
  height: number,
  cols: number,
  rows: number,
  crinkleDepth: number,
  material: MeshStandardMaterial,
): Mesh {
  const positions: number[] = [];
  const grid: Vector3[][] = [];

  for (let r = 0; r <= rows; r++) {
    const rowPts: Vector3[] = [];
    const v = r / rows - 0.5;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols - 0.5;
      const edgeMask =
        Math.sin((c / cols) * Math.PI) * Math.sin((r / rows) * Math.PI);
      const rawHash = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
      const hash = rawHash - Math.floor(rawHash);
      const zOff = (hash - 0.5) * 2.0 * crinkleDepth * (0.35 + 0.65 * edgeMask);
      const jx = (hash - 0.5) * (width / cols) * 0.2 * edgeMask;
      const jy =
        Math.cos(c * 9.1 + r * 5.7) * 0.5 * (height / rows) * 0.2 * edgeMask;
      rowPts.push(new Vector3(u * width + jx, v * height + jy, zOff));
    }
    grid.push(rowPts);
  }

  const pushVert = (p: Vector3) => {
    positions.push(p.x, p.y, p.z);
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pushVert(grid[r][c]);
      pushVert(grid[r][c + 1]);
      pushVert(grid[r + 1][c + 1]);

      pushVert(grid[r][c]);
      pushVert(grid[r + 1][c + 1]);
      pushVert(grid[r + 1][c]);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();

  const mesh = new Mesh(geo, material);
  mesh.name = name;
  return mesh;
}

/**
 * Precision 3U Earth-Observation CubeSat Spacecraft (`ORBIT_ZERO_3U_CubeSat_spacecraft_1afdaa89.jpg`):
 * - 3U Anodized Aluminum Bus (0.068m x 0.068m x 0.204m) with 4 corner rails & 1U cross-frames
 * - Crinkled Amber-Gold Kapton MLI Thermal Blanket on +Z optical bulkhead, top aft bay, & side ports
 * - Square Nadir Optical Camera Housing with recessed multi-coated blue-cyan objective lens
 * - 6 Body-Mounted Solar Panels + Twin Horizontal Deployable Solar Array Wings (3x4 cell grid each)
 * - 4 Corner Dipole Whip Antennas + 2 Dorsal Telemetry Whip Antennas
 */
export function createOrbitZeroCubeSatAsset(): Object3D {
  const root = new Group();
  root.name = 'OrbitZero3UCubeSat';

  const busW = 0.068;
  const busH = 0.068;
  const busL = 0.204; // 3U length (3 x 6.8cm)

  const blackAnodizedMat = new MeshStandardMaterial({
    color: 0x141923,
    roughness: 0.34,
    metalness: 0.84,
  });
  const darkCoreMat = new MeshStandardMaterial({
    color: 0x0b0f17,
    roughness: 0.52,
    metalness: 0.65,
  });
  const kaptonGoldMat = new MeshStandardMaterial({
    color: 0xf5b82e,
    emissive: 0x6b3e06,
    emissiveIntensity: 0.24,
    roughness: 0.22,
    metalness: 0.92,
    side: DoubleSide,
  });
  const kaptonSolidGoldMat = new MeshStandardMaterial({
    color: 0xf5b82e,
    emissive: 0x78350f,
    emissiveIntensity: 0.28,
    roughness: 0.24,
    metalness: 0.86,
  });
  const solarCellBlueMat = new MeshStandardMaterial({
    color: 0x173873,
    emissive: 0x0c244f,
    emissiveIntensity: 0.28,
    roughness: 0.2,
    metalness: 0.72,
  });
  const silverBusbarMat = new MeshStandardMaterial({
    color: 0xdbe4f0,
    roughness: 0.24,
    metalness: 0.9,
  });
  const opticalLensGlassMat = new MeshStandardMaterial({
    color: 0x2563eb,
    emissive: 0x0284c7,
    emissiveIntensity: 0.65,
    roughness: 0.06,
    metalness: 0.35,
  });

  // 1. Inner 3U Structural Core Box
  const coreBox = new Mesh(
    bevelBox(busW - 0.006, busH - 0.006, busL - 0.006, 0.001, 0.002, 1),
    darkCoreMat,
  );
  coreBox.name = 'CubeSatCoreChassis';
  root.add(coreBox);

  // 2. Four Longitudinal 3U Anodized Corner Rails + Protruding Deployment Standoffs
  const railSize = 0.0068;
  const railOffset = busW * 0.5 - railSize * 0.5;
  const railGeo = bevelBox(railSize, railSize, busL + 0.008, 0.0008, 0.0012, 1);

  const cornerSigns: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];

  for (const [idx, [sx, sy]] of cornerSigns.entries()) {
    const rail = new Mesh(railGeo, blackAnodizedMat);
    rail.name = `CubeSatCornerRail_${idx}`;
    rail.position.set(sx * railOffset, sy * railOffset, 0);
    root.add(rail);

    for (const sz of [-1, 1]) {
      const bolt = new Mesh(
        new CylinderGeometry(0.0014, 0.0014, 0.002, 8),
        silverBusbarMat,
      );
      bolt.name = `RailFastener_${idx}_${sz > 0 ? 'F' : 'R'}`;
      bolt.rotation.set(Math.PI / 2, 0, 0);
      bolt.position.set(
        sx * railOffset,
        sy * railOffset,
        sz * (busL * 0.5 + 0.0045),
      );
      root.add(bolt);
    }
  }

  // 3. Four Transverse 1U Structural Bulkhead Rings (Z = -1.5U, -0.5U, +0.5U, +1.5U)
  const uStep = busL / 3;
  const zStations = [-1.5 * uStep, -0.5 * uStep, 0.5 * uStep, 1.5 * uStep];
  const hBarGeo = bevelBox(busW - railSize * 1.4, 0.0048, 0.0052, 0.0006, 0.001, 1);
  const vBarGeo = bevelBox(0.0048, busH - railSize * 1.4, 0.0052, 0.0006, 0.001, 1);

  for (const [sIdx, zPos] of zStations.entries()) {
    for (const sy of [-1, 1]) {
      const hBar = new Mesh(hBarGeo, blackAnodizedMat);
      hBar.name = `FrameHBar_${sIdx}_${sy > 0 ? 'T' : 'B'}`;
      hBar.position.set(0, sy * railOffset, zPos);
      root.add(hBar);
    }
    for (const sx of [-1, 1]) {
      const vBar = new Mesh(vBarGeo, blackAnodizedMat);
      vBar.name = `FrameVBar_${sIdx}_${sx > 0 ? 'R' : 'L'}`;
      vBar.position.set(sx * railOffset, 0, zPos);
      root.add(vBar);
    }
  }

  // 4. High-Resolution Crinkled Amber-Gold Kapton MLI Thermal Foil Blankets
  const frontKapton = buildCrinkledKaptonPatch(
    'FrontPayloadKaptonMLI',
    busW - 0.011,
    busH - 0.011,
    18,
    18,
    0.0024,
    kaptonGoldMat,
  );
  frontKapton.position.set(0, 0, busL * 0.5 - 0.0015);
  root.add(frontKapton);

  const topAftKapton = buildCrinkledKaptonPatch(
    'TopAftKaptonMLI',
    busW - 0.012,
    uStep * 1.35,
    14,
    16,
    0.002,
    kaptonGoldMat,
  );
  topAftKapton.rotation.set(-Math.PI / 2, 0, 0);
  topAftKapton.position.set(0, busH * 0.5 - 0.0015, -uStep * 0.72);
  root.add(topAftKapton);

  for (const sx of [-1, 1]) {
    const sideGold = buildCrinkledKaptonPatch(
      `SideAvionicsKapton_${sx > 0 ? 'R' : 'L'}`,
      uStep * 0.42,
      busH - 0.016,
      10,
      12,
      0.0016,
      kaptonGoldMat,
    );
    sideGold.rotation.set(0, (sx * Math.PI) / 2, 0);
    sideGold.position.set(sx * (busW * 0.5 - 0.0022), 0, -uStep * 0.22);
    root.add(sideGold);
  }

  // 5. Nadir Optical Camera Assembly on Front (+Z) Face
  const camHousing = new Mesh(
    bevelBox(0.034, 0.034, 0.014, 0.0018, 0.003, 2),
    blackAnodizedMat,
  );
  camHousing.name = 'OpticalCameraHousing';
  camHousing.position.set(0, -0.001, busL * 0.5 + 0.005);
  root.add(camHousing);

  for (const [bx, by] of cornerSigns) {
    const cBolt = new Mesh(
      new CylinderGeometry(0.0013, 0.0013, 0.002, 8),
      silverBusbarMat,
    );
    cBolt.name = `CameraBezelBolt_${bx}_${by}`;
    cBolt.rotation.set(Math.PI / 2, 0, 0);
    cBolt.position.set(bx * 0.0125, -0.001 + by * 0.0125, busL * 0.5 + 0.0122);
    root.add(cBolt);
  }

  const outerBaffle = new Mesh(
    new TorusGeometry(0.0115, 0.0022, 12, 28),
    blackAnodizedMat,
  );
  outerBaffle.name = 'CameraOuterBaffle';
  outerBaffle.position.set(0, -0.001, busL * 0.5 + 0.0125);
  root.add(outerBaffle);

  const innerApertureRing = new Mesh(
    new TorusGeometry(0.0088, 0.0012, 10, 24),
    silverBusbarMat,
  );
  innerApertureRing.name = 'CameraApertureRing';
  innerApertureRing.position.set(0, -0.001, busL * 0.5 + 0.0128);
  root.add(innerApertureRing);

  const lensDome = new Mesh(
    new SphereGeometry(0.0086, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.42),
    opticalLensGlassMat,
  );
  lensDome.name = 'CameraObjectiveLens';
  lensDome.rotation.set(Math.PI / 2, 0, 0);
  lensDome.position.set(0, -0.001, busL * 0.5 + 0.0085);
  root.add(lensDome);

  const calBracket = new Mesh(
    bevelBox(0.011, 0.008, 0.007, 0.0008, 0.0015, 1),
    silverBusbarMat,
  );
  calBracket.name = 'StarTrackerCalBracket';
  calBracket.position.set(0.019, -0.023, busL * 0.5 + 0.003);
  calBracket.rotation.set(0.2, -0.25, -0.35);
  root.add(calBracket);

  // 6. Body-Mounted Photovoltaic Cell Panels (Left -X, Right +X, and Forward Top +Y)
  for (const sx of [-1, 1]) {
    const xPos = sx * (busW * 0.5 - 0.0008);
    for (let strip = 0; strip < 3; strip++) {
      const zCenter = uStep * 0.92 - strip * 0.026;
      const cell = new Mesh(
        bevelBox(0.0018, busH - 0.016, 0.023, 0.0003, 0.0006, 1),
        solarCellBlueMat,
      );
      cell.name = `SideSolarFwd_${sx > 0 ? 'R' : 'L'}_${strip}`;
      cell.position.set(xPos, 0, zCenter);
      root.add(cell);
    }
    for (let strip = 0; strip < 2; strip++) {
      const zCenter = -uStep * 0.78 - strip * 0.028;
      const cell = new Mesh(
        bevelBox(0.0018, busH - 0.016, 0.025, 0.0003, 0.0006, 1),
        solarCellBlueMat,
      );
      cell.name = `SideSolarAft_${sx > 0 ? 'R' : 'L'}_${strip}`;
      cell.position.set(xPos, 0, zCenter);
      root.add(cell);
    }
  }

  for (let strip = 0; strip < 3; strip++) {
    const zCenter = uStep * 1.15 - strip * 0.032;
    const topCell = new Mesh(
      bevelBox(busW - 0.015, 0.0018, 0.028, 0.0003, 0.0006, 1),
      solarCellBlueMat,
    );
    topCell.name = `TopBodySolar_${strip}`;
    topCell.position.set(0, busH * 0.5 - 0.0006, zCenter);
    root.add(topCell);

    const busbar = new Mesh(
      bevelBox(busW - 0.014, 0.002, 0.0014, 0.0002, 0.0003, 1),
      silverBusbarMat,
    );
    busbar.name = `TopBodyBusbar_${strip}`;
    busbar.position.set(0, busH * 0.5 - 0.0004, zCenter + 0.015);
    root.add(busbar);
  }

  // 7. Twin Horizontal Deployable Solar Array Wings (3 x 4 Photovoltaic Cell Grid per Wing)
  const wingSpan = 0.172;
  const wingChord = 0.118;
  const cols = 4;
  const rows = 3;
  const cellW = (wingSpan - 0.014) / cols;
  const cellD = (wingChord - 0.012) / rows;
  const cellGeo = bevelBox(cellW - 0.0022, 0.0016, cellD - 0.0022, 0.0003, 0.0008, 1);

  for (const sx of [-1, 1]) {
    const wingGroup = new Group();
    wingGroup.name = sx < 0 ? 'LeftSolarWing' : 'RightSolarWing';
    wingGroup.position.set(
      sx * (busW * 0.5 + wingSpan * 0.5 + 0.003),
      busH * 0.5 - 0.002,
      -0.008,
    );
    wingGroup.rotation.set(0.06, 0, sx * -0.04);

    const substrate = new Mesh(
      bevelBox(wingSpan, 0.0022, wingChord, 0.0005, 0.0015, 1),
      kaptonSolidGoldMat,
    );
    substrate.name = `${wingGroup.name}_Substrate`;
    wingGroup.add(substrate);

    const frameRim = new Mesh(
      bevelBox(wingSpan - 0.003, 0.0026, wingChord - 0.003, 0.0004, 0.001, 1),
      blackAnodizedMat,
    );
    frameRim.name = `${wingGroup.name}_Frame`;
    wingGroup.add(frameRim);

    for (let r = 0; r < rows; r++) {
      const zOff = (r - (rows - 1) * 0.5) * cellD;
      for (let c = 0; c < cols; c++) {
        const xOff = (c - (cols - 1) * 0.5) * cellW;
        const cell = new Mesh(cellGeo, solarCellBlueMat);
        cell.name = `${wingGroup.name}_Cell_${r}_${c}`;
        cell.position.set(xOff, 0.0014, zOff);
        wingGroup.add(cell);
      }
    }

    for (let c = 1; c < cols; c++) {
      const xOff = (c - cols * 0.5) * cellW;
      const vBus = new Mesh(
        bevelBox(0.0016, 0.0028, wingChord - 0.008, 0.0002, 0.0003, 1),
        silverBusbarMat,
      );
      vBus.name = `${wingGroup.name}_ColBus_${c}`;
      vBus.position.set(xOff, 0.0015, 0);
      wingGroup.add(vBus);

      for (const sz of [-1, 1]) {
        const clip = new Mesh(
          bevelBox(0.0045, 0.0036, 0.0032, 0.0004, 0.0005, 1),
          silverBusbarMat,
        );
        clip.name = `${wingGroup.name}_EdgeClip_${c}_${sz > 0 ? 'F' : 'R'}`;
        clip.position.set(xOff, 0.0015, sz * (wingChord * 0.5 + 0.0005));
        wingGroup.add(clip);
      }
    }

    for (let r = 1; r < rows; r++) {
      const zOff = (r - rows * 0.5) * cellD;
      const hBus = new Mesh(
        bevelBox(wingSpan - 0.008, 0.0028, 0.0015, 0.0002, 0.0003, 1),
        silverBusbarMat,
      );
      hBus.name = `${wingGroup.name}_RowBus_${r}`;
      hBus.position.set(0, 0.0015, zOff);
      wingGroup.add(hBus);
    }

    for (const hz of [-0.034, 0.034]) {
      const hinge = new Mesh(
        bevelBox(0.009, 0.005, 0.007, 0.0008, 0.001, 1),
        silverBusbarMat,
      );
      hinge.name = `${wingGroup.name}_Hinge_${hz > 0 ? 'F' : 'R'}`;
      hinge.position.set(sx * (-wingSpan * 0.5 - 0.002), 0, hz);
      wingGroup.add(hinge);
    }

    root.add(wingGroup);
  }

  // 8. Six Precision Whip Antennas (4 Front Corner Dipoles + 2 Dorsal Monopoles)
  const whipGeo = new CylinderGeometry(0.00055, 0.00085, 1, 8);
  const antennaSpans: Array<{ name: string; start: Vector3; end: Vector3 }> = [
    {
      name: 'Antenna_FrontTopLeft',
      start: new Vector3(-0.029, 0.029, busL * 0.5),
      end: new Vector3(-0.072, 0.076, busL * 0.5 + 0.028),
    },
    {
      name: 'Antenna_FrontMidLeft',
      start: new Vector3(-0.031, 0.018, busL * 0.5),
      end: new Vector3(-0.088, 0.004, busL * 0.5 + 0.026),
    },
    {
      name: 'Antenna_FrontBottomLeft',
      start: new Vector3(-0.026, -0.029, busL * 0.5),
      end: new Vector3(-0.068, -0.064, busL * 0.5 + 0.032),
    },
    {
      name: 'Antenna_FrontBottomRight',
      start: new Vector3(0.022, -0.028, busL * 0.5 + 0.002),
      end: new Vector3(-0.018, -0.066, busL * 0.5 + 0.044),
    },
    {
      name: 'Antenna_DorsalLeft',
      start: new Vector3(-0.008, busH * 0.5, 0.004),
      end: new Vector3(-0.036, busH * 0.5 + 0.078, 0.026),
    },
    {
      name: 'Antenna_DorsalRight',
      start: new Vector3(0.012, busH * 0.5, -0.016),
      end: new Vector3(0.034, busH * 0.5 + 0.084, -0.004),
    },
  ];

  for (const ant of antennaSpans) {
    const whip = new Mesh(whipGeo, silverBusbarMat);
    whip.name = ant.name;
    const len = alignSpan(whip, ant.start, ant.end);
    whip.scale.set(1, len, 1);
    root.add(whip);
  }

  mergeStaticMeshesByMaterial(root);

  // 9. Dynamic Dual-Mode Payload Telemetry Indicators (attached after static merge for runtime ECS control)
  const opticalRingMat = new MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1.8,
    roughness: 0.15,
    metalness: 0.4,
  });
  opticalRingMat.name = 'CubeSatOpticalRingMat';
  const opticalRing = new Mesh(
    new TorusGeometry(0.0092, 0.0011, 8, 24),
    opticalRingMat,
  );
  opticalRing.name = 'CubeSatOpticalApertureRing';
  opticalRing.position.set(0, -0.001, busL * 0.5 + 0.0135);
  root.add(opticalRing);

  const sarFeedMat = new MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xb45309,
    emissiveIntensity: 0.35,
    roughness: 0.25,
    metalness: 0.8,
  });
  sarFeedMat.name = 'CubeSatSarFeedMat';
  const sarFeed = new Mesh(
    bevelBox(0.038, 0.006, 0.003, 0.0004, 0.0006, 1),
    sarFeedMat,
  );
  sarFeed.name = 'CubeSatSarFeedStrip';
  sarFeed.position.set(0, -busH * 0.5 + 0.004, busL * 0.5 + 0.002);
  root.add(sarFeed);

  return root;
}
