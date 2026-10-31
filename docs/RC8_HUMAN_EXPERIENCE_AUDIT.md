# ORBIT ZERO: THE LAST DOWNLINK
# RC8 Phase 0: Human Experience & First-Time Player Audit

**Date:** October 31, 2026  
**Document Class:** Human Experience & Ergonomics Audit  
**Auditor:** Flight Software & Mission Simulation Engineering  
**Baseline Commit:** `2fce0ec`  

---

## 1. Executive Summary & Personal Human Assessment

Before writing this audit, the development agent played the game from a clean state and critically evaluated the human experience against three questions:

### Question 1: Do you understand what to do without reading a long explanation?
**Honest Answer: No, not yet without effort.**  
When the game opens, the player is confronted with **two competing UI layers at the same physical screen coordinates**:
1. The 3D world-space UIKitML panels (`briefing-panel` on the left, `debrief-panel` on the right) mounted inside the WebXR scene.
2. The 2D DOM overlay cards (`TACTICAL RECONNAISSANCE` on the left, `EVIDENCE TELEMETRY` on the right, and the top banner) floating in front.

Because both layers render simultaneously on desktop, text from the 3D panels bleeds behind the 2D DOM cards. Furthermore, there are 13 buttons on the bottom toolbar, 5 buttons on the left panel, 7 buttons on the right panel, and 4 text cards. A first-time player suffers immediate cognitive overload because there is no clear single focal point.

### Question 2: Do you feel that your decisions matter?
**Honest Answer: Mechanically yes, but experientially only after decoding the clutter.**  
The underlying simulation is rich: choosing active SAR ($14\text{ Wh}$) over optical ($8\text{ Wh}$) to penetrate storm clouds, choosing optical over SAR for metal truss bridges to avoid $+18.5\text{ dB}$ dihedral glare, and calculating whether to spend $6\text{ Wh}$ in the cradle so that $3$ packets fit into the $10.0\text{ s}$ downlink window. These are genuine, high-stakes trade-offs. However, when the UI presents direct technical walls of text, the player feels less like an orbital hero saving 120,000 people and more like a technician filling out forms.

### Question 3: Would you genuinely enjoy playing it again?
**Honest Answer: In its current cluttered state, no; with visual focus and pacing polish, YES.**  
The core loop—**Select Sector -> Arm Sensor -> Fire Swath -> Examine Telemetry Cube -> Compress in Cradle -> Stage to Bay -> Stream before LOS Cutoff**—is inherently compelling. What prevents it from feeling fun right now is lack of visual restraint, text verbosity, and the clash between 3D world-space panels and 2D DOM cards on desktop.

---

## 2. Phase 0 Detailed Inspection Findings (The 7 Questions)

### 1. What the player actually sees when opening the game
- **Visuals:** An orbital space cupola with stars/nebula, a NASA 2K Blue Marble Earth globe slowly rotating in the center, a 3U CubeSat satellite hovering in low Earth orbit, and console hardware on the desk (3 colored evidence cubes, a yellow processing cradle, pad buttons).
- **HUD Clutter:** A 2D top banner (`CRISIS BRIEFING`), a left card (`TACTICAL RECONNAISSANCE`), a right card (`FORENSIC EVIDENCE & DOWNLINK`), and a bottom toolbar with 13 buttons. Behind these float the 3D spatial panels.

### 2. How the player starts the mission
- In RC7, an explicit `[COMMENCE CRISIS PASS [Enter / Click]]` button was introduced on the top banner. This is an improvement over previous builds where the game sat in static standby.
- However, the button sits inside a text-heavy card with 4 lines of briefing, making it less prominent than it should be.

### 3. How the player discovers available interactions
- Interactions are discovered through two conflicting channels:
  1. The top banner prompts ("Step 1: Click Sector B [2]...", "Step 2: Switch to RADAR [M]...").
  2. The bottom toolbar buttons (`A`, `B`, `C`, `RADAR`, `SCAN`, `PROCESS`, `QUEUE`, `TRANSMIT`).
- In desktop mode, clicking directly on 3D console pads (cradle, bay, tray) is supported via raycasting, but there are no visual hover outlines or click affordances on the 3D meshes themselves, so desktop players instinctively rely on the 2D buttons.

### 4. Whether every gameplay mechanic has understandable feedback
- **Scanning:** Excellent audio and visual feedback (swath sound, satellite beam pulse, cube appearing on tray with sound cue).
- **Processing (Cradle):** Clear sound and size reduction from $3.0\text{ MB}$ to $1.0\text{ MB}$.
- **Staging (Bay):** Clear sound and slot assignment.
- **Unqueue:** Works via `[U]`, but lacks an explicit button on the bottom toolbar (it is only mentioned in the helper text).
- **Downlink:** Tension is good, but the streaming progress bar needs higher visual contrast against the background nebula.

### 5. Whether the mission has a meaningful beginning, middle, and ending
- **Beginning:** Good narrative premise (Category 4 supercell, levee breach in Sindh, 120,000 residents trapped).
- **Middle:** Strong tactical tension around energy reserve vs knapsack transmission time.
- **Ending:** The Ground Rescue Impact debrief connects telemetry directly to convoy survival, which is satisfying. However, the debrief screen is cramped and overlaps the underlying 3D debrief panel.

### 6. Whether the game can be completed using desktop controls without developer assistance
- **Yes**, the game is 100% completable via desktop controls (mouse clicks on 2D HUD or keyboard shortcuts `1-5`, `M`, `Space`, `P`, `Q`, `T`, `R`).
- However, a player who does not read English fluently would struggle because the visual cues are heavily text-dependent rather than icon/color-driven.

### 7. Whether IWER interaction paths are genuinely functional
- IWER emulation initializes properly with Meta Quest 3 hand profile.
- Ray interactions and spatial panel clicks function correctly in emulation.
- Physical hand-tracking pinch and tactile grab on real hardware remain **unverified** without physical Quest hardware.

---

## 3. High-Priority Action Items for RC8

1. **Eliminate Desktop Dual-UI Overlap:** On desktop mode, hide or dim the background 3D UIKitML panels so they do not clash with the high-resolution 2D DOM cards, OR reposition the 2D cards cleanly to frame the 3D view like a real spaceship viewport HUD.
2. **Scientific & Terminology Corrections:**
   - Remove `0% SNR` -> replace with `SNR < 0 dB (Complete Droplet Washout)`.
   - Add explicit `[Simulated Telemetry]` tag to S-Band radio metrics.
   - Add explicit `[Simulated Scenario Outcome]` tag to ground rescue consequences.
3. **Pacing & Readability Polish:**
   - Shorten long text paragraphs into crisp tactical bullets.
   - Add an explicit `UNQUEUE [U]` button to the bottom toolbar so players don't have to guess keyboard shortcuts.
   - Increase contrast of the downlink countdown timer and streaming progress.
