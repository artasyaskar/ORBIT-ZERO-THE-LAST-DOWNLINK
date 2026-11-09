# ARCHITECTURAL DECISION RECORDS (DECISIONS.md)

*Last updated: 2026-10-28*

This document records major technical, gameplay, and tooling decisions for **ORBIT ZERO: THE LAST DOWNLINK**. No recorded decision may be silently reversed without updating this file and obtaining user approval.

---

## ADR-001: Primary Engine & Framework Selection
- **Date:** 2026-10-28
- **Status:** Accepted & Implemented (`@iwsdk/core@1.0.1` Stable)
- **Context:** We must build and ship a hands-first VR game for the Meta VR Start Developer Competition 2026 by November 18, 2026 on a Dell Latitude 5490 (Intel i5-8350U, 8 GB RAM, Intel UHD 620, 42.9 GB free on `D:`). Physical Meta Quest availability is currently unconfirmed.
- **Alternatives Considered:**
  1. **Meta Immersive Web SDK (`@iwsdk/core@1.0.1` latest stable) + Three.js (`super-three@0.181.0`) + `@pmndrs/uikit-horizon` + TypeScript + Vite + IWER.**
  2. **Meta IWSDK pre-release (`1.1.0-rc.2`).**
  3. **Unity (Meta XR All-in-One SDK v81+ / v207).**
  4. **React Three Fiber (`@react-three/fiber` + `@react-three/xr`).**
- **Evidence:**
  - `devpost.txt` explicitly lists **Immersive Web SDK** (`Node.js >= 20.19.0`, `npm create @iwsdk@latest`) as an official suggested SDK and permits WebXR submissions hosted on GitHub Pages / Vercel.
  - Scaffolding via `npx @iwsdk/create@latest` confirmed `1.0.1` is the canonical stable release (`iwsdk.project.v1`, `iwsdk.scene.v1`, `virtual:iwsdk-project`, native `AssetType.UIKitML`, and `@pmndrs/uikit-horizon`).
- **Decision:** Select **Meta IWSDK (`@iwsdk/core@1.0.1` stable) + Three.js (`super-three@0.181.0`) + TypeScript + Vite**.
- **Consequences:** Fast sub-second hot reload on the Dell Latitude 5490, native integration with Meta's official `hz-iwsdk-webxr` skill and `@iwer/devui` emulator, and instant judge access via an HTTPS URL without APK sideloading friction.

---

## ADR-002: Pure TypeScript Simulation Core Separated from ECS Presentation
- **Date:** 2026-10-28
- **Status:** Proposed (Recommended for Approval)
- **Context:** Strategy games fail when game rules (power, storage, cloud obstruction, processing eligibility, downlink timers, scoring) are tangled inside 3D frame loops or pointer callbacks.
- **Alternatives Considered:**
  1. **Pure TypeScript `src/mission/` state machine with zero 3D imports, bridged to IWSDK ECS systems.**
  2. **Embedding gameplay logic directly inside ECS `update(delta)` methods and UI click handlers.**
- **Decision:** Keep all simulation rules, scenario data, and scoring in pure TypeScript modules under `src/mission/` and test them independently with **Vitest**.
- **Consequences:** 100% of mission balance, edge cases, and scientific rules can be unit-tested in milliseconds without launching a browser, while ECS systems remain clean, focused adapters.

---

## ADR-003: Full Virtual Environment (`ImmersiveVR`) vs. Passthrough Mixed Reality (`ImmersiveAR`)
- **Date:** 2026-10-28
- **Status:** Proposed (Recommended for Approval)
- **Context:** `devpost.txt` notes that passthrough entries are judged strictly on whether the player's real room meaningfully changes the experience (using MRUK plane/mesh detection and holding up in untested rooms).
- **Alternatives Considered:**
  1. **Stylized, self-contained Virtual Orbital Console (`SessionMode.ImmersiveVR`, `ReferenceSpaceType.LocalFloor`).**
  2. **Passthrough Mixed Reality (`SessionMode.ImmersiveAR`) anchoring the globe to a real table.**
- **Evidence:**
  - `devpost.txt` lines 195 & 203 state: *"For entries that use passthrough, passthrough should be purposeful... and holding up in rooms the developer never tested."*
  - Physical Quest access is currently unconfirmed, making real-room plane/mesh testing risky.
  - A stylized low-Earth-orbit command console with controlled lighting provides stronger visual cohesion and predictable seated ergonomics.
- **Decision:** Build a cohesive **Immersive VR (`SessionMode.ImmersiveVR`)** orbital console for the MVP. Do not enable passthrough MR.
- **Consequences:** Avoids untested room-mesh failures during judging while guaranteeing consistent lighting, contrast, and seated reach across both emulator and physical Quest headsets.

---

## ADR-004: Procedural & Batched Low-Poly Assets + Web Audio Synthesis Over Heavy External Assets
- **Date:** 2026-10-28
- **Status:** Proposed (Recommended for Approval)
- **Context:** External 3D models and uncompressed audio/textures bloat repository size, strain Intel UHD 620 VRAM, risk license/attribution issues, and can fail silently in Quest Browser if CORS/paths are misconfigured.
- **Alternatives Considered:**
  1. **Procedural low-poly Three.js geometry builders + deterministic canvas textures + Web Audio API procedural synthesis (supplemented only by small verified CC0/MIT `.glb` assets if needed).**
  2. **Authoring high-poly models in Blender and downloading large external `.glb` and `.wav` packs.**
- **Decision:** Use **code-driven procedural/batched geometry (`src/scene/`)**, **UIKitML (`PanelUI`)**, and **Web Audio API synthesis (`src/systems/audioFeedbackSystem.ts`)** as the primary asset pipeline.
- **Consequences:** Total build size stays under `5 MB`, load time (TTI) is near-instant, draw calls stay under `50`, zero external license compliance risk, and zero Blender memory pressure on the 8 GB RAM laptop.

---

## ADR-005: Two Defensible Sensor Modes (Optical vs. SAR/Radar) & Non-Magical Onboard Processing
- **Date:** 2026-10-28
- **Status:** Proposed (Recommended for Approval)
- **Context:** Earlier brainstorming considered three sensor lenses (Optical, Thermal, RF) and continuous solar panel rotation.
- **Alternatives Considered:**
  1. **Two sensor modes (Optical + Radar/SAR-inspired) with deterministic cloud/geometry trade-offs and non-magical feature compression.**
  2. **Three+ sensor modes plus continuous solar/thermal housekeeping chores.**
- **Evidence:** `core_concept` and NASA Earth-observation literature establish a clear, scientifically defensible dichotomy: Optical provides high visual clarity in clear skies but is blocked by clouds (`Unverified`), whereas SAR penetrates clouds to map surface water at a higher power cost (`14` vs `8`) but can exhibit geometric/reflection ambiguity (`Probable`) around complex metallic/valley structures.
- **Decision:** Lock the MVP to **Optical** and **Radar (SAR-inspired)** modes, plus an **Onboard Processing Cradle** that compresses valid (`Confirmed`/`Probable`) observations without upgrading `Unverified` cloud-blocked scans.
- **Consequences:** Keeps cognitive load clear for a 4–6 minute session while creating a genuine, scientifically grounded optimization puzzle.
---
## ADR-006: "Plan calmly, transmit live" gameplay redesign
- **Date:** 2026-11-07
- **Status:** Accepted (approved by project owner)
- **Context:** A first-time desktop playtest found the game confusing and pointless. Root causes found in code: the HUD, ARIA-7, request text and briefing all printed the correct sensor; the recon phase had no clock and nothing could be lost before the debrief; the transmit climax needed no player action; the win rule was never shown; several key hints were wrong and the step-by-step guide never rendered.
- **Decision:**
  1. **Deduce, don't follow:** the UI shows sector weather and plain sensor capabilities, never the matching sensor. The answer is only available as a paid ARIA-7 hint (`SCORING.hintPenalty`, blocks Grade S).
  2. **Orbital pass clock** (`passDurationSec` per scenario) starts at the first scan; at zero the window opens automatically, or the pass fails if nothing usable is on board. Relaxed mode (accessibility) removes it.
  3. **Live downlink:** cubes can be docked while the window is open; a late cube starts no earlier than its dock time, so idle seconds are lost. The lever closes the link early.
  4. **Weighted triage:** Fireline and Aftershock requests carry `priorityPoints` (sum 100). Aftershock's battery (42 Wh) cannot confirm all three requests; two strategies reach the win line.
  5. **Explicit win/lose:** per-scenario `successScore` / `partialScore`, shown on the Mission Card before play and in the debrief. ABORT ends a stalled pass.
  6. **One source of truth:** `SCORING`, `getScanCost`, `getScenarioThresholds` in `missionConfig.ts` feed engine, planner, debrief, desktop HUD, spatial panels and landing cards.
  7. Player-facing campaign is Academy + Fireline + Monsoon + Aftershock; Supercell, Brownout and daily passes stay in code but are hidden.
- **Supersedes:** ADR-005's "two sensor modes" (Thermal IR was already shipped in Fireline/Aftershock); sensors are now enforced per scenario via `availableSensors`.
- **Consequences:** The puzzle now requires reading weather and choosing what to sacrifice. Balance is verified by `tests/passClockAndLiveDownlink.test.ts` and the planner tests. The pass-clock lengths and Aftershock budget still need human playtest tuning.
---
## ADR-007: Hand input — one laser for far targets, the touched object for near ones
- **Date:** 2026-11-08
- **Status:** Accepted (P0-3 of the pre-submission fix list)
- **Context:** Far sector, pad and HUD-button pinches were resolved by an app-side ray from the index fingertip (`fingerDir`), while the laser drawn in the headset is IWSDK's hand ray (`targetRaySpace`). The two point in different directions, so a pinch could act on a neighbour of what the laser showed. In addition, every beacon, pad and cube carried `PokeInteractable`; IWSDK's pointer arbitration (touch > grab > ray, 15/20 cm hysteresis) let the fingertip "touch-hover" a beacon 17 cm away from the seated rest pose, which hid the laser and disabled its pinch.
- **Decision:**
  1. Far presses come only from IWSDK's hand ray (`pointerType === 'ray'`): beacons and pads via `pointerdown` listeners, HUD buttons via UIKit `click`. The fingertip-ray branches are removed.
  2. Near presses stay with the app's proximity check, tightened to "on the object": pads 6 cm, beacons 5 cm, cubes 5.5/8.5 cm, scanner 12 cm. When the pinching hand is on something, the laser press of that pinch is ignored.
  3. `PokeInteractable` only on the four UIKit panels (all out of reach when seated), so the laser stays active over the desk and globe. The scanner also lost it: a fingertip poke picked it up without a pinch.
  4. Hover feedback from the same ray: beacons grow, pads grow, HUD buttons thicken their border (`:hover` in `public/ui/*.uikitml`), and a 25 ms tick plays (throttled to 120 ms).
- **Consequences:** What the laser shows is what a far pinch acts on. Verified in IWER only (`tests/e2e-hands-first-proof.mjs`); Quest hand-ray stability, the 5-6 cm near radii and the hover tick level need a headset check. Controllers keep their ray; controller poke on pads and beacons is gone.
- **Amendment (2026-11-08, P1 performance):** item 3 now reads "`PokeInteractable` on nothing". The four panels are out of reach when seated, yet every frame IWSDK's two touch pointers sphere-tested each UIKit element of them, and each test walked the element's whole parent chain (about 130 world-matrix updates per frame, `tests/profile-pointer-tests.mjs`). A near pinch on a HUD button still presses it through the app's 14 cm check; everything else is the laser. Measured with the other P1 pointer changes (hidden panels leave hit-testing; ARIA and each cube are hit-tested through one mesh): mesh ray-casts per frame 133 -> 43, `updateWorldMatrix` calls 816 -> 280, pointer intersection time 6.2 -> 2.3 ms per frame on the desktop profiler. A finger poke without a pinch no longer presses panel buttons.
---
## ADR-008: Headset lobby and a defensive, one-tap VR entry
- **Date:** 2026-11-08
- **Status:** Accepted (P0-6 of the pre-submission fix list)
- **Context:** A Quest visitor went through the cinematic landing (4K skybox, Earth textures, a voice-over MP4), tapped ENTER VR, then waited for `World.create()` to load the game. That load can outlast Chromium's ~5 s user-activation window, so `requestSession()` was skipped and a second button appeared after 2.5 s. IWSDK 1.0.1 `world.launchXR()` also logs and swallows a rejected request (`dist/init/xr.js`), so a failed entry left the player on the flat page with no message.
- **Decision:**
  1. Headset browsers (`OculusBrowser`/`Quest`/Pico/Wolvic in the user agent, or `?headset`) skip the landing. The game loads at once behind a lobby with one ENTER VR button; the tap on it is the user gesture `requestSession()` needs. `?landing` forces the landing. The user agent only picks the first screen; whether VR can start is decided by feature detection (`isSecureContext`, `navigator.xr`, `isSessionSupported('immersive-vr')`), as Meta's browser docs recommend.
  2. Every entry path (lobby, landing ENTER VR, briefing-panel Enter VR) goes through `startImmersiveSession()` in `src/ui/xrEntryOverlay.ts`. It wraps `navigator.xr.requestSession` only for the duration of the synchronous `world.launchXR()` call to observe the promise IWSDK swallows, then waits for IWSDK to adopt the session.
  3. A failure shows a plain message (`src/ui/xrEntryText.ts`, by WebXR error name), what to do, the raw error, TRY AGAIN, and a flat-screen option. Leaving VR from the lobby or landing VR path shows the button again.
- **Risk and safer alternative:** wrapping a browser API is unusual. The wrapper forwards the call unchanged and is removed before `launchXR()` returns; if the property cannot be redefined, the code falls back to watching `world.session` / `world.sessionRequestPending` (no error name, generic message). That fallback alone is the safer alternative if the wrapper ever misbehaves on a headset.
- **Consequences:** Headset visitors download neither the landing scene nor the voice-over. Verified with IWER and headless Chrome only (`tests/e2e-enter-vr.mjs`, `tests/deploy-static-check.mjs`). Not verified on Meta Quest Browser: the real activation rules, permission prompts, the coexistence of IWSDK's `offerSession` (`xr.offer: "always"`) with our `requestSession`, and how long the lobby takes to load.
---
## ADR-009: Quest 3 render budget, adaptive quality, one result vocabulary, MR tabletop removed
- **Date:** 2026-11-09
- **Status:** Accepted (P1/P2 of the pre-submission fix list)
- **Context:** The live-play frame cost 163 draw calls and 110k triangles per eye (IWER, seated eye) against the agreed budget of at most 100 draws and 100k triangles. Results were named five ways (ARIA said "S-Rank" while the HUD said "Grade A"; debrief showed GOLD/SILVER and a rank title). A "MR TABLETOP" settings toggle requested `immersive-ar` passthrough, which ADR-003 had ruled out and nobody had tested on a headset.
- **Decisions:**
  1. **Budget per eye:** at most 100 draws and 100k triangles in the Mission Card and live play, measured by `tests/profile-xr-budget.mjs` (per eye = per frame on Quest with multiview; IWER mono counts twice and the probe halves it). Reached with static merges (`mergeStaticMeshesIntoBakedMaterial` bakes colour, glow, roughness and metalness into vertex attributes), one mesh for the globe's sector ribbons and storm caps (`lib/sectorOverlayMesh.ts`), one instanced mesh for the desk gauges, one Points object for the weather, shared materials where the runtime tint was already identical, the cut flood hologram, and fewer tube segments on thin glow toruses. Result: mission card 85 / 93.7k, live play 97 / 97.6k, downlink window 102-104 / 98.2k. The 10 s downlink climax stays 2-4 draws over; its extra draws (uplink beam, pulse rings, Karachi shockwave, laser) are the climax itself.
  2. **Adaptive quality (headset only, always on):** `PerfMonitorSystem` lowers the refresh rate one step (never below 72 Hz) after 4 s below 90% of the display rate, at most once per session, and renders the next session at 0.8 resolution after a session that averaged below 90% of 72 Hz. Foveation stays at three.js's default (maximum). `?perf=1` shows FPS avg / 1% low, frame time, draws and triangles per eye, JS heap, texture memory and a 60 s summary.
  3. **One result vocabulary:** `src/mission/resultLabels.ts` (MISSION SUCCESS / PARTIAL SUCCESS / MISSION FAILED + "GRADE S/A/B/C"; storage in "memory blocks"). Certification and mission rank stay in the debrief report for tests and logs but are not shown.
  4. **MR tabletop removed:** the toggle, the `immersive-ar` request and the tabletop panel layout are gone; the stored preference is ignored. This applies ADR-003 instead of reversing it.
- **Consequences:** Multiview on Quest Browser is ASSUMED (IWSDK requests `multiviewStereo`); without it the GPU submits twice the per-eye numbers. The refresh-rate fallback and resolution step are UNVERIFIED on a headset (IWER does not implement `updateTargetFrameRate`).
