/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Visible sector weather & disaster VFX on the globe. The puzzle is "match the sensor to the hazard",
 * so a headset player must be able to SEE flickering wildfire flames + rising smoke plumes, brooding
 * monsoon storm clouds + rain + lightning, or earthquake rockfall dust + fault sparks in 1 draw call.
 */

import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  Quaternion,
  SRGBColorSpace,
  Sphere,
  Vector3,
} from '@iwsdk/core';
import type { SectorConfig } from '../mission/types';

export type WeatherKind = SectorConfig['cloudCover'];
export type HazardVisualTheme = 'WILDFIRE' | 'FLOOD' | 'EARTHQUAKE' | 'NEUTRAL';

type PuffRole = 'CLOUD' | 'SMOKE' | 'FLAME' | 'EMBER' | 'RAIN' | 'LIGHTNING' | 'KILN' | 'DUST';

interface WeatherLook {
  color: number;
  count: number;
  size: number;
  opacity: number;
  /** Height band above the sector surface (m). */
  lift: [number, number];
  spread: number;
  drift: number;
}

/** Visual baseline preserved for telemetry & deterministic layout tests. */
export const WEATHER_LOOKS: Record<WeatherKind, WeatherLook | null> = {
  CLEAR: null,
  DENSE_STORM: { color: 0xdbeafe, count: 22, size: 0.032, opacity: 0.88, lift: [0.008, 0.044], spread: 0.036, drift: 0.28 },
  CONVECTIVE_CLOUD: { color: 0xe2e8f0, count: 12, size: 0.030, opacity: 0.82, lift: [0.014, 0.044], spread: 0.032, drift: 0.26 },
  THIN_SMOKE: { color: 0xa89484, count: 10, size: 0.025, opacity: 0.46, lift: [0.010, 0.042], spread: 0.028, drift: 0.65 },
  MODERATE_SMOKE: { color: 0x7c5338, count: 18, size: 0.028, opacity: 0.78, lift: [0.004, 0.054], spread: 0.030, drift: 0.75 },
  DENSE_SMOKE: { color: 0x573b2c, count: 24, size: 0.032, opacity: 0.88, lift: [0.003, 0.068], spread: 0.033, drift: 0.85 },
  SEISMIC_DUST: { color: 0xd6b98c, count: 20, size: 0.028, opacity: 0.72, lift: [0.003, 0.028], spread: 0.036, drift: 0.24 },
};

export const PUFFS_PER_SECTOR = 26;
/**
 * Base point size multiplied per particle by `puffSize`.
 * Safe fallback renders cleanly even if custom shader injection is bypassed.
 */
const BASE_POINT_SIZE = 0.030;
const PROGRAM_KEY = 'oz-weather-puffs-atlas-v2';
/** Farthest animated particle reach from sector anchor (lift 0.072 m, downwind 0.055 m). */
const MAX_PUFF_REACH = Math.hypot(0.075, 0.065) + 0.022;

const VERT_PATCH: ReadonlyArray<[string, string]> = [
  ['#include <common>', '#include <common>\nattribute float puffSize;\nattribute float puffTile;\nvarying float vPuffTile;'],
  ['gl_PointSize = size;', 'gl_PointSize = size * puffSize;'],
  ['#include <project_vertex>', '#include <project_vertex>\nvPuffTile = puffTile;'],
];

const FRAG_PATCH: ReadonlyArray<[string, string]> = [
  ['#include <common>', '#include <common>\nvarying float vPuffTile;'],
  [
    '#include <map_particle_fragment>',
    `#ifdef USE_MAP
      float ozTile = floor(vPuffTile + 0.5);
      float ozCol = mod(ozTile, 2.0);
      float ozRow = floor(ozTile * 0.5);
      vec2 ozSubUv = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) * 0.44 + vec2(ozCol * 0.5 + 0.03, (1.0 - ozRow) * 0.5 + 0.03);
      diffuseColor *= texture2D(map, ozSubUv);
    #endif`,
  ],
];

let puffAtlasTexture: CanvasTexture | null = null;

/**
 * Generates a 256x256 2x2 VFX sprite atlas in 1 CanvasTexture:
 * - Tile 0 (Top-Left): Layered fluffy cumulus / storm anvil cloud silhouette
 * - Tile 1 (Top-Right): Turbulent curling pyroconvective smoke / silicate dust plume
 * - Tile 2 (Bottom-Left): Blazing wildfire flame tongue & radiant hot spark glow
 * - Tile 3 (Bottom-Right): Slanted monsoon cloudburst rain streaks
 */
function getPuffAtlasTexture(): CanvasTexture | null {
  if (puffAtlasTexture) return puffAtlasTexture;
  if (typeof document === 'undefined') return null;

  const size = 256;
  const half = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const paintSoftLobe = (cx: number, cy: number, r: number, peak: number, warmEdge = false) => {
    const g = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r);
    g.addColorStop(0, `rgba(255, 255, 255, ${peak})`);
    g.addColorStop(0.5, `rgba(248, 250, 252, ${(peak * (warmEdge ? 0.58 : 0.66)).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };

  // Tile 0 (Top-Left): Asymmetric fluffy cumulus cloud lobes
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, half, half);
  ctx.clip();
  paintSoftLobe(64, 70, 38, 0.92);
  paintSoftLobe(46, 62, 26, 0.78);
  paintSoftLobe(84, 60, 28, 0.80);
  paintSoftLobe(66, 46, 26, 0.74);
  paintSoftLobe(56, 82, 24, 0.55);
  ctx.restore();

  // Tile 1 (Top-Right): Turbulent billowing smoke / rockfall curl
  ctx.save();
  ctx.beginPath();
  ctx.rect(half, 0, half, half);
  ctx.clip();
  paintSoftLobe(half + 64, 66, 36, 0.82, true);
  paintSoftLobe(half + 48, 52, 24, 0.68, true);
  paintSoftLobe(half + 82, 74, 24, 0.62, true);
  paintSoftLobe(half + 62, 42, 20, 0.54, true);
  paintSoftLobe(half + 74, 52, 18, 0.45, true);
  ctx.restore();

  // Tile 2 (Bottom-Left): Upward flame tongue + intense glowing spark core
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, half, half, half);
  ctx.clip();
  const outerFlame = ctx.createRadialGradient(64, half + 78, 4, 64, half + 66, 46);
  outerFlame.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  outerFlame.addColorStop(0.35, 'rgba(255, 245, 220, 0.90)');
  outerFlame.addColorStop(0.7, 'rgba(255, 220, 180, 0.42)');
  outerFlame.addColorStop(1, 'rgba(255, 180, 120, 0)');
  ctx.fillStyle = outerFlame;
  ctx.beginPath();
  ctx.moveTo(64, half + 20);
  ctx.bezierCurveTo(96, half + 54, 96, half + 94, 64, half + 108);
  ctx.bezierCurveTo(32, half + 94, 32, half + 54, 64, half + 20);
  ctx.fill();
  paintSoftLobe(64, half + 76, 18, 1.0);
  paintSoftLobe(60, half + 50, 13, 0.72);
  ctx.restore();

  // Tile 3 (Bottom-Right): Slanted monsoon rain streaks + wet cloudburst halo
  ctx.save();
  ctx.beginPath();
  ctx.rect(half, half, half, half);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
  ctx.lineCap = 'round';
  const rainDrops: Array<[number, number, number, number]> = [
    [36, 26, 26, 2.8],
    [54, 20, 34, 3.2],
    [74, 24, 30, 3.0],
    [92, 32, 24, 2.6],
    [44, 62, 32, 3.0],
    [66, 56, 38, 3.4],
    [86, 62, 28, 2.8],
    [52, 92, 22, 2.4],
    [74, 88, 24, 2.6],
  ];
  for (const [rx, ry, len, lw] of rainDrops) {
    const grad = ctx.createLinearGradient(half + rx, half + ry, half + rx - len * 0.25, half + ry + len);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
    grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.92)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(half + rx, half + ry);
    ctx.lineTo(half + rx - len * 0.25, half + ry + len);
    ctx.stroke();
  }
  ctx.restore();

  puffAtlasTexture = new CanvasTexture(canvas);
  puffAtlasTexture.colorSpace = SRGBColorSpace;
  puffAtlasTexture.needsUpdate = true;
  return puffAtlasTexture;
}

/** Deterministic pseudo-random so the same sector always builds identical geometry & choreography. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface PuffMeta {
  role: PuffRole;
  baseColor: Color;
  baseAlpha: number;
  baseSize: number;
  phase: number;
  speed: number;
  driftRate: number;
}

interface SectorSlot {
  sectorIndex: number;
  seed: number;
  /** Sector anchor in the globe-local frame. */
  origin: Vector3;
  /** Local +Y = outward surface normal. */
  frame: Quaternion;
  kind: WeatherKind;
  offsets: Float32Array;
  puffs: PuffMeta[];
  count: number;
  drift: number;
}

const _spin = new Quaternion();
const _turn = new Quaternion();
const _offset = new Vector3();
const _yAxis = new Vector3(0, 1, 0);

/**
 * All sectors' 3D weather, wildfire flames/smoke, monsoon rain/lightning, and seismic dust in one
 * Points draw call. Add one slot per sector, update hazard theme & weather kind when switching
 * operations, and call animate() each frame.
 */
export class SectorWeatherLayer {
  readonly points: Points;
  private readonly slots: SectorSlot[] = [];
  private readonly positions: Float32BufferAttribute;
  private readonly colours: Float32BufferAttribute;
  private readonly sizes: Float32BufferAttribute;
  private readonly tiles: Float32BufferAttribute;
  private theme: HazardVisualTheme = 'FLOOD';

  constructor(private readonly capacity: number) {
    const total = capacity * PUFFS_PER_SECTOR;
    const geometry = new BufferGeometry();
    this.positions = new Float32BufferAttribute(new Float32Array(total * 3), 3);
    this.colours = new Float32BufferAttribute(new Float32Array(total * 4), 4);
    this.sizes = new Float32BufferAttribute(new Float32Array(total), 1);
    this.tiles = new Float32BufferAttribute(new Float32Array(total), 1);
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('color', this.colours);
    geometry.setAttribute('puffSize', this.sizes);
    geometry.setAttribute('puffTile', this.tiles);

    const material = new PointsMaterial({
      size: BASE_POINT_SIZE,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      map: getPuffAtlasTexture() ?? undefined,
      color: 0xffffff,
    });
    material.onBeforeCompile = (shader) => {
      const missingVert = VERT_PATCH.filter(([from]) => !shader.vertexShader.includes(from));
      const missingFrag = FRAG_PATCH.filter(([from]) => !shader.fragmentShader.includes(from));
      if (missingVert.length > 0 || missingFrag.length > 0) {
        console.warn('[sectorWeatherFx] shader patch mismatch:', {
          vert: missingVert.map(([from]) => from),
          frag: missingFrag.map(([from]) => from),
        });
        return;
      }
      for (const [from, to] of VERT_PATCH) shader.vertexShader = shader.vertexShader.replace(from, to);
      for (const [from, to] of FRAG_PATCH) shader.fragmentShader = shader.fragmentShader.replace(from, to);
    };
    material.customProgramCacheKey = () => PROGRAM_KEY;

    this.points = new Points(geometry, material);
    this.points.name = 'SectorWeatherFx';
    this.points.raycast = () => {};
    this.points.visible = false;
    this.points.renderOrder = 4;
    geometry.boundingSphere = new Sphere(new Vector3(), 0);
  }

  /** Sets the active scenario theme ('WILDFIRE' | 'FLOOD' | 'EARTHQUAKE') and rebuilds active hazards. */
  setHazardTheme(theme: HazardVisualTheme): void {
    if (this.theme === theme) return;
    this.theme = theme;
    for (let i = 0; i < this.slots.length; i++) {
      this.rebuildSlot(i);
    }
  }

  /** Reserves the next slot for a sector anchored at `origin` (globe-local) with +Y along `normal`. */
  addSector(origin: Vector3, normal: Vector3, seed: number): number {
    if (this.slots.length >= this.capacity) throw new Error('SectorWeatherLayer is full');
    const sphere = this.points.geometry.boundingSphere!;
    sphere.radius = Math.max(sphere.radius, origin.length() + MAX_PUFF_REACH);
    const slotIndex = this.slots.length;
    this.slots.push({
      sectorIndex: slotIndex,
      seed,
      origin: origin.clone(),
      frame: new Quaternion().setFromUnitVectors(_yAxis, normal.clone().normalize()),
      kind: 'CLEAR',
      offsets: new Float32Array(PUFFS_PER_SECTOR * 3),
      puffs: Array.from({ length: PUFFS_PER_SECTOR }, () => ({
        role: 'CLOUD' as PuffRole,
        baseColor: new Color(0xffffff),
        baseAlpha: 0,
        baseSize: 0,
        phase: 0,
        speed: 1,
        driftRate: 0,
      })),
      count: 0,
      drift: 0,
    });
    return slotIndex;
  }

  /** Rebuilds a sector's particles whenever its weather kind changes (e.g. new operation). */
  setWeather(slotIndex: number, kind: WeatherKind): void {
    const slot = this.slots[slotIndex];
    if (!slot) return;
    if (slot.kind === kind && slot.count > 0) return;
    slot.kind = kind;
    this.rebuildSlot(slotIndex);
  }

  private rebuildSlot(slotIndex: number): void {
    const slot = this.slots[slotIndex];
    if (!slot) return;
    const kind = slot.kind;
    const r = rand(slot.seed * 97 + kind.length * 13 + this.theme.length * 31);
    const first = slotIndex * PUFFS_PER_SECTOR;

    const assignPuff = (
      i: number,
      role: PuffRole,
      ox: number,
      oy: number,
      oz: number,
      hex: number,
      alpha: number,
      size: number,
      speed = 1.0,
      driftRate = 0.25,
    ) => {
      slot.offsets[i * 3] = ox;
      slot.offsets[i * 3 + 1] = oy;
      slot.offsets[i * 3 + 2] = oz;
      const meta = slot.puffs[i];
      meta.role = role;
      meta.baseColor.setHex(hex);
      meta.baseAlpha = alpha;
      meta.baseSize = size;
      meta.phase = r() * Math.PI * 2;
      meta.speed = speed;
      meta.driftRate = driftRate;
      const tile = role === 'CLOUD' ? 0 : role === 'SMOKE' || role === 'DUST' ? 1 : role === 'RAIN' ? 3 : 2;
      this.tiles.setX(first + i, tile);
      this.sizes.setX(first + i, size / BASE_POINT_SIZE);
      this.colours.setXYZW(first + i, meta.baseColor.r, meta.baseColor.g, meta.baseColor.b, alpha);
    };

    let idx = 0;

    if (kind === 'DENSE_SMOKE' || kind === 'MODERATE_SMOKE') {
      const flameCount = kind === 'DENSE_SMOKE' ? 9 : 6;
      const emberCount = kind === 'DENSE_SMOKE' ? 4 : 3;
      const smokeCount = kind === 'DENSE_SMOKE' ? 13 : 9;
      slot.drift = kind === 'DENSE_SMOKE' ? 0.85 : 0.72;

      // Ground flames: scorching orange-gold-crimson core tongues
      for (let k = 0; k < flameCount; k++) {
        const a = r() * Math.PI * 2;
        const rad = (0.25 + r() * 0.75) * (kind === 'DENSE_SMOKE' ? 0.025 : 0.021);
        const h = 0.003 + r() * 0.011;
        const hex = k % 3 === 0 ? 0xffdd55 : k % 3 === 1 ? 0xff7b18 : 0xef4444;
        assignPuff(idx++, 'FLAME', Math.cos(a) * rad, h, Math.sin(a) * rad, hex, 0.96, 0.019 + r() * 0.009, 5.2 + r() * 3.0, 0.15);
      }

      // Rising glowing sparks & embers
      for (let k = 0; k < emberCount; k++) {
        const a = r() * Math.PI * 2;
        const rad = r() * 0.024;
        const h = 0.016 + r() * 0.032;
        assignPuff(idx++, 'EMBER', Math.cos(a) * rad, h, Math.sin(a) * rad, 0xfbbf24, 0.88, 0.010 + r() * 0.004, 2.2 + r() * 1.4, 0.45);
      }

      // Towering downwind pyroconvective smoke column (underlit warm soot -> dark charcoal curl)
      for (let k = 0; k < smokeCount; k++) {
        const t = k / Math.max(1, smokeCount - 1);
        const h = 0.014 + t * (kind === 'DENSE_SMOKE' ? 0.056 : 0.044);
        const windDriftX = t * 0.030;
        const windDriftZ = t * 0.014;
        const swirlA = r() * Math.PI * 2;
        const spread = (0.010 + t * 0.018) * (0.4 + r() * 0.6);
        // Low smoke reflects ember glow (#8a3c19); upper column cools to dark charcoal (#3c3634)
        const hex = t < 0.32 ? 0x8a3c19 : t < 0.65 ? 0x574c47 : 0x3b3634;
        assignPuff(
          idx++,
          'SMOKE',
          windDriftX + Math.cos(swirlA) * spread,
          h,
          windDriftZ + Math.sin(swirlA) * spread,
          hex,
          0.84 - t * 0.24,
          0.025 + t * 0.016,
          1.2 + r() * 0.6,
          0.55,
        );
      }
    } else if (kind === 'THIN_SMOKE') {
      slot.drift = 0.58;
      for (let k = 0; k < 10; k++) {
        const t = k / 9;
        const a = r() * Math.PI * 2;
        const rad = 0.008 + t * 0.022;
        assignPuff(
          idx++,
          'SMOKE',
          t * 0.022 + Math.cos(a) * rad,
          0.012 + r() * 0.030,
          t * 0.010 + Math.sin(a) * rad,
          0x9c8b7e,
          0.44 - t * 0.14,
          0.022 + r() * 0.008,
          0.9,
          0.4,
        );
      }
    } else if (kind === 'DENSE_STORM') {
      slot.drift = 0.32;
      // Heavy slate-white monsoon cyclone cloud deck
      for (let k = 0; k < 13; k++) {
        const a = (k / 13) * Math.PI * 2 + r() * 0.4;
        const rad = Math.sqrt((k + 0.5) / 13) * 0.036;
        const h = 0.022 + r() * 0.024;
        const hex = k % 3 === 0 ? 0xf1f5f9 : k % 3 === 1 ? 0xcbd5e1 : 0x94a3b8;
        assignPuff(idx++, 'CLOUD', Math.cos(a) * rad, h, Math.sin(a) * rad, hex, 0.88, 0.029 + r() * 0.011, 1.1, 0.34);
      }
      // Slanted silver-cyan monsoon rainburst curtains underneath clouds
      for (let k = 0; k < 8; k++) {
        const a = r() * Math.PI * 2;
        const rad = r() * 0.028;
        const h = 0.005 + r() * 0.017;
        assignPuff(idx++, 'RAIN', Math.cos(a) * rad, h, Math.sin(a) * rad, 0x7dd3fc, 0.78, 0.021 + r() * 0.006, 2.8 + r(), 0.12);
      }
      // Internal cloud-to-ground storm lightning flashes
      for (let k = 0; k < 3; k++) {
        const a = r() * Math.PI * 2;
        const rad = r() * 0.020;
        assignPuff(idx++, 'LIGHTNING', Math.cos(a) * rad, 0.016 + r() * 0.010, Math.sin(a) * rad, 0xe0f2fe, 0.0, 0.024, 3.6 + k * 1.1, 0.25);
      }
    } else if (kind === 'CONVECTIVE_CLOUD') {
      slot.drift = 0.24;
      for (let k = 0; k < 12; k++) {
        const a = r() * Math.PI * 2;
        const rad = Math.sqrt(r()) * 0.032;
        const h = 0.016 + r() * 0.026;
        assignPuff(idx++, 'CLOUD', Math.cos(a) * rad, h, Math.sin(a) * rad, k % 2 === 0 ? 0xf8fafc : 0xcbd5e1, 0.82, 0.026 + r() * 0.008, 1.0, 0.24);
      }
    } else if (kind === 'SEISMIC_DUST') {
      slot.drift = 0.26;
      // Low rolling beige/ochre fault rockfall dust cloud
      for (let k = 0; k < 16; k++) {
        const a = r() * Math.PI * 2;
        const rad = Math.sqrt(r()) * 0.035;
        const h = 0.004 + r() * 0.024;
        const hex = k % 2 === 0 ? 0xd6b98c : 0xb89668;
        assignPuff(idx++, 'DUST', Math.cos(a) * rad, h, Math.sin(a) * rad, hex, 0.74, 0.024 + r() * 0.009, 1.3, 0.26);
      }
      // Fault stress / transformer spark hotspots (brighter over Sector E substation)
      const sparkCount = slot.sectorIndex === 4 ? 5 : 2;
      for (let k = 0; k < sparkCount; k++) {
        const a = r() * Math.PI * 2;
        const rad = r() * 0.018;
        assignPuff(idx++, 'FLAME', Math.cos(a) * rad, 0.005 + r() * 0.008, Math.sin(a) * rad, k % 2 === 0 ? 0xf59e0b : 0xf97316, 0.85, 0.014, 6.2 + r(), 0.08);
      }
    } else if (kind === 'CLEAR') {
      // Clear sky carries subtle contextual terrain signatures with zero occlusion cloud cover:
      // - Sector D (index 3) in WILDFIRE shows steady static industrial kiln amber pinpoint (no plume)
      // - Flood theme Sector A (index 0) / D (index 3) shows faint river surface water shimmer
      if (this.theme === 'WILDFIRE' && slot.sectorIndex === 3) {
        slot.drift = 0.05;
        assignPuff(idx++, 'KILN', -0.006, 0.004, 0.005, 0xf59e0b, 0.78, 0.013, 1.8, 0.0);
        assignPuff(idx++, 'KILN', 0.007, 0.004, -0.004, 0xfb923c, 0.72, 0.011, 2.2, 0.0);
      }
    }

    slot.count = idx;
    for (let i = idx; i < PUFFS_PER_SECTOR; i++) {
      this.sizes.setX(first + i, 0);
      this.colours.setXYZW(first + i, 0, 0, 0, 0);
      this.positions.setXYZ(first + i, 0, 0, 0);
    }

    this.sizes.needsUpdate = true;
    this.tiles.needsUpdate = true;
    this.colours.needsUpdate = true;
    this.placeSlot(slotIndex, 0, false);
    this.points.visible = this.slots.some((s) => s.count > 0);
  }

  /** Animates flames, rising embers, swirling smoke/storm clouds, rainfall, and lightning each frame. */
  animate(time: number, reducedMotion: boolean): void {
    if (!this.points.visible) return;
    if (reducedMotion) return;
    for (let s = 0; s < this.slots.length; s++) {
      const slot = this.slots[s];
      if (slot.count === 0) continue;
      this.placeSlot(s, time, true);
    }
    this.positions.needsUpdate = true;
    this.colours.needsUpdate = true;
    this.sizes.needsUpdate = true;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as PointsMaterial).dispose();
  }

  private placeSlot(slotIndex: number, time: number, dynamicFx: boolean): void {
    const slot = this.slots[slotIndex];
    const swirlAngle = time * slot.drift * 0.28;
    _spin.copy(slot.frame).multiply(_turn.setFromAxisAngle(_yAxis, swirlAngle));
    const first = slotIndex * PUFFS_PER_SECTOR;

    for (let i = 0; i < slot.count; i++) {
      const meta = slot.puffs[i];
      let ox = slot.offsets[i * 3];
      let oy = slot.offsets[i * 3 + 1];
      let oz = slot.offsets[i * 3 + 2];
      let alpha = meta.baseAlpha;
      let size = meta.baseSize;

      if (dynamicFx) {
        if (meta.role === 'FLAME') {
          const flick = 0.5 + 0.5 * Math.sin(time * meta.speed + meta.phase);
          oy += flick * 0.005;
          size = meta.baseSize * (0.82 + 0.42 * flick);
          alpha = meta.baseAlpha * (0.72 + 0.28 * flick);
        } else if (meta.role === 'EMBER') {
          const cycle = (time * 0.42 + meta.phase / (Math.PI * 2)) % 1;
          oy = 0.006 + cycle * 0.044;
          ox += Math.sin(time * 3.1 + meta.phase) * 0.005 + cycle * 0.015;
          oz += Math.cos(time * 2.7 + meta.phase) * 0.004;
          alpha = meta.baseAlpha * Math.sin(cycle * Math.PI);
        } else if (meta.role === 'RAIN') {
          const fall = (time * 1.45 + meta.phase / (Math.PI * 2)) % 1;
          oy = 0.022 - fall * 0.019;
          alpha = meta.baseAlpha * Math.sin(fall * Math.PI);
        } else if (meta.role === 'LIGHTNING') {
          const spike = Math.sin(time * meta.speed + meta.phase) * Math.sin(time * 7.3 + meta.phase * 2.1);
          alpha = spike > 0.72 ? 0.98 : 0.0;
          size = meta.baseSize * (spike > 0.72 ? 1.25 : 0.4);
        } else if (meta.role === 'SMOKE' || meta.role === 'DUST') {
          const bob = Math.sin(time * 1.4 + meta.phase);
          oy += bob * 0.003;
          alpha = meta.baseAlpha * (0.86 + 0.14 * bob);
        } else {
          alpha = meta.baseAlpha * (0.88 + 0.12 * Math.sin(time * 1.2 + meta.phase));
        }
      }

      _offset.set(ox, oy, oz).applyQuaternion(_spin).add(slot.origin);
      this.positions.setXYZ(first + i, _offset.x, _offset.y, _offset.z);
      this.colours.setW(first + i, alpha);
      this.sizes.setX(first + i, size / BASE_POINT_SIZE);
    }

    if (!dynamicFx) {
      this.positions.needsUpdate = true;
    }
  }
}
