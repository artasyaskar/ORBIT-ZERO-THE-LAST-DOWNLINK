# Headset session checklist (Meta Quest 3, 60-90 minutes)

Nothing in this project has run on a physical headset yet. Everything below was verified only in the IWER
Quest 3 emulator (Chromium, desktop GPU). Run this list on a real Quest 3 before the code freeze, in this order:
the riskiest items come first, so a short session still covers what can sink the entry.

**Setup (5 min):** Quest 3, latest Horizon OS and Quest Browser, hand tracking ON, controllers put away. Sit
in a chair with a clear desk-height space in front. Open the live URL with `?perf=1` at the end. Optional:
USB to a PC with `chrome://inspect` open to read console logs (`[perf]` lines).
Record for each item: PASS / FAIL, and on FAIL what you saw (a phone video through the lens helps).

## 1. Entering VR (0-10 min) - highest risk
- [ ] The page shows the headset lobby (one ENTER VR button, no cinematic landing) within 20 s on Wi-Fi.
- [ ] ONE pinch/tap on ENTER VR enters the game. No second tap, no browser error.
- [ ] If Quest Browser also shows its own "Enter VR" offer: using it works too, and the two do not fight
      (no double session request, no frozen lobby).
- [ ] Exit with the Quest menu, then ENTER VR again from the lobby: works the second time.
- [ ] Deny the hand-tracking or VR permission once: the lobby shows a plain message and TRY AGAIN, which works.
- [ ] ARIA's opening line plays after entering, not while the lobby is up.

## 2. Hand laser and pinch (10-20 min)
- [ ] Each hand shows a laser. Pointing at a sector beacon grows it and plays a soft tick.
- [ ] Pinch on a beacon selects it (HUD names the sector). No selection fires without a pinch.
- [ ] Laser + pinch presses: START PASS, ASK ARIA (twice to buy a hint), TRANSMIT, RETRY, NEXT, PAUSE PASS.
- [ ] Desk pads in VR (sensor, cradle, queue, commit, discard, FIRE SWATH plunger, recenter, ARIA, master):
      each is hittable by laser and by a near pinch; the visible button is the one that reacts.
- [ ] A near pinch (fingertip within about 14 cm) on a HUD button presses it.

## 3. Pause and interruptions (20-30 min)
- [ ] Quest menu button mid-pass: the pass pauses, the clock stops, voice and sound stop.
- [ ] Back in the game the HUD reads PAUSED / RESUME PASS; laser + pinch resumes; sound returns.
- [ ] Take the headset off for 10 s mid-pass, put it back: paused, 0 s of clock used, resume works.
- [ ] Quest menu -> Exit mid-pass, then re-enter: the pass is paused with its clock, resume works.

## 4. Frame rate and render budget (30-45 min)
Read the `?perf=1` panel (lower left of the view). Hold each view about 60 s for the summary line.
- [ ] Mission Card, live play with three cubes, and the open downlink window: FPS avg >= 70 and 1% low >= 60
      at 72 Hz (if the headset runs 90 Hz: avg >= 85).
- [ ] Panel says "multiview". If it says "no multiview", record it: the GPU then draws twice the numbers below.
- [ ] Draws per eye close to the emulator numbers: card ~85, live ~97, downlink ~104.
- [ ] No visible judder when turning the head quickly over the globe.
- [ ] If FPS stays low at 90/120 Hz, a `[perf] ... asking for 72 Hz` log line appears (USB inspect) and the
      rate drops once. After exiting a slow session, the next ENTER VR logs the 0.8 resolution step.

## 5. Scanner, cubes and drops (45-60 min)
- [ ] Pinch the scanner in its left holster, carry it, aim the beam at a beacon: the beacon locks (HUD
      names it), releasing scans it. Releasing aimed at nothing scans nothing.
- [ ] Grab a cube from the tray, carry it to the amber cradle: it compresses. Carry it to Slot 1: it docks.
- [ ] Carry a cube into the chute: discarded. DISCARD pad needs a second pinch within the window.
- [ ] Drop a cube in mid-air or lose hand tracking while holding it: it returns to its tray slot.

## 6. One full operation (60-75 min)
- [ ] Play OP 01 FIRELINE start to result without the desktop. Note any step where you did not know
      what to do next.
- [ ] The result title (e.g. "MISSION SUCCESS | GRADE A") matches what ARIA says (no rank or medal words).
- [ ] OP 03 AFTERSHOCK: select every sector; no flood, levee or Indus wording anywhere.

## 7. Comfort and legibility (75-90 min)
- [ ] Every control is reachable seated without leaning (35-60 cm).
- [ ] HUD text readable without squinting; LARGE TEXT and HIGH CONTRAST work.
- [ ] RECENTER on the desk re-seats the view after leaning or standing.
- [ ] Captions show ARIA's lines; REDUCED MOTION stops the sweep, swirl and cube spin.

Results go into `docs/TESTING_AND_ACCEPTANCE.md` (device section) with the date, headset build and browser version.
