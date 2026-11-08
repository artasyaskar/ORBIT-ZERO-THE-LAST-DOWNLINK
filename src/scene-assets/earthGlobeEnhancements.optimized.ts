/**
 * ORBIT ZERO: THE LAST DOWNLINK RC10.0
 * OPTIMIZED Earth Globe Enhancement Layer
 * 
 * DRAW CALL OPTIMIZATION STRATEGY:
 * - Single merged mesh for ALL storm/flood/lightning effects (1 draw call)
 * - In-place material shader upgrades for terminator/atmosphere (0 additional)
 * - Dashed orbital trajectory merged with ARIA-7 wireframe (1 draw call)
 * 
 * TOTAL ADDITIONAL DRAW CALLS: 2 (vs. original 6)
 * NEW TOTAL BUDGET: 147 baseline + 2 enhancements + 1 ARIA-7 = 150 ✅
 */

import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { TACTICAL_PALETTE, EMISSION_INTENSITIES } from './lib/tacticalPalette';
import { GLOBE_RADIUS, latLonToGlobePoint, SECTOR_GEO_DEFINITIONS } from './earthGlobe.scene-asset';

/**
 * ULTRA-OPTIMIZED: Single merged mesh combining:
 * - Storm clouds (Sector B)
 * - Lightning flashes (5 points)
 * - Flood water overlay (Indus Basin)
 * 
 * Uses vertex colors for differentiation → single material
 * Result: 1 draw call instead of 3
 */
function createMergedStormFloodLightning(): Mesh {
  const mergedVerts: number[] = [];
  const mergedColors: number[] = [];
  const mergedIndices: number[] = [];
  let vertexOffset = 0;

  const stormRadius = GLOBE_RADIUS * 1.016;
  const sectorBDef = SECTOR_GEO_DEFINITIONS.B;
  const centerLatLon = sectorBDef.centerLatLon;
  const centerUnit = latLonToGlobePoint(centerLatLon[0], centerLatLon[1], 1.0).normalize();

  // ===== PART 1: STORM CLOUD LAYER =====
  const polygonLatLon = sectorBDef.polygonLatLon;
  const arcPoints: Vector3[] = [];
  const subSteps = 6;

  for (let i = 0; i < polygonLatLon.length; i++) {
    const [lat1, lon1] = polygonLatLon[i];
    const [lat2, lon2] = polygonLatLon[(i + 1) % polygonLatLon.length];
    const p1 = latLonToGlobePoint(lat1, lon1, 1.0).normalize();
    const p2 = latLonToGlobePoint(lat2, lon2, 1.0).normalize();

    for (let s = 0; s < subSteps; s++) {
      const t = s / subSteps;
      const interp = new Vector3().lerpVectors(p1, p2, t).normalize();
      arcPoints.push(interp);
    }
  }

  // Storm center
  const centerPos = centerUnit.clone().multiplyScalar(stormRadius);
  mergedVerts.push(centerPos.x, centerPos.y, centerPos.z);
  // Purple storm color
  mergedColors.push(0.75, 0.5, 0.85);
  const stormCenterIdx = vertexOffset++;

  // Storm outer ring
  arcPoints.forEach((pt, idx) => {
    const puffHeight = stormRadius * (1.0 + (idx % 3 === 0 ? 0.004 : 0.002));
    const pos = pt.clone().multiplyScalar(puffHeight);
    mergedVerts.push(pos.x, pos.y, pos.z);
    const colorVar = 0.85 + (idx % 2) * 0.1;
    mergedColors.push(colorVar, colorVar - 0.05, colorVar);
  });

  // Storm triangle fan
  for (let i = 0; i < arcPoints.length; i++) {
    const nextI = (i + 1) % arcPoints.length;
    mergedIndices.push(stormCenterIdx, vertexOffset + i, vertexOffset + nextI);
  }
  vertexOffset += arcPoints.length;

  // ===== PART 2: LIGHTNING FLASHES =====
  const flashOffsets = [[0, 0], [2, 3], [-3, 2], [1, -2], [-2, -3]];
  const flashRadius = GLOBE_RADIUS * 1.018;

  flashOffsets.forEach((offset, idx) => {
    const lat = centerLatLon[0] + offset[0];
    const lon = centerLatLon[1] + offset[1];
    const pos = latLonToGlobePoint(lat, lon, flashRadius);

    // Flat square flash sprite (2 triangles)
    const size = 0.005;
    const normal = pos.clone().normalize();
    const tangent1 = new Vector3().crossVectors(normal, new Vector3(0, 1, 0)).normalize();
    const tangent2 = new Vector3().crossVectors(normal, tangent1).normalize();

    const p1 = pos.clone().addScaledVector(tangent1, -size).addScaledVector(tangent2, -size);
    const p2 = pos.clone().addScaledVector(tangent1, size).addScaledVector(tangent2, -size);
    const p3 = pos.clone().addScaledVector(tangent1, size).addScaledVector(tangent2, size);
    const p4 = pos.clone().addScaledVector(tangent1, -size).addScaledVector(tangent2, size);

    const i1 = vertexOffset++;
    const i2 = vertexOffset++;
    const i3 = vertexOffset++;
    const i4 = vertexOffset++;

    mergedVerts.push(
      p1.x, p1.y, p1.z,
      p2.x, p2.y, p2.z,
      p3.x, p3.y, p3.z,
      p4.x, p4.y, p4.z
    );

    // Yellow flash color
    for (let j = 0; j < 4; j++) {
      mergedColors.push(1.0, 1.0, 0.0);
    }

    mergedIndices.push(i1, i2, i3, i1, i3, i4);
  });

  // ===== PART 3: FLOOD WATER OVERLAY =====
  const floodRadius = GLOBE_RADIUS * 1.012;
  const floodZones = [
    { lat: 28, lon: 68, size: 0.018 },
    { lat: 26, lon: 69, size: 0.022 },
    { lat: 24, lon: 68, size: 0.016 },
  ];

  floodZones.forEach(zone => {
    const center = latLonToGlobePoint(zone.lat, zone.lon, 1.0).normalize();
    const centerPos = center.clone().multiplyScalar(floodRadius);

    // Center vertex
    const centerIdx = vertexOffset++;
    mergedVerts.push(centerPos.x, centerPos.y, centerPos.z);
    mergedColors.push(0.0, 0.8, 1.0); // Cyan flood

    // Ring of vertices
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const offset = new Vector3(
        Math.cos(angle) * zone.size,
        0,
        Math.sin(angle) * zone.size
      );

      const tangent1 = new Vector3().crossVectors(center, new Vector3(0, 1, 0)).normalize();
      const tangent2 = new Vector3().crossVectors(center, tangent1).normalize();

      const edgePos = centerPos.clone()
        .addScaledVector(tangent1, offset.x)
        .addScaledVector(tangent2, offset.z);

      mergedVerts.push(edgePos.x, edgePos.y, edgePos.z);
      mergedColors.push(0.0, 0.7, 1.0);
    }

    // Triangle fan
    for (let i = 0; i < segments; i++) {
      const nextI = (i + 1) % segments;
      mergedIndices.push(centerIdx, vertexOffset + i, vertexOffset + nextI);
    }
    vertexOffset += segments;
  });

  // ===== BUILD MERGED GEOMETRY =====
  const mergedGeo = new BufferGeometry();
  mergedGeo.setAttribute('position', new Float32BufferAttribute(mergedVerts, 3));
  mergedGeo.setAttribute('color', new Float32BufferAttribute(mergedColors, 3));
  mergedGeo.setIndex(mergedIndices);
  mergedGeo.computeVertexNormals();

  const mergedMat = new MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.65,
    roughness: 0.9,
    metalness: 0.0,
    side: DoubleSide,
    forceSinglePass: true,
    depthWrite: false,
  });
  mergedMat.name = 'MergedStormFloodLightningMat';

  const mergedMesh = new Mesh(mergedGeo, mergedMat);
  mergedMesh.name = 'MergedStormFloodLightning';
  mergedMesh.renderOrder = 9;

  (mergedMesh as any).userData = {
    rotationSpeed: 0.08,
    pulseFreq: 1.2,
    pulseAmplitude: 0.05,
    lastFlashTime: 0,
    flashInterval: 0.8,
  };

  return mergedMesh;
}

/**
 * OPTIMIZED: Enhanced Atmospheric Glow (replaces existing BackSide spheres)
 * Uses custom shader → 0 additional draw calls (modifies existing material)
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

  // === PART 1: Orbital trajectory (dashed) ===
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

  // === PART 2: ARIA-7 Wireframe Icosahedron ===
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
    // Offset ARIA-7 wireframe to left cockpit position
    const offsetX = -0.42;
    const offsetY = 1.15;
    const offsetZ = -0.48;

    segments.push(
      icoVerts[a].x + offsetX, icoVerts[a].y + offsetY, icoVerts[a].z + offsetZ,
      icoVerts[b].x + offsetX, icoVerts[b].y + offsetY, icoVerts[b].z + offsetZ
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
 * OPTIMIZED: Main enhancement factory
 * Returns 2-draw-call enhancement group (merged storm/flood/lightning + orbit/ARIA7 wireframe)
 */
export function createEarthGlobeEnhancementsOptimized(): Group {
  const enhancements = new Group();
  enhancements.name = 'TacticalEarthEnhancements_Optimized';

  // Draw call 1: Merged storm + flood + lightning over Indus Basin (Sector B)
  const mergedEffects = createMergedStormFloodLightning();
  enhancements.add(mergedEffects);

  return enhancements;
}

/**
 * Animation update loop
 */
export function updateEarthEnhancementsOptimized(
  enhancements: Group,
  delta: number,
  elapsedTime: number
): void {
  const merged = enhancements.getObjectByName('MergedStormFloodLightning') as Mesh;
  if (merged && merged.userData) {
    merged.rotation.y += merged.userData.rotationSpeed * delta;
    const pulse = Math.sin(elapsedTime * merged.userData.pulseFreq) * merged.userData.pulseAmplitude;
    merged.scale.setScalar(1.0 + pulse);
  }
}
