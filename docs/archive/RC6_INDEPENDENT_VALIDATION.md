# RC6: INDEPENDENT GAMEPLAY, INTERACTION & SCIENTIFIC AUDIT
**Project:** ORBIT ZERO: THE LAST DOWNLINK  
**Release Candidate:** RC6 (Gameplay Depth & Interaction Quality Gate)  
**Role:** Independent Senior VR Game Director, Gameplay Systems Architect & Lead Interaction Engineer  
**Date:** October 31, 2026  
**Status:** PHASE 0 BASELINE AUDIT COMPLETE (Gated Prior to Mutation)  
**Repository State:** Branch `main`, Commit `e167cea` (Clean, Synced with Remote)  

---

## 1. Executive Summary: The Core Question

> *"Would someone genuinely enjoy playing ORBIT ZERO, even if the developer were not present to explain it?"*

### The Adversarial Verdict
In RC5, the project successfully moved away from "giving away the answers in text" and added spatial cursor tooltips. However, when evaluating the application as a competition-level VR game against ~5,000 global developers, **the current desktop experience remains a raycast point-and-click simulator, rather than a tactile spatial strategy game**.

While Meta Quest XR hand tracking features physical grabbing and drop envelopes (`OneHandGrabbable`, `PROCESS_CRADLE_WORLD`, `DOWNLINK_BAY_POSITIONS`), **desktop players cannot drag cubes, cannot rotate or inspect evidence objects, and cannot unqueue packets once placed in the bay**. Furthermore, scientific telemetry still bundles atmospheric optical effects with microwave radar backscatter in a single card, rather than letting players reason about two distinct physical domains.

---

## 2. Phase 0: Verification Audit of RC5 Implementation

Every claimed RC5 capability was inspected in source code, verified via unit/runtime tests, and tested against interactive failure modes.

```
+-------------------------------------------------------------------------------------------------------+
|                                    RC5 FEATURE VERIFICATION MATRIX                                    |
+-------------------------------------------------------------------------------------------------------+
| Verification Item                     | Status            | Empirical Finding & Root Cause            |
+---------------------------------------+-------------------+-------------------------------------------+
| 1. Cursor Tooltips on 3D Objects      | PARTIALLY WORKING | Finds objects via Raycaster, but meshes   |
|                                       |                   | have no 3D hover glow/reaction; 2D only.  |
| 2. Mouse Selection & Manipulation     | BROKEN/DEFICIENT  | Raycast click selects, but NO dragging,   |
|                                       |                   | NO rotation, NO physical manipulation.    |
| 3. Evidence Comparison Logic          | PARTIALLY WORKING | Uses real packets, but blindly compares   |
|                                       |                   | with packets[0] instead of same sector.   |
| 4. Downlink Overflow Math             | VERIFIED ACCURATE | 13.0s vs 10.0s window synchronized 100%   |
|                                       |                   | across engine, MCS, and desktop overlay.  |
| 5. Engine-Driven Downlink & Cutoff    | VERIFIED ACCURATE | Driven by deterministic tickDownlink()    |
|                                       |                   | in simulation loop, not CSS/DOM timer.    |
| 6. Visible Interaction Feedback       | PARTIALLY WORKING | Good toast feedback; lacks 3D mechanical  |
|                                       |                   | button travel on click & 3D error states. |
| 7. Mistake Recovery & Unqueueing      | BROKEN/BLOCKED    | missionEngine.unqueuePacket() exists,     |
|                                       |                   | but is NOT wired to UI or drop zones!     |
| 8. Desktop vs XR Parity               | DISCONNECTED      | XR has physical grabbing; desktop is      |
|                                       |                   | purely raycast clicks. Neither unqueues.  |
+---------------------------------------+-------------------+-------------------------------------------+
```

---

### Deep Dive: The 8 Verification Items

#### Item 1: Spatial Cursor Tooltips vs Real Interactive Objects
- **Inspection (`src/systems/desktopControls.ts:186-215`):**
  - `handlePointerMove` raycasts into `this.host.scene`.
  - Accurately identifies `sector-[a-f]`, `earth-globe`, `scanner-tool`, `pad-*`, `evidence-cube-[1-3]`, and `ProcessingCradle`.
- **Deficiency:**
  - The tooltip is purely a 2D DOM box (`#orbit-zero-hover-tooltip`) following the cursor.
  - The 3D Three.js object underneath **does not change its material emissive intensity, outline, or elevation** during hover. The user sees a cursor change and a floating 2D card, but the 3D cockpit feels static and unresponsive to their physical presence.

#### Item 2: Mouse Selection vs 3D Object Manipulation
- **Inspection (`src/systems/desktopControls.ts:217-254`):**
  - Left-clicking dispatches single raycast clicks (`handlePointerDown`).
  - Clicking a cube calls `selectPacket(id)`.
  - Clicking the cradle calls `processPacket()`.
  - Clicking the bay calls `queuePacket()`.
- **Critical Flaw:**
  - **There is zero mouse dragging.** If a desktop tester or judge clicks on an evidence cube and naturally tries to drag it over to the processing cradle or downlink bay, nothing happens.
  - **There is zero object rotation.** The player cannot click-drag the cube to inspect its six forensic faces (SAR backscatter map, optical RGB frame, SNR graph, provenance stamp), nor can they spin the Earth globe to look at non-facing sectors.
  - This is why the desktop game felt like "just selecting from a menu and pressing keys."

#### Item 3: Evidence Comparison Logic
- **Inspection (`src/systems/desktopControls.ts:1066`):**
  - `const otherPkt = packets.find((p) => p.id !== sel.id);`
- **Deficiency:**
  - When the player has 3 evidence packets (e.g., Sector B Radar, Sector C Optical, Sector C Radar), selecting Sector C Radar pairs it with `packets[0]` (Sector B Radar), comparing two completely different geographic targets!
  - It fails to prioritize comparing **conflicting observations of the same sector** (Sector C Optical vs Sector C Radar), which is where the forensic dilemma actually exists!

#### Item 4: Downlink Overflow Arithmetic
- **Inspection (`src/mission/missionConfig.ts:34-40`, `missionEngine.ts:512-530`):**
  - Sector B (4.5s) + Sector C (4.0s) + Sector E (4.5s) = **13.0s raw transmission duration**.
  - Horizon contact window = **10.0s**.
  - Overflow = **+3.0s**.
  - Compressed packets = $1.8\text{ s} + 4.0\text{ s} + 1.8\text{ s} = \mathbf{7.6\text{ s}} \le 10.0\text{ s}$.
- **Finding:** 100% verified accurate and mathematically consistent across all layers.

#### Item 5: Engine-Driven Downlink Countdown & Loss-of-Signal
- **Inspection (`src/systems/missionControlSystem.ts:758-765`, `src/mission/missionEngine.ts:668-735`):**
  - When `state.phase === 'DOWNLINK'`, each render frame dispatches `{ type: 'TICK', seconds: simulationDelta }`.
  - `missionEngine.tickDownlink()` accumulates transmit seconds, flips packets to `transmitted = true`, and strictly cuts off the link at $10.0\text{ s}$, setting remaining packets to `dropped = true`.
- **Finding:** Verified 100% deterministic and physics-driven. Zero cosmetic animation fakery.

#### Item 6: Interaction Feedback Across States
- **Inspection:**
  - Positive actions generate audio tones (`orbitalAudio.ts`) and green toast notifications.
  - Laser vectorization in the cradle visibly pulses and scales the cube down by 15%.
- **Deficiency:**
  - When an action is rejected (e.g., trying to scan when power is at 0 Wh, or clicking cradle when no packet is selected), the 3D console pads do not illuminate in red or emit a mechanical refusal buzz. Only a 2D red banner appears at the screen perimeter.

#### Item 7: Mistake Recovery & The "Unqueue" Black Hole
- **Inspection (`src/mission/missionEngine.ts:545-568`):**
  - `missionEngine.unqueuePacket(packetId)` is fully implemented and tested in unit tests.
- **Critical Flaw:**
  - **`unqueuePacket` is never wired to `desktopControls.ts`!**
  - There is no unqueue button, no keybinding, and pressing [Q] on an already queued packet throws `ALREADY_QUEUED`.
  - In `missionControlSystem.ts:2010`, releasing a grabbed cube in XR outside the bay simply snaps it back into the bay!
  - **Result:** If a player accidentally queues a raw packet and sees the `⚠️ HORIZON CUTOFF` warning, they are trapped. They cannot pull it back to the tray to compress it in the cradle. They are forced to transmit an overflowing queue or discard the packet completely!

#### Item 8: Desktop vs XR Architectural Parity
- **Inspection:**
  - In XR: Grabbing and releasing cubes over 3D coordinates triggers actions.
  - On Desktop: Raycast clicks trigger synthetic actions.
  - **Deficiency:** The mental model is fragmented. An XR player thinks in terms of spatial drop zones; a desktop player thinks in terms of button triggers. Neither platform supports pulling a cube out of the bay back to the tray.

---

## 3. Scientific Realism & Simulation Grounding

The user provided a crucial scientific observation:
> *"Optical cloud attenuation aur SAR backscatter alag physical processes hain. Fixed albedo value ko universal cloud property ya direct radar evidence mat banana."*

### Physical Phenomenological Distinction
In remote sensing, optical observation and microwave SAR interact with completely different physical mechanisms:

```
+---------------------------------------------------------------------------------------------------------+
|                                  PHYSICAL SENSING MECHANISM COMPARISON                                  |
+---------------------------------------------------------------------------------------------------------+
| Domain            | Passive Optical (VIS/NIR: 450 - 850 nm)    | Active Synthetic Aperture Radar (C-Band)|
+-------------------+--------------------------------------------+-----------------------------------------+
| Medium Target     | Cloud Deck (Liquid Droplets)               | Ground Surface & Target Structures      |
| Physical Process  | Mie Scattering (Droplet diameter ~ λ)      | Microwave Specular / Double-Bounce      |
| Parameter Metric  | Cloud Top Albedo (α = 0.65 - 0.88),        | Backscatter Coefficient (σ° in dB),     |
|                   | Optical Thickness (τ > 30 = opaque)        | Dielectric Constant (ε_r), Surface RMS  |
| Information Yield | Multi-spectral color, high spatial res     | Cloud-penetrating geometry, roughness   |
| Vulnerabilities   | Total darkness at night, cloud obscuration | Speckle noise, layover, dihedral flare  |
+-------------------+--------------------------------------------+-----------------------------------------+
```

### Corrections for RC6:
1. **Never conflate Cloud Albedo with Radar Performance:** Cloud albedo belongs exclusively to the **Atmospheric Profile**. Radar penetrates clouds regardless of whether albedo is 70% or 90%.
2. **Explicit Radar Limitations:** Radar is not a "magic wall-hack". In Sector C (Steel Bridge), perpendicular steel girders create a dihedral corner reflection flare that overwhelms the detector with bright glare, masking standing water on the road deck. In Sector E (Shelter Ridge), mountain slope geometry causes side-looking foreshortening and layover.
3. **Explicit Fictional Disclaimers:** All casualty, population, and rescue metrics must continue to be explicitly framed as illustrative procedural parameters of a fictional triage training simulation.

---

## 4. Highest-Impact Recommendations for RC6

To elevate *ORBIT ZERO* from an operational simulator to an award-winning VR experience without rewriting the core engine:

### Recommendation 1: Direct 3D Mouse Drag-and-Drop & Inspection (Desktop)
- Allow desktop players to click-and-drag evidence cubes across the 3D console:
  - Dragging a cube over the **Processing Cradle** highlights the laser guides; dropping it triggers compression.
  - Dragging a cube over the **Downlink Bay** highlights the slot; dropping it queues the packet.
  - Dragging a queued cube **back to the Raw Tray** triggers `unqueuePacket()`, fully solving the mistake recovery trap!
  - Right-click or mouse-wheel drag on a selected cube rotates it in place, allowing the player to inspect its 3D internal holographic structures (bridge span, terrain core, cloud obscuration cap).

### Recommendation 2: Intelligent Multi-Observation Forensic Comparison
- When multiple packets exist, prioritize comparing **same-sector observations** (e.g., Sector C Optical vs Sector C Radar).
- Display a clear side-by-side forensic matrix:
  - Optical: High-res ($0.75\text{ m}$) dry deck surface contrast, but zero penetration if clouds roll in.
  - Radar: Cloud-piercing ($2.2\text{ m}$), but corrupted by dihedral metallic corner flare ($18.5\text{ dB}$ multipath).
- The player reasons: *"Do I trust the radar's metallic glare, or do I wait for an optical clearing?"*

### Recommendation 3: Visceral Downlink Climax & LOS Tension
- During the $10.0\text{ s}$ downlink phase:
  - An illuminated waveguide bar streams glowing energy packets from the Downlink Bay to the S-band feed antenna.
  - A real-time countdown progress bar shows the approaching horizon cutoff.
  - When an uncompressed packet overflows the $10.0\text{ s}$ mark, the carrier tone drops to static, the waveguide turns amber/red, and the HUD stamps `[DROPPED: HORIZON LOSS-OF-SIGNAL]`.
  - The consequences of greedy play are visually and aurally undeniable.

### Recommendation 4: First-Time Player Discovery Protocol
- Ensure a completely unassisted first-time player can understand the loop in $< 10\text{ seconds}$ through:
  - Prominent 3D console glow guides (pulsing subtle cyan on the active step).
  - Clean three-step guidance: `1. TARGET SECTOR` $\to$ `2. ACQUIRE EVIDENCE` $\to$ `3. STAGE DOWNLINK`.

---

## 5. Verification Gate & Next Steps

This Phase 0 audit is complete and committed to documentation. No codebase modifications will occur until this audit and the recommended 4 priorities are reviewed.

**Next Immediate Actions (upon user green light):**
1. Implement desktop 3D mouse drag-and-drop and unqueue drop-zone recovery in `src/systems/desktopControls.ts`.
2. Enhance 3D object hover glow and tactile button depression in `src/scene-assets/tactileHardware.scene-asset.ts` and `desktopControls.ts`.
3. Upgrade the Forensic Comparison Matrix to intelligently pair matching sector observations with corrected atmospheric vs radar physics.
4. Enhance the real-time downlink transmission visualization.
5. Re-verify full test suites (`npm test`, `npm run typecheck`, `npm run build`, `node tests/e2e-runtime.mjs`).

