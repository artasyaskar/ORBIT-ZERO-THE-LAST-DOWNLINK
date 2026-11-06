# Runtime Asset Attribution & Provenance Manifest

**Project:** ORBIT ZERO: THE LAST DOWNLINK  
**Revision:** Build Distribution Manifest  
**Target Platform:** Meta Quest Browser (Horizon OS) WebXR / Desktop  
**Policy:** Zero proprietary, unlicensed, or infringing assets. Incoming source files in `public/assets/models/incoming/` are developer working files and are strictly excluded from production distribution builds via Vite build hooks (`vite.config.ts`).

---

## 1. Shipped 3D Models (`dist/assets/models/`)

| File Name | Size (Bytes) | Provenance / Creator | License | Attribution Citation & Source URL | Status |
|---|---|---|---|---|---|
| `nasa-cubesat-icecube.glb` | 309,880 | NASA Goddard Space Flight Center / Earth Science Technology Office (ESTO) | NASA Open Data Policy (Public Domain / US Govt Work) | NASA 3U CubeSat demonstration platform for submillimeter-wave radiometry (857 GHz cloud ice radiometer). NASA 3D Resources / ESTO. | `[VERIFIED CC0 / PUBLIC DOMAIN]` |
| `nasa-cubesat-mirata.glb` | 444,564 | NASA Earth Science Technology Office / MIT Lincoln Laboratory | NASA Open Data Policy (Public Domain / US Govt Work) | Microwave Radiometer Technology Acceleration (MiRaTA) CubeSat model. Atmospheric sounding radiometer validation. NASA ESTO. | `[VERIFIED CC0 / PUBLIC DOMAIN]` |
| `nasa_acrimsat.glb` | 1,091,672 | NASA / Jet Propulsion Laboratory (JPL) | NASA Open Data Policy (Public Domain / US Govt Work) | Active Cavity Radiometer Irradiance Monitor Satellite (AcrimSAT) model. NASA JPL 3D Resources. | `[VERIFIED CC0 / PUBLIC DOMAIN]` |

---

## 2. Shipped Planetary Textures (`dist/assets/textures/`)

| File Name | Size (Bytes) | Resolution | Source / Agency | License | Technical Role | Status |
|---|---|---|---|---|---|---|
| `earth_atmos_4096.jpg` | 1,004,147 | 4096 × 2048 | NASA Visible Earth / Goddard Space Flight Center | Public Domain (NASA Open Data) | Primary RGB8 Earth surface reflectance albedo (desktop / high-VRAM). | `[VERIFIED PUBLIC DOMAIN]` |
| `earth_atmos_2048.jpg` | 512,606 | 2048 × 1024 | NASA Visible Earth / Goddard Space Flight Center | Public Domain (NASA Open Data) | Standalone Quest mobile fallback Earth albedo texture. | `[VERIFIED PUBLIC DOMAIN]` |
| `earth_normal_4096.jpg` | 710,237 | 4096 × 2048 | NASA Earth Observatory / Shuttle Radar Topography Mission (SRTM) | Public Domain (NASA Open Data) | Tangent-space topographic relief normal perturbation. | `[VERIFIED PUBLIC DOMAIN]` |
| `earth_normal_2048.jpg` | 336,774 | 2048 × 1024 | NASA Earth Observatory / SRTM | Public Domain (NASA Open Data) | Standalone Quest mobile fallback normal perturbation map. | `[VERIFIED PUBLIC DOMAIN]` |
| `earth_specular_4096.jpg` | 549,994 | 4096 × 2048 | NASA Goddard Space Flight Center | Public Domain (NASA Open Data) | Continental vs oceanic specular reflection mask (4K). | `[VERIFIED PUBLIC DOMAIN]` |
| `earth_specular_2048.jpg` | 223,421 | 2048 × 1024 | NASA Goddard Space Flight Center | Public Domain (NASA Open Data) | Continental vs oceanic specular reflection mask (2K fallback). | `[VERIFIED PUBLIC DOMAIN]` |
| `earth_lights_4096.png` | 2,629,386 | 4096 × 2048 | NASA / NOAA Suomi NPP VIIRS (Day-Night Band) | Public Domain (NASA/NOAA Open Data) | Nocturnal urban illumination emissions map (additive blending). | `[VERIFIED PUBLIC DOMAIN]` |
| `earth_lights_2048.png` | 410,160 | 2048 × 1024 | NASA / NOAA Suomi NPP VIIRS | Public Domain (NASA/NOAA Open Data) | 2K mobile nocturnal urban illumination texture. | `[VERIFIED PUBLIC DOMAIN]` |
| `earth_clouds_1024.png` | 226,113 | 1024 × 512 | NASA Visible Earth | Public Domain (NASA Open Data) | Alpha-masked revolving atmospheric cloud layer sphere. | `[VERIFIED PUBLIC DOMAIN]` |
| `milky_way_skybox_4096.jpg` | 2,754,824 | 4096 × 2048 | ESO / Serge Brunier / NASA | CC0 1.0 Universal (Public Domain Dedication) | 360-degree deep space background panorama. | `[VERIFIED CC0 / PUBLIC DOMAIN]` |

---

## 3. Shipped PBR Material Textures (`dist/assets/textures/pbr/`)

| File Name | Size (Bytes) | Resolution | Source / Creator | License | Derived From | Status |
|---|---|---|---|---|---|---|
| `hull_metal_ao_2k.jpg` | 1,142,975 | 2048 × 2048 | ambientCG (Lennart Demes) | CC0 1.0 Universal (Public Domain) | `MetalPlates015A_2K-JPG_AmbientOcclusion.jpg` | `[VERIFIED CC0]` |
| `hull_metal_color_2k.jpg` | 1,606,534 | 2048 × 2048 | ambientCG (Lennart Demes) | CC0 1.0 Universal (Public Domain) | `MetalPlates015A_2K-JPG_Color.jpg` | `[VERIFIED CC0]` |
| `hull_metal_metalness_2k.jpg` | 633,970 | 2048 × 2048 | ambientCG (Lennart Demes) | CC0 1.0 Universal (Public Domain) | `MetalPlates015A_2K-JPG_Metalness.jpg` | `[VERIFIED CC0]` |
| `hull_metal_normal_2k.jpg` | 3,099,380 | 2048 × 2048 | ambientCG (Lennart Demes) | CC0 1.0 Universal (Public Domain) | `MetalPlates015A_2K-JPG_NormalGL.jpg` | `[VERIFIED CC0]` |
| `hull_metal_roughness_2k.jpg` | 1,605,380 | 2048 × 2048 | ambientCG (Lennart Demes) | CC0 1.0 Universal (Public Domain) | `MetalPlates015A_2K-JPG_Roughness.jpg` | `[VERIFIED CC0]` |

---

## 4. Excluded Source-Only Assets (`public/assets/models/incoming/`)

The following files exist in the source repository for asset authoring, baking, and development inspection. **None of these files are included in the production build or deployed to users** (enforced by the Vite build exclusion hook `excludeIncomingSources` in `vite.config.ts`):

- `8k_earth_daymap.jpg`, `8k_earth_nightmap.jpg`, `8k_earth_specular_map.tif` (Raw 8K NASA maps; downscaled to 4K/2K runtime assets)
- `Active Cavity Irradiance Monitor Satellite (AcrimSAT) (B).glb` (Uncompressed NASA source model; normalized to `nasa_acrimsat.glb`)
- `Fabric004_*` (Source texture pack from ambientCG; not referenced by runtime code)
- `MetalPlates006_*` (Source texture pack from ambientCG; not referenced by runtime code)
- `MetalPlates015A_*` (Source material archive and Blender files; baked into `textures/pbr/hull_metal_*`)
- `milky_way*.jpg`, `Nasa_Black_marble*.jpg` (Raw exploratory tiles; baked into unified skybox/lights)
- `pexels-*.jpg` (Mood reference stock photos; never referenced by runtime shaders or scenes)

---

## 5. Procedural Runtime Assets (Zero File I/O)

All of the following interactive elements are procedurally synthesized in memory at runtime without external asset downloads:

1. **Tactile Cockpit & Orbital Console Geometries:**
   - Procedural geometries authored in `src/scene-assets/*.scene-asset.ts` using Three.js primitives (`BoxGeometry`, `CylinderGeometry`, `TorusGeometry`, `ExtrudeGeometry`).
   - License: MIT (Original Developer Work).

2. **Tactile Evidence Cube Displays:**
   - Dynamically generated 512 × 512 HTML5 `<canvas>` textures updating at 10 Hz with telemetry, QR data matrices, and scientific metadata.
   - License: MIT (Original Developer Work).

3. **Audio Synthesis:**
   - Zero pre-recorded audio sample files (`.mp3`, `.wav`, `.ogg`). 100% procedurally synthesized Web Audio nodes (sine/saw oscillators, biquad filters, exponential gain ramps, pink noise).
   - Source: `src/systems/orbitalAudio.ts`.
   - License: MIT (Original Developer Work).
