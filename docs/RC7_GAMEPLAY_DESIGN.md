# ORBIT ZERO: THE LAST DOWNLINK
# RC7: Gameplay Design & Player Decision Architecture

**Date:** October 31, 2026  
**Document Class:** System Design & Player Experience Blueprint  
**Target:** Meta VR Start Developer Competition 2026 (Gaming Track)  
**Author:** Flight Software & Mission Simulation Engineering Team  

---

## 1. Core Philosophy: From Rote Routine to High-Stakes Spatial Triage

The core promise of *ORBIT ZERO: THE LAST DOWNLINK* is:
> *"Every scan costs something. Every packet competes for the last downlink. Your job is to send the right evidence before the window closes."*

In prior release candidates (RC1–RC4), automated test suites verified that state transitions succeeded, but the human experience felt too much like a rigid checklist: select Sector B, select Radar, fire, process, queue.

In **Release Candidate 7 (RC7)**, the game mechanics are reframed around **genuine player agency, tactical trade-offs, and forensic interpretation**. The player is not an automated script running through pre-programmed steps; they are an **Emergency Orbital Operator** managing a low-Earth orbit satellite during an extreme climate crisis.

---

## 2. The Decision Architecture: Multi-Path Resource Constraints

Players face three interlocking constraints that cannot all be maximized simultaneously:
1. **The Energy Budget ($40\text{ Wh}$):** Finite onboard battery.
2. **The Horizon Time Budget ($10.0\text{ s}$):** Physical pass duration over the Karachi Downlink Station before line-of-sight (LOS) cutoff.
3. **The Sensor Physics Dilemma:** Wavelength-dependent atmospheric transmission and surface scattering physics.

```
                           [ 40 Wh Battery Budget ]
                                     |
               +---------------------+---------------------+
               |                                           |
     Active Radar Swath (14 Wh)                 Passive Optical Swath (8 Wh)
     • Penetrates clouds (T > 98%)              • Extinguished by clouds (T < 0.001%)
     • Specular water vs dihedral metal         • Sub-meter daylight contrast
               |                                           |
               +---------------------+---------------------+
                                     |
                          [ Raw Telemetry Cube ]
                          3.0 MB / 4.5s TX Time
                                     |
                     +---------------+---------------+
                     |                               |
       Process in Cradle (6 Wh)             Queue Direct to Bay (0 Wh)
       • Feature extraction                 • Preserves 6 Wh battery
       • Compresses to 1.0 MB (1.8s TX)     • Consumes 4.5s of 10.0s window
       • Preserves physical uncertainty     • Heavy knapsack footprint
                     |                               |
                     +---------------+---------------+
                                     |
                       [ 10.0s Downlink Knapsack ]
                     • Total Queued Time <= 10.0s?
                     • Packets past 10.0s lost in orbit
                                     |
                      [ Ground Rescue Consequences ]
                     • Roads diverted, bridges opened
```

### A. The Sensor Selection Dilemma
- **Sector B (East Levee Highway):** Under a 95% convective nimbus storm cloud deck ($\tau > 15$). Optical transmission is $T = e^{-\tau} < 0.001\%$, yielding $0\text{ dB}$ SNR (zero usable surface data). Active C-band SAR ($5.4\text{ GHz}$, $\lambda = 5.55\text{ cm}$) pierces the storm deck ($T > 98\%$), detecting specular forward-scatter ($\sigma^0 < -22\text{ dB}$) from water sheets on the road. SAR costs $14\text{ Wh}$; Optical costs $8\text{ Wh}$.
- **Sector C (Steel Truss Bridge):** Clear skies ($\tau \approx 0.02$, $T \approx 98.02\%$). High-resolution Optical ($0.75\text{ m}$ GSD, $8\text{ Wh}$) clearly verifies dry road asphalt. Active SAR ($14\text{ Wh}$) produces intense dihedral corner multipath glare ($\sigma^0 > +18.5\text{ dB}$) off the steel truss beams, creating ambiguous saturated blooms that mask deck flooding.
- **Player Decision:** If the player lazily fires Radar everywhere, they waste battery ($14\text{ Wh}$ vs $8\text{ Wh}$) and receive ambiguous glare over metal structures. If they fire Optical under storms, they receive worthless black frames.

### B. The Processing vs. Downlink Knapsack Trade-off
- **Raw Telemetry:**
  - Storage cost: $3.0\text{ MB}$
  - Downlink transmission time: $4.5\text{ s}$ ($45\%$ of total contact window!)
- **Onboard AI Feature Extraction (Cradle):**
  - Energy cost: $6\text{ Wh}$
  - Compressed storage: $1.0\text{ MB}$
  - Downlink transmission time: $1.8\text{ s}$
- **Player Dilemma:**
  - With $40\text{ Wh}$ battery:
    - Firing 3 SAR scans costs $3 \times 14 = 42\text{ Wh} \implies$ **Battery brownout!**
    - Firing 2 SAR scans ($28\text{ Wh}$) + 1 Optical scan ($8\text{ Wh}$) costs $36\text{ Wh}$, leaving only $4\text{ Wh}$.
    - Since Cradle compression costs $6\text{ Wh}$, the player can only afford to compress **some** packets!
    - If they queue raw packets, $4.5\text{ s} + 4.5\text{ s} + 4.5\text{ s} = 13.5\text{ s} > 10.0\text{ s} \implies$ **The 3rd packet drops at LOS cutoff!**
  - The player must strategically decide which packets to compress and which to downlink raw or triage.

---

## 3. First-Time Player Experience & Narrative Framing

### Phase 1: Crisis Briefing (`INTRO`)
The player is greeted by an immediate, urgent operational briefing:
- **Disaster Context:** A Category 4 Monsoon supercell has breached river levees in Sindh, Pakistan. 120,000 residents are cut off by rising waters.
- **Clear Call to Action:** Prominent `[COMMENCE CRISIS PASS [Enter / Click]]` button puts the operator in control.
- **Physical Console Presence:** Floating in a low-Earth orbit glass cupola, with Earth rotating beneath them and holographic telemetry cards flanking the viewport.

### Phase 2: Guided Tactical Triage (`OPERATIONS`)
Rather than telling the player "Click B, click Radar", the HUD frames tactical dilemmas:
- **Step 1 (Triage Evaluation):** Compares Sector B (East Levee, storm occluded) with Sector C (Bridge Crossing, clear sky).
- **Step 2 (Sensor Trade-off):** Details photon extinction ($T < 0.001\%$) vs. microwave penetration ($T > 98\%$).
- **Step 3 (Acquire Swath):** Satellite emits focused radar beam; evidence cube materializes on console tray.
- **Step 4 (Forensic Interpretation):** Knapsack dilemma displayed immediately: raw SAR packet takes $4.5\text{ s}$ ($45\%$ of pass).
- **Step 5 (Strategic Compression):** Explains feature extraction; demonstrates time savings while reinforcing that compression does not invent missing evidence.
- **Step 6 (Downlink Staging):** Stages packet into bay; shows remaining contact window margin.
- **Step 7 (Free Triage):** Player has time and power remaining to evaluate Sector C and optimize their final rescue score.

### Phase 3: The Downlink Climax (`DOWNLINK`)
- High-tension carrier stream with live S-Band link status ($2205.5\text{ MHz}$, $18.4\text{ dB}$ SNR).
- Dynamic countdown to Loss of Signal (LOS).
- Visual pipeline tracking each packet: `TRANSMITTED ✓` (green), `STREAMING 📡` (cyan), `QUEUED ⏳` (yellow), or `LOS RISK ⚠️` (red).

### Phase 4: Ground Rescue Accountability (`DEBRIEF`)
- Direct consequence reporting:
  - **REQ 1 (Road Inundation):** Convoys rerouted away from $2.4\text{ km}$ submerged levee highway.
  - **REQ 2 (Bridge Approach):** Rescue teams cleared to send heavy engineering equipment across verified bridge.
  - **REQ 3 (Shelter Basin):** High-ground school evacuation site confirmed dry.
- Telemetry Delivery Accounting:
  - Shows delivered packets vs dropped or retained packets.
  - Explains counterfactual choices: what would have happened if different sensors were chosen or compression was neglected.
- Instant replayability: `[RESTART PASS [R]]` and `[NEXT PASS [N]]`.

---

## 4. Hardware Scope & Verification Transparency

| Verification Domain | Verification Mechanism | Status |
|:---|:---|:---|
| Pure Simulation Logic | Vitest unit test suite (117 tests) | **Empirically Verified** (100% pass) |
| TypeScript Types | `tsc --noEmit` compiler | **Empirically Verified** (0 errors) |
| WebXR Asset Pipeline | Vite production rollup build | **Empirically Verified** (15.85s build) |
| Desktop Controls & HUD | Playwright / Chromium with D3D11 GPU | **Empirically Verified** (11/11 flows) |
| Seated Airplane Envelope | 3D coordinate analysis ($0.35\text{--}0.65\text{ m}$) | **Design Compliant** |
| Physical Quest Hand Tracking | Meta Quest 3/3S Horizon OS Browser | **Unverified on Physical Hardware** (Requires developer headset) |
