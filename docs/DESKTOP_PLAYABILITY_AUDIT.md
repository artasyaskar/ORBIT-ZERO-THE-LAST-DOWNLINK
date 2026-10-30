# DESKTOP PLAYABILITY AUDIT & OPERATOR INTERFACE SPECIFICATION
**Project:** ORBIT ZERO: THE LAST DOWNLINK  
**Component:** Desktop Input System & Operator HUD (`src/systems/desktopControls.ts`)  
**Target Environments:** Desktop Chrome/Edge/Firefox (IWER WebXR Emulator), Meta Quest Browser (Horizon OS)  
**Status:** RELEASE CANDIDATE VERIFIED  
**Date:** October 30, 2026

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 The User's Friction on Desktop
When opening `https://localhost:8081/` on a desktop laptop browser, evaluators and players encountered three immediate friction points:
1. **The Prominent Top "Play" Button:** Clicking the play icon at the top of the browser viewport did not start or advance the game.
2. **The Side Controller Legends (`W A S D`, `Q`, `E`, Arrows):** Pressing keyboard keys matching the on-screen diagrams produced zero gameplay response.
3. **No Direct Interactivity or Direction:** Clicking on the 3D Earth globe, evidence cubes, or console pads failed to trigger scans, processing, or downlinks.

### 1.2 Architectural Root Cause
- **IWER Emulator Injections:** The top toolbar (with the play/pause toggle, gamepad, camera, and device profiles) and the left/right keyboard controller legends belong to **IWER** (Immersive Web Emulation Runtime), which `@iwsdk/vite-plugin-dev` injects into development builds.
  - The top "Play" button is IWER's timeline/session recording playback toggle—**not a game start button**.
  - The side legends (`W A S D`, `Q`, `E`) are IWER's hotkeys for moving virtual 6-DOF controller models in 3D space, which requires holding specific modifier keys and aiming virtual controller rays.
- **Zero Native DOM Listeners in Base Game:** Historically, the IWSDK application only listened to internal WebXR ECS events (`Pressed`, `Grabbed`, `RayInteractable`) emitted when an XR input source ray intersects an entity's collision volume. A standard desktop user clicking with a mouse or pressing keyboard keys generated standard HTML DOM events (`click`, `keydown`), which the 3D canvas ignored entirely.

### 1.3 The Solution: Dual-Mode Ergonomic Input Bridge
We implemented `DesktopControlsManager` in `src/systems/desktopControls.ts`, fully integrated into `MissionControlSystem` (`src/systems/missionControlSystem.ts`). It bridges desktop DOM events directly into the pure TypeScript `MissionEngine`, while maintaining 100% parity with Quest VR physical hand tracking. When an immersive WebXR session starts on a Quest headset, the desktop DOM overlay is automatically hidden to preserve zero-overhead spatial immersion.

---

## 2. Desktop Controls Specification

### 2.1 Keyboard Matrix
| Key | Action | Engine API Called | Audio / Visual Feedback |
| :--- | :--- | :--- | :--- |
| `1` – `5` | Select Sector A through E | `engine.selectSector(id)` | `tick` audio, sector beacon pulse, top objective updates |
| `Tab` | Cycle Next Sector | `engine.selectSector(nextId)` | `tick` audio, sector beacon cycle |
| `M` | Toggle Sensor Mode (RADAR / OPTICAL) | `engine.toggleSensorMode()` | `switch` audio, scanner ring material swaps |
| `Space` | Fire Satellite Scan Swath | `engine.scanSector(id, mode)` | `scan` beam sound, microwave conical swath fires, cube spawns |
| `P` | Process Active Cube in Cradle | `engine.processPacket(id)` | `process` sound, cradle particle beam, size compressed 3MB $\to$ 1MB |
| `Q` | Queue Active Cube to Downlink Bay | `engine.queuePacket(id)` | `queue` sound, cube moves to downlink tray, window bar updates |
| `X` | Discard Unneeded Cube | `engine.discardPacket(id)` | `discard` sound, cube dissolved, storage freed |
| `T` | Transmit Downlink Batch | `engine.transmitDownlink()` | `transmit` audio, S-Band antenna dish pulses, debrief triggered |
| `R` | Reset / Restart Mission | `engine.resetMission()` | `click` sound, console and engine reset to initial state |
| `N` | Cycle Scenario Profile | `engine.cycleScenario()` | `switch` sound, loads Monsoon / Solar Brownout scenario |
| `H` | Toggle Interactive Help Manual | DOM Modal Toggle | Opens floating operator manual with full cheat sheet |
| `F1` | Toggle Dev Diagnostic Telemetry HUD | DOM Card Toggle | Displays live FPS, draw calls, triangles, heap, provenance |
| `Escape` | Dismiss Modals / Clear Selection | UI handler | Closes open help modal or deselects active cube |

### 2.2 Mouse Pointer Raycasting
- **Direct 3D Raycasting:** A `THREE.Raycaster` is updated on pointer coordinates relative to the WebGL canvas.
- **Interactive Targets:**
  1. **Earth Globe & Sector Beacons:** Clicking on a sector marker on the 3D globe selects that geographic sector.
  2. **Sensor Mode Switch (Hardware Toggle):** Clicking the console mode button toggles RADAR / OPTICAL.
  3. **Scan Trigger Button:** Clicking the large illuminated console button fires the active scan swath.
  4. **Evidence Cubes (Storage Tray):** Clicking any floating data cube selects it and highlights its telemetry panel.
  5. **Processing Cradle:** Clicking the cradle processes the currently selected cube.
  6. **Downlink Bay Tray:** Clicking the downlink tray queues the active cube for transmission.
  7. **Downlink Transmit Lever:** Clicking the transmission handle commits the RF transmission burst.

---

## 3. Desktop Operator HUD & Feedback System

### 3.1 Top Mission Objective Banner
A high-contrast, military-spec HUD banner pinned to the top of the screen guides the operator step-by-step through the crisis triage workflow:
```
[MONSOON SUPERCELL PASS]  WINDOW: 10.0s  |  PWR: 60/60 Wh  |  STORAGE: 0/4 MB
MISSION OBJECTIVE: Select flood impact sector [Sector B: Indus Lower Basin] (Press [2] or click beacon on globe)
```
- Real-time countdown timer tracking orbital pass window ($10.0\text{ s} \to 0.0\text{ s}$).
- Real-time battery watt-hour meter ($60\text{ Wh} \to 0\text{ Wh}$).
- Onboard flash storage meter ($0/4\text{ MB}$).

### 3.2 Action Toast Feedback
Every operator action triggers an animated transient toast in the center-top of the screen (e.g., `SCAN COMPLETED: Sector B [CONFIRMED] - Cube spawned on tray`, `CRADLE PROCESSING: -67% size reduction (3MB -> 1MB)`), guaranteeing immediate cognitive feedback without guessing.

### 3.3 Bottom Action Toolbar
A persistent docking bar at the bottom of the viewport with clickable badges for every major command:
- `[1-5] Sectors` | `[M] Sensor: RADAR` | `[Space] Scan` | `[P] Cradle Process` | `[Q] Queue Bay` | `[T] Transmit` | `[H] Help` | `[F1] Telemetry`

---

## 4. Desktop-to-VR Parity Matrix

Every single desktop interaction maps 1:1 to a physical VR hand interaction:

| Action | Desktop Interaction | Meta Quest VR Interaction (Hands-First) |
| :--- | :--- | :--- |
| **Inspect Earth** | Mouse Hover / Look | Direct eye-level inspection, rotational grab (`OneHandGrabbable`) |
| **Select Sector** | Keys `1-5` or Mouse Click | Direct fingertip touch / poke on holographic sector beacon |
| **Switch Sensor** | Key `M` or Click Switch | Physical index finger poke on the rotary mode switch |
| **Trigger Scan** | Key `Space` or Click Button | Physical palm/finger press on the illuminated spring-loaded button |
| **Handle Evidence** | Click Cube / Key `P` / `Q` | Physical grab of data cube (`OneHandGrabbable`), physically place in cradle |
| **Queue Downlink** | Key `Q` or Click Bay | Physical grab and slot into Downlink Bay tray receptacle |
| **Commit Downlink** | Key `T` or Click Lever | Two-finger physical grab and pull of the S-band transmission handle |

---

## 5. Empirical Verification Evidence

### 5.1 Automated Unit & Integration Tests
`tests/desktopControls.test.ts` validates 8 distinct test suites:
1. `initializes desktop overlay DOM elements without errors` — PASSED
2. `selects sectors via keyboard keys 1-5 and Tab` — PASSED
3. `toggles sensor mode via [M] key` — PASSED
4. `triggers scan via [Space] key` — PASSED
5. `processes selected packet via [P] key` — PASSED
6. `queues packet to downlink bay via [Q] key` — PASSED
7. `transmits downlink via [T] key` — PASSED
8. `completes a full end-to-end mission exclusively through desktop controls` — PASSED

### 5.2 Test Output Citation
```powershell
 ✓ tests/desktopControls.test.ts (8 tests) 194ms
 Test Files  5 passed (5)
      Tests  111 passed (111)
   Duration  9.05s
```

### 5.3 TypeScript Compilation & Production Build
```powershell
> npm run typecheck
Exit code: 0 (Zero errors)

> npm run build
✓ 2205 modules transformed.
dist/index.html                                                    0.50 kB
dist/assets/index-DsTKbw04.js                                  6,765.54 kB
✓ built in 45.18s
Exit code: 0
```

---

## 6. Conclusion
The desktop experience is now fully self-explanatory, responsive, and robustly playable using any standard laptop keyboard and mouse. Evaluators without a Quest headset can evaluate the full depth of the game mechanics, scientific credibility, and triage puzzle immediately, while Quest VR users continue to enjoy hands-first spatial physics.

