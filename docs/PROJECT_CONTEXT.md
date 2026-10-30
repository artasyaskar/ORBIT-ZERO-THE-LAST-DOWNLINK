# PROJECT CONTEXT — ORBIT ZERO: THE LAST DOWNLINK

*Last updated: 2026-10-28*

## 1. Product Vision & Core Premise
**ORBIT ZERO: THE LAST DOWNLINK** is a seated, hands-first spatial strategy game built for the **Meta VR Start Developer Competition 2026 (Gaming Track, New Experience Division)**.

> **Core Promise:** *"Every scan costs something. Every packet competes for the last downlink. Your job is to send the right evidence before the window closes."*

### The Narrative & Problem Space
A fictional district in a flood-affected Indus-basin region faces an urgent emergency. Ground response teams have **three critical unanswered questions**:
1. **Request 1 (Access Road Status):** Which primary access road is flooded and impassable?
2. **Request 2 (Crossing Viability):** Which river crossing/bridge is most likely to remain structurally passable?
3. **Request 3 (Shelter Route Verification):** Which route to the designated emergency shelter requires immediate hazard verification?

The player operates an orbital observation and data-triage console aboard a CubeSat / small Earth-observation mission making a single pass over **six distinct terrain sectors** on a miniature 3D Earth globe. Because onboard **power**, **data storage**, and **ground-station downlink time** are strictly limited—and because cloud cover and sensor geometry introduce uncertainty—collecting more images does not guarantee mission success. The player must physically scan, inspect, process, and prioritize the smallest high-confidence evidence package before the communication window closes.

---

## 2. Target Player & Experience Goals
- **Target Audience:** Meta Quest players and competition judges looking for an intuitive, tactile, controller-free strategy/puzzle experience that feels native to spatial computing.
- **Session Length:** **4 to 6 minutes** per complete mission ("one bus stop test": cold start to satisfying conclusion in under 10 minutes, with instant one-pinch replay).
- **Physical Posture:** **Seated, stationary ("airplane seat test")**. Every interaction occurs within a comfortable 0.35 m – 0.65 m forward desktop/console envelope (`< 2 ft` radius), requiring zero roomscale movement or awkward overhead reaching.
- **Opening Hook ("First Five Minutes"):** Zero walls of text. Within 15 seconds, the player sees the miniature 3D flood basin, hears the emergency alert, views the three visual request cards, and grabs the physical scanner tool to take their first observation.

---

## 3. Core Gameplay Loop
`SCAN → INTERPRET → PROCESS → PRIORITIZE → TRANSMIT → REVIEW`

1. **Briefing (See the Problem):** Three visual request cards display target questions, required evidence type, and minimum confidence threshold (`Confirmed` vs. `Probable`).
2. **Scan (Choose What to Observe):** The player grabs the physical sensor tool, selects between **Optical** and **Radar (SAR-inspired)** modes, and scans sectors on the rotatable 3D Earth globe. Each scan consumes **Power** and spawns a tangible **3D Data Cube** occupying **Onboard Storage**.
3. **Interpret & Process (Triage Evidence):** The player grabs and rotates each Data Cube to inspect its sector ID, sensor type, cloud/geometry artifacts, confidence level (`Confirmed`, `Probable`, `Unverified`), storage footprint, and downlink transmission time. Placing a compatible Data Cube into the **Onboard Processing Cradle** consumes Power to extract key features, reducing packet size and transmission duration—**without** magically upgrading cloud-blocked or inherently ambiguous observations.
4. **Prioritize & Transmit (The Downlink Climax):** When the ground-station pass begins, a countdown timer starts. The player physically grabs Data Cubes / Processed Reports and snaps them into the **Downlink Transmission Bay** queue. Packets transmit sequentially based on their transmission duration until the window closes. Captured packets left outside the transmitted queue do **not** count as delivered intelligence.
5. **Review (Consequence Debrief & Replay):** The world-space debrief panel shows which of the three ground requests were answered with sufficient confidence, which failed or remained unverified, resource efficiency (power/storage/bandwidth wasted), and **one deterministic, actionable replay recommendation** based on the player's specific mistake.

---

## 4. Scientific Grounding & Deterministic Rules
All gameplay mechanics follow deterministic rules inspired by NASA small-spacecraft onboard data processing and Earth-observation remote sensing principles:
- **Optical Mode:** Low energy cost (`8 Power`), high visual interpretability under clear skies (`Confirmed`), but severely degraded or blocked by dense cloud cover (`Unverified` / obstructed).
- **Radar / SAR-Inspired Mode:** Higher energy cost (`14 Power`), penetrates cloud cover to detect surface water extent (smooth water acts as a specular reflector appearing dark in backscatter), but can suffer from geometric distortion or speckle/urban-canopy ambiguity (`Probable` or `Confirmed` depending on terrain geometry, never claimed as infallible ground truth).
- **Onboard Processing:** Costs `6 Power`. Compresses a valid raw observation (`3 Storage`, `4.0s Downlink Time`) into a compact feature report (`1 Storage`, `1.8s Downlink Time`). Cannot increase confidence of an `Unverified` cloud-blocked optical scan.
- **Explicit Disclaimer:** The experience is a stylized strategy game using simulated scenario data. It does not control a real satellite, ingest live satellite feeds, or make real-world disaster predictions.

---

## 5. Epistemic Ledger: Verified Facts vs. Decisions vs. Assumptions vs. Deferred Scope

### A. Verified Facts (Proven via Audit & Research)
- **Competition Deadline:** November 18, 2026 at 12:00 PM PST = **November 19, 2026 at 01:00 AM PKT (GMT+5)** (`devpost.txt`, official Devpost rules).
- **Judging Weights:** Four equally weighted criteria at **25% each**: *Innovation & Creativity*, *Experience Design*, *Technical Implementation*, and *Polish & Presentation* (`devpost.txt`).
- **Hard Competition Requirements:** Must be **hands-first** (completable end-to-end without pairing a controller), adhere to Meta VR Start policies, provide a playable build (hosted HTTPS URL for IWSDK WebXR apps), and include a public demo video **under 3 minutes** recorded on a Meta VR device, XR Simulator, or equivalent emulator (`devpost.txt`).
- **New Experience Window:** Must be conceived and built starting on or after September 24, 2026 (`devpost.txt`). Repository initial commit was created on October 28, 2026 (`357527a`).
- **Development Hardware & Environment:**
  - Host: Dell Latitude 5490 (Intel Core i5-8350U, 8 GB RAM, Intel UHD 620 integrated GPU, Windows).
  - Disk Space: `D:` drive has **42.9 GB free**; `C:` drive has **13.5 GB free**.
  - Tooling Installed: Node.js `v22.23.1` (satisfies IWSDK `>=20.19.0`), npm `10.9.8`, Python `3.11.9`, Git.
  - Current IWSDK Packages on npm: `@iwsdk/core@1.1.0-rc.2`, `@iwsdk/create@1.1.0-rc.2`, `@iwsdk/vite-plugin-dev@1.1.0-rc.2` (includes `@iwer/devui@^2.7.0` and `playwright@^1.58.2`), `@iwsdk/vite-plugin-uikitml@0.4.2`, `three@npm:super-three@0.185.0`.
  - Official Meta Skill: `hz-iwsdk-webxr` verified from `meta-quest/agentic-tools` (Apache-2.0) and installed at `.agents/skills/hz-iwsdk-webxr`.
  - Gravitas Runtime Status: `gravitas_core_detected: true`, `native_hooks_available: false` (verified via `doctor.py`).

### B. Current Approved Decisions
- **Track & Division:** Gaming Track — New Experience Division.
- **Primary & Secondary Award Targets:** *Best New Gaming Experience* (primary), *Best First Five Minutes* and *Boldest Original Concept* (secondary design alignment).
- **Tech Stack:** Meta IWSDK (`@iwsdk/core`) + Three.js (`super-three`) + TypeScript + Vite + Vitest + IWER/Playwright, deployed via static HTTPS hosting (GitHub Pages or Vercel).
- **VR Mode:** Full virtual environment (`SessionMode.ImmersiveVR`, `ReferenceSpaceType.LocalFloor`) with seated console layout; no passthrough MR in MVP.

### C. Proposed Designs (Pending User Review of Plan)
- **Scenario Balance Parameters:**
  - Starting Power: `55 units`
  - Onboard Storage Capacity: `9 units` (3 raw cubes max at once unless processed or discarded)
  - Downlink Window Duration: `10.0 seconds` active transmission capacity
  - 6 Sectors (`Sector A: Indus Barrage North`, `Sector B: East Levee Highway`, `Sector C: Steel Truss Crossing`, `Sector D: Old Causeway`, `Sector E: High-Ground Shelter Spur`, `Sector F: Southern Floodplain Basin`) with a deterministic weather/terrain truth table yielding multiple viable strategies.

### D. Unverified Assumptions (Require Early Empirical Validation)
- **Assumption A1 (Physical Quest Access):** Physical access to a Meta Quest headset before November 18, 2026 is currently **unconfirmed**. Development must proceed emulator-first (IWER + desktop WebXR + Playwright hardware ANGLE), with honest disclosure in submission docs if physical device testing cannot be secured.
- **Assumption A2 (UHD 620 Performance with Vite + IWER):** Running Vite + Chrome with IWER on Intel UHD 620 with 8 GB RAM will maintain smooth interactive framerates (`>= 30-60 FPS` on desktop) if draw calls (`< 60`), texture sizes (`<= 1024x1024`), and Havok physics usage (avoiding heavy physics workers if simple transform/distance-snap suffices) are kept tight.

### E. Deferred / Out-of-Scope Features (Do Not Implement in MVP)
- AI chatbots, LLM narration, or voice assistants.
- Live satellite APIs, real-time telemetry, or real orbital propagation (SGP4/TLE).
- Additional sensor modes (Thermal IR, RF triangulation) beyond Optical and Radar/SAR.
- Continuous solar-panel rotation or thermal radiator maintenance chores.
- Passthrough Mixed Reality (`SessionMode.ImmersiveAR`) and room mesh anchoring (MRUK).
- Multiplayer, backend accounts, leaderboards, or multi-mission campaigns.

---

## 6. Project Success Criteria
1. **Playable End-to-End Loop:** A player can launch the HTTPS build, enter XR, complete the briefing, scan sectors, inspect and process data cubes, prioritize and transmit packets during the timed downlink, read a deterministic debrief, and restart the mission using **only hand interactions**.
2. **Strategic Depth:** At least two distinct valid strategies exist, and naive "scan everything in optical mode" fails due to cloud cover, storage limits, and downlink bandwidth constraints.
3. **Technical & Visual Polish:** Cohesive orbital console art direction, clear spatial audio and visual state feedback, zero unhandled runtime exceptions, `< 80` draw calls, and 100% passing unit tests for `src/mission/`.
4. **Submission Readiness by Nov 17, 2026:** Deployed public HTTPS URL verified, `< 3 minute` real gameplay video captured, and Devpost submission materials completed 48 hours before the deadline.
