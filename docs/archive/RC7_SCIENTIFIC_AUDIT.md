# ORBIT ZERO: THE LAST DOWNLINK
# RC7 Phase 1: Scientific Integrity & Physical Phenomenology Audit

**Date:** October 31, 2026  
**Commit Reference:** `1cf6586` + Phase 1 Patches  
**Audited Domains:** Atmospheric VIS/NIR Radiative Transfer & Active Microwave SAR Backscatter  
**Standard:** Rigorous Aerospace Physics Grounding with Explicit Synthetic Scenario Framing  

---

## 1. Mathematical Correction: Beer-Lambert Atmospheric Transmission

### The Discrepancy Identified in RC6 M2:
The previous reconnaissance HUD card reported an optical depth of $\tau \approx 0.02$ alongside an atmospheric transmission of $T \approx 92\%$.

### The Exact Physical Law:
Radiative transmission through an absorbing and scattering atmospheric column obeys the Beer-Lambert-Bouguer Law:
$$T = \frac{I}{I_0} = \exp(-\tau)$$

Where $\tau$ is the vertical optical thickness along the nadir observation line of sight.

- **Clear-Sky Atmospheric Window ($\tau \approx 0.02$):**
  $$T_{\text{clear}} = e^{-0.02} = 0.98019867\dots \approx 98.02\%$$
  The prior value of $92\%$ was mathematically inconsistent with the declared optical depth $\tau = 0.02$.
- **Convective Nimbus Storm Cloud Deck ($\tau > 15$):**
  $$T_{\text{storm}} = e^{-15} \approx 3.059 \times 10^{-7} < 0.0001\%$$
  Total optical extinction occurs due to multiple Mie forward and backward scattering across water droplets ($r \sim 5\text{--}25\,\mu\text{m}$).

### Code Correction:
In `src/systems/desktopControls.ts` line 1293:
```typescript
// Corrected Beer-Lambert transmission
const opticalTrans = isStorm 
  ? 'T = e^(-τ) < 0.001% — Complete Mie Extinction' 
  : 'T = e^(-τ) ≈ 98.02% — High Direct Surface Reflectance';
```

---

## 2. Active C-Band SAR Microwave Physical Boundaries

### Wavelength & Frequency:
- Center frequency: $f = 5.40\text{ GHz}$
- Wavelength: $\lambda = \frac{c}{f} = \frac{2.9979 \times 10^8\text{ m/s}}{5.40 \times 10^9\text{ Hz}} \approx 5.55\text{ cm}$

### Penetration Reality vs. Universal Claim:
- **Prior Claim:** "100% Atmospheric Penetration".
- **Physical Reality:** While C-band pulses easily penetrate non-precipitating cloud decks (where droplet radius $r \ll \lambda$, Rayleigh regime), intense tropical convective rainfall cells containing large raindrops ($r > 1\text{ mm}$) induce volumetric Mie scattering and two-way dielectric attenuation ($\sim 0.3\text{--}1.0\text{ dB/km}$ in heavy torrential downpours).
- **Corrected HUD Statement:**
  `> 98% (Minimal droplet attenuation; rain cores scatter [Scenario Calibration])`

---

## 3. Surface Backscatter Phenomenology & Calibration Framing

To ensure judges and players understand that numerical values reflect calibrated scenario conditions rather than universal constants:

| Phenomenon | Scenario Value | Physical Mechanism | Scenario Calibration Caveat |
| :--- | :---: | :--- | :--- |
| **Specular Water Reflection** (Sector B) | $\sigma^0 < -22\text{ dB}$ | Smooth surface water reflects incident microwave pulses away from side-looking antenna into forward quadrant. | **Scenario Calibration:** In windy conditions or heavy rain, capillary wave Bragg scattering can elevate $\sigma^0$ to $-12\text{ dB}$. Single-pass amplitude **cannot measure water depth**. |
| **Dihedral Metallic Flare** (Sector C) | $\sigma^0 > +18.5\text{ dB}$ | Orthogonal $90^\circ$ angles between steel bridge truss members, deck, and water produce double-bounce retroreflection. | **Scenario Calibration:** Flare strength depends on bridge orientation relative to radar look-angle. High return confirms an engineered structure, but **masks road deck flood status**. |
| **Terrain Layover & Foreshortening** (Sector E) | Slope distortion near Km 4 | Elevated mountain terrain slopes facing the antenna compress radar slant-range relative to true ground distance. | **Scenario Calibration:** Geometric foreshortening reduces effective cross-track resolution; confidence limited to `[?] PROBABLE`. |
| **Sediment Contrast** (Sector D) | Optical VIS/NIR | Turbid, sediment-laden floodwater provides strong visual contrast against broken stone piers. | Confirms causeway breach visually; sub-surface foundation condition remains unobservable from orbit. |

---

## 4. Fundamental Remote-Sensing Limits Explicitly Stated

The forensic matrix and HUD cards now explicitly display physical limitations to preserve scientific credibility:
1. **Orbital SAR Limitation:** *"Physical Limit: SAR single-pass amplitude identifies smooth water sheets and dihedral corner reflectors; cannot measure floodwater depth without in-situ ground validation."*
2. **Orbital Optical Limitation:** *"Physical Limit: Optical imagery confirms visible daylight surfaces; cannot evaluate subsurface structural load capacity or penetrate cloud decks."*
3. **Synthetic Framing:** All scenario parameters are explicitly labeled as `[Scenario Calibration]`, maintaining scientific rigor without fabricating real-world predictions.
