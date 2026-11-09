# Asset License and Attribution Audit

**Project:** ORBIT ZERO: THE LAST DOWNLINK  
**Competition Target:** Meta VR Start Developer Competition 2026 (Gaming Track — New Experience Division)  
**Verification Date:** October 30, 2026  
**Status:** 100% Verified Clean — Zero Proprietary, Unlicensed, or Infringing Assets  

---

## 1. Executive Summary

All visual, geometric, sonic, and textural assets used in *ORBIT ZERO: THE LAST DOWNLINK* adhere strictly to open-access, public domain, or original developer-authored licenses. The project incorporates no copyrighted commercial models, no restricted satellite telemetries, and no external audio samples.

---

## 2. 3D Model Assets

| Asset Name | Source Path | Provenance / Creator | License | Attribution Citation |
|---|---|---|---|---|
| ~~NASA AcrimSAT~~ (removed, not in the project) | - | NASA / JPL 3D Resources | Public Domain | Not used. |
| **NASA IceCube CubeSat** (reference only, not loaded or deployed) | `public/assets/models/nasa-cubesat-icecube.glb` | NASA Goddard Space Flight Center / ESTO | Public Domain (NASA Open Data & Media Policy) | *NASA ESTO 3U CubeSat demonstration platform.* |
| **NASA MiRaTA CubeSat** (reference only, not loaded or deployed) | `public/assets/models/nasa-cubesat-mirata.glb` | NASA Earth Science Technology Office / MIT LL | Public Domain (NASA Open Data & Media Policy) | *Microwave Radiometer Technology Acceleration (MiRaTA) CubeSat.* |
| **Tactile Hardware (Console, Bay, Cradle)** | `src/scene-assets/orbitalConsole.scene-asset.ts`, `tactileHardware.scene-asset.ts` | Original Three.js procedural geometries by author | MIT License (Developer Original) | *Authored procedural geometric primitives.* |
| **Earth Globe & Beacon Rings** | `src/scene-assets/earthGlobe.scene-asset.ts` | Original Three.js procedural meshes by author | MIT License (Developer Original) | *Authored multi-layer spherical geometries.* |

---

## 3. Surface & Environment Textures

| Texture Map | Resolution | Source / Agency | License | Technical Notes |
|---|---|---|---|---|
| **NASA Blue Marble Albedo** (`earth_atmos_4096.jpg`) | 4096 × 2048 | NASA Visible Earth / GSFC | Public Domain | RGB8 sRGB earth surface reflectance. |
| **NASA Topographic Normal** (`earth_normal_4096.jpg`) | 4096 × 2048 | NASA Earth Observatory / Shuttle Radar Topography Mission (SRTM) | Public Domain | Tangent-space normal perturbation. |
| **NASA Ocean Specular Mask** (`earth_specular_4096.jpg`) | 4096 × 2048 | NASA Goddard Space Flight Center | Public Domain | Specular highlight water mask. |
| **NASA Night Lights** (`earth_lights_4096.png`) | 4096 × 2048 | NASA / NOAA Suomi NPP VIIRS | Public Domain | Additive nocturnal urban illumination. |
| **NASA Cloud Layer** (`earth_clouds_1024.png`) | 1024 × 512 | NASA Visible Earth | Public Domain | Alpha-blended dynamic revolving cloud shell. |
| **Milky Way Cosmic Skybox** (`milky_way_skybox_4096.jpg`) | 4096 × 2048 | ESO / Serge Brunier / NASA | CC0 1.0 Universal (Public Domain Dedication) | Deep-field panoramic background sphere. |
| **Tactile Evidence Cube Faces** | 512 × 512 Dynamic | Procedural HTML5 2D Canvas in Three.js | Developer Original | Real-time procedural rendering with QR/telemetry glyphs. |

---

## 4. Audio Synthesis (Zero External Sample Files)

*ORBIT ZERO* uses **zero pre-recorded audio sample files** (`.mp3`, `.wav`, `.ogg`). All sound design is procedurally generated at runtime via the HTML5 Web Audio API:

- **Source Code:** [`src/systems/orbitalAudio.ts`](../src/systems/orbitalAudio.ts)
- **Audio Architecture:**
  - Ambient deep-space rumble: Procedural 48 Hz sine oscillator modulated by pink noise filter.
  - S-Band microwave beacon: 880 Hz pulse-width modulated tone with exponential gain decay.
  - Scan sweep: Dual frequency chirp (220 Hz to 880 Hz) with dynamic resonance.
  - Evidence lock & cradle snap: Dual harmonic chime (440 Hz + 660 Hz).
  - Downlink buffer burst: High-frequency frequency-modulated data packets (1200 Hz / 2400 Hz FSK emulation).
  - Emergency klaxon: Band-pass filtered 330 Hz saw wave.
- **License:** Developer Original (MIT License).

---

## 5. UI Typography & Icons

- **Spatial UI Framework:** `@pmndrs/uikit` + `@pmndrs/uikit-horizon` (Meta Horizon design tokens and shaders).
- **Typography:** Horizon OS system font stack (`Roboto`, `system-ui`, monospace) rendered via MSDF (Multi-channel Signed Distance Field) text engines.
- **Icons & Badges:** Vector SVG paths and procedural text glyphs (`[RADAR]`, `[OPTICAL]`, `[VERIFIED]`, `[PROBABLE]`, `[AMBIGUOUS]`).

---

## 6. Scientific Data Disclaimer

All crisis scenarios (Standard Indus Pass, Monsoon Supercell Pass, Solar Brownout Pass) are **fictional procedural training simulations** designed to evaluate operator spatial triage skills under physical telemetry constraints. They do **not** represent live military intelligence, real-time civil defence rescue commands, or active classified satellite constellations. All satellite orbit parameters and downlink windows are simulated abstractions for competitive gameplay.

