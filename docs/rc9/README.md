# ORBIT ZERO RC9.0: "PROJECT IGI / GAMELOFT SPATIAL OVERHAUL"
## Master Architectural Blueprint & Phase Execution Roadmap

> **Meta VR Start Developer Competition 2026** (Gaming Track — New Experience Division)  
> **Target Platform:** Meta Quest Browser (Horizon OS, WebXR) & Desktop Chromium  
> **Core Promise:** *"Every scan costs something. Every packet competes for the last downlink. Your job is to send the right evidence before the window closes."*

---

## 1. Executive Overview

This master document synthesizes the **6 Architectural Phases** comprising the **RC9.0 Spatial Overhaul** for *ORBIT ZERO: THE LAST DOWNLINK*. 

Following the user's explicit directive and the strict engineering principles of **Gravitas** (`.agents/skills/gravitas/SKILL.md`) and **Claude Code Best Practice** (`.agents/skills/claude-code-best-practice/SKILL.md`), this architecture transitions ORBIT ZERO from a "2D UI cards on top of 3D scene" prototype into a **fully diegetic, tactile, cinematic aerospace tactical simulator** inspired by classic military tactical titles (*Project IGI*, *Homeworld*, *Ace Combat*, and early Gameloft spatial experiences).

### The Four Pillars of the RC9.0 Overhaul:
1. **Physical Tactility (Zero Keyboard Requirement):** 100% of the game can be completed with a 3D mouse on desktop and with bare hands in WebXR (pinch & poke). All actions operate via physical buttons, switches, and 3D drag-and-drop.
2. **Tactical Voice Commander (Commander ARIA-7):** Eliminates walls of text by delivering tactical briefings, sensor physics coaching, and downlink warnings aloud using procedurally generated military radio DSP (Quindar beeps + VHF squelch bursts).
3. **Living Deep-Space Orbital Environment:** A 2,500-star procedural deep space field, directional solar lighting, cockpit canopy struts, and an interactive 3D Gimbal Globe with physical rotational momentum and smooth zoom.
4. **Inside-Cube Aerospace Holograms:** Visualizes Earth observation physics (optical cloud scattering, radar ground penetration, metal specular multipath glare) directly inside 3D crystal memory cartridges.

---

## 2. Phase Navigation & Execution Matrix

| Phase | Specification Document | Primary Focus | Key Architectural Deliverables |
| :--- | :--- | :--- | :--- |
| **Phase 1** | [`PHASE_1_ORBITAL_COCKPIT_GIMBAL_GLOBE.md`](./PHASE_1_ORBITAL_COCKPIT_GIMBAL_GLOBE.md) | Orbital Viewport & Gimbal Globe | 2,500-starfield (`Points`), 3D cockpit canopy frame, mouse drag inertia, wheel zoom ($0.38\text{m} - 0.85\text{m}$), 3D elevated beacons. |
| **Phase 2** | [`PHASE_2_COMMANDER_ARIA_VOICE_RADIO_DSP.md`](./PHASE_2_COMMANDER_ARIA_VOICE_RADIO_DSP.md) | Voice Commander ARIA-7 & Radio DSP | 3D holographic avatar with audio-reactive waveform rings, Web Audio Quindar beeps (`2525Hz / 2475Hz`), VHF radio squelch, TTS dialogue trees, single-line subtitle bar. |
| **Phase 3** | [`PHASE_3_DIEGETIC_COCKPIT_DESK_PHYSICAL_CONTROLS.md`](./PHASE_3_DIEGETIC_COCKPIT_DESK_PHYSICAL_CONTROLS.md) | Physical Cockpit Console Desk | 3D illuminated rocker switches (`OPT` / `SAR`), spring-loaded swath plunger, 3D segmented arc gauges (Battery, Storage, Downlink Window), auto-collapsed HUD. |
| **Phase 4** | [`PHASE_4_PHYSICAL_DRAG_DROP_CUBES_AEROSPACE_HOLOGRAMS.md`](./PHASE_4_PHYSICAL_DRAG_DROP_CUBES_AEROSPACE_HOLOGRAMS.md) | 3D Drag & Drop Data Cubes & Holograms | Translucent crystal glass cubes with internal 3D micro-holograms (terrain, radar spikes, cloud block), 3D raycast drag plane with magnetic snap, laser compression, unqueue recovery. |
| **Phase 5** | [`PHASE_5_CINEMATIC_DOWNLINK_VR_HAND_SIMULATOR.md`](./PHASE_5_CINEMATIC_DOWNLINK_VR_HAND_SIMULATOR.md) | Cinematic Downlink & VR Hand Simulator | Orbiting CubeSat to Karachi high-intensity telemetry laser, real-time clock drain, in-engine VR Hand & Reach Envelope Debugger (`Key: H` / `?vrSim=1`). |
| **Phase 6** | [`PHASE_6_AUTOMATED_VERIFICATION_GPU_BUDGET_GATE.md`](./PHASE_6_AUTOMATED_VERIFICATION_GPU_BUDGET_GATE.md) | Automated Verification & GPU Budget Gate | 117 passing unit tests, zero-keyboard Playwright E2E automation, strict GPU budget gate ($< 150$ draw calls, $< 100\text{k}$ triangles, 90 FPS on Quest 3). |

---

## 3. Strict Architectural Rules & Discipline

1. **Deterministic Core Preservation:**  
   `src/mission/missionEngine.ts` and `src/mission/missionPlanner.ts` remain pure TypeScript with zero rendering dependencies. All 117 unit tests must pass at every step.
2. **Three.js Import Discipline:**  
   Never `import * as THREE from 'three'`. All Three.js classes and primitives must be imported strictly from `@iwsdk/core`.
3. **Quest 3 Hardware Budget Discipline:**  
   - Total Draw Calls: $\le 150$ (currently 142).
   - Total Triangles: $\le 100,000$ (currently ~48,200).
   - Zero object allocations inside animation / render loops (`tick()`).
4. **Ergonomic Seated Envelope:**  
   All interactive console elements remain strictly within the forward seated envelope:
   $$0.35\text{ m} \le r \le 0.65\text{ m}$$
5. **Phase Execution Discipline:**  
   Each phase must be executed, tested, and verified with empirical evidence before proceeding to the subsequent phase.

