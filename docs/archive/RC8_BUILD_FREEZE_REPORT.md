# ORBIT ZERO: THE LAST DOWNLINK
# Release Candidate 8 (RC8): Build Freeze & Human Testing Readiness Report

**Freeze Date:** October 31, 2026  
**Document Class:** Software Milestone Freeze & Test Readiness Verification  
**Freeze Commit:** `8272697` + Testing Plan Corrections  
**Target Platform:** Meta Quest Browser (Horizon OS) & Desktop WebXR Demonstration  
**Competition Track:** Gaming Track, New Experience Division (Meta VR Start Developer Competition 2026)  
**Status:** **FEATURE FREEZE ACTIVE** — Zero new mechanics or scope expansion permitted.  

---

## 1. Feature Freeze Declaration

In accordance with strict engineering discipline and the product strategy directive, **all gameplay feature additions are officially frozen at Commit `8272697`**.

### Freeze Scope Boundaries:
- **No New Gameplay Mechanics:** No additional sensors, mini-games, secondary satellites, orbital physics maneuvers, or LLM/AI APIs.
- **Protected Resources:** The remaining schedule before the hard deadline (**November 18, 2026 @ 12:00 PM PST / November 19, 2026 @ 01:00 AM PKT**) is strictly reserved for:
  1. Conducting 3 unassisted human playtests and gathering unprimed player feedback.
  2. Physical Meta Quest 3/3S hardware ergonomics and hand-tracking verification.
  3. Fixing highest-friction defects and points of confusion identified by human testers.
  4. Recording high-impact competition video demonstrations and polishing the submission dossier.

---

## 2. Verification of Current Frozen Build

Every verification check was executed directly against the clean frozen tree:

| Verification Pipeline | Exact Command Executed | Observed Result | Status |
|:---|:---|:---|:---:|
| **Git Working Tree** | `git status` | Clean, 0 uncommitted changes, synced with `origin/main` | **VERIFIED** |
| **Unit Test Suite** | `npm test` (`vitest run`) | **117 passed (117 total, 100%)** across 5 test suites in $3.71\text{ s}$ | **VERIFIED** |
| **TypeScript Typecheck** | `npm run typecheck` (`tsc --noEmit`) | **0 errors, clean exit code 0** | **VERIFIED** |
| **Production Rollup Build** | `npm run build` | Built in $16.25\text{ s}$; all chunks resolved; 0 build failures | **VERIFIED** |
| **Unassisted First-Time Player** | `node tests/rc8-first-time-player.mjs` | Completed 12 real DOM actions from launch to debrief in $24.66\text{ s}$; 0 failures | **VERIFIED** |
| **GPU Draw Calls** | `node tests/e2e-runtime.mjs` | **142 draw calls** (Target: $< 150$ on Quest 3) | **VERIFIED** |
| **Geometry Complexity** | `node tests/e2e-runtime.mjs` | **73,708 triangles** (Target: $< 100,000$ on Quest 3) | **VERIFIED** |
| **Texture Units** | `node tests/e2e-runtime.mjs` | **16 textures** | **VERIFIED** |
| **Console Errors / Network** | Playwright runtime listener | **0 page errors, 0 console errors, 0 failed asset requests** | **VERIFIED** |
| **Restart Mechanism** | `DesktopControlsManager.restartMission()` | Cleanly resets engine state, tutorial step to `'INTRO'`, and UI banner | **VERIFIED** |

---

## 3. How to Launch the Frozen Build for Testing

### A. Local Desktop Playtesting (Recommended for Initial Usability):
In Windows PowerShell (inside `d:\ORBIT-ZERO-THE-LAST-DOWNLINK`):
```powershell
npm run preview -- --host 127.0.0.1 --port 8081
```
Open Chrome or Edge and navigate to:
`https://localhost:8081/` *(Accept self-signed SSL warning)*.

### B. LAN Access for Physical Meta Quest or Another Device:
Run preview bound to all network interfaces:
```powershell
npm run preview -- --host 0.0.0.0 --port 8081
```
Navigate to `https://<YOUR_LOCAL_PC_IP>:8081/` (e.g. `https://10.5.32.225:8081/`) on the target device.  
*(Important: Test from a smartphone first to verify that your Wi-Fi router does not block peer-to-peer traffic via AP client isolation. If blocked, use a Cloudflare tunnel or localtunnel: `npx cloudflared tunnel --url https://localhost:8081`)*.

---

## 4. Operational Instructions for Conducting the 3 Human Playtests

*Methodology: Neutral moderated usability playtest. Three participants provide exploratory qualitative feedback to discover recurring friction, not statistically representative conclusions.*

### Step 1: Prepare the Station
1. Start the server: `npm run preview -- --host 127.0.0.1 --port 8081`.
2. Open `https://localhost:8081/` in Chrome or Edge, maximize the window, and verify the 3D orbital console and `[COMMENCE CRISIS PASS]` button are visible.
3. Have your copy of [`docs/RC8_PLAYTEST_EXECUTION_GUIDE.md`](RC8_PLAYTEST_EXECUTION_GUIDE.md) ready.

### Step 2: Read the Neutral Opening Script Verbatim (Zero Coaching)
Do **not** explain satellites, sensors, scanning, processing, packet queuing, or the downlink window. Read this exact script:
> *"Welcome to ORBIT ZERO: THE LAST DOWNLINK.*  
>  
> *Please explore the experience and try to complete the mission. Take your time, and interact with anything that looks usable.*  
>  
> *I won't explain the controls or help you during the session because I want to understand how easy the experience is for a new player.*  
>  
> *Please think aloud if something confuses you. There are no wrong answers in this test."*

### Step 3: Observe Silently & Fill Scorecards
- Do not touch the mouse or keyboard.
- Time how long it takes them to understand the crisis and click `COMMENCE CRISIS PASS`.
- Note whether they switch between Optical and Radar based on storm clouds, or if they guess.
- Note whether they discover the `PROCESS [P]` compression button or if they attempt to queue raw packets.
- Note their reaction during the 10.0-second S-Band downlink countdown.
- Do not explain mechanics unless the participant cannot proceed because of a technical failure. Record any assistance given.

### Step 4: Ask the 3 Post-Game Questions & Record Raw Answers
1. *"What was the most interesting or satisfying part of the experience?"*
2. *"What confused, frustrated, or slowed you down?"*
3. *"Would you voluntarily play another mission to try a different strategy or improve your score? Why or why not?"*

---

## 5. Hardware Scope Transparency Statement

- **Empirically Verified on Desktop WebXR (Chromium / D3D11):** UI cards, raycasts, keyboard shortcuts, cradle compression, knapsack downlink, audio synthesis, and debrief verified.
- **Empirically Verified in IWER Emulation:** Meta Quest 3 profile, seated forward reach coordinates ($[0, 1.25, 0.32]\text{ m}$), and hand interaction mode verified.
- **Human Playtest Status:** The facilitation guide and scorecards are ready in [`docs/RC8_PLAYTEST_EXECUTION_GUIDE.md`](RC8_PLAYTEST_EXECUTION_GUIDE.md). **Zero human results are fabricated.** Testing with the 3 real human participants is ready to begin.
- **Physical Meta Quest Hardware Status:** Step-by-step Quest verification checklist authored in [`docs/RC8_QUEST_DEVICE_TEST_CHECKLIST.md`](RC8_QUEST_DEVICE_TEST_CHECKLIST.md). Physical on-headset hand tracking and 72 FPS stability remain **unverified on physical hardware** until tested on a physical headset.
