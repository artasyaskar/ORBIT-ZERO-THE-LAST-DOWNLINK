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
| **5. Quest 3 72 FPS Budget** | Verified | Live XR scene cut from `85–104` draw calls/eye (`170–208` stereo) and `84k–98k` triangles/eye (`169k–196k` stereo) down to **`41–49` draw calls and `29,480–34,330` triangles per eye** (`<= 50` draws / `<= 35k` tris budget), zero per-frame allocations in the XR hand loop, fixed foveation (`setFoveation(1)`), and automatic frame-rate/pixel-ratio fallback (`src/systems/perfMonitor.ts`). |
| **6. No Fake Eye Tracking / Haptics** | Verified | Head-direction (`gazeAssist`) uses `camera` world quaternion; hand interactions rely on visual scale/emissive feedback + procedural spatial audio ticks, chirps, magnetic snaps, and combo stingers. |

---

## 3. Quick Start & Verification Commands

### Install & Run Locally
```powershell
npm install
npm run dev:runtime
```

### Typecheck, Unit Tests & Production Build
```powershell
npm run typecheck
npm test
npm run build
```

### Automated Playwright + IWER Quest 3 E2E Verification Suites
```powershell
npm run test:hands-first   # Completes full mission pass via visible hand laser + pinch + scanner + cube carry
npm run test:enter-vr      # Verifies Quest Browser lobby, 1-tap VR entry, permission retry, and re-entry
npm run test:judge-fit     # Verifies seated/standing auto-fit, RECENTER, and 0.00s pause clock drift
npm run test:controllers   # Verifies full controller ray + trigger fallback playability
npm run test:desktop       # Verifies desktop HUD, keyboard/mouse controls, and debrief consistency
npm run test:deploy        # Verifies built dist/ at root and GitHub Pages sub-path
```

### Live Performance HUD (`?perf=1` or Two-Hand Pinch Hold)
Append `?perf=1` to the URL (or hold **both hands pinched for 1.2 seconds** with empty hands inside VR) to toggle the live telemetry readout showing:
- Average FPS, 1% low FPS, and frame time (ms)
- Draw calls and triangles **per eye** (with multiview status)
- Active shader programs, textures, JS heap (MB), and 60-second `[perf] 60s summary` console line.

---

## 4. Key Documentation
- [`docs/AUDIT.md`](docs/AUDIT.md) — Ranked audit findings, before/after scorecard, per-frame allocation fixes, and full `input -> gameplay state -> UI -> audio -> save -> feedback` Connection Map.
- [`docs/HEADSET_SESSION_CHECKLIST.md`](docs/HEADSET_SESSION_CHECKLIST.md) — Step-by-step 60–90 minute physical Meta Quest 3 verification checklist.
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — GitHub Pages deployment setup (`Settings -> Pages -> Source: GitHub Actions`) and live URL smoke test.
- [`docs/DEVPOST_SUBMISSION.md`](docs/DEVPOST_SUBMISSION.md) — Submission tagline, description, and 2:30 real-footage demo video script.

