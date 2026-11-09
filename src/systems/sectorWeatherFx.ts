/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Visible sector weather on the globe. The puzzle is "match the sensor to the weather", so a
 * headset player must be able to SEE storm cloud, wildfire smoke or quake dust over each sector
 * without reading text. Every sector's puffs live in ONE Points object (one draw call for the whole
 * globe): soft round sprites with a per-puff colour, opacity and size, no raycast.
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

/** Visual language: white-grey storm, brown-orange smoke, tan dust, nothing for clear sky. */
export const WEATHER_LOOKS: Record<WeatherKind, WeatherLook | null> = {
  CLEAR: null,
  DENSE_STORM: { color: 0xe2e8f0, count: 9, size: 0.03, opacity: 0.85, lift: [0.012, 0.04], spread: 0.032, drift: 0.25 },
  CONVECTIVE_CLOUD: { color: 0xcbd5e1, count: 8, size: 0.028, opacity: 0.8, lift: [0.014, 0.045], spread: 0.03, drift: 0.3 },
  THIN_SMOKE: { color: 0xb08968, count: 5, size: 0.022, opacity: 0.5, lift: [0.01, 0.04], spread: 0.024, drift: 0.6 },
  MODERATE_SMOKE: { color: 0x8c5a2b, count: 7, size: 0.026, opacity: 0.7, lift: [0.01, 0.05], spread: 0.028, drift: 0.7 },
  DENSE_SMOKE: { color: 0x6b3f1d, count: 9, size: 0.03, opacity: 0.82, lift: [0.01, 0.055], spread: 0.03, drift: 0.8 },
  SEISMIC_DUST: { color: 0xd6b98c, count: 8, size: 0.026, opacity: 0.6, lift: [0.004, 0.022], spread: 0.034, drift: 0.2 },
};

export const PUFFS_PER_SECTOR = 12;
/**
 * The material's point size. Each puff multiplies it by its own `puffSize` attribute (look size / this).
 * If the shader patch ever stops matching (a three.js upgrade), every puff simply renders at this size.
 */
const BASE_POINT_SIZE = 0.028;
const PROGRAM_KEY = 'oz-weather-puffs-v1';
/** Farthest a puff centre gets from its anchor (lift 0.055 m, spread 0.034 m), plus half the largest sprite. */
const MAX_PUFF_REACH = Math.hypot(0.055, 0.034) + 0.03 / 2;
const SIZE_PATCH: ReadonlyArray<[string, string]> = [
  ['#include <common>', '#include <common>\nattribute float puffSize;'],
  ['gl_PointSize = size;', 'gl_PointSize = size * puffSize;'],
];

let puffTexture: CanvasTexture | null = null;

function getPuffTexture(): CanvasTexture | null {
  if (puffTexture) return puffTexture;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  puffTexture = new CanvasTexture(canvas);
  puffTexture.colorSpace = SRGBColorSpace;
  return puffTexture;
}

/** Deterministic pseudo-random so the same sector always looks the same. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface SectorSlot {
  seed: number;
  /** Sector anchor in the layer's frame (the globe's local frame). */
  origin: Vector3;
  /** Local +Y = the sector's surface normal. */
  frame: Quaternion;
  kind: WeatherKind;
  /** Puff offsets in the sector frame, before the swirl. */
  offsets: Float32Array;
  count: number;
  drift: number;
  baseOpacity: number;
  colour: Color;
}

const _spin = new Quaternion();
const _turn = new Quaternion();
const _offset = new Vector3();
const _yAxis = new Vector3(0, 1, 0);

/**
 * All sectors' weather in one Points object. Add one slot per sector (anchor on the globe surface),
 * set its weather kind when the operation changes, and call animate() once per frame.
 */
export class SectorWeatherLayer {
  readonly points: Points;
  private readonly slots: SectorSlot[] = [];
  private readonly positions: Float32BufferAttribute;
  private readonly colours: Float32BufferAttribute;
  private readonly sizes: Float32BufferAttribute;

  constructor(private readonly capacity: number) {
    const total = capacity * PUFFS_PER_SECTOR;
    const geometry = new BufferGeometry();
    this.positions = new Float32BufferAttribute(new Float32Array(total * 3), 3);
    this.colours = new Float32BufferAttribute(new Float32Array(total * 4), 4);
    this.sizes = new Float32BufferAttribute(new Float32Array(total), 1);
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('color', this.colours);
    geometry.setAttribute('puffSize', this.sizes);
    const material = new PointsMaterial({
      size: BASE_POINT_SIZE,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      map: getPuffTexture() ?? undefined,
      color: 0xffffff,
    });
    material.onBeforeCompile = (shader) => {
      const missing = SIZE_PATCH.filter(([from]) => !shader.vertexShader.includes(from));
      if (missing.length > 0) {
        console.warn('[sectorWeatherFx] point-size patch did not match this three.js version:', missing.map(([from]) => from));
        return;
      }
      for (const [from, to] of SIZE_PATCH) shader.vertexShader = shader.vertexShader.replace(from, to);
    };
    material.customProgramCacheKey = () => PROGRAM_KEY;
    this.points = new Points(geometry, material);
    this.points.name = 'SectorWeatherFx';
    this.points.raycast = () => {};
    this.points.visible = false;
    this.points.renderOrder = 3;
    // The puffs move every frame, so the culling sphere is fixed: centred on the globe, grown in addSector
    // to cover every anchor plus the tallest, widest puff volume.
    geometry.boundingSphere = new Sphere(new Vector3(), 0);
  }

  /** Reserves the next slot for a sector anchored at `origin` (globe-local) with +Y along `normal`. */
  addSector(origin: Vector3, normal: Vector3, seed: number): number {
    if (this.slots.length >= this.capacity) throw new Error('SectorWeatherLayer is full');
    const sphere = this.points.geometry.boundingSphere!;
    sphere.radius = Math.max(sphere.radius, origin.length() + MAX_PUFF_REACH);
    this.slots.push({
      seed,
      origin: origin.clone(),
      frame: new Quaternion().setFromUnitVectors(_yAxis, normal.clone().normalize()),
      kind: 'CLEAR',
      offsets: new Float32Array(PUFFS_PER_SECTOR * 3),
      count: 0,
      drift: 0,
      baseOpacity: 0,
      colour: new Color(),
    });
    return this.slots.length - 1;
  }

  /** Rebuilds a sector's puff layout when its weather type changes (e.g. a new operation). */
  setWeather(slotIndex: number, kind: WeatherKind): void {
    const slot = this.slots[slotIndex];
    if (!slot || slot.kind === kind) return;
    slot.kind = kind;
    const look = WEATHER_LOOKS[kind];
    slot.count = look ? look.count : 0;
    if (look) {
      const r = rand(slot.seed * 97 + kind.length * 13);
      for (let i = 0; i < look.count; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * look.spread;
        const y = look.lift[0] + r() * (look.lift[1] - look.lift[0]);
        slot.offsets[i * 3] = Math.cos(a) * d;
        slot.offsets[i * 3 + 1] = y;
        slot.offsets[i * 3 + 2] = Math.sin(a) * d;
      }
      slot.drift = look.drift;
      slot.baseOpacity = look.opacity;
      slot.colour.setHex(look.color);
    }
    const first = slotIndex * PUFFS_PER_SECTOR;
    for (let i = 0; i < PUFFS_PER_SECTOR; i++) {
      const p = first + i;
      const shown = look !== null && i < look.count;
      // Unused puffs get size 0 (nothing rasterised) and sit at the globe centre, inside the opaque core.
      this.sizes.setX(p, shown ? look.size / BASE_POINT_SIZE : 0);
      this.colours.setXYZW(p, slot.colour.r, slot.colour.g, slot.colour.b, shown ? slot.baseOpacity : 0);
      if (!shown) this.positions.setXYZ(p, 0, 0, 0);
    }
    this.sizes.needsUpdate = true;
    this.colours.needsUpdate = true;
    this.placeSlot(slotIndex, 0);
    this.points.visible = this.slots.some((s) => s.count > 0);
  }

  /** Slow swirl about each sector's surface normal and a gentle breathing, so the weather reads as alive. */
  animate(time: number, reducedMotion: boolean): void {
    if (!this.points.visible || reducedMotion) return;
    for (let s = 0; s < this.slots.length; s++) {
      const slot = this.slots[s];
      if (slot.count === 0) continue;
      this.placeSlot(s, time * slot.drift * 0.35);
      const alpha = slot.baseOpacity * (0.85 + 0.15 * Math.sin(time * 1.3 + slot.seed));
      const first = s * PUFFS_PER_SECTOR;
      for (let i = 0; i < slot.count; i++) this.colours.setW(first + i, alpha);
    }
    this.colours.needsUpdate = true;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as PointsMaterial).dispose();
  }

  private placeSlot(slotIndex: number, angle: number): void {
    const slot = this.slots[slotIndex];
    _spin.copy(slot.frame).multiply(_turn.setFromAxisAngle(_yAxis, angle));
    const first = slotIndex * PUFFS_PER_SECTOR;
    for (let i = 0; i < slot.count; i++) {
      _offset.fromArray(slot.offsets, i * 3).applyQuaternion(_spin).add(slot.origin);
      this.positions.setXYZ(first + i, _offset.x, _offset.y, _offset.z);
    }
    this.positions.needsUpdate = true;
  }
}
