/**
 * One pinch, one authority.
 *
 * The app resolves every hand pinch to a single target. IWSDK's own ray grab can independently
 * latch the scanner tool onto the same hand. If the pinch was aimed at something else (a sector
 * beacon, a pad, a cube) the tool flies to the hand and its release fires an unintended,
 * power-costing scan. These pure helpers decide when that grab is stray.
 */

/** A pinch that starts this close to the scanner tool is a deliberate scanner grab. */
export const DELIBERATE_SCANNER_PRESS_RADIUS_M = 0.12;

export const SCANNER_TARGET_ID = 'scanner-tool';

/**
 * What a pinch "owns" for arbitration purposes. A press within reach of the scanner owns the
 * scanner even if the nearest control (the tool rests beside the discard chute) resolved otherwise.
 */
export function pressOwner(resolvedTargetId: string | null | undefined, distanceToScannerM: number | null): string | null {
  if (distanceToScannerM !== null && distanceToScannerM <= DELIBERATE_SCANNER_PRESS_RADIUS_M) return SCANNER_TARGET_ID;
  return resolvedTargetId ?? null;
}

export interface StrayScannerInput {
  /** Owner recorded for this hand's current pinch, or undefined when the hand is not pinching. */
  pressOwnerId: string | null | undefined;
  scannerGrabbed: boolean;
  /** Which hand IWSDK reports as holding the scanner. */
  holderHand: 'left' | 'right' | null;
  side: 'left' | 'right';
}

export function isStrayScannerGrab(input: StrayScannerInput): boolean {
  const { pressOwnerId, scannerGrabbed, holderHand, side } = input;
  if (!pressOwnerId || /scanner/i.test(pressOwnerId)) return false; // pinch not pressed, or aimed at the scanner
  if (!scannerGrabbed) return false;
  return holderHand === side; // the other hand's scanner hold is legitimate
}
