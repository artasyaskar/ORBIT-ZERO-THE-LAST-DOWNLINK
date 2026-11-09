import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GLOBE_CARD_SCALE,
  IMMERSIVE_PANEL_POSES,
  MISSION_HUD_POSES,
  MIN_PANEL_TEXT_DEG,
  PRIMARY_PANEL_TEXT_DEG,
  SEATED_EYE,
  SEAT_FIT_LIMITS,
  eyeDistance,
  seatFitOffset,
  textAngleDeg,
  type PanelPose,
} from '../src/ui/spatialLayout';

/**
 * Geometry-only guard for spatial panel legibility. It proves text is large enough on paper
 * (visual angle of the glyph em-height at the seated eye) and that panels clear the Earth globe.
 * It does not prove readability on a headset.
 */
const PANELS: Array<{ file: string; pose: PanelPose; widthPx: number; primary: string[] }> = [
  { file: 'briefing-panel', pose: IMMERSIVE_PANEL_POSES.briefing, widthPx: 440, primary: ['title-text', 'sector-title'] },
  { file: 'telemetry-hud', pose: IMMERSIVE_PANEL_POSES.telemetry, widthPx: 480, primary: ['directive-text', 'resource-row', 'op-title-text'] },
  { file: 'debrief-panel', pose: IMMERSIVE_PANEL_POSES.debrief, widthPx: 440, primary: ['banner-title'] },
];

const read = (name: string) => readFileSync(`public/ui/${name}.uikitml`, 'utf8');
const fontSizes = (xml: string) => [...xml.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
const classFont = (xml: string, cls: string) => {
  const m = new RegExp(`\\.${cls}\\s*\\{[^}]*?font-size:\\s*(\\d+)px`).exec(xml);
  return m ? Number(m[1]) : null;
};

describe('Spatial panel legibility (geometry)', () => {
  for (const { file, pose, widthPx, primary } of PANELS) {
    const xml = read(file);

    it(`${file}: declared width matches the layout table`, () => {
      expect(new RegExp(`\\.panel-root\\s*\\{[^}]*?width:\\s*${widthPx}px`).test(xml)).toBe(true);
    });

    it(`${file}: every font is at least ${MIN_PANEL_TEXT_DEG} degrees at the seated eye`, () => {
      const sizes = fontSizes(xml);
      expect(sizes.length).toBeGreaterThan(5);
      const smallest = Math.min(...sizes);
      expect(textAngleDeg(smallest, pose)).toBeGreaterThanOrEqual(MIN_PANEL_TEXT_DEG);
    });

    it(`${file}: primary text is at least ${PRIMARY_PANEL_TEXT_DEG} degrees`, () => {
      for (const cls of primary) {
        const px = classFont(xml, cls);
        expect(px, `${cls} must declare a font-size`).not.toBeNull();
        expect(textAngleDeg(px!, pose), `${cls} ${px}px`).toBeGreaterThanOrEqual(PRIMARY_PANEL_TEXT_DEG);
      }
    });

    it(`${file}: panel clears the Earth globe silhouette from the seat`, () => {
      const yaw = (pose.yawDeg * Math.PI) / 180;
      const half = (widthPx * pose.scale * 0.01) / 2;
      // Panel local +X axis in world space after rotation about Y.
      const axis = [Math.cos(yaw), -Math.sin(yaw)] as const; // (x, z)
      const sign = Math.sign(pose.position[0]);
      const innerX = pose.position[0] - sign * half * axis[0];
      const innerZ = pose.position[2] - sign * half * axis[1];
      const innerAzimuth = (Math.atan2(Math.abs(innerX - SEATED_EYE[0]), -(innerZ - SEATED_EYE[2])) * 180) / Math.PI;
      // Globe centre (0, 1.07, -0.48); radius 0.23 m including its orbit rings.
      const globeDist = Math.hypot(0 - SEATED_EYE[0], 1.07 - SEATED_EYE[1], -0.48 - SEATED_EYE[2]);
      const globeRadiusDeg = (Math.asin(0.23 / globeDist) * 180) / Math.PI;
      expect(innerAzimuth - globeRadiusDeg).toBeGreaterThanOrEqual(0.5);
    });
  }

  describe('forward Mission HUD (headset-first)', () => {
    const xml = read('mission-hud');
    const smallest = Math.min(...fontSizes(xml));
    for (const [mode, pose] of Object.entries(MISSION_HUD_POSES)) {
      const asPanel: PanelPose = { position: pose.position, yawDeg: 0, scale: pose.scale };
      it(`${mode}: every font is at least ${MIN_PANEL_TEXT_DEG} degrees`, () => {
        expect(textAngleDeg(smallest, asPanel)).toBeGreaterThanOrEqual(MIN_PANEL_TEXT_DEG);
      });
      it(`${mode}: titles are at least ${PRIMARY_PANEL_TEXT_DEG} degrees`, () => {
        expect(textAngleDeg(classFont(xml, 'hud-title')!, asPanel)).toBeGreaterThanOrEqual(PRIMARY_PANEL_TEXT_DEG);
      });
      it(`${mode}: centred within 20 degrees of seated forward`, () => {
        const [x, y, z] = pose.position;
        const off = (Math.acos(-(z - SEATED_EYE[2]) / Math.hypot(x - SEATED_EYE[0], y - SEATED_EYE[1], z - SEATED_EYE[2])) * 180) / Math.PI;
        expect(off).toBeLessThan(20);
      });
    }
    it('strip bottom edge stays above the globe-and-rings silhouette', () => {
      const pose = MISSION_HUD_POSES.strip;
      // Play section is about 300 px tall; panels are centred on their pose.
      const bottomY = pose.position[1] - (300 * pose.scale * 0.01) / 2;
      const bottomDeg = (Math.atan2(bottomY - SEATED_EYE[1], -(pose.position[2] - SEATED_EYE[2])) * 180) / Math.PI;
      const globeTopDeg = (Math.atan2(1.07 + 0.23 - SEATED_EYE[1], 0.48) * 180) / Math.PI;
      expect(bottomDeg).toBeGreaterThan(globeTopDeg);
    });
    it('card leaves room for the shrunken globe', () => {
      expect(GLOBE_CARD_SCALE).toBeLessThanOrEqual(0.5);
    });
  });

  it('side panels are within a comfortable viewing distance', () => {
    for (const { pose } of PANELS) {
      expect(eyeDistance(pose)).toBeGreaterThan(0.9);
      expect(eyeDistance(pose)).toBeLessThan(1.3);
    }
  });

  it('records the before/after numbers for the 12 px body text', () => {
    const before: PanelPose = { position: [0.88, 1.16, -0.98], yawDeg: -30, scale: 0.098 };
    expect(textAngleDeg(12, before)).toBeLessThan(0.55);
    expect(textAngleDeg(13, IMMERSIVE_PANEL_POSES.telemetry)).toBeGreaterThanOrEqual(0.75);
  });
});

/**
 * The rig offset that puts a judge's head on SEATED_EYE. Geometry only: it does not prove that a real
 * Quest session starts with the head near the local-floor origin (that is checked on the headset).
 */
describe('Seat fit (rig offset)', () => {
  const head = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
  const apply = (h: [number, number, number], off: [number, number, number]) => h.map((v, i) => v + off[i]);

  it('leaves a head that is already on the design eye alone', () => {
    expect(seatFitOffset(head(...SEATED_EYE))).toEqual([0, 0, 0]);
  });

  it('ignores errors inside the deadband, per axis', () => {
    const deadband: [number, number, number] = [0.05, 0.05, 0.08];
    expect(seatFitOffset(head(0.04, 1.25 + 0.04, 0.1 + 0.07), deadband)).toEqual([0, 0, 0]);
    const [ox, oy, oz] = seatFitOffset(head(0, 1.6, 0.1), deadband);
    expect(ox).toBe(0);
    expect(oy).toBeCloseTo(1.25 - 1.6, 5);
    expect(oz).toBe(0);
  });

  it('lands the head on the design eye for a standing judge, a low seat and a default Quest head', () => {
    for (const h of [head(0, 1.7, 0), head(0, 1.9, 0), head(0, 1.0, 0), head(0.1, 1.6, 0.02)]) {
      const landed = apply(h, seatFitOffset(h));
      SEATED_EYE.forEach((target, i) => expect(landed[i]).toBeCloseTo(target, 5));
    }
  });

  it('never shifts the rig farther than the limits', () => {
    const tall = seatFitOffset(head(0, 2.4, 0));
    const tiny = seatFitOffset(head(0, 0.2, 0));
    const wide = seatFitOffset(head(3, 1.25, -3));
    expect(tall[1]).toBe(SEAT_FIT_LIMITS.y[0]);
    expect(tiny[1]).toBe(SEAT_FIT_LIMITS.y[1]);
    expect(wide[0]).toBe(SEAT_FIT_LIMITS.x[0]);
    expect(wide[2]).toBe(SEAT_FIT_LIMITS.z[1]);
  });

  it('keeps the design eye where the cockpit was laid out (1.25 m high, 0.10 m forward of the origin)', () => {
    expect([...SEATED_EYE]).toEqual([0, 1.25, 0.1]);
  });
});
