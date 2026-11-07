# Runtime Asset Attribution & Provenance Manifest

**Project:** ORBIT ZERO: THE LAST DOWNLINK (fictional, simulated gameplay; not a real satellite system)
**Audit date:** 2026-11-07
**Policy:** Incoming source files in `public/assets/models/incoming/` are developer working files and are excluded from production builds by `excludeIncomingSources` in `vite.config.ts`.

Status vocabulary: **MATCHED** = the shipped file was compared against the named upstream source and agrees. **NAME ONLY** = the source is named by the project but the file was not compared to upstream. **UNVERIFIED** = no source could be confirmed; treat the license as unknown.

---

## 1. Credit required by license (CC BY 4.0)

Earth day, night and relief maps: **Solar System Scope** (solarsystemscope.com/textures), licensed CC BY 4.0, based on NASA elevation and imagery data. The same credit is shown on the landing page.

---

## 2. 3D models (`assets/models/`)

| File | Source | License | Status | Used at runtime |
|---|---|---|---|---|
| `nasa_acrimsat.glb` | NASA 3D Resources, "Active Cavity Irradiance Monitor Satellite (AcrimSAT) (B)" (github.com/nasa/NASA-3D-Resources). Identical to the project's `incoming/` copy of that model. | NASA media usage guidelines (generally not copyrighted; no NASA endorsement implied) | NAME ONLY | Yes (`src/assets.ts`) |
| `nasa-cubesat-icecube.glb` | NASA 3D Resources, "CubeSat - ICECube" | NASA media usage guidelines | NAME ONLY | No (shipped, unreferenced) |
| `nasa-cubesat-mirata.glb` | NASA 3D Resources, "CubeSat - MiRaTa" | NASA media usage guidelines | NAME ONLY | No (shipped, unreferenced) |

The in-game CubeSat, console, globe overlays and cubes are procedural geometry written for this project.

---

## 3. Textures (`assets/textures/`)

| File | Origin found | License | Status | Used at runtime |
|---|---|---|---|---|
| `earth_atmos_2048.jpg`, `earth_normal_2048.jpg`, `earth_specular_2048.jpg`, `earth_lights_2048.png`, `earth_clouds_1024.png` | Byte-identical to the files in the three.js repository, `examples/textures/planets/`. The upstream origin of the pixels is not documented there. | three.js repo is MIT; license of the underlying imagery is **UNVERIFIED** | MATCHED to three.js, UNVERIFIED upstream | Yes (game and landing) |
| `earth_atmos_4096.jpg` | Matches Solar System Scope 8K Earth day map (mean gray difference 0.15 of 255 at 128x64) | CC BY 4.0 | MATCHED | Landing scene |
| `earth_lights_4096.png` | Matches Solar System Scope 8K Earth night map (0.04) | CC BY 4.0 | MATCHED | No (shipped, unreferenced) |
| `earth_specular_4096.jpg` | Matches Solar System Scope 8K specular map (0.27) | CC BY 4.0 | MATCHED | Landing scene |
| `earth_normal_4096.jpg` | Not compared. Presumed Solar System Scope derivative. | Unknown | UNVERIFIED | Landing scene |
| `milky_way_skybox_4096.jpg` | Previously labelled "ESO / Serge Brunier, CC0". Not matched to ESO image eso0932a (difference 17), and ESO publishes under CC BY 4.0, not CC0. Real source unknown. | Unknown | **UNVERIFIED** | Yes (game and landing) |
| `pbr/hull_metal_*_2k.jpg` (5 files) | ambientCG "MetalPlates015A", byte-identical to the `incoming/` files. ambientCG states all assets are CC0. | CC0 1.0 | MATCHED | No (shipped, unreferenced) |

---

## 4. Media (`media/`)

| File | Origin | License | Status |
|---|---|---|---|
| `gemini_generated_video_0a69bdeb.mp4` | Landing-page voice-over ("Welcome to ORBIT ZERO..."), played as audio. The file name indicates it was generated with Google Gemini tooling. | Governed by the generating tool's terms; not reviewed | **AI-GENERATED, TERMS UNVERIFIED** |

---

## 5. Audio

In-game sound effects and the landing drone are synthesized at runtime with the Web Audio API (`src/systems/orbitalAudio.ts`, `src/landing/landingAudio.ts`) and use no sample files. The one pre-recorded audio asset is the landing voice-over in section 4.

---

## 6. Excluded source-only assets (`public/assets/models/incoming/`, not deployed)

`8k_earth_*` (Solar System Scope, CC BY 4.0), AcrimSAT source model, ambientCG `Fabric004`, `MetalPlates006`, `MetalPlates015A` packs (CC0), `milky_way*.jpg` and `Nasa_Black_marble*.jpg` exploratory tiles (origin not recorded), `pexels-*.jpg` mood references (Pexels license, never referenced).

---

## 7. Software dependencies

Runtime dependencies are listed in `package.json` and `package-lock.json` (Meta Immersive Web SDK, three.js, @pmndrs/uikit and others). Their licenses ship with each package in `node_modules`; no separate third-party notice file has been generated for the bundle.
