# Physical Meta Quest 3 / 3S Test Checklist

Every item is **PENDING**. Nothing here has been run on a headset. Mark each item PASS, FAIL or N/A with a date and the tester's initials. See `RC8_QUEST_DEVICE_TEST_CHECKLIST.md` for LAN and certificate setup.

## 0. Record
| Field | Value |
|---|---|
| Headset model | PENDING |
| Horizon OS version | PENDING |
| Quest Browser version | PENDING |
| Build tested (git revision or dist hash) | PENDING |
| URL and host | PENDING |
| Tester, date | PENDING |

## 1. Session
- [ ] PENDING: Page loads over HTTPS; landing renders and the voice-over plays after a first gesture.
- [ ] PENDING: ENTER VR starts an immersive session; the seated view is at a comfortable height.
- [ ] PENDING: Exit the session (system menu), then re-enter. The mission state is sane.
- [ ] PENDING: If VR entry fails, "Play on desktop" recovers.

## 2. Hands
- [ ] PENDING: Hand tracking is reported (no controllers).
- [ ] PENDING: Left and right hands are identified correctly (compare with `getXRHandTelemetryLog`).
- [ ] PENDING: Point and pinch on a sector, pad and panel button.
- [ ] PENDING: Grab, carry, release a data cube into the cradle and each downlink slot.
- [ ] PENDING: Release outside any target returns the cube safely.
- [ ] PENDING: Cover one hand to cause tracking loss. The cube recovers; no duplicate cubes.
- [ ] PENDING: Both hands pinch at once: no stuck scanner, no wrong-hand scan (regression: Fireline 13 Wh vs 10 Wh).

## 3. Comfort and legibility
- [ ] PENDING: Every control is reachable seated, without leaning out of the chair.
- [ ] PENDING: Briefing, telemetry and debrief panels are readable at the default size. Note the smallest text that fails.
- [ ] PENDING: Cube labels and bay slot labels are readable. The bay slots sit just outside the globe's view cone in emulation; confirm they are easy to find.
- [ ] PENDING: Left and right eye images agree; no double vision, flicker or shimmer.
- [ ] PENDING: Debrief panel sits to the right of the globe and is not occluded.
- [ ] PENDING: ARIA hologram does not obscure the globe or panels; captions are legible and audio is audible.

## 4. Mission progression
- [ ] PENDING: OP 00 Academy to completion.
- [ ] PENDING: OP 01 Fireline: optimal run (reference: Thermal B and E compressed, Optical C; 76 MB; 7.6 s; 10 Wh left; 100/100).
- [ ] PENDING: OP 01 with a deliberate wrong sensor: failure debrief shows plain-language guidance.
- [ ] PENDING: OP 02 Monsoon Shield and OP 03 Aftershock to completion.
- [ ] PENDING: Reload the page. Campaign progress persists.

## 5. Performance (measure, do not estimate)
- [ ] PENDING: Frame time via Quest Browser developer tools or OVR Metrics Tool: median, p95, dropped frames. Compare with the 72 Hz target (13.9 ms). The emulator figures (36 to 57 ms median on the development PC) say nothing about the headset.
- [ ] PENDING: Thermal and battery after a 20 minute session.
- [ ] PENDING: Long-session stability: five consecutive passes without a crash, leak or drift in the panels' position.

## 6. Sign-off
Release stays "NOT FULLY VERIFIED" until sections 1 to 5 have PASS or documented FAIL with follow-up.
