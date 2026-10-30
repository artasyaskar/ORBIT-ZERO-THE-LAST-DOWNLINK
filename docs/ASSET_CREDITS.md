# Asset Credits, Provenance, and Licensing (`docs/ASSET_CREDITS.md`)

All 3D models, planetary textures, and procedural geometry libraries integrated into **ORBIT ZERO: THE LAST DOWNLINK** are self-contained inside the repository (`public/assets/` and `src/scene-assets/`) with verified public-domain or permissive open-source licenses suitable for the **Meta VR Start Developer Competition 2026**.

---

## 1. 3D Spacecraft Model (`public/assets/models/`)

| Asset ID (`src/assets.ts`) | Local File Path | Original Source | License | Size & Geometry | Modifications & Optimization |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `nasa-cubesat` | `public/assets/models/nasa-cubesat-icecube.glb` | **NASA 3D Resources — ICECube 3U Earth-Observation CubeSat** (`https://science.nasa.gov/3d-resources/` / `https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/CubeSat%20-%20ICECube`) — NASA Goddard Space Flight Center | **NASA Media Usage Guidelines (Public Domain / US Government Work)** | `309.6 KB` (`309,568 bytes`), 6 meshes, 21 PBR material slots | Normalized root scale (`0.042`) to true 1:1 WebXR meters (`0.34m` 3U chassis, `0.68m` deployed wingspan); articulated `Pivot-Layer_2..5` matrices to deploy the twin solar array wings in orbital flight configuration; upgraded material PBR metallic/roughness/emissive factors for Kapton gold MLI foil, silicon photovoltaic cells, optical aperture lens, and anodized structural rails. |
| *(Reference archive)* | `public/assets/models/nasa-cubesat-mirata.glb` | **NASA 3D Resources — MiRaTa 3U Weather/Radiometer CubeSat** (`https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/CubeSat%20-%20MiRaTa`) | **NASA Public Domain** | `444.6 KB` (`444,564 bytes`) | Retained locally as verified backup 3U radiometer spacecraft asset. |

---

## 2. Planetary Earth Observation Textures (`public/assets/textures/`)

| Asset ID (`src/assets.ts`) | Local File Path | Original Source | License | Resolution & Size | Runtime Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `earth-albedo-tex` | `public/assets/textures/earth_atmos_2048.jpg` | **NASA Earth Observatory / Blue Marble Next Generation** (via Three.js Planetary Examples repository) | **NASA Public Domain / MIT** | `2048 × 1024` (`512.6 KB`) | Mapped (`SRGBColorSpace`) onto `GlobeCoreSphere`, rotated (`ry = -2.775 rad, rx = 0.24 rad`) so South Asia, the Arabian Sea, the Himalayas, and the Indus River Basin face the seated operator. |
| `earth-normal-tex` | `public/assets/textures/earth_normal_2048.jpg` | **NASA SRTM / ETOPO Topographic Relief Normal Map** (via Three.js Planetary Examples) | **NASA Public Domain / MIT** | `2048 × 1024` (`336.8 KB`) | Bound to `GlobeCoreSphere.material.normalMap` (`normalScale: 2.1`) for physical mountain and river-basin surface relief under orbital directional lighting. |
| `earth-specular-tex` | `public/assets/textures/earth_specular_2048.jpg` | **NASA Earth Water/Land Specular Mask** | **NASA Public Domain / MIT** | `2048 × 1024` (`223.4 KB`) | Preloaded water/land mask asset in `src/assets.ts`. |
| `earth-clouds-tex` | `public/assets/textures/earth_clouds_1024.png` | **NASA MODIS Global Cloud Cover Map** | **NASA Public Domain / MIT** | `1024 × 512` (`226.1 KB`) | Bound (`map` + `alphaMap`, `opacity: 0.52`) onto the concentric `GlobeCloudSphere` (`radius * 1.012`) with continuous orbital cloud drift. |
| `earth-night-tex` | `public/assets/textures/earth_lights_2048.png` | **NASA Suomi NPP / VIIRS Earth at Night City Lights** | **NASA Public Domain / MIT** | `2048 × 1024` (`410.2 KB`) | Bound (`emissiveMap`, warm amber `0xfbbf24` at `0.22` intensity) onto `GlobeCoreSphere` to reveal subtle human settlement corridors along the Indus valley. |

---

## 3. Authored Procedural 3D Scene Assets (`src/scene-assets/`)

| Asset ID (`src/assets.ts`) | Source Module | License | Description |
| :--- | :--- | :--- | :--- |
| `orbital-console` | `src/scene-assets/orbitalConsole.scene-asset.ts` | Project-owned (MIT) | Wrap-around aerospace orbital command console, brushed silver-titanium deck bolster, recessed scanner holster, 3-slot capture tray, turbine globe gimbal with lower-hemisphere projector calipers, amber induction compression cradle, 3-slot waveguide downlink bay, cupola structural mullions, and deep-space planetary horizon limb arc. |
| `earth-globe` | `src/scene-assets/earthGlobe.scene-asset.ts` | Project-owned (MIT) | 64×48 multi-layered Earth globe (`0.37m` diameter), concentric cloud & Fresnel atmosphere shells, graduated azimuth/polar telemetry rings, 6 miniature Indus Basin sector terrain dioramas (Barrage Dam, Flooded Levee Highway, Steel Truss Bridge, Broken Causeway, Shelter Ridge Spur, Retention Polders), and volumetric storm-cloud puff clusters over Sectors B and E. |
| `scanner-tool` | `src/scene-assets/tactileHardware.scene-asset.ts` | Project-owned (MIT) | Handheld dual-aperture Optical + SAR Radar orbital scanner instrument with ergonomic angled polymer grip, titanium trigger guard, twin sensor barrels, and rear operator status visor. |
| `evidence-cube-cyan`, `evidence-cube-amber`, `evidence-cube-emerald` | `src/scene-assets/tactileHardware.scene-asset.ts` | Project-owned (MIT) | Open-frame titanium holographic evidence data cubes (`6.8 cm` cube) with 4 corner struts, luminous confidence core, 3D topographic swath relief, and dynamic runtime `CanvasTexture` front/top telemetry displays (`256 × 256`). |
| `console-pad-*`, `sector-beacon-*` | `src/scene-assets/tactileHardware.scene-asset.ts`, `src/scene-assets/earthGlobe.scene-asset.ts` | Project-owned (MIT) | Tactile console push-switches and holographic sector target reticles. |
