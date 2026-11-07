/**
 * Seated-XR spatial panel layout and legibility math.
 *
 * UIKit lays text out in "px" where one px is 1 cm before the panel's object scale is applied,
 * so a glyph em-height in metres is `fontPx * scale * UIKIT_METERS_PER_PX`. The visual angle of
 * that em-height at the seated eye is what decides whether text is comfortably readable, so panel
 * poses and minimum font sizes are defined here once and checked by tests/spatialReadability.test.ts.
 *
 * Angles describe geometry only. They do not prove readability on a headset (lens sharpness,
 * display resolution and user eyesight all matter); that needs a physical Quest check.
 */

export const UIKIT_METERS_PER_PX = 0.01;
/** Seated eye position used by the cockpit (matches the seated head pose in iwsdk.config.json). */
export const SEATED_EYE: readonly [number, number, number] = [0, 1.25, 0];

/** Smallest em-height angle allowed for any panel text. */
export const MIN_PANEL_TEXT_DEG = 0.75;
/** Primary information (objective, resources, results) should be at least this large. */
export const PRIMARY_PANEL_TEXT_DEG = 0.88;

export interface PanelPose {
  readonly position: readonly [number, number, number];
  /** Rotation about world Y, degrees (positive turns the panel face toward +X). */
  readonly yawDeg: number;
  readonly scale: number;
}

/**
 * Immersive (seated) poses. Side panels sit about 1.2 m from the eye, about 45 degrees off axis, outside
 * the Earth globe (radius 0.2 m at 0.48 m) so nothing occludes them. The briefing and the
 * telemetry/debrief panels never overlap: debrief replaces telemetry while it is visible.
 */
export const IMMERSIVE_PANEL_POSES = {
  briefing: { position: [-0.86, 1.3, -0.86], yawDeg: 40, scale: 0.125 },
  telemetry: { position: [0.86, 1.3, -0.86], yawDeg: -40, scale: 0.125 },
  debrief: { position: [0.86, 1.3, -0.86], yawDeg: -40, scale: 0.125 },
} as const satisfies Record<string, PanelPose>;

export function eyeDistance(pose: PanelPose): number {
  const [x, y, z] = pose.position;
  return Math.hypot(x - SEATED_EYE[0], y - SEATED_EYE[1], z - SEATED_EYE[2]);
}

/** Visual angle (degrees) of a glyph em-height for text of `fontPx` on a panel with this pose. */
export function textAngleDeg(fontPx: number, pose: PanelPose): number {
  const heightM = fontPx * pose.scale * UIKIT_METERS_PER_PX;
  return (2 * Math.atan(heightM / (2 * eyeDistance(pose))) * 180) / Math.PI;
}

/** Panel world height (m) for a layout height given in UIKit px. */
export function panelHeightMeters(heightPx: number, pose: PanelPose): number {
  return heightPx * pose.scale * UIKIT_METERS_PER_PX;
}
