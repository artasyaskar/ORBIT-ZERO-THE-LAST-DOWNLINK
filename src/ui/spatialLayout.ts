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
/**
 * The head position (world metres) the whole cockpit is laid out for: panel poses, text angles and the reach of
 * every pad, cube and the scanner. 1.25 m is a typical seated eye height. 0.10 m behind the floor origin is the
 * compromise between two limits: the beacons on the globe's near side stay at least about 0.43 m from the eye
 * (closer is uncomfortable to focus on), and the farthest desk target (a cube in its tray) stays within about
 * 0.67 m of the nearer shoulder (a natural pinch reach; from 0.34 m back it was 0.88 m, out of reach).
 * The game moves the player rig so that a real head lands here (see seatFitOffset).
 */
export const SEATED_EYE: readonly [number, number, number] = [0, 1.25, 0.1];

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
  briefing: { position: [-0.86, 1.3, -0.76], yawDeg: 40, scale: 0.125 },
  telemetry: { position: [0.86, 1.3, -0.76], yawDeg: -40, scale: 0.125 },
  debrief: { position: [0.86, 1.3, -0.76], yawDeg: -40, scale: 0.125 },
} as const satisfies Record<string, PanelPose>;

/**
 * Forward Mission HUD (headset-first). Two poses:
 * - `card`: eye-level modal for the Mission Card and the result. The globe shrinks to
 *   GLOBE_CARD_SCALE while it is open so it cannot occlude the lower rows.
 * - `strip`: compact Next Step / clock strip above the globe during play. Its bottom edge stays
 *   above the globe-plus-rings silhouette (about 6 degrees above the eye line).
 * Pitch is rotation about world X in degrees (positive tips the face down toward the seat).
 */
export const MISSION_HUD_POSES = {
  card: { position: [0, 1.3, -0.72], pitchDeg: 0, scale: 0.085 },
  strip: { position: [0, 1.56, -0.9], pitchDeg: 14, scale: 0.115 },
} as const;
export const GLOBE_CARD_SCALE = 0.45;

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

/** Largest rig shift the game will apply on each axis (metres): heads from about 0.6 m to 1.9 m fit. */
export const SEAT_FIT_LIMITS = { x: [-0.8, 0.8], y: [-0.65, 0.45], z: [-0.8, 0.8] } as const;

/**
 * The player-rig offset that puts a head tracked at `head` (floor-origin coordinates, i.e. before any rig
 * offset) onto SEATED_EYE. An axis whose error is inside `deadband` stays 0, so a seated player is not moved for a
 * few centimetres. Offsets are clamped to SEAT_FIT_LIMITS.
 */
export function seatFitOffset(
  head: readonly [number, number, number],
  deadband: readonly [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const axes = ['x', 'y', 'z'] as const;
  const out: [number, number, number] = [0, 0, 0];
  axes.forEach((axis, i) => {
    const error = SEATED_EYE[i] - head[i];
    if (Math.abs(error) <= deadband[i]) return;
    const [lo, hi] = SEAT_FIT_LIMITS[axis];
    out[i] = Math.max(lo, Math.min(hi, error));
  });
  return out;
}