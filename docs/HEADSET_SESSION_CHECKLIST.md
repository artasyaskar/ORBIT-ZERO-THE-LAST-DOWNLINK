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
- [ ] ARIA's opening line plays after entering, not while the lobby is up. If the headset has no speech voice
      and ARIA stays silent, the captions still show each line and the pass still moves on within a few seconds.

## 1b. Fit to the player (seat auto-fit, 10-20 min) - high risk
The game moves the play space so the player's head lands on the cockpit's design eye (1.25 m high, 0.10 m
forward of the floor origin). It reads the head pose on the first frames after ENTER VR, and it assumes that
Quest Browser reports that pose in a floor-level space. The emulator proves the maths (`tests/e2e-judge-fit.mjs`);
a real Quest has not been tried.
- [ ] Sit upright, look straight ahead, tap ENTER VR. Without moving: the globe is ahead at about arm's length,
      the Mission Card is straight ahead and readable, the desk pads and cubes are below you. Nothing needs a lean.
- [ ] Repeat standing (eye about 1.6-1.8 m): after entering, the whole cockpit is at your seat height and you do
      not bend down. Repeat sitting low (sofa, eye about 1.0 m): you do not reach up.
- [ ] The nearest part of the globe and its beacons look single (no double vision, no eye strain). Design
      distance: about 0.41 m from the eye to the globe surface (full-size globe in live play; it is smaller on
      the Mission Card).
- [ ] Reach test with both hands, seated: touch every desk pad, the scanner and the three cube trays. In the
      body model (eye 1.25 m, shoulders 25 cm lower, 18 cm either side) 9 of the 13 near targets are 0.60-0.69 m
      from the nearer shoulder, over the 0.6 m goal: the cube trays 0.66-0.68 m, the RECENTER pad 0.69 m. Pads
      and panel buttons also work by laser; only carrying a cube needs a pinch at the tray (COMPRESS and ADD TO
      BAY on the panel do the same jobs by laser). Write down which targets needed a lean, and how far.
- [ ] Enter VR while leaning or turned on purpose. The fit takes your first pose, so the cockpit may sit off.
      RECENTER (desk pad, or the briefing button) puts it right in one tap. Write down how far off it was.
- [ ] Stand up mid-pass and stay up for 3 s: a short select sound, and the cockpit re-seats to the new height
      (it never moves while you hold a cube). Sit down again: same.
- [ ] Head movements of about 5 cm never move the cockpit.
- [ ] Open the Quest menu and come back (and take the headset off and on): the cockpit is fitted again to
      where you now sit, without a visible jump to your feet or the ceiling.
- [ ] If the desk appears at ankle height or the globe near the ceiling, note it with the browser version.

## 2. Hand laser and pinch (20-28 min)
- [ ] Each hand shows a laser. Pointing at a sector beacon grows it and plays a soft tick.
- [ ] Pinch on a beacon selects it (HUD names the sector). No selection fires without a pinch.
- [ ] Laser + pinch presses: START PASS, ASK ARIA (twice to buy a hint), TRANSMIT, RETRY, NEXT, PAUSE PASS.
- [ ] Desk pads in VR (sensor, cradle, queue, commit, discard, FIRE SWATH plunger, recenter, ARIA, master):
      each is hittable by laser and by a near pinch; the visible button is the one that reacts.
- [ ] A near pinch (fingertip within about 14 cm) on a HUD button presses it.

## 2b. Controllers only, no hands (28-38 min) - medium risk
A judge may pick up the controllers. Controllers cannot carry cubes; the telemetry panel buttons and the desk
pads do the same jobs (`tests/e2e-controllers.mjs` plays a whole pass that way in the emulator).
- [ ] With hand tracking off (or the controllers in your hands), ENTER VR works and each controller shows a ray.
- [ ] Ray + trigger: START PASS, a sector beacon, the sensor pad, the FIRE SWATH plunger, COMPRESS SELECTED
      CUBE, ADD SELECTED CUBE TO DOWNLINK BAY, NEXT CUBE, TRANSMIT. Finish a whole pass this way.
- [ ] Both controllers aim and press, and the ray does not stick to a panel behind the one you point at.
- [ ] Note whether the panel labels were enough to find the cube buttons, or whether you needed a hint.

## 3. Pause and interruptions (38-45 min)
- [ ] Quest menu button mid-pass: the pass pauses, the clock stops, voice and sound stop.
- [ ] Back in the game the HUD reads PAUSED / RESUME PASS; laser + pinch resumes; sound returns.
- [ ] Take the headset off for 10 s mid-pass, put it back: paused, 0 s of clock used, resume works.
- [ ] Quest menu -> Exit mid-pass, then re-enter: the pass is paused with its clock, resume works.

## 4. Frame rate and render budget (45-60 min)
Read the `?perf=1` panel (lower left of the view, or hold a two-hand pinch with empty hands for 1.2 s to toggle it in VR). Hold each view about 60 s for the summary line.
- [ ] Mission Card, live play with three cubes, and the open downlink window: FPS avg >= 70 and 1% low >= 60
      at 72 Hz (if the headset runs 90 Hz: avg >= 85).
- [ ] Panel says "multiview". If it says "no multiview", record it: the GPU then draws twice the numbers below.
- [ ] Draws and triangles per eye match the verified emulator budget (`<= 50` draws/eye, `<= 35,000` tris/eye):
      card `41-42` draws (`29.5k-32.0k` tris), live `46-49` draws (`31.8k-34.3k` tris), downlink `44-47` draws (`30.7k-33.3k` tris).
- [ ] No visible judder when turning the head quickly over the globe.
- [ ] If FPS stays low at 90/120 Hz, a `[perf] ... asking for 72 Hz` log line appears (USB inspect) and the
      rate drops once. After exiting a slow session, the next ENTER VR logs the 0.8 resolution step.

## 5. Scanner, cubes and drops (60-70 min)
- [ ] Pinch the scanner in its left holster, carry it, aim the beam at a beacon: the beacon locks (HUD
      names it), releasing scans it. Releasing aimed at nothing scans nothing.
- [ ] Grab a cube from the tray, carry it to the amber cradle: it compresses. Carry it to Slot 1: it docks.
- [ ] Carry a cube into the chute: discarded. DISCARD pad needs a second pinch within the window.
- [ ] Drop a cube in mid-air or lose hand tracking while holding it: it returns to its tray slot.

## 6. One full operation (70-82 min)
- [ ] Play OP 01 FIRELINE start to result without the desktop. Note any step where you did not know
      what to do next.
- [ ] The result title (e.g. "MISSION SUCCESS | GRADE A") matches what ARIA says (no rank or medal words).
- [ ] OP 03 AFTERSHOCK: select every sector; no flood, levee or Indus wording anywhere.

## 7. Comfort and legibility (82-90 min)
- [ ] Every control is reachable seated without leaning (35-60 cm).
- [ ] HUD text readable without squinting; LARGE TEXT, HIGH CONTRAST, and DOMINANT HAND (RIGHT / LEFT) on the right panel work.
- [ ] RECENTER on the desk re-seats the view after leaning or standing.
- [ ] Captions show ARIA's lines; REDUCED MOTION stops the sweep, swirl and cube spin.

Results go into `docs/TESTING_AND_ACCEPTANCE.md` (device section) with the date, headset build and browser version.
