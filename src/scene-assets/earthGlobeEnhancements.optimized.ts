/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Scenario-Reactive Tactical Earth Disaster Overlay (`1` draw call via merged vertex-animated GLSL shader).
 *
 * Adapts to the active mission hazard while staying pinned cleanly to South Asia sector coordinates:
 * - WILDFIRE (OP 01 Fireline / Academy): jagged blazing canyon flame fronts, crimson burn scars, kiln hotspot.
 * - FLOOD / MONSOON (OP 02 Monsoon Shield / Supercell / Brownout): overflowing Indus floodplain water sheets,
 *   rippling levee-breach waves, brooding cyclone clouds & crackling lightning bolts.
 * - EARTHQUAKE (OP 03 Aftershock): jagged tectonic fault rupture fissures, expanding seismic shockwaves,
 *   sandstone landslide apron & overheating substation arc glow.
 */

import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  ShaderMaterial,
  Vector3,
} from '@iwsdk/core';
import type { SectorConfig, SectorId } from '../mission/types';
import { TACTICAL_PALETTE } from './lib/tacticalPalette';
import { GLOBE_RADIUS, latLonToGlobePoint, SECTOR_GEO_DEFINITIONS } from './earthGlobe.scene-asset';

export type EarthDisasterTheme = 'WILDFIRE' | 'FLOOD' | 'EARTHQUAKE';

export interface EarthDisasterVisualSpec {
  theme: EarthDisasterTheme;
  sectorWeather: Partial<Record<SectorId, SectorConfig['cloudCover']>>;
}

interface MeshAccumulator {
  verts: number[];
  colors: number[];
  effects: number[]; // [radialT, kind, phase, alpha]
  indices: number[];
  vertexCount: number;
}

function makeAccumulator(): MeshAccumulator {
  return { verts: [], colors: [], effects: [], indices: [], vertexCount: 0 };
}

function pushVertex(
  acc: MeshAccumulator,
  pos: Vector3,
  r: number,
  g: number,
  b: number,
  t: number,
  kind: number,
  phase: number,
  alpha: number,
): number {
  const idx = acc.vertexCount++;
  acc.verts.push(pos.x, pos.y, pos.z);
  acc.colors.push(r, g, b);
  acc.effects.push(t, kind, phase, alpha);
  return idx;
}

function buildSurfaceFrame(lat: number, lon: number, radius: number): {
  center: Vector3;
  normal: Vector3;
  east: Vector3;
  north: Vector3;
} {
  const center = latLonToGlobePoint(lat, lon, radius);
  const normal = center.clone().normalize();
  const upHint = Math.abs(normal.y) > 0.94 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const east = new Vector3().crossVectors(upHint, normal).normalize();
  const north = new Vector3().crossVectors(normal, east).normalize();
  return { center, normal, east, north };
}

/** Projects a local tangent offset back onto the sphere at `radius` so ribbons hug Earth curvature. */
function spherePointFromOffset(
  origin: Vector3,
  east: Vector3,
  north: Vector3,
  dx: number,
  dy: number,
  radius: number,
): Vector3 {
  return origin
    .clone()
    .addScaledVector(east, dx)
    .addScaledVector(north, dy)
    .normalize()
    .multiplyScalar(radius);
}

/** Organic irregular hazard patch (flood lake, charred burn bed, storm anvil, or landslide apron). */
function addOrganicHazardBlob(
  acc: MeshAccumulator,
  lat: number,
  lon: number,
  radiusScale: number,
  radiusM: number,
  aspectX: number,
  aspectY: number,
  rotRad: number,
  coreColor: [number, number, number],
  edgeColor: [number, number, number],
  kind: number,
  phase: number,
  centerAlpha: number,
  edgeAlpha: number,
  irregularity: number,
  segments = 14,
): void {
  const r = GLOBE_RADIUS * radiusScale;
  const { center, east, north } = buildSurfaceFrame(lat, lon, r);
  const cIdx = pushVertex(acc, center, coreColor[0], coreColor[1], coreColor[2], 0, kind, phase, centerAlpha);
  const start = acc.vertexCount;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const lobe = 1 + irregularity * (0.65 * Math.sin(a * 3 + phase) + 0.35 * Math.cos(a * 5 - phase));
    const lx = Math.cos(a) * radiusM * aspectX * lobe;
    const ly = Math.sin(a) * radiusM * aspectY * lobe;
    const dx = lx * cosR - ly * sinR;
    const dy = lx * sinR + ly * cosR;
    const pt = spherePointFromOffset(center, east, north, dx, dy, r);
    pushVertex(acc, pt, edgeColor[0], edgeColor[1], edgeColor[2], 1, kind, phase, edgeAlpha);
  }

  for (let i = 0; i < segments; i++) {
    acc.indices.push(cIdx, start + i, start + ((i + 1) % segments));
  }
}

/** Jagged polyline ribbon along Earth's sphere for active fire fronts, lightning arcs, or fault fissures. */
function addSurfacePolylineRibbon(
  acc: MeshAccumulator,
  latLonPath: Array<[number, number]>,
  radiusScale: number,
  halfWidthM: number,
  color: [number, number, number],
  kind: number,
  phase: number,
  alpha: number,
): void {
  if (latLonPath.length < 2) return;
  const r = GLOBE_RADIUS * radiusScale;
  const pts = latLonPath.map(([lat, lon]) => latLonToGlobePoint(lat, lon, r));
  const baseIdx = acc.vertexCount;

  for (let i = 0; i < pts.length; i++) {
    const curr = pts[i];
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const nrm = curr.clone().normalize();
    const tang = next.clone().sub(prev).normalize();
    const side = new Vector3().crossVectors(nrm, tang).normalize();
    const t = i / (pts.length - 1);
    const taper = Math.sin(Math.min(1, Math.max(0.08, t * (1 - t) * 4.2)));
    const w = halfWidthM * (0.45 + 0.75 * taper);
    const left = curr.clone().addScaledVector(side, -w);
    const right = curr.clone().addScaledVector(side, w);
    pushVertex(acc, left, color[0], color[1], color[2], t, kind, phase, alpha * (0.65 + 0.35 * taper));
    pushVertex(acc, right, color[0], color[1], color[2], t, kind, phase, alpha * (0.65 + 0.35 * taper));
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const vi = baseIdx + i * 2;
    acc.indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
  }
}

/** Expanding surface ring (seismic shockwave, flood breach surge, or thermal perimeter pulse). */
function addSurfaceRing(
  acc: MeshAccumulator,
  lat: number,
  lon: number,
  radiusScale: number,
  ringRadiusM: number,
  thicknessM: number,
  color: [number, number, number],
  kind: number,
  phase: number,
  alpha: number,
  segments = 20,
): void {
  const r = GLOBE_RADIUS * radiusScale;
  const { center, east, north } = buildSurfaceFrame(lat, lon, r);
  const start = acc.vertexCount;
  const inner = Math.max(0.002, ringRadiusM - thicknessM * 0.5);
  const outer = ringRadiusM + thicknessM * 0.5;

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const pIn = spherePointFromOffset(center, east, north, ca * inner, sa * inner, r);
    const pOut = spherePointFromOffset(center, east, north, ca * outer, sa * outer, r);
    pushVertex(acc, pIn, color[0], color[1], color[2], 0.2, kind, phase, alpha * 0.4);
    pushVertex(acc, pOut, color[0], color[1], color[2], 0.9, kind, phase, alpha);
  }

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const vi = start + i * 2;
    const nvi = start + next * 2;
    acc.indices.push(vi, vi + 1, nvi, vi + 1, nvi + 1, nvi);
  }
}

function buildScenarioDisasterGeometry(spec: EarthDisasterVisualSpec): BufferGeometry {
  const acc = makeAccumulator();
  const bCenter = SECTOR_GEO_DEFINITIONS.B.centerLatLon;
  const dCenter = SECTOR_GEO_DEFINITIONS.D.centerLatLon;
  const eCenter = SECTOR_GEO_DEFINITIONS.E.centerLatLon;

  if (spec.theme === 'WILDFIRE') {
    // 1. Sector B (Bolan Canyon Highway): deep scorched soot bed + jagged 860K canyon wildfire fronts
    addOrganicHazardBlob(
      acc, bCenter[0], bCenter[1], 1.0065, 0.036, 1.35, 0.85, 0.45,
      [0.14, 0.06, 0.04], [0.06, 0.04, 0.04], 0, 0.4, 0.68, 0.0, 0.28, 16,
    );
    addOrganicHazardBlob(
      acc, bCenter[0] + 0.6, bCenter[1] - 0.8, 1.008, 0.025, 1.25, 0.72, 0.55,
      [1.0, 0.78, 0.25], [0.95, 0.24, 0.06], 0, 1.1, 0.95, 0.12, 0.34, 14,
    );
    addSurfacePolylineRibbon(
      acc,
      [
        [bCenter[0] - 4.8, bCenter[1] - 7.5],
        [bCenter[0] - 1.5, bCenter[1] - 3.2],
        [bCenter[0] + 1.2, bCenter[1] + 0.4],
        [bCenter[0] + 3.4, bCenter[1] + 4.8],
        [bCenter[0] + 5.2, bCenter[1] + 8.0],
      ],
      1.009, 0.0042, [1.0, 0.52, 0.10], 0, 0.7, 0.96,
    );
    addSurfacePolylineRibbon(
      acc,
      [
        [bCenter[0] - 2.6, bCenter[1] + 2.5],
        [bCenter[0] + 0.2, bCenter[1] + 1.2],
        [bCenter[0] + 3.8, bCenter[1] - 2.8],
      ],
      1.0092, 0.0032, [1.0, 0.85, 0.32], 0, 2.2, 0.92,
    );

    // 2. Sector E (Juniper Ridge Fuel Depot): wind-driven spot-fire perimeter + ember ring
    addOrganicHazardBlob(
      acc, eCenter[0], eCenter[1], 1.0068, 0.028, 1.2, 0.85, -0.35,
      [0.98, 0.45, 0.09], [0.55, 0.12, 0.03], 0, 2.5, 0.88, 0.08, 0.32, 14,
    );
    addSurfacePolylineRibbon(
      acc,
      [
        [eCenter[0] - 4.2, eCenter[1] - 5.2],
        [eCenter[0] - 1.4, eCenter[1] - 1.6],
        [eCenter[0] + 0.8, eCenter[1] + 2.4],
        [eCenter[0] + 2.8, eCenter[1] + 6.0],
      ],
      1.0088, 0.0034, [1.0, 0.58, 0.14], 0, 3.3, 0.92,
    );

    // 3. Sector D (Sibi Industrial Kiln Flats): tiny static brick-kiln thermal pinpoint (distinct from wildfire)
    addOrganicHazardBlob(
      acc, dCenter[0], dCenter[1], 1.0072, 0.010, 1.0, 1.0, 0,
      [0.98, 0.65, 0.16], [0.85, 0.32, 0.05], 5, 1.5, 0.82, 0.05, 0.12, 10,
    );
  } else if (spec.theme === 'EARTHQUAKE') {
    // 1. Sector B (Hanna Valley Gorge): landslide debris apron + shattered valley epicenter ring
    addOrganicHazardBlob(
      acc, bCenter[0], bCenter[1], 1.0068, 0.032, 1.3, 0.78, 0.6,
      [0.72, 0.56, 0.38], [0.35, 0.28, 0.22], 3, 0.5, 0.72, 0.05, 0.28, 14,
    );
    addSurfacePolylineRibbon(
      acc,
      [
        [bCenter[0] - 5.5, bCenter[1] - 6.8],
        [bCenter[0] - 1.8, bCenter[1] - 2.1],
        [bCenter[0] + 0.9, bCenter[1] + 2.2],
        [bCenter[0] + 4.8, bCenter[1] + 6.4],
      ],
      1.0086, 0.0032, [0.96, 0.58, 0.18], 3, 0.9, 0.92,
    );
    addSurfaceRing(acc, bCenter[0], bCenter[1], 1.0076, 0.029, 0.0032, [0.98, 0.45, 0.09], 4, 0.0, 0.82, 22);

    // 2. Sector E (Chaman Fault Substation): deep crimson/orange fault rupture trace + 740 K transformer glow + wave
    addSurfacePolylineRibbon(
      acc,
      [
        [eCenter[0] - 6.5, eCenter[1] - 7.5],
        [eCenter[0] - 2.4, eCenter[1] - 2.0],
        [eCenter[0] + 1.2, eCenter[1] + 2.6],
        [eCenter[0] + 5.8, eCenter[1] + 7.2],
      ],
      1.009, 0.0038, [0.98, 0.35, 0.12], 3, 2.4, 0.96,
    );
    addSurfacePolylineRibbon(
      acc,
      [
        [eCenter[0] - 1.5, eCenter[1] + 4.5],
        [eCenter[0] + 0.3, eCenter[1] + 0.6],
        [eCenter[0] + 3.2, eCenter[1] - 4.0],
      ],
      1.0088, 0.0024, [1.0, 0.72, 0.24], 3, 3.1, 0.88,
    );
    addOrganicHazardBlob(
      acc, eCenter[0], eCenter[1], 1.0092, 0.013, 1.0, 1.0, 0,
      [1.0, 0.78, 0.25], [0.94, 0.26, 0.08], 5, 2.0, 0.95, 0.08, 0.20, 12,
    );
    addSurfaceRing(acc, eCenter[0], eCenter[1], 1.0078, 0.032, 0.0034, [0.98, 0.42, 0.12], 4, 1.6, 0.85, 22);
  } else {
    // FLOOD / MONSOON: Saturated shimmering Indus & Sector B/E floodplains + breach ripples + lightning arcs
    // 1. Indus Valley Overflow & Sector B Levee Breach Inundation Basin
    addOrganicHazardBlob(
      acc, 28.5, 70.0, 1.0062, 0.026, 1.45, 0.65, -0.85,
      [0.06, 0.78, 0.98], [0.02, 0.42, 0.76], 1, 0.4, 0.80, 0.08, 0.25, 14,
    );
    addOrganicHazardBlob(
      acc, bCenter[0], bCenter[1], 1.0066, 0.036, 1.3, 0.85, 0.35,
      [0.10, 0.84, 1.0], [0.02, 0.48, 0.86], 1, 1.2, 0.86, 0.10, 0.26, 16,
    );
    addSurfaceRing(acc, bCenter[0], bCenter[1], 1.0076, 0.031, 0.0035, [0.22, 0.84, 0.98], 4, 0.2, 0.78, 22);

    // 2. Sector E Highland Spur Floodline
    addOrganicHazardBlob(
      acc, eCenter[0], eCenter[1], 1.0066, 0.030, 1.25, 0.82, -0.4,
      [0.08, 0.80, 0.98], [0.02, 0.46, 0.84], 1, 2.1, 0.82, 0.08, 0.24, 14,
    );
    addSurfaceRing(acc, eCenter[0], eCenter[1], 1.0076, 0.027, 0.0030, [0.22, 0.84, 0.98], 4, 1.8, 0.72, 20);

    // 3. Sector C storm inundation surge in Supercell variants
    if (spec.sectorWeather.C === 'DENSE_STORM') {
      const cCenter = SECTOR_GEO_DEFINITIONS.C.centerLatLon;
      addOrganicHazardBlob(
        acc, cCenter[0], cCenter[1], 1.0066, 0.028, 1.15, 0.9, 0.2,
        [0.08, 0.75, 0.96], [0.03, 0.40, 0.78], 1, 3.0, 0.78, 0.08, 0.24, 14,
      );
      addSurfacePolylineRibbon(
        acc,
        [
          [cCenter[0] - 2.5, cCenter[1] - 3.5],
          [cCenter[0] + 0.5, cCenter[1] + 0.4],
          [cCenter[0] + 3.2, cCenter[1] + 3.8],
        ],
        1.016, 0.0022, [0.85, 0.96, 1.0], 2, 4.1, 0.95,
      );
    }

    // 4. Crackling Monsoon Lightning Arcs hovering in Sector B & E storm clouds
    addSurfacePolylineRibbon(
      acc,
      [
        [bCenter[0] - 3.0, bCenter[1] - 3.2],
        [bCenter[0] - 0.6, bCenter[1] + 0.8],
        [bCenter[0] + 1.2, bCenter[1] - 0.9],
        [bCenter[0] + 3.6, bCenter[1] + 3.4],
      ],
      1.017, 0.0022, [0.88, 0.97, 1.0], 2, 1.4, 0.98,
    );
    addSurfacePolylineRibbon(
      acc,
      [
        [eCenter[0] - 2.8, eCenter[1] + 2.4],
        [eCenter[0] + 0.2, eCenter[1] - 0.4],
        [eCenter[0] + 3.2, eCenter[1] - 2.8],
      ],
      1.017, 0.0020, [0.82, 0.95, 1.0], 2, 3.7, 0.96,
    );
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(acc.verts, 3));
  geo.setAttribute('color', new Float32BufferAttribute(acc.colors, 3));
  geo.setAttribute('aEffect', new Float32BufferAttribute(acc.effects, 4));
  geo.setIndex(acc.indices);
  geo.computeBoundingSphere();
  return geo;
}

function createDisasterOverlayMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute vec3 color;
      attribute vec4 aEffect;
      varying vec3 vColor;
      varying vec4 vEffect;
      void main() {
        vColor = color;
        vEffect = aEffect;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vColor;
      varying vec4 vEffect;
      void main() {
        float t = vEffect.x;
        float kind = vEffect.y;
        float phase = vEffect.z;
        float baseAlpha = vEffect.w;
        vec3 col = vColor;
        float alpha = baseAlpha;

        if (kind < 0.5) {
          // Wildfire: turbulent licking ember waves
          float pulse = 0.74 + 0.26 * sin(uTime * 6.8 + phase - t * 6.0);
          col = mix(col, vec3(1.0, 0.92, 0.48), clamp((1.0 - t) * 0.42 * pulse, 0.0, 0.5));
          alpha *= (0.82 + 0.18 * pulse);
        } else if (kind < 1.5) {
          // Floodwater sheet: rhythmic outward surface wave crests
          float ripple = 0.5 + 0.5 * sin(t * 14.0 - uTime * 3.4 + phase);
          col = mix(col, vec3(0.45, 0.94, 1.0), ripple * 0.36);
          alpha *= (0.78 + 0.22 * ripple);
        } else if (kind < 2.5) {
          // Monsoon lightning bolt flash: dark gap followed by vivid electric cyan-white bolt
          float flash = pow(max(0.0, sin(uTime * 3.9 + phase) * sin(uTime * 9.1 + phase * 1.7)), 5.0);
          alpha = baseAlpha * (0.04 + 0.96 * flash);
          col = mix(col, vec3(1.0), flash * 0.65);
        } else if (kind < 3.5) {
          // Seismic fault rupture crack: hot stressed tectonic pulse
          float strain = 0.68 + 0.32 * sin(uTime * 4.5 + phase - t * 4.0);
          col *= (0.9 + 0.35 * strain);
          alpha *= (0.78 + 0.22 * strain);
        } else if (kind < 4.5) {
          // Expanding ring wave (shockwave / surge pulse)
          float ringPulse = 0.45 + 0.55 * sin(uTime * 3.2 - phase);
          alpha *= ringPulse;
        } else {
          // Kiln / Substation beacon glow
          float beacon = 0.78 + 0.22 * sin(uTime * 5.2 + phase);
          alpha *= beacon;
        }

        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }
    `,
  });
}

function createMergedStormFloodLightning(): Mesh {
  const geo = buildScenarioDisasterGeometry({
    theme: 'FLOOD',
    sectorWeather: { B: 'DENSE_STORM', E: 'DENSE_STORM' },
  });
  const mat = createDisasterOverlayMaterial();
  mat.name = 'MergedStormFloodLightningMat';

  const mergedMesh = new Mesh(geo, mat);
  mergedMesh.name = 'MergedStormFloodLightning';
  mergedMesh.renderOrder = 3;
  mergedMesh.raycast = () => {};
  return mergedMesh;
}

/**
 * Configures the merged globe disaster overlay for the currently loaded operation so wildfire,
 * monsoon flood, and earthquake scenarios show unmistakable, non-drifting surface hazards in 1 draw call.
 */
export function configureEarthDisasterEnhancements(
  enhancements: Group,
  spec: EarthDisasterVisualSpec,
): void {
  const merged = enhancements.getObjectByName('MergedStormFloodLightning');
  if (!(merged instanceof Mesh)) return;
  const nextGeo = buildScenarioDisasterGeometry(spec);
  merged.geometry.dispose();
  merged.geometry = nextGeo;
}

/**
 * OPTIMIZED: Enhanced Atmospheric Glow (replaces existing BackSide spheres)
 * Uses custom shader -> 0 additional draw calls (modifies existing material)
 */
export function createEnhancedAtmosphereShader(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      glowColor: { value: new Color(TACTICAL_PALETTE.electricCyan) },
      intensity: { value: 0.7 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float intensity;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 2.2);
        float alpha = fresnel * intensity;
        gl_FragColor = vec4(glowColor, alpha);
      }
    `,
  });
}

/**
 * OPTIMIZED: Single LineSegments for Orbital Trajectory + ARIA-7 Wireframe
 * Combines both into one draw call (merged in aria7Avatar integration)
 */
export function createOrbitalTrajectoryAndARIA7Wireframe(): LineSegments {
  const segments: number[] = [];

  const orbitRadius = GLOBE_RADIUS * 2.8;
  const orbitSegments = 64;

  for (let i = 0; i < orbitSegments; i += 2) {
    const t1 = i / orbitSegments;
    const t2 = (i + 1) / orbitSegments;
    const angle1 = t1 * Math.PI * 2;
    const angle2 = t2 * Math.PI * 2;

    const x1 = Math.cos(angle1) * orbitRadius;
    const y1 = Math.sin(angle1) * orbitRadius * 0.3;
    const z1 = Math.sin(angle1) * orbitRadius * 0.5;

    const x2 = Math.cos(angle2) * orbitRadius;
    const y2 = Math.sin(angle2) * orbitRadius * 0.3;
    const z2 = Math.sin(angle2) * orbitRadius * 0.5;

    segments.push(x1, y1, z1, x2, y2, z2);
  }

  const phi = (1 + Math.sqrt(5)) / 2;
  const scale = 0.025;

  const icoVerts = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ].map(v => new Vector3(v[0], v[1], v[2]).normalize().multiplyScalar(scale));

  const edges = [
    [0, 11], [0, 5], [0, 1], [0, 7], [0, 10],
    [1, 5], [5, 9], [11, 5], [11, 10], [11, 2],
    [10, 7], [7, 1], [1, 8], [8, 9], [9, 4],
    [4, 5], [2, 9], [2, 4], [2, 6], [6, 10],
    [6, 7], [6, 8], [3, 9], [3, 4], [3, 2],
    [3, 6], [3, 8], [8, 1], [4, 11], [7, 6],
  ];

  edges.forEach(([a, b]) => {
    const offsetX = -0.42;
    const offsetY = 1.15;
    const offsetZ = -0.48;

    segments.push(
      icoVerts[a].x + offsetX, icoVerts[a].y + offsetY, icoVerts[a].z + offsetZ,
      icoVerts[b].x + offsetX, icoVerts[b].y + offsetY, icoVerts[b].z + offsetZ,
    );
  });

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(segments, 3));

  const mat = new LineBasicMaterial({
    color: new Color(TACTICAL_PALETTE.electricCyan),
    transparent: true,
    opacity: 0.7,
  });
  mat.name = 'OptimizedWireframeMat';

  const lines = new LineSegments(geo, mat);
  lines.name = 'OptimizedOrbitalAndARIA7Wireframe';
  lines.raycast = () => {};

  return lines;
}

/**
 * OPTIMIZED: Main enhancement factory (1 draw call, updated dynamically when operation switches).
 */
export function createEarthGlobeEnhancementsOptimized(): Group {
  const enhancements = new Group();
  enhancements.name = 'TacticalEarthEnhancements_Optimized';
  const mergedEffects = createMergedStormFloodLightning();
  enhancements.add(mergedEffects);
  return enhancements;
}

/**
 * Drives GPU hazard wave/flame/lightning/fault animations cleanly with zero ocean rotation drift.
 */
export function updateEarthEnhancementsOptimized(
  enhancements: Group,
  _delta: number,
  elapsedTime: number,
): void {
  const merged = enhancements.getObjectByName('MergedStormFloodLightning');
  if (merged instanceof Mesh && merged.material instanceof ShaderMaterial && merged.material.uniforms?.uTime) {
    merged.material.uniforms.uTime.value = elapsedTime;
  }
}
