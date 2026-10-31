# ORBIT ZERO RC9.0 — PHASE 3 SPECIFICATION
# Diegetic 3D Cockpit Desk & Physical Spring-Loaded Controls (Zero Keyboard Needed)

> **Document Version:** 1.0.0  
> **Target Release:** RC9.0 ("Project IGI / Gameloft Spatial Overhaul")  
> **Status:** APPROVED ARCHITECTURAL SPECIFICATION  
> **Target Hardware:** Meta Quest Browser (Horizon OS, WebXR) & Desktop Chromium  
> **Ergonomic Zone:** Forward Seated Console Envelope ($[y: 0.82\text{m} - 0.96\text{m}, z: -0.38\text{m} - -0.58\text{m}]$)  
> **Interaction Mandate:** 100% Direct 3D Mouse Raycast & WebXR Poke/Pinch (Zero Keyboard Requirement).

---

## 1. Executive Summary & Problem Statement

### 1.1 The Gameplay Defect in RC8.1
In RC8.1, the game presents keyboard prompts throughout the interface:
- *"Press [Space] to Scan"*, *"Press [M] to toggle SAR"*, *"Press [P] to Process"*, *"Press [Q] to Queue"*, *"Press [T] to Transmit"*.
- While desktop hotkeys are convenient for debugging, relying on them as the primary UX completely destroys the spatial immersion expected of a Meta Horizon VR title.
- A player wearing a Meta Quest 3 headset does not have a physical keyboard in front of them; they have hands and controllers.
- Furthermore, on desktop, a user wants to feel like they are interacting with high-tech military hardware by clicking tactile switches, not typing letters on a keyboard.

### 1.2 The RC9.0 Vision: Physical Tactile Command Console
Phase 3 converts every fundamental control into an interactive, diegetic 3D object mounted on the cockpit desk:
1. **Physical 3D Illuminated Rocker Switches:**
   - Left switch: `[OPTICAL 0.75m VIS/NIR - 8Wh]` glowing electric cyan (`#06b6d4`).
   - Right switch: `[ACTIVE SAR 5.4GHz C-BAND - 14Wh]` glowing radar emerald (`#10b981`).
   - Mechanical depression: Depresses $-12\text{mm}$ along the Y-axis with spring-damper recoil and a procedural mechanical micro-switch audio click.
2. **Tactical 3D Swath Plunger Button:**
   - A heavy-duty, spring-loaded industrial plunger `[FIRE SWATH SCAN]`.
   - Surrounded by a safety guard ring that pulses electric amber when a valid target sector is locked.
3. **Diegetic 3D Segmented Arc Gauges:**
   - Replace flat 2D numbers with 3D glowing holographic arc bar meters embedded into the desk surface:
     - **Battery Gauge:** 55 Wh capacity, color shifting from cyan ($> 30\text{Wh}$) to amber ($15 - 30\text{Wh}$) to flashing red ($< 15\text{Wh}$).
     - **Buffer Storage Gauge:** 9 MB solid-state recorder capacity.
     - **Karachi Contact Window Gauge:** 10.0s time budget with a pulsing red warning strip if queued packets exceed 10.0s.
4. **Auto-Collapsed HUD:** 75% of text is purged from 2D cards; side HUD cards are collapsed into micro status badges by default, giving 85% of the viewport to the tactile 3D cockpit.

---

## 2. Console Desk Physical Layout & Spatial Mapping

```
+---------------------------------------------------------------------------------------+
|                                    ORBITAL VIEWPORT                                   |
|                          (Interactive Gimbal Globe & Starfield)                       |
+---------------------------------------------------------------------------------------+
|  LEFT ANCHOR                   CENTER CONSOLE DESK                   RIGHT ANCHOR     |
|  [-0.42, 1.15, -0.48]          [0.00, 0.86, -0.48]                   [+0.42, 1.05, -0.48]
|                                                                                       |
|  [ARIA-7 HOLOGRAPHIC]    +---------------------------------+     [3D DOWNLINK BAY]    |
|  [TACTICAL AVATAR   ]    |       3D DIEGETIC GAUGES        |     | [SLOT 1] [SLOT 2] |
|                          | Battery: [||||||||||] 55 Wh     |     | [SLOT 3]          |
|                          | Storage: [||||||    ] 9 MB      |     +-------------------+
|  [SENSOR SELECTORS  ]    | Window:  [||||||||  ] 10.0s     |     | [TRANSMIT PLUNGER]|
|  +------------------+    +---------------------------------+     | (Protected Guard) |
|  | [OPTICAL] [SAR]  |    |     SWATH TRIGGER PLUNGER       |     +-------------------+
|  +------------------+    |     [  FIRE SWATH SCAN  ]       |                          |
|                          +---------------------------------+                          |
|  [AMBER COMPRESSION ]                                            [DISCARD TRAY]       |
|  [CRADLE (LASER RING]                                            [TRASH RECEPTACLE]   |
+---------------------------------------------------------------------------------------+
```

### 2.1 Ergonomic Seated Reach Validation
- **Desk Surface Height:** $y = 0.85\text{ m}$ to $0.88\text{ m}$ (comfortably below player's eye level $y = 1.25\text{ m}$, preventing visual obstruction of the Earth Globe).
- **Console Forward Depth:** $z = -0.42\text{ m}$ to $-0.52\text{ m}$ (within the optimal $0.35\text{ m} - 0.65\text{ m}$ seated arm reach envelope, accessible without leaning forward).
- **Lateral Spread:** $x = -0.45\text{ m}$ to $+0.45\text{ m}$ (within comfortable $60^\circ$ horizontal cone of vision).

---

## 3. Component & Interaction Mechanics

### 3.1 3D Spring-Loaded Button Physics (`src/scene-assets/cockpit-button.scene-asset.ts`)
Each physical cockpit button implements damped spring physics to provide realistic mechanical tactility:

$$\ddot{y} + 2\zeta\omega_n \dot{y} + \omega_n^2 (y - y_{\text{rest}}) = F_{\text{applied}}$$

- **Parameters:**
  - $y_{\text{rest}} = 0.0\text{ m}$
  - $y_{\text{pressed}} = -0.012\text{ m}$ (12mm physical stroke)
  - Natural frequency $\omega_n = 28.0\text{ rad/s}$
  - Damping ratio $\zeta = 0.72$ (slightly underdamped for a sharp mechanical snap back)
- **State Machine:**
  - `IDLE`: Emissive glow intensity $0.35$.
  - `HOVER` (Mouse over or VR finger within 20mm): Emissive glow ramps to $0.85$, subtle haptic tick ($10\text{ms}$ low intensity).
  - `PRESS` (Raycast click or finger touches cap): Cap snaps down to $-0.012\text{m}$, plays procedural micro-switch click audio, triggers mission engine action.
  - `RELEASE`: Cap springs back with damped oscillation.

### 3.2 Procedural Mechanical Click Sound FX (`src/systems/orbitalAudio.ts`)
Synthesized dynamically via Web Audio API to match the button stroke:
```typescript
export function playMechanicalSwitchClick(ctx: AudioContext, isDepress: boolean): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // Snappy high-frequency microswitch transient (2400Hz -> 400Hz drop)
  osc.type = 'triangle';
  const startFreq = isDepress ? 2400 : 1800;
  const endFreq = isDepress ? 320 : 540;
  osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + 0.018);

  gain.gain.setValueAtTime(0.18, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.022);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.025);
}
```

### 3.3 3D Diegetic Segmented Arc Gauges (`src/scene-assets/desk-gauges.scene-asset.ts`)
Replaces 2D text meters with physical illuminated arc bars embedded into the console desk:
- **Geometry:** Instanced curved segments ($10$ discrete bars per gauge, radius $0.08\text{m}$, segment thickness $2.5\text{mm}$).
- **Material:** `MeshStandardMaterial` with dynamic emissive color:
  - **Battery Meter (10 segments):**
    - 8-10 segments lit: Electric Cyan (`#06b6d4`, healthy $> 44\text{ Wh}$).
    - 4-7 segments lit: Tactical Amber (`#f59e0b`, nominal $20 - 44\text{ Wh}$).
    - 1-3 segments lit: Pulsing Warning Red (`#ef4444`, critical $< 20\text{ Wh}$).
  - **Karachi Contact Window Gauge (10 segments = 10.0 seconds):**
    - Indicates queued transmission time.
    - If total queued time $> 10.0\text{ s}$, remaining segments flash bright red at $4\text{ Hz}$ accompanied by an audio alert chime.

### 3.4 2D HUD De-cluttering & Minimalist Badge Architecture
- **Purge Text:** Remove extensive narrative paragraphs from `#recon-card` and `#compare-card`.
- **Default State:** Auto-collapse side panels into compact $36\text{px}$ high tactical status badges docked at the screen edges.
- **On-Demand Inspection:** Clicking a status badge smoothly slides out a compact aerospace readout for deep inspection without ever obscuring the 3D globe.

---

## 4. Advanced Recommendations & Architectural Enhancements

### Recommendation 3.1: Dual Raycast/Poke Hit-Testing Abstraction
To ensure 100% feature parity between Desktop (mouse raycast) and WebXR (Quest 3 index finger poke):
- Implement `SpatialInteractableComponent` on all buttons:
  - Stores bounding box $[x_{\min}, x_{\max}, y_{\min}, y_{\max}, z_{\min}, z_{\max}]$.
  - Supports both `onPointerDown` (raycast) and `onColliderEnter` (hand joint collision).
  - Fires the identical `dispatch(action)` command to `missionControlSystem.ts`.

### Recommendation 3.2: Illuminated Indicator Legends with Stencil Text
Instead of plain colored blocks, stamp stencil text directly onto button surfaces:
- `OPT` / `8 Wh` engraved in luminescent cyan.
- `SAR` / `14 Wh` engraved in luminescent emerald.
- `SCAN` engraved in emergency hazard amber.

### Recommendation 3.3: Tactical Button Lockout Logic
If the player attempts to press `[FIRE SWATH SCAN]` when battery is insufficient ($< 8\text{ Wh}$) or no sector is targeted:
- Button refuses to depress.
- Safety ring flashes warning amber twice.
- Play a dull mechanical lockout buzz (`140 Hz` square wave).
- Commander ARIA-7 speaks: *"Insufficient bus power. Reallocate battery or transmit queued evidence."*

---

## 5. Performance Budget & Resource Impact

- **Draw Calls:** +3 draw calls (1 Instanced Mesh for gauges, 1 for buttons, 1 for text decals).
- **Triangles:** ~4,200 triangles total for all desk hardware, levers, and gauge segments.
- **CPU Overhead:** $< 0.2\text{ms}$ per frame for spring physics updates.
- **Memory Footprint:** Zero additional texture files; uses procedural canvas textures for button labels.

---

## 6. Verification & Acceptance Gate (Phase 3)

1. **Unit Test Gate:** 117 tests in `src/mission/` must pass without regressions (`npm test`).
2. **E2E Desktop Mouse Interaction Test (`tests/phase3-cockpit-controls.spec.mjs`):**
   - Click `[ACTIVE SAR]` 3D button -> Verify armed sensor switches to `SAR` and button depresses.
   - Click `[FIRE SWATH SCAN]` 3D button -> Verify swath scan fires and battery drops from 55 Wh to 41 Wh.
   - Verify all actions complete without any keyboard keystrokes.
3. **Ergonomic Reach Assertion:** Verify all interactive button centers lie strictly within $0.35\text{m} \le r \le 0.65\text{m}$ of player origin $[0, 1.25, 0]$.

