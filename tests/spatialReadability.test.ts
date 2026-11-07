import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  IMMERSIVE_PANEL_POSES,
  MIN_PANEL_TEXT_DEG,
  PRIMARY_PANEL_TEXT_DEG,
  SEATED_EYE,
  eyeDistance,
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
