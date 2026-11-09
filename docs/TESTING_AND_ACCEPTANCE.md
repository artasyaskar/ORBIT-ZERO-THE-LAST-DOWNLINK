# TESTING AND ACCEPTANCE CRITERIA — ORBIT ZERO: THE LAST DOWNLINK

*Last updated: 2026-10-28*

## 1. Testing Philosophy & Honest Verification Policy
In accordance with **Gravitas** and **GSD Empirical Validation** rules:
1. **No Unverified Claims:** Never claim a test passed, a visual state rendered, or a device check succeeded without executing the verification step and recording the actual output.
2. **Explicit Environment Separation:** Every test report must explicitly state which tier was executed:
   - **Tier 1: Deterministic Unit & Integration Tests (Vitest / Node.js)**
   - **Tier 2: Automated Desktop Browser & Headless GPU Profiling (Playwright + Hardware ANGLE)**
   - **Tier 3: Interactive WebXR Emulation (`@iwer/devui` in Desktop Chrome/Edge)**
   - **Tier 4: Physical Meta Quest Headset Validation (Quest Browser on Horizon OS — *Conditional on hardware availability*)**
3. **No Substitution Fallacy:** Passing Tier 1–3 proves simulation correctness, desktop WebGL rendering, and emulated XR interaction wiring, but must **never** be misrepresented as Tier 4 physical headset hand-tracking or 72Hz on-device thermal validation.

---

## 2. Tier 1: Deterministic Simulation Unit Tests (`tests/*.test.ts`)
Executed via `npm test` (Vitest). Must achieve **100% pass rate** and cover all mission rules in `src/mission/`:

| Test Suite | Required Test Cases & Invariants |
| :--- | :--- |
| **Power & Storage Limits** | - Initial state starts with exact configured Power (`55`) and empty Storage (`0 / 9`).<br>- Scanning with Optical (`8 Power`) or Radar (`14 Power`) deducts exact power and increments storage by `+3`.<br>- Attempting a scan when `remainingPower < scanCost` or `usedStorage + 3 > maxStorage` returns a deterministic rejection reason (`INSUFFICIENT_POWER` or `STORAGE_FULL`) without mutating state.<br>- Discarding/recycling a cube frees its exact storage (`-3` for raw, `-1` for processed) without refunding spent power. |
| **Observation Quality & Scientific Rules** | - Optical scan on cloud-obscured Sector B or E deterministically produces `ConfidenceLevel.Unverified`.<br>- Radar scan on cloud-obscured Sector B produces `ConfidenceLevel.Confirmed` (flooded road).<br>- Optical scan on clear Sector C produces `ConfidenceLevel.Confirmed` (intact bridge), whereas Radar scan on Sector C produces `ConfidenceLevel.Probable` (truss reflection ambiguity).<br>- Re-scanning the same sector with the same sensor mode yields the exact same deterministic result (no RNG scumming). |
| **Onboard Processing Mechanics** | - Processing a valid (`Confirmed` or `Probable`) raw packet deducts `6 Power`, reduces `storageCost` from `3` to `1`, reduces `transmitSeconds` from `4.0s/4.5s` to `1.8s`, and marks `isProcessed = true`.<br>- Attempting to process an `Unverified` cloud-blocked packet is rejected (`CANNOT_PROCESS_UNVERIFIED`) — processing never fabricates missing evidence.<br>- Attempting to process an already-processed packet is rejected (`ALREADY_PROCESSED`). |
| **Downlink Window & Prioritization** | - Downlink window budget is `10.0s`.<br>- Queued packets transmit in exact slot priority order (`Slot 1 → Slot 2 → Slot 3...`).<br>- Only packets whose cumulative `transmitSeconds <= 10.0s` transition to `transmitted = true`; any packet exceeding the remaining window is cut off (`transmitted = false`).<br>- Captured packets left in the Raw Tray or Processing Cradle (never placed in the Downlink Bay) are never transmitted and never satisfy ground requests. |
| **Request Satisfaction & Deterministic Scoring** | - Request 1 (Flooded Access Road) is satisfied **only** if a transmitted packet covers Sector B with `Confirmed` status.<br>- Request 2 (Passable Crossing) is satisfied **only** if a transmitted packet covers Sector C with `Confirmed` status (`Probable` awards partial credit and flags uncertainty).<br>- Request 3 (Shelter Route Verification) is satisfied if a transmitted packet covers Sector E with `Probable` or `Confirmed` status.<br>- `scoring.ts` generates a deterministic score breakdown and a specific, actionable replay hint matching the highest-priority unsatisfied request or resource bottleneck. |
| **Mission Restart & State Reset** | - Calling `missionEngine.reset()` restores Power (`55`), Storage (`0/9`), Phase (`Briefing`), clears all captured/queued packets, and allows an identical sequence of actions to produce an identical score. |

---

## 3. Tier 2: Automated Desktop Browser & Headless GPU Tests (`tests/e2e/`)
Executed via Playwright against the production preview build (`npm run build` then `npm run preview`):
- **Hardware ANGLE Verification:** Launch Chromium with `--use-angle=d3d11` and `--ignore-certificate-errors`. Query `WEBGL_debug_renderer_info` and assert the renderer is **Intel UHD Graphics 620** (not `SwiftShader`).
- **Clean Boot & Scene Graph Readiness:** Assert `window.__ORBIT_ZERO_READY__ === true` (or `performance.mark('app-ready')`), zero `pageerror` or `console.error` events, and canvas dimensions `> 0`.
- **Render Budget Inspection:** Read `world.renderer.info` from the running page and assert:
  - `render.calls < 80` (Target: `< 50` draw calls)
  - `render.triangles < 100000` (Target: `< 50,000` triangles)
  - `memory.textures < 32`
- **Custom TTI Measurement:** Compute Time-To-Interactive from FCP + PerformanceObserver `longtask` quiet window (avoiding Lighthouse's `LanternError: NO_LCP` on canvas-only WebXR pages, per `.agents/skills/hz-iwsdk-webxr/references/desktop-load-profiling.md`). Target desktop TTI `< 3.0s`.

---

## 4. Tier 3: Interactive WebXR Emulator Validation (`@iwer/devui`)
Executed in desktop Chrome/Edge over `https://localhost:5173` (or `4173`) using IWSDK's built-in IWER emulation:
1. **XR Session Entry:** Clicking/tapping the launch control transitions `world.visibilityState` into immersive XR mode without console errors.
2. **Hands-First Interaction Walkthrough:**
   - Rotate the 3D Earth globe smoothly to inspect all 6 labeled sectors.
   - Toggle Scanner Mode between `OPTICAL` and `RADAR`, grab the Scanner Tool, and scan Sector B, Sector C, and Sector E.
   - Verify tangible Data Cubes spawn in the Raw Observation Tray with distinct visual glyphs, text labels, and confidence indicators.
   - Grab a Data Cube, move it into the Onboard Processing Cradle, verify magnetic snap and compression into a compact report (`1 Storage`, `1.8s Tx`).
   - Grab and release a Data Cube in empty air; verify it smoothly returns to its tray slot (`returnToOrigin` recovery).
   - Place selected packets into the Downlink Transmission Bay slots and trigger the Downlink Window.
   - Observe the countdown climax, packet transmission animations, audio cues, and automatic transition to the Debrief Panel.
   - Activate **Restart Mission** using hand pinch/poke and confirm clean state reset.
3. **Seated Ergonomics Check:** Verify all interactive targets lie within `0.35m – 0.65m` of the camera origin (`y = 0.75m – 1.25m`, `z = -0.35m to -0.75m`), requiring zero locomotion.

---

### 4a. Release suites (run before every commit that changes runtime code)
`npm run build`, then `powershell -File tests/run-release-suites.ps1` runs these one at a time (parallel runs
time out on the 8 GB dev laptop) and prints one PASS/FAIL line each:

| Suite | What it proves (IWER Quest 3, hand input) | Level |
|---|---|---|
| `tests/virtual-headset-player.mjs` | A judge's whole session by laser + pinch: card, three scans, result, retry, hint | emulator, end to end |
| `tests/e2e-hands-first-proof.mjs` | Laser aim from a seated rest pose, hand paths in steps, scanner carry, Quest menu / headset off / session end pause | emulator, end to end |
| `tests/e2e-enter-vr.mjs` | Headset lobby, one-tap ENTER VR, every failure path shows a message + TRY AGAIN | emulator |
| `tests/e2e-redesign-desktop.mjs` | The flat-page game by mouse and keys | desktop |
| `tests/e2e-hands-only.mjs` | Every object's touch action, with the fingertip placed on the target | unit-level (placement, not reach) |
| `tests/e2e-judge-fit.mjs` | Four head positions at session start (eye 1.0, 1.25, 1.7, 1.9 m): the seat fit lands the head on the design eye; the 13 desk targets are within 0.7 m of the nearer shoulder of a body model; the globe's near surface is at least 0.4 m from the eye; a laser press works; standing then sitting refits the height; RECENTER restores a drifted head | emulator, geometry (a body model, not a human) |
| `tests/e2e-controllers.mjs` | Controller input, no hands: START PASS, a beacon with each controller, sensor pad, FIRE SWATH plunger, panel COMPRESS and ADD TO BAY, TRANSMIT opens the downlink window | emulator, end to end |
| `tests/e2e-perf-hud.mjs` | `?perf=1` readout, head-locked panel, per-eye draws/tris, 60 s summary | emulator |
| `tests/deploy-static-check.mjs` | `dist/` served at `/` and a sub-path: landing, game, headset lobby, no failed requests | static hosting |

`npm run test:release` runs the same runner. Unit tests (`npx vitest run`) include the seat-fit offset maths
(`tests/spatialReadability.test.ts`).

Render budget: `node tests/profile-xr-budget.mjs <label>` (per-eye draws and triangles in nine views).
Live site: `node tests/live-url-smoke.mjs <https-url>` after a deploy (see `docs/DEPLOY.md`).

## 5. Tier 4: Physical Meta Quest Headset Protocol (If Hardware Access Secured)
**Run `docs/HEADSET_SESSION_CHECKLIST.md` (60-90 min, riskiest first).** Nothing has run on a physical headset yet.
If a Meta Quest 2, 3, or 3S is available during Phase 6:
0. **Enter VR (verify first; emulator coverage: `node tests/e2e-enter-vr.mjs`).**
   - Open the deployed HTTPS URL in Meta Quest Browser: the lobby (not the cinematic landing) shows "Loading the mission...", then ENTER VR. Note the load time.
   - One tap on ENTER VR enters VR. Count the taps; anything above one is a failure.
   - If the browser's own Enter VR button (address bar, from IWSDK `offerSession`) appears, check that using it also works, and that it does not block our button.
   - Leave VR (Meta button > Exit or Quit): the lobby comes back with "You left VR..."; one tap re-enters.
   - If VR ever fails to start, the lobby must show a message and TRY AGAIN, never a silent flat page. Write down the error line shown under the message.
1. Open the deployed HTTPS URL in **Meta Quest Browser** with controllers set aside (hand tracking active).
2. Verify **Fixed Foveated Rendering (`medium`)** and **Multiview (`OCULUS_multiview`)** activation in `chrome://inspect` logs.
3. Measure sustained framerate (`>= 60 FPS` required by Devpost rubric; `72 FPS` target) using OVR Metrics Tool.
4. Validate real-hand pinch threshold (`0.7–0.8`), world-space typography legibility at `0.5m – 0.8m`, and seated comfort over 3 consecutive replays.

---

## 6. Final Submission Acceptance Checklist (Competition Gate)
- [ ] **Gaming Track & New Experience Compliance:** All code written within the competition window; genuine strategy game loop.
- [ ] **Hands-First Mandate:** 100% playable from start to finish and replayable without controllers.
- [ ] **Seated Airplane-Seat Test:** Zero roomscale movement required; all interactions within `< 2 ft` radius. *Not yet met on paper:* in the body model 9 of 13 near targets are 0.60-0.69 m from the nearer shoulder (ADR-010); decide on the headset whether that needs a lean.
- [ ] **One Bus Stop Test:** Complete session takes 4–6 minutes (`< 10 minutes`).
- [ ] **Public HTTPS Build Live:** Deployed URL opens cleanly and enters WebXR without certificate errors or broken assets.
- [ ] **Honest Demo Video (`< 3:00`):** Public YouTube/Vimeo link (`~2:40` runtime) showing real captured gameplay from Quest or IWER/XR Simulator, with zero fabricated/AI-generated gameplay footage.
- [ ] **Post-Deadline Freeze:** Final deployment and Devpost submission completed by **November 17, 2026**, with zero repository or hosting modifications after **November 18, 2026 @ 12:00 PM PST (Nov 19, 2026 @ 01:00 AM PKT)**.
