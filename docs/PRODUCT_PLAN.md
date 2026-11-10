# ORBIT ZERO: THE LAST DOWNLINK — Product, UX & Competition Execution Plan (`docs/PRODUCT_PLAN.md`)

**Prepared:** 2026-11-10 | **Code Freeze:** 2026-11-16 | **Competition Deadline:** 2026-11-19 01:00 AM PKT (`2026-11-18 12:00 PM PST`)  
**Stack:** Meta IWSDK `@iwsdk/core@1.0.1`, Three.js (`super-three@0.181.0`), `@pmndrs/uikit` + `@pmndrs/uikit-horizon`, TypeScript, Vite, Vitest, IWER (`2.7.0`)  
**Device Ground Truth:** Nothing has run on a physical Meta Quest 3 yet. Every runtime claim below separates **VERIFIED** (ran in Vitest / Chromium + IWER), **UNVERIFIED-NEEDS-HEADSET**, and **ASSUMED**.

---

## (a) One-Sentence Pitch, 30-Second Core Loop & Clip Moment

- **One-sentence pitch:** *Sit inside a failing 400 km low-Earth orbital cupola, read storm and wildfire smoke with your own hands, compress the right 3D data cubes, and dock them live before your 10-second S-Band horizon window snaps shut over Karachi.*
- **30-second core loop:** **Read Weather** (pick a glowing sector on the holographic globe) -> **Pick Sensor** (`OPTICAL`, `THERMAL`, or `RADAR` — match physics to cloud/smoke) -> **Scan** (pull trigger / pinch plunger or aim handheld scanner wand) -> **Compress** (drop raw cube into the amber Cradle to halve transmit time at a `-6 Wh` cost) -> **Prioritize & Hot-Dock** (slot #1 transmits first; late cubes dock live against a ticking red `LIVE LINK` countdown).
- **The Shareable "Clip Moment" (10 seconds that sells the game):**
  In `OP 01: FIRELINE`, Sector B's thick wildfire smoke blinds Optical (`[X] UNVERIFIED`), you toggle to **Thermal IR**, watch an orange swath pierce the smoke into a green `CONFIRMED` cube, realize two raw cubes overflow the `10.0s` window, slam them through the compressing cradle, hit `TRANSMIT`, and **physically hot-dock the third cube mid-stream with `1.2s` left on the red downlink clock** as the laser locks onto Karachi (`HOT DOCK!`).

---

## (b) Friction Map (Link Open -> End of First Run)

Ranked by risk of a competition judge failing/marking down OR a Gen Z player quitting in the first 30 seconds:

| Severity | Moment | Concrete Friction Found in Code | Audience Impact |
| :---: | :--- | :--- | :--- |
| **P0** | **Mission Card -> First Action (`VR`)** | [`CARD_HOW_LINE`](../src/ui/hudText.ts#L71) tells the player *"point your hand laser at a glowing sector and pinch"*, yet [`missionHudMode()`](../src/systems/missionControlSystem.ts#L3850) keeps the modal open until **`Btn_StartPass`** is clicked. Selecting a sector while the card is open speaks weather but leaves the modal blocking center view. | Judge or Gen Z player aims at a glowing sector immediately, thinks input is broken (`~8s` dead confusion). |
| **P0** | **First-Run Headset Tracking & Pinch Jitter** | [`NativeXRHands.sample()`](../src/systems/nativeXRHands.ts#L148-L165) resets a hand immediately on 1 missing joint pose (`line 150`) and applies spatial pinch hysteresis (`18mm`/`28mm`) **without temporal debounce**. (Audited `docs/AUDIT.md` previously assumed a `55ms` debounce and `120ms` grace that are not implemented in code.) | Real Quest camera occlusion or hand-edge jitter can drop a carried cube mid-air or double-fire a UI tap (`UNVERIFIED-NEEDS-HEADSET`). |
| **P0** | **Headset Session Triage Blind Spot (`?perf=1`)** | [`PerfMonitorSystem`](../src/systems/perfMonitor.ts#L261) renders FPS/draws/tris/heap/tex, but does **not** show active reference space, granted XR features (e.g. `hand-tracking`), live L/R hand tracking + pinch values, or Web Audio / Speech state (`AudioContext.state`, `held`). | Wastes precious minutes during the single 60–90 min borrowed Quest session diagnosing silent audio or tracking permission issues. |
| **P1** | **Desktop Retry Puts Modal Back Up** | [`DesktopControlsManager.restartMission()`](../src/systems/desktopControls.ts#L1198-L1203) sets `this.briefingModalOpen = true`. Clicking `RETRY PASS [R]` re-opens the multi-section Mission Card instead of dropping the player straight back into action. Also `[V]` `TACTICAL RECONNAISSANCE` in [`desktopControls.ts:2263-2315`](../src/systems/desktopControls.ts#L2263-L2315) still contains a broken template literal (` (% sure, simulated)`) and spoils exact `CONFIRMED/UNVERIFIED` radar/optical outcomes. | Breaks `"one more run"` momentum on desktop and leaks the puzzle answers if `[V]` is expanded. |
| **P1** | **No First-Tap Audio Pre-Unlock on XR Lobby & Landing Launch** | [`OrbitalAudioController.ensureContext()`](../src/systems/orbitalAudio.ts#L86) only creates/resumes `AudioContext` on the first `playCue()`, which can occur seconds later in an interval callback (`whenPlayerReady`) rather than synchronously inside the `ENTER VR` / `START PASS` click handler. | Quest Browser or Chrome autoplay policy can lock Web Audio silently if creation happens outside the synchronous click stack. |
| **P1** | **Weak Retention Hook on End Screen (VR & Desktop)** | [`missionProfile.ts`](../src/systems/missionProfile.ts#L153-L168) + `startDailyPass()` already implement daily seed selection and streak persistence, and [`proceduralCrisis.ts`](../src/mission/proceduralCrisis.ts) generates solvable seeded variations, **but neither is reachable** on the VR `ResultSection`, VR `CardSection`, or Desktop Debrief/Campaign UI, and there are zero local unlockables/share codes. | After beating or failing `OP 01` once, Gen Z players see only `"RETRY PASS"` / `"NEXT OPERATION"` with no streak hook, run variation, cosmetic reward, or clip-friendly share card. |
| **P2** | **Loading Screen Shows Indeterminate Progress** | [`XrEntryOverlay.showLoading()`](../src/ui/xrEntryOverlay.ts#L268) shows `"Loading the mission..."` with an animated pulse bar but no real load stages (`Initializing 3D world... -> Building orbital cockpit... -> Compiling spatial UI...`). | On slower Quest Wi-Fi, an indeterminate bar feels stalled after ~4 seconds. |

---

## (c) "Feels Good" Audit (Anticipation, Impact, Follow-Through)

| Key Action | Current Visual + Audio + Motion | What Is Missing (Concrete & Cheap for Quest <=50 draws) |
| :--- | :--- | :--- |
| **Hover** | Beacons & desk pads scale `1.15x` + soft [`HOVER_TICK`](../src/systems/missionControlSystem.ts#L5476); UIKit buttons border-thicken (`:hover`). | Desktop hover tooltip is text-only; headset hover on **cubes** highlights only `CubeAcrylicShell` (hidden in XR!) instead of tinting `CubeOuterFrame` (`+0` draws). |
| **Pinch / Trigger Press** | Hand joint hysteresis (`18mm`/`28mm`); pad cap depresses `-9mm`/`-12mm` + mechanical switch click. | No brief pinch-lock ring / fingertip dot pulse (`0` extra draws via hand ray or existing cursor) and no desktop button press micro-bounce. |
| **Lock (Target / Scanner)** | `ScannerAimLaser` changes opacity (`0.4 -> 0.9`), snaps length to beacon, plays `WAND_LOCK`. | Needs cleaner audible dual-tone lock chime vs unlock release, plus a clear toast/caption when an early release has no target (`"Hold beam on beacon briefly"`). |
| **Scan** | `OrbitalScanSwathCone` (`0.85s` pulse from CubeSat), cube materializes `0.15 -> 1.04`, particles burst (flat screen), `SCAN_OPTICAL` / `SCAN_RADAR` + sub-bass pulse + combo badge (`FIRST-TRY LOCK`, `STREAK xN`). | On **`UNVERIFIED`** (`[X]`) blocked scan, add distinct dull low-pass thud + red rim pulse on the materialized cube & beacon so a wrong sensor reads **viscerally within 0.3s** without reading text. |
| **Compress** | Amber Cradle clamps animate (hidden in XR to save draws), `CradleDropHalo` lights, cube shrinks over `0.65s`, [`playCompressionChirp`](../src/systems/orbitalAudio.ts), combo callout (`CLUTCH COMPRESS` / `FITS THE WINDOW`). | In VR `CradleDropHalo` only shows during drag and snaps off instantly on release; keeping a `0.65s` emerald/amber follow-through glow on `pad-process-cradle` (`+0` draws) makes cradle drops feel impactful in VR too. |
| **Dock (Downlink Bay)** | Green slot waveguide lights (`1.2` emissive), [`playMagneticSnap`](../src/systems/orbitalAudio.ts), `HOT DOCK!` / `CLEAN SWEEP` callout. | Queue slot waveguides (`DownlinkSlotWaveguide_1..3`) have `material.visible = !immersive` (`line 4504`), hiding green/red overflow feedback on the physical console desk in VR! Leaving those 3 tiny waveguides (`0` extra tris—wait: measure impact; or color the bay pad itself `+0` draws!) gives instant bay overflow warning at a glance. |
| **Fail** | `LINK_CUTOFF` descending synth + debrief text card (`retryGuidanceFor`). | Fair-fail impact missing a clear "what cost us" highlight (e.g. `OVERFLOW CUT PKT-X` / `LOW BATTERY`) paired with **1-pinch Instant Retry**. |
| **Win** | `OPTIMAL_VICTORY` chime + [`playSuccessFanfare`](../src/systems/orbitalAudio.ts) + delivered green sector pins + `Grade S/A/B` HUD & ARIA voice. | No Grade-S / Streak celebration chord stinger or local cockpit palette unlock notification on the debrief card. |

---

## (d) Local Retention Design (Zero Backend Required)

All persisted inside [`MissionProfile`](../src/systems/missionProfile.ts) (`localStorage` key `'orbit-zero-profile-v1'` -> backward-compatible bump/extension):

1. **Instant Restart (Zero-Modal):**
   - Desktop `RETRY PASS [R]` and VR `Btn_HudRetry` immediately reset resources and drop straight into live play (skipping the blocking Mission Card on retries unless `[H]` / `Briefing` is requested).
   - Add a **Next / Retry / Daily** tri-CTA flow on End Screen (`"ONE MORE RUN"`, `"PLAY DAILY"`, `"NEXT OP"`).
2. **Per-Operation Mastery, Stars & Best Streak:**
   - Already present: `bestScore`, `bestGrade`, `attempts`, `bestMarginSec`, `starsFor()`.
   - Extend cleanly: track `bestStreak` (consecutive `SUCCESS` passes without failing) and `runsCompleted` + show them cleanly in both Campaign selector and End Screen.
3. **Local Cosmetic / Cockpit Skin Track (Zero Extra Draw Calls):**
   - Modify material colors/emissives on existing merged console accent strips, globe orbit rings, and scanner beam trail at session/scenario start (`0` extra geometry, `0` extra draw calls):
     - **`ORBITAL CYAN`** (Default)
     - **`SOLAR AMBER`** (Unlocks at 1 campaign pass or Daily completion)
     - **`EMERALD RECON`** (Unlocks at 3+ total stars or 1st `Grade S`)
     - **`INFRARED CRIMSON`** (Unlocks at 6+ total stars or 3-pass streak)
   - Toggleable cleanly in Settings (`telemetry-hud` + Desktop settings pill).
4. **Daily Seeded Mission + Shareable Result Card:**
   - Replace [`getDailyPass(date)`](../src/systems/missionProfile.ts#L153) (currently picking 1 of 3 hidden static scenarios) with deterministic seeded generation via [`generateProceduralCrisis(`DAILY-${date}`)`](../src/mission/proceduralCrisis.ts#L135) patched so sector rules align cleanly with `FIRELINE` / `MONSOON` / `AFTERSHOCK` visual weather + guaranteed solvability (`>= 75` achievable!). Everyone playing on `YYYY-MM-DD` gets the exact same weather, budget, and 10s challenge, tracked in `profile.daily`.
   - **Shareable Result Text / SVG-or-Text Card (Deterministic from `DebriefReport`):**
     Generate a compact wordle/telemetry-style 4-line share string on the Desktop Debrief (with `"Copy Result"` button) and display the 6-char Mission Run Code (`OZ-MMDD-GRADE-SCORE`) on the VR Result HUD, built strictly from `debrief` + `scenarioId` + `dailyDate` + `marginSec`.
5. **Subtle Run Variation (`Replay Mode`):**
   - Keep default campaign missions (`OP 01..03`) **100% deterministic** on first run (preserving all puzzle design, unit tests, and judge balance!).
   - On subsequent replays (or when `"SHIFTED PASS"` / Daily is active), [`proceduralCrisis.ts`](../src/mission/proceduralCrisis.ts) or seeded offsets vary weather clutter (`THIN_SMOKE` / `DENSE_STORM`), downlink window (`9.2s – 10.8s`), or a random solar fault (`-3 Wh`), clearly labeled on the HUD kicker (`"SHIFTED ORBIT PASS"`). *(Must be opt-in or Daily-only so standard campaign unit tests and first-pass judging remain deterministic!)*

---

## (e) Real-World Earth Context (Zero API Keys, 100% Offline Safe)

- **API Verdict:** Real live NASA FIRMS / NOAA SWPC feeds require API keys or CORS proxies (`FIRMS MAP_KEY`, unreliable public endpoints in Quest Browser CSP) and violate Competition Rule 4 (*must work identically with every external service removed*).
- **Zero-Key Offline-First Solution (`src/mission/earthContext.ts`):**
  - Bundle a compact **public-domain seasonal Earth-observation & South Asia crisis almanac snapshot** (monsoon seasonality June–Sep over Sindh/Indus, dry pre-monsoon/post-monsoon wildfire season in Balochistan/Sulaiman ridges, seismic active belt along Chaman/Quetta fault, plus solar activity Kp context).
  - Tag each operation card & briefing with real-world physical context (`Season window`, `Primary sensor physics reason`, `Ground station geometry`), clearly marked **`[SIMULATED PASS • GROUNDED IN PUBLIC EARTH-OBS PHYSICS]`**.
  - Strictly offline, zero runtime `fetch()`, zero API keys, zero failure modes.

---

## (e2) Passthrough / Mixed Reality Verdict

- **Honest Verdict: NO PASSTHROUGH — Keep Full Immersive VR (`SessionMode.ImmersiveVR`).**
- **Why (referencing `ADR-003` & `ADR-009` + Competition Rule 6):**
  1. Competition rules penalize tacked-on passthrough that fails in untested judge rooms. We have **no physical Quest** right now to test WebXR `plane-detection`, `mesh-detection`, or `hit-test` against real tables/walls.
  2. Our seated cockpit (`CockpitEnclosureShell` + deep-space starfield + Earth horizon + holographic desk glow) directly sells the *400 km low-Earth orbit cupola* fantasy and keeps contrast uniform (`white/cyan` on dark orbital navy). Opening camera passthrough into a bright living room destroys the orbital mood and reduces text contrast without changing a single triage decision.
  3. **Action:** Keep `SessionMode.ImmersiveVR` and `ADR-009` cleanly locked; do **not** re-introduce a fake MR toggle.

---

## (f) Desktop / VR Parity Matrix

| Player Action | Meta Quest 3 (Hands) | Meta Quest 3 (Controllers) | Desktop (Mouse / Keys) | Parity Gap to Fix |
| :--- | :--- | :--- | :--- | :--- |
| **Launch & Enter** | 1-tap `ENTER VR` on Quest lobby -> `OP 00` (or `OP 01` via landing) | Same (trigger on `ENTER VR`) | Landing -> `OP 01: FIRELINE` -> `PLAY ON DESKTOP` | `FIXED` (just needs `CARD_HOW_LINE` & sector auto-dismiss alignment). |
| **Start Pass / Dismiss Card** | Pinch `START PASS` (or `TRAINING FIRST`) | Trigger on `START PASS` | Click `START PASS [Enter]` | In VR, selecting a sector directly on the globe should also start the pass (`xrCardOpen = false`). |
| **Select Sector (A–F)** | Point hand ray (laser) + pinch beacon / gaze-dwell | Controller ray + trigger | Click beacon `[1-6]` / `[Tab]` | Parity good; fix Desktop `[V]` recon panel so it doesn't leak sensor answer! |
| **Switch Sensor** | Pinch `pad-toggle-sensor` (laser or near touch) | Trigger on `pad-toggle-sensor` | Click sensor pills / `[S]` / `[M]` | Equivalent. |
| **Scan Sector** | Pinch `pad-fire-swath` plunger OR carry `scanner-tool` beam -> release | Trigger on `pad-fire-swath` | Click `SCAN [Space]` | Equivalent. |
| **Inspect Cube** | Grab & lift near eyes (`STEP 5`), or `telemetry-hud` card | Click cube or `SELECT NEXT CUBE` | Click cube / `[←]` `[→]` | Keep desktop cube tray click visual glow matching VR cube selection. |
| **Compress (`PROCESS`)** | Carry cube -> amber Cradle release OR pinch `COMPRESS` button | Trigger `COMPRESS` button or Cradle pad | Drag cube -> Cradle OR `[P]` / `COMPRESS` button | VR Cradle needs clear follow-through pulse even when button-compressed. |
| **Load / Unload Bay (`QUEUE`)** | Carry cube -> Bay Slot 1–3 OR pinch `LOAD` button | Trigger `LOAD` button or Bay pad | Drag cube -> Bay / Slot OR `[Q]` / `[U]` | Unify "slot 1 sends first" feedback pulse. |
| **Discard** | Drop into red Chute OR 2-pinch `DISCARD` | 2-trigger `DISCARD` | Drag -> Chute OR `DISCARD [X]` | Equivalent & safe. |
| **Transmit / Hot-Dock** | Pinch green Lever or `TRANSMIT`, carry late cubes into Bay while live! | Trigger `TRANSMIT` + `ADD SELECTED` while live! | `[T]` / button + `DOCK SELECTED CUBE [Q]` / drag while live | Desktop supports dragging during live `DOWNLINK` — confirm & verify visual prompt matches VR! |
| **Pause / Resume** | Quest menu / headset off auto-pauses; `RESUME PASS` on HUD or `Btn_Pause` | Quest menu auto-pauses; trigger `RESUME PASS` | Tab hide / window blur auto-pauses; `PAUSE [Esc]` | Equivalent (`0.0s` leak). |
| **Retry / Next / Daily** | `RETRY PASS`, `NEXT OPERATION` on `ResultSection` | Same (ray + trigger) | `RETRY PASS [R]`, `NEXT [N]`, `CAMPAIGN [C]` | **GAP:** VR & Desktop lack 1-click **Instant Retry** (no modal), **Daily Mission**, **Cosmetic Skin**, and **Shareable Result Card**! |

---

## (g) Phased Execution Backlog (Nov 10 -> Nov 16 Freeze)

### TIER 0 — Must Ship by Nov 16 (~5–6h total; small safe batches)
1. **Batch 1 — First-30s Alignment & Safe Quest Diagnostics (`~1.5h`)**
   - Make selecting a sector on Earth while `CardSection` is open dismiss `xrCardOpen` cleanly, and align [`CARD_HOW_LINE`](../src/ui/hudText.ts#L71) so both hands and controllers know how to start cleanly.
   - Add synchronous `AudioContext` pre-unlock inside `ENTER VR` / `PLAY ON DESKTOP` / `START PASS` user gestures (`OrbitalAudioController.unlockFromGesture()`).
   - Harden [`NativeXRHands`](../src/systems/nativeXRHands.ts): real `45ms` pinch press/release debounce + `100ms` tracking-loss grace window (`0` heap allocations/frame preserved!).
   - Extend [`PerfMonitorSystem`](../src/systems/perfMonitor.ts) diagnostics overlay (`?perf=1` or 2-hand pinch): show `XR RefSpace`, granted session features (`hand-tracking`), L/R live hand & pinch state, and Audio (`ctx.state`, `held`, `voiceSpeaking`).
   - Show real loading sub-stage progress in [`XrEntryOverlay`](../src/ui/xrEntryOverlay.ts) + [`src/index.ts`](../src/index.ts).
2. **Batch 2 — Desktop Parity Cleanup & Instant Retry (`~1h`)**
   - Fix [`DesktopControlsManager`](../src/systems/desktopControls.ts): make `RETRY PASS [R]` instant (do not re-open `briefingModalOpen`), remove broken `opticalTau` + sensor answer spoiler leak in `[V]` Tactical Reconnaissance card (`renderReconCard`), ensure first-run controls/keys stay documented cleanly on Mission Card / Help.
3. **Batch 3 — Game Feel / Juice & Fair-Fail Clarity (`~1.5h`)**
   - Tinting `CubeOuterFrame` cleanly on XR hover (`+0` draws), distinct dull low-pass thud + red pulse when scanning produces `[X] UNVERIFIED`, subtle follow-through pulse on `pad-process-cradle` + `DownlinkBay` glow (without adding extra draw calls over 50/eye!).
   - Add celebratory Grade-S / Streak chord cue and clear cut-off / power-bottleneck highlight on Result HUD.

### TIER 1 — Should Ship If Tier 0 Is Green (~3h total)
4. **Batch 4 — Retention Loop: Daily Seeded Pass, Share Code & Local Cosmetics (`~3h`)**
   - Upgrade `getDailyPass(date)` to deterministic solvable seeded daily via `generateProceduralCrisis('DAILY-' + date)` (with daily mission entry in both Desktop Campaign modal and VR Result / Card!).
   - Add shareable result summary / Mission Code (`Copy Result` on Desktop debrief, compact `SHARE` / result code on VR `ResultSection`).
   - Add local Cockpit Skin track (`ORBITAL CYAN`, `SOLAR AMBER`, `EMERALD RECON`, `INFRARED CRIMSON`) unlocked via `missionProfile.ts` stars/streaks and persisted in `localStorage` (`0` extra draw calls).
   - Add optional offline [`earthContext.ts`](../src/mission/earthContext.ts) seasonal remote-sensing flavor tags (`0` network calls).

### TIER 2 — Real-Product Roadmap (Document Only in `docs/ROADMAP.md`, Do NOT Implement)
- Backend accounts, verified Daily Leaderboard & ghost runs, Meta Horizon Store packaging / release channel compliance (`Oculus` App Lab / Store VRC checklist), telemetry/funnel analytics, dynamic NASA/Copernicus event ingestion worker, and fair cosmetic/campaign monetization.

---

**Phase 1 Summary (10 lines):**
1. **Pitch:** Seated 400 km LEO disaster-triage puzzle where hands read weather, fire sensors, compress cubes, and hot-dock before a 10s S-Band cutoff.
2. **Clip Moment:** Switching Thermal IR over thick wildfire smoke, compressing cubes in the cradle, and hot-docking the final cube with `~1s` left.
3. **Top P0 Fixes:** Let sector clicks auto-start past the Mission Card, add real `45ms` debounce + `100ms` tracking-loss grace in `NativeXRHands`, and pre-unlock audio synchronously on `ENTER VR`.
4. **Quest Diagnostics:** Expand `?perf=1` / 2-hand pinch HUD with ref-space, granted features (`hand-tracking`), L/R hand/pinch state, and Audio status so the single headset session catches issues in seconds.
5. **Desktop Parity & Anti-Spoiler:** Fix broken `opticalTau` + sensor answer spoiler in `[V]` Recon panel and make `[R] Retry` instant without re-showing the briefing modal.
6. **Game Feel:** Add XR cube-frame hover feedback, distinct dull `[X]` unverified thud/pulse, cradle follow-through glow, and Grade-S/streak synth finish — keeping `<=50` draws/eye and `<=35k` tris/eye.
7. **Retention (No Backend):** Deterministic daily seeded crisis from `YYYY-MM-DD`, streak counter, local 4-palette cockpit skin track (`0` draws), and real-state share codes.
8. **Earth Context & MR Decision:** Bundled offline seasonal Earth-obs context only (zero API keys); Passthrough/MR remains disabled (`ImmersiveVR` keeps mood, contrast, and zero untested room-mesh failures).
9. **Execution:** 4 small green-gated batches (Tier 0 Batches 1–3, then Tier 1 Batch 4), running typecheck + unit + release + XR budget after every batch and committing cleanly.
10. **Proceeding automatically to Phase 2 (Tier 0 Batch 1 now).**

