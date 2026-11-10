# ORBIT ZERO: THE LAST DOWNLINK

> *"Every scan costs something. Every packet competes for the last downlink. Your job is to send the right evidence before the window closes."*

**ORBIT ZERO: THE LAST DOWNLINK** is a seated, hands-first WebXR spatial strategy and emergency-intelligence triage puzzle game built for the **Meta VR Start Developer Competition 2026** (**Gaming Track — New Experience Division**).

---

## 1. One-Sentence Pitch & 30-Second Core Loop

- **One-Sentence Pitch:** Seated in an orbital command cupola with your bare hands, you scan disaster zones through smoke and storm clouds, compress high-value evidence cubes, and pack a 10-second S-band downlink window before your satellite drops below the horizon.
- **30-Second Core Loop:**
  1. **Point & Pinch Sector (0–8s):** Aim your visible hand laser at a glowing disaster sector on the 3D Earth globe (`A–F`), hear Commander ARIA-7 call out its weather and point value, and pinch to lock it.
  2. **Match Sensor & Fire Swath (8–16s):** Toggle the sensor (`OPTICAL` for clear skies, `RADAR` for storm clouds, `THERMAL` for wildfire smoke) and pinch the **FIRE SWATH** plunger (or grab the handheld scanner tool, aim its beam at the beacon, and release) to materialize a 3D Holographic Evidence Cube.
  3. **Compress, Order & Transmit (16–30s):** Pinch-grab `CONFIRMED` or `PROBABLE` cubes from the tray, drop them into the **Amber Processing Cradle** (`-6 Wh`, shrinks transmit time so all three fit the window), slot them in priority order (`Slot 1 -> 2 -> 3`) in the **Downlink Bay**, and pull **TRANSMIT** before the pass clock expires.

---

## 2. Competition Hard Rules Compliance

| Rule | Status | Implementation |
|---|---|---|
| **1. 100% Hands-Only Playable** | Verified | Every interaction from VR entry (`#oz-xr-enter`) to sector selection, sensor switching, scanning, cube carry/drop, pause/resume, and debrief retry/next works with bare hands (visible laser + pinch or near touch) with zero controller or keyboard dependency. |
| **2. Seated & Stationary Ergonomics** | Verified | Automatic seated head-fit (`SEATED_EYE = [0, 1.25, 0.10]`) centers the cockpit to the player's actual seated or standing posture on XR entry and after 3s height shifts, with one-tap `RECENTER` on the desk and briefing panel. |
| **3. Fast Cold Start & Clean Pause/Resume** | Verified | Headset lobby (`src/ui/xrEntryOverlay.ts`) opens straight into a single `ENTER VR` button on Quest Browser (`OculusBrowser` / `Quest`). Quest system menu (`visibilityState: 'visible-blurred' / 'hidden'`), headset removal, and tab switches immediately pause the mission clock, timers, Web Audio, and speech synthesis (`0.00s` clock drift). |
| **4. 100% Original, Zero External Service Dependency** | Verified | Deterministic TypeScript simulation engine (`src/mission/`), procedural 3D hardware (`src/scene-assets/`), procedural Web Audio (`src/systems/orbitalAudio.ts`), and local Web Speech + radio DSP (`src/systems/voiceCommander.ts`). Zero external AI/LLM/satellite APIs required. |
| **5. Quest 3 72 FPS Budget** | Verified (IWER) | Live XR scene tuned from `85–104` draw calls/eye and `84k–98k` tris/eye down to **`39–50` draw calls and `22,934–34,528` triangles per eye** (`<= 50` draws / `<= 35k` tris ceiling across card/play/downlink), zero per-frame allocations in the XR hand loop, fixed foveation (`setFoveation(1)`), and automatic frame-rate/resolution governor (`src/systems/perfMonitor.ts`). **Physical headset FPS requires Quest 3 testing.** |
| **6. No Fake Eye Tracking / Haptics** | Verified | Head-direction (`gazeAssist`) uses `camera` world quaternion; hand interactions rely on visual scale/emissive feedback (including cube hover rim highlights, red `[X]` blocked scan thuds, and `0.65s` cradle follow-through glow) + procedural Web Audio cues. |
| **7. Zero-Backend Retention & Skins** | Verified | Deterministic Daily Seeded Challenge (`DAILY-YYYY-MM-DD`) with bundled offline seasonal Earth context (`src/mission/proceduralCrisis.ts`), local mastery + `bestStreak` persistence (`src/systems/missionProfile.ts`), 4 zero-draw-cost console trim skins (`CYAN`, `AMBER`, `EMERALD`, `CRIMSON`), and shareable debrief Run Codes (`src/ui/debriefText.ts`). |

---

## 3. Controls & Quick Start

- **Meta Quest 3 / Quest Browser:** Open the hosted HTTPS link directly in Quest Browser (`OculusBrowser`), tap **ENTER VR** once, point the hand laser at any glowing sector, and pinch to select/scan/grab.
- **Desktop (Mouse & Keyboard):** Click **Play Desktop**, or append `?game` to skip the landing scene. Keys: `[1-3]` Sensor (`RADAR`/`OPTICAL`/`THERMAL`), click globe to select sector, `[Space]` Scan, `[P]` Compress, `[Q]` Load Bay, `[T]` Transmit, `[V]` Tactical Recon card, `[C]` Campaign / Daily Pass / Console Skins, `[R]` Instant Retry, `[Esc]` Pause.

### Install, Test & Build Locally
```powershell
npm install
npm run dev:runtime
npm run typecheck
npm test              # 354 Vitest unit/simulation tests
npm run build
npm run test:release  # Runs all 9 Playwright + IWER Quest 3 E2E suites
node tests/profile-xr-budget.mjs
```

### Live Performance & Diagnostics HUD (`?perf=1` or Two-Hand Pinch Hold)
Append `?perf=1` to the URL (or hold **both hands pinched for 1.2 seconds** with empty hands inside VR) to toggle the telemetry panel showing FPS avg / 1% low / frame ms, per-eye draws/triangles, active XR input/reference space/features (`XR:` / `FEAT:`), Web Audio state (`AUD:`), heap/textures, and the 60-second summary line.

---

## 4. Key Documentation
- [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) — Product pitch, friction audit, retention design, desktop/VR parity matrix, and implementation plan.
- [`docs/AUDIT.md`](docs/AUDIT.md) — Ranked audit findings, before/after scorecard, per-frame allocation fixes, and full Connection Map.
- [`docs/HEADSET_SESSION_CHECKLIST.md`](docs/HEADSET_SESSION_CHECKLIST.md) — Risk-prioritized 60–90 minute physical Meta Quest 3 verification checklist.
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — GitHub Pages / Vercel static deployment setup and smoke verification.
- [`docs/DEVPOST_SUBMISSION.md`](docs/DEVPOST_SUBMISSION.md) — Competition submission copy and 2:30 real-footage video script.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — Tier 2 post-competition Horizon Store & cloud expansion roadmap.

