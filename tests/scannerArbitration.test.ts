import { describe, expect, it } from 'vitest';
import {
  DELIBERATE_SCANNER_PRESS_RADIUS_M,
  isStrayScannerGrab,
  pressOwner,
  SCANNER_TARGET_ID,
} from '../src/systems/scannerArbitration';

describe('pressOwner', () => {
  it('keeps the resolved target when the pinch starts away from the scanner', () => {
    expect(pressOwner('sector-e', 0.43)).toBe('sector-e');
    expect(pressOwner(null, 0.43)).toBeNull();
    expect(pressOwner(undefined, null)).toBeNull();
  });

  it('gives a pinch within reach of the scanner to the scanner, even if a nearer control resolved', () => {
    expect(pressOwner('pad-discard-chute', 0.04)).toBe(SCANNER_TARGET_ID);
    expect(pressOwner('pad-discard-chute', DELIBERATE_SCANNER_PRESS_RADIUS_M)).toBe(SCANNER_TARGET_ID);
    expect(pressOwner('pad-discard-chute', DELIBERATE_SCANNER_PRESS_RADIUS_M + 0.01)).toBe('pad-discard-chute');
  });
});

describe('isStrayScannerGrab (regression: Fireline step 7c lost 8 Wh to a stray scan)', () => {
  const base = { scannerGrabbed: true, holderHand: 'right' as const, side: 'right' as const };

  it('releases a scanner latched onto the hand that pinched a sector beacon', () => {
    expect(isStrayScannerGrab({ ...base, pressOwnerId: 'sector-e' })).toBe(true);
    expect(isStrayScannerGrab({ ...base, pressOwnerId: 'pad-fire-swath' })).toBe(true);
    expect(isStrayScannerGrab({ ...base, pressOwnerId: 'evidence-cube-2' })).toBe(true);
  });

  it('keeps a deliberate scanner grab', () => {
    expect(isStrayScannerGrab({ ...base, pressOwnerId: SCANNER_TARGET_ID })).toBe(false);
    expect(isStrayScannerGrab({ ...base, pressOwnerId: 'scanner-tool-handle' })).toBe(false);
  });

  it('keeps a scanner held by the other hand while this hand presses a control', () => {
    expect(isStrayScannerGrab({ ...base, holderHand: 'left', pressOwnerId: 'sector-e' })).toBe(false);
  });

  it('does nothing when the hand is not pinching or the scanner is not grabbed', () => {
    expect(isStrayScannerGrab({ ...base, pressOwnerId: undefined })).toBe(false);
    expect(isStrayScannerGrab({ ...base, pressOwnerId: null })).toBe(false);
    expect(isStrayScannerGrab({ ...base, scannerGrabbed: false, pressOwnerId: 'sector-e' })).toBe(false);
    expect(isStrayScannerGrab({ ...base, holderHand: null, pressOwnerId: 'sector-e' })).toBe(false);
  });
});
