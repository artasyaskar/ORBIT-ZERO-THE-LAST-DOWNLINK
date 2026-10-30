# ORBIT ZERO: THE LAST DOWNLINK
## Technical Terminology, Simulation Limitations & Scientific Citations

**Document Version:** 3.0.0 (Release Candidate 3)  
**Author:** Flight Operations & Remote Sensing Simulation Reviewer  
**Context:** Meta VR Start Developer Competition 2026 (Gaming Track — New Experience Division)  
**Mandate:** Provide clear, explicit boundaries between authentic Earth-observation physics, spacecraft avionics principles, and deliberate gameplay abstractions.

---

## 1. Explicit Simulation Boundaries: Game vs. Reality

> *"ORBIT ZERO: THE LAST DOWNLINK is an interactive spatial VR puzzle and emergency triage simulation. It is grounded in Earth-observation physics but is not an operational satellite ground station or military intelligence platform."*

| Feature | Operational Earth Observation Reality | ORBIT ZERO Simulation Abstraction | Purpose of Abstraction |
| :--- | :--- | :--- | :--- |
| **Downlink Window** | Low Earth Orbit (LEO) ground-station passes typically last **6 to 12 minutes** as the satellite traverses horizon-to-horizon (elevation mask $>5^\circ$). | **Simulated Downlink Window:** A compressed **8.0s to 10.0s** countdown representing the final critical line-of-sight margin before loss of signal. | Creates intense, seated spatial puzzle pressure without 10 minutes of passive waiting. |
| **Resource Units** | Power is measured in Watt-hours (Wh) or Joules (J); memory is measured in Gigabytes (GB) of flash NAND. | **PWR (Power Units) & STR (Storage Units):** Abstract integer resource budgets (55 PWR initial, 9 STR capacity). | Allows immediate mental arithmetic for players wearing a VR headset. |
| **Orbit Mechanics** | SGP4/SDP4 orbital propagation based on NORAD Two-Line Element (TLE) sets, accounting for J2 gravitational perturbations, atmospheric drag, and Earth rotation. | **Static Orbital Frame:** Spacecraft is positioned over South Asia / Indus River basin with dynamic atmospheric shader and interactive swath aiming. | Focuses on hands-first tactical triage decisions rather than orbital trajectory plotting. |
| **Feature Extraction** | Complex radiometric calibration, terrain correction, Doppler centroid estimation, phase unwrapping, and deep convolutional neural networks taking minutes/hours. | **Tactile Processing Cradle:** Compresses raw rasters (3 STR) into vectorized boundary masks (1 STR) in 0.5s for 6 PWR. | Hands-first tactile haptic feedback embodying edge-computing concepts. |
| **Avionics LEDs** | CubeSats do not use external visual LEDs for human viewing in the vacuum of space (only internal debugging headers on engineering test benches). | **Status LEDs:** Miniature ADCS attitude lock (green) and EPS bus heartbeat (cyan/amber) mounted on the CubeSat model. | Immediate, intuitive visual state feedback for the player inside the VR cupola. |

---

## 2. Remote Sensing Physics: Rigorous Principles vs. Common Misconceptions

### 2.1 Active Microwave Synthetic Aperture Radar (SAR)
Operational references: NASA Applied Sciences SAR Flood Mapping Guide (2024); ESA Sentinel-1 SAR User Guide; JPL AIRSAR Radar Fundamentals.

1. **Specular Reflection on Open Water:**
   - *Physical Mechanism:* Calm, standing floodwater acts as a near-perfect specular mirror at microwave wavelengths ($\lambda \approx 5.6\text{ cm}$, C-band). Because radar operates in an oblique side-looking geometry (incidence angle $\theta \approx 20^\circ\text{--}45^\circ$), transmitted microwave pulses bounce forward away from the satellite antenna.
   - *Result:* Very little backscatter energy returns to the receiver (typically $\sigma^\circ < -22\text{ dB}$). Flooded plains and inundated highways appear as **dark features**.
2. **Flooded Vegetation & Double-Bounce Scattering:**
   - *Physical Mechanism:* When water covers forested or vegetated areas (`SEC-F Southern Retention Basin`), the microwave pulse bounces off the horizontal water surface and then strikes vertical tree trunks (or vice versa), reflecting energy back toward the antenna.
   - *Result:* Unlike calm open water, flooded vegetation produces **exceptionally bright backscatter returns**. A bright return in vegetated areas can indicate flooding, whereas open water produces dark returns.
3. **Urban Structures & Dihedral Corner Reflector Multipath Glare:**
   - *Physical Mechanism:* In urban centers and metallic bridges (`SEC-C Steel Truss Crossing`), orthogonal geometries formed by vertical steel girders, bridge towers, concrete bridge piers, and the adjacent river water form **right-angle dihedral corner reflectors**.
   - *Result:* These dihedrals reflect coherent microwave pulses directly back to the sensor antenna with near-zero scattering loss, creating **intense backscatter saturation glare**.
   - *Scientific Limitation Enforced in RC3:* **Metallic corner reflector glare is NOT an automatic bridge safety or flood detector.** It confirms the presence of reflective vertical metal/concrete structures, but masks whether the bridge deck road surface is flooded or passable. That is why in `MONSOON_SUPERCELL_PASS`, radar observation on Sector C yields only `[?] PROBABLE` evidence (18 points), and the debrief advises that ground visual reconnaissance is required.
4. **Steep Terrain Distortions (Layover & Shadow):**
   - In mountainous terrain (`SEC-E Shelter Ridge Spur`), radar pulses reach elevated mountain peaks before reaching lower valleys, projecting the ridge onto the sensor prematurely (layover). This limits geometric interpretation confidence to `[?] PROBABLE`.

### 2.2 Passive Visible & Near-Infrared (VNIR) Optical Imaging
1. **Physical Mechanism:** Measures solar illumination reflected by ground features (0.4 to 1.0 $\mu\text{m}$).
2. **Mie Scattering & Cloud Obscuration:** Cloud water droplets ($10\text{--}50\ \mu\text{m}$) match the scale of visible wavelengths, causing severe, isotropic **Mie scattering**. When convective storm clouds or monsoon supercells cover a sector (`SEC-B`, `SEC-E`, and all sectors in `MONSOON_SUPERCELL_PASS`), optical transmission drops to zero.
3. **Intellectual Honesty:** Onboard edge computing cannot extract features from zero-signal data. An optical frame over a cloud-covered sector produces `[X] UNVERIFIED` telemetry; the processing cradle rejects compression, prompting the player to discard the cube and switch to radar.

---

## 3. CubeSat Spacecraft Subsystem Grounding

| Subsystem | Authentic Engineering Principles | Implementation in ORBIT ZERO |
| :--- | :--- | :--- |
| **ADCS (Attitude Determination and Control System)** | Uses star trackers, sun sensors, magnetometers, and reaction wheels to achieve 3-axis pointing accuracy within $\pm 0.05^\circ$. | Visualized through the spacecraft orienting toward Indus nadir and a subtle status indicator LED (`AdcsAttitudeLockLED`). |
| **EPS (Electrical Power System)** | Employs triple-junction GaAs solar arrays and Li-ion battery packs managed by Maximum Power Point Tracking (MPPT) regulators. | Represented by the `PWR` budget (55 PWR nominal, 50 PWR in brownout). Status heartbeat LED transitions from cyan to amber if power $< 15\text{ PWR}$. |
| **OBDH (On-Board Data Handling)** | Space-grade flash NAND storage with radiation-tolerant partitions. | Represented by the `STR` budget (9 STR nominal, 6 STR in brownout). Storage fills as raw scans are collected; cradle vectorization frees memory. |
| **RF Communications (S-Band Downlink)** | S-band (2.2–2.4 GHz) transceiver transmitting telemetry and compressed payload packets to ground station dishes at data rates of 2 to 10 Mbps. | Represented by the 3-slot Downlink Bay, animated microwave waveguide beam, and scheduled packet transmission durations (1.8s to 4.5s). |

---

## 4. Authoritative Scientific Citations

1. **NASA Applied Sciences Program (2024):** *SAR Flood Mapping & Inundation Assessment: Theory and Practice.* NASA Earth Applied Sciences Disasters Program.
2. **NASA Jet Propulsion Laboratory (JPL):** *AIRSAR Radar Fundamentals & Scattering Mechanisms: Specular Reflection, Surface Roughness, and Double-Bounce.* California Institute of Technology.
3. **European Space Agency (ESA):** *Sentinel-1 SAR Technical Guide: C-Band Backscatter Characteristics, Interferometry, and Synthetic Aperture Processing.* ESA Sentinel Online Documentation.
4. **NASA Earth Science Data Systems (ESDS):** *Normalized Difference Water Index (NDWI) and Water Surface Masking using Visible and Near-Infrared Radiometry.*
5. **USGS Remote Sensing Technologies:** *Guidelines for Emergency Disaster Satellite Triage and Situational Awareness.* United States Geological Survey.
