/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Visible sector weather on the globe. The puzzle is "match the sensor to the weather", so a
 * headset player must be able to SEE storm cloud, wildfire smoke or quake dust over each sector
 * without reading text. One Points object per sector (1 draw call), soft round sprites, no raycast.
 */

import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  NormalBlending,
  Points,
  PointsMaterial,
  SRGBColorSpace,
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
  additive?: boolean;
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

export function createWeatherFx(seed: number): Points {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(12 * 3), 3));
  const material = new PointsMaterial({
    size: 0.03,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    map: getPuffTexture() ?? undefined,
    color: new Color(0xffffff),
    opacity: 0.8,
  });
  const points = new Points(geometry, material);
  points.name = 'SectorWeatherFx';
  points.userData.seed = seed;
  points.userData.kind = 'CLEAR';
  points.raycast = () => {};
  points.visible = false;
  points.renderOrder = 3;
  return points;
}

/** Rebuilds the puff layout when the weather type changes (e.g. a new operation). */
export function applyWeather(points: Points, kind: WeatherKind): void {
  if (points.userData.kind === kind) return;
  points.userData.kind = kind;
  const look = WEATHER_LOOKS[kind];
  if (!look) {
    points.visible = false;
    return;
  }
  const r = rand((points.userData.seed as number) * 97 + kind.length * 13);
  const positions = points.geometry.getAttribute('position') as Float32BufferAttribute;
  for (let i = 0; i < 12; i++) {
    if (i < look.count) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * look.spread;
      const y = look.lift[0] + r() * (look.lift[1] - look.lift[0]);
      positions.setXYZ(i, Math.cos(a) * d, y, Math.sin(a) * d);
    } else {
      positions.setXYZ(i, 0, -10, 0); // parked below the surface, hidden by the globe
    }
  }
  positions.needsUpdate = true;
  points.geometry.setDrawRange(0, look.count);
  const material = points.material as PointsMaterial;
  material.color.setHex(look.color);
  material.size = look.size;
  material.opacity = look.opacity;
  material.blending = look.additive ? AdditiveBlending : NormalBlending;
  material.needsUpdate = true;
  points.userData.drift = look.drift;
  points.userData.baseOpacity = look.opacity;
  points.visible = true;
}

/** Slow swirl and breathing so the weather reads as alive. Cheap: one rotation + one uniform. */
export function animateWeather(points: Points, time: number, reducedMotion: boolean): void {
  if (!points.visible || reducedMotion) return;
  const drift = (points.userData.drift as number) ?? 0.3;
  points.rotation.y = time * drift * 0.35;
  const base = (points.userData.baseOpacity as number) ?? 0.8;
  (points.material as PointsMaterial).opacity = base * (0.85 + 0.15 * Math.sin(time * 1.3 + (points.userData.seed as number)));
}
