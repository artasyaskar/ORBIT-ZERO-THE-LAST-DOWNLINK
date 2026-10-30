# ARCHITECTURAL DECISION RECORDS (DECISIONS.md)

*Last updated: 2026-10-28*

This document records major technical, gameplay, and tooling decisions for **ORBIT ZERO: THE LAST DOWNLINK**. No recorded decision may be silently reversed without updating this file and obtaining user approval.

---

## ADR-001: Primary Engine & Framework Selection
- **Date:** 2026-10-28
- **Status:** Accepted & Implemented (`@iwsdk/core@1.0.1` Stable)
- **Context:** We must build and ship a hands-first VR game for the Meta VR Start Developer Competition 2026 by November 18, 2026 on a Dell Latitude 5490 (Intel i5-8350U, 8 GB RAM, Intel UHD 620, 42.9 GB free on `D:`). Physical Meta Quest availability is currently unconfirmed.
- **Alternatives Considered:**
  1. **Meta Immersive Web SDK (`@iwsdk/core@1.0.1` latest stable) + Three.js (`super-three@0.181.0`) + `@pmndrs/uikit-horizon` + TypeScript + Vite + IWER.**
  2. **Meta IWSDK pre-release (`1.1.0-rc.2`).**
  3. **Unity (Meta XR All-in-One SDK v81+ / v207).**
  4. **React Three Fiber (`@react-three/fiber` + `@react-three/xr`).**
- **Evidence:**
  - `devpost.txt` explicitly lists **Immersive Web SDK** (`Node.js >= 20.19.0`, `npm create @iwsdk@latest`) as an official suggested SDK and permits WebXR submissions hosted on GitHub Pages / Vercel.
  - Scaffolding via `npx @iwsdk/create@latest` confirmed `1.0.1` is the canonical stable release (`iwsdk.project.v1`, `iwsdk.scene.v1`, `virtual:iwsdk-project`, native `AssetType.UIKitML`, and `@pmndrs/uikit-horizon`).
- **Decision:** Select **Meta IWSDK (`@iwsdk/core@1.0.1` stable) + Three.js (`super-three@0.181.0`) + TypeScript + Vite**.
- **Consequences:** Fast sub-second hot reload on the Dell Latitude 5490, native integration with Meta's official `hz-iwsdk-webxr` skill and `@iwer/devui` emulator, and instant judge access via an HTTPS URL without APK sideloading friction.

---

## ADR-002: Pure TypeScript Simulation Core Separated from ECS Presentation
- **Date:** 2026-10-28
- **Status:** Proposed (Recommended for Approval)
- **Context:** Strategy games fail when game rules (power, storage, cloud obstruction, processing eligibility, downlink timers, scoring) are tangled inside 3D frame loops or pointer callbacks.
- **Alternatives Considered:**
  1. **Pure TypeScript `src/mission/` state machine with zero 3D imports, bridged to IWSDK ECS systems.**
  2. **Embedding gameplay logic directly inside ECS `update(delta)` methods and UI click handlers.**
- **Decision:** Keep all simulation rules, scenario data, and scoring in pure TypeScript modules under `src/mission/` and test them independently with **Vitest**.
- **Consequences:** 100% of mission balance, edge cases, and scientific rules can be unit-tested in milliseconds without launching a browser, while ECS systems remain clean, focused adapters.

---

## ADR-003: Full Virtual Environment (`ImmersiveVR`) vs. Passthrough Mixed Reality (`ImmersiveAR`)
- **Date:** 2026-10-28
- **Status:** Proposed (Recommended for Approval)
- **Context:** `devpost.txt` notes that passthrough entries are judged strictly on whether the player's real room meaningfully changes the experience (using MRUK plane/mesh detection and holding up in untested rooms).
- **Alternatives Considered:**
  1. **Stylized, self-contained Virtual Orbital Console (`SessionMode.ImmersiveVR`, `ReferenceSpaceType.LocalFloor`).**
  2. **Passthrough Mixed Reality (`SessionMode.ImmersiveAR`) anchoring the globe to a real table.**
- **Evidence:**
  - `devpost.txt` lines 195 & 203 state: *"For entries that use passthrough, passthrough should be purposeful... and holding up in rooms the developer never tested."*
  - Physical Quest access is currently unconfirmed, making real-room plane/mesh testing risky.
  - A stylized low-Earth-orbit command console with controlled lighting provides stronger visual cohesion and predictable seated ergonomics.
- **Decision:** Build a cohesive **Immersive VR (`SessionMode.ImmersiveVR`)** orbital console for the MVP. Do not enable passthrough MR.
- **Consequences:** Avoids untested room-mesh failures during judging while guaranteeing consistent lighting, contrast, and seated reach across both emulator and physical Quest headsets.

---

## ADR-004: Procedural & Batched Low-Poly Assets + Web Audio Synthesis Over Heavy External Assets
- **Date:** 2026-10-28
- **Status:** Proposed (Recommended for Approval)
- **Context:** External 3D models and uncompressed audio/textures bloat repository size, strain Intel UHD 620 VRAM, risk license/attribution issues, and can fail silently in Quest Browser if CORS/paths are misconfigured.
- **Alternatives Considered:**
  1. **Procedural low-poly Three.js geometry builders + deterministic canvas textures + Web Audio API procedural synthesis (supplemented only by small verified CC0/MIT `.glb` assets if needed).**
  2. **Authoring high-poly models in Blender and downloading large external `.glb` and `.wav` packs.**
- **Decision:** Use **code-driven procedural/batched geometry (`src/scene/`)**, **UIKitML (`PanelUI`)**, and **Web Audio API synthesis (`src/systems/audioFeedbackSystem.ts`)** as the primary asset pipeline.
- **Consequences:** Total build size stays under `5 MB`, load time (TTI) is near-instant, draw calls stay under `50`, zero external license compliance risk, and zero Blender memory pressure on the 8 GB RAM laptop.

---

## ADR-005: Two Defensible Sensor Modes (Optical vs. SAR/Radar) & Non-Magical Onboard Processing
- **Date:** 2026-10-28
- **Status:** Proposed (Recommended for Approval)
- **Context:** Earlier brainstorming considered three sensor lenses (Optical, Thermal, RF) and continuous solar panel rotation.
- **Alternatives Considered:**
  1. **Two sensor modes (Optical + Radar/SAR-inspired) with deterministic cloud/geometry trade-offs and non-magical feature compression.**
  2. **Three+ sensor modes plus continuous solar/thermal housekeeping chores.**
- **Evidence:** `core_concept` and NASA Earth-observation literature establish a clear, scientifically defensible dichotomy: Optical provides high visual clarity in clear skies but is blocked by clouds (`Unverified`), whereas SAR penetrates clouds to map surface water at a higher power cost (`14` vs `8`) but can exhibit geometric/reflection ambiguity (`Probable`) around complex metallic/valley structures.
- **Decision:** Lock the MVP to **Optical** and **Radar (SAR-inspired)** modes, plus an **Onboard Processing Cradle** that compresses valid (`Confirmed`/`Probable`) observations without upgrading `Unverified` cloud-blocked scans.
- **Consequences:** Keeps cognitive load clear for a 4–6 minute session while creating a genuine, scientifically grounded optimization puzzle.
