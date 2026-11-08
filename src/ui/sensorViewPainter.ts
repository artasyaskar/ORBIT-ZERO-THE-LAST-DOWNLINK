/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Paints "what the sensor actually saw" onto the evidence cube display, so the science is visible:
 * - blocked (UNVERIFIED): the frame is a white/brown wash with BLOCKED stamped on it
 * - OPTICAL: crisp roads, river and bridge lines
 * - THERMAL: dark terrain with glowing heat blobs (a false alarm looks like one small hot spot)
 * - RADAR: grainy grey speckle; bright glint on metal bridges; dark smooth water
 * Deterministic per packet (seeded by sector + sensor) so a cube never changes on re-render.
 */

import type { DataPacket } from '../mission/types';

type Ctx = CanvasRenderingContext2D;

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function seedFor(pkt: Pick<DataPacket, 'sectorId' | 'sensorMode'>): number {
  return pkt.sectorId.charCodeAt(0) * 131 + pkt.sensorMode.charCodeAt(0) * 17 + pkt.sensorMode.length;
}

function terrain(ctx: Ctx, x: number, y: number, w: number, h: number, base: string, river: string): void {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = river;
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.3);
  ctx.bezierCurveTo(x + w * 0.35, y + h * 0.42, x + w * 0.55, y + h * 0.72, x + w, y + h * 0.82);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
}

function stamp(ctx: Ctx, x: number, y: number, w: number, h: number, text: string, color: string): void {
  ctx.fillStyle = 'rgba(3,7,18,0.72)';
  ctx.fillRect(x, y + h - 38, w, 38);
  ctx.fillStyle = color;
  ctx.font = 'bold 19px monospace';
  ctx.fillText(text, x + 8, y + h - 13);
}

export function paintSensorView(ctx: Ctx, x: number, y: number, w: number, h: number, pkt: DataPacket): void {
  const rnd = seeded(seedFor(pkt));
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const tag = pkt.phenomenologyTag ?? '';
  const metal = /DIHEDRAL|METALLIC|TRUSS/.test(tag);

  if (pkt.confidence === 'UNVERIFIED') {
    // What the sensor received: the obscurant itself.
    const smoke = /SMOKE|KILN|FALSE_POSITIVE/.test(tag) && pkt.sensorMode !== 'THERMAL';
    const dust = /DUST|SILICATE/.test(tag);
    const wash = smoke ? '#7c5a3a' : dust ? '#b9a47f' : '#e5e7eb';
    ctx.fillStyle = wash;
    ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 26; i++) {
      const r = 18 + rnd() * 38;
      const cx = x + rnd() * w;
      const cy = y + rnd() * h;
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
      g.addColorStop(0, smoke ? 'rgba(60,40,25,0.55)' : dust ? 'rgba(150,130,95,0.55)' : 'rgba(255,255,255,0.7)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
    if (pkt.sensorMode === 'THERMAL' && /FALSE_POSITIVE|KILN/.test(tag)) {
      // A single small, flat hot spot: heat, but not a wildfire front.
      const g = ctx.createRadialGradient(x + w * 0.6, y + h * 0.45, 1, x + w * 0.6, y + h * 0.45, 18);
      g.addColorStop(0, 'rgba(255,170,60,0.9)');
      g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      stamp(ctx, x, y, w, h, 'HOT SPOT ≠ FIRE', '#fbbf24');
    } else {
      stamp(ctx, x, y, w, h, 'BLOCKED: NO GROUND', '#f87171');
    }
    ctx.restore();
    return;
  }

  if (pkt.sensorMode === 'OPTICAL') {
    terrain(ctx, x, y, w, h, '#5b7a4a', '#2563eb');
    // Roads
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + h * 0.18);
    ctx.lineTo(x + w - 6, y + h * 0.62);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y);
    ctx.lineTo(x + w * 0.35, y + h);
    ctx.stroke();
    // Bridge over the river
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.42, y + h * 0.48);
    ctx.lineTo(x + w * 0.64, y + h * 0.66);
    ctx.stroke();
    stamp(ctx, x, y, w, h, 'OPTICAL: SHARP DETAIL', '#86efac');
  } else if (pkt.sensorMode === 'THERMAL') {
    ctx.fillStyle = '#0b0b1a';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(120,120,180,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y + h * (0.15 + i * 0.15));
      ctx.bezierCurveTo(x + w * 0.3, y + h * (0.1 + i * 0.15), x + w * 0.6, y + h * (0.25 + i * 0.15), x + w, y + h * (0.18 + i * 0.15));
      ctx.stroke();
    }
    const blobs = pkt.confidence === 'CONFIRMED' ? 7 : 4;
    for (let i = 0; i < blobs; i++) {
      // Fire front: blobs along a diagonal line
      const t = i / Math.max(1, blobs - 1);
      const bx = x + w * (0.15 + t * 0.7) + (rnd() - 0.5) * 20;
      const by = y + h * (0.65 - t * 0.4) + (rnd() - 0.5) * 20;
      const r = 14 + rnd() * 18;
      const g = ctx.createRadialGradient(bx, by, 1, bx, by, r);
      g.addColorStop(0, 'rgba(255,255,200,1)');
      g.addColorStop(0.35, 'rgba(255,170,40,0.95)');
      g.addColorStop(1, 'rgba(220,38,38,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
    stamp(ctx, x, y, w, h, pkt.confidence === 'CONFIRMED' ? 'THERMAL: HEAT FRONT' : 'THERMAL: COARSE HEAT', '#fdba74');
  } else {
    // RADAR: speckle field, dark smooth water, bright returns from rough or metal surfaces.
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(x, y, w, h);
    const img = ctx.getImageData(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 40 + rnd() * 150;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, Math.round(x), Math.round(y));
    ctx.fillStyle = 'rgba(10,10,14,0.85)';
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.32);
    ctx.bezierCurveTo(x + w * 0.35, y + h * 0.44, x + w * 0.55, y + h * 0.74, x + w, y + h * 0.84);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
    if (metal) {
      // Double-bounce glare: the bridge blooms into a bright star, hiding the deck.
      const g = ctx.createRadialGradient(x + w * 0.53, y + h * 0.57, 1, x + w * 0.53, y + h * 0.57, 46);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
    stamp(ctx, x, y, w, h, metal ? 'RADAR: METAL GLARE' : pkt.confidence === 'CONFIRMED' ? 'RADAR: THROUGH CLOUD' : 'RADAR: BLURRY SLOPE', metal ? '#fbbf24' : '#cbd5e1');
  }
  ctx.restore();
}
