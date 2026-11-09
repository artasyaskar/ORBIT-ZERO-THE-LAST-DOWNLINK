# ORBIT ZERO: THE LAST DOWNLINK
# RC8 Meta Quest 3/3S Physical Device Testing Checklist

**Document Version:** 1.1 (Freeze Baseline `e6059f4`)  
**Target Hardware:** Meta Quest 3 / Meta Quest 3S (Horizon OS Browser)  
**Track:** Gaming Track, New Experience Division (Meta VR Start Developer Competition 2026)  
**Standard:** Hands-First Mandate, Seated Airplane-Seat Ergonomics, 72 FPS Target  
**Verification Status:** **Checklist Prepared / Physical Headset Testing Pending**  
*(Do not claim Quest accessibility or compatibility until verified on a physical device).*

---

## 1. Network & Local SSL Setup for Meta Quest Browser

Because WebXR requires a secure context (`HTTPS`), running the development or preview server on a local PC for Meta Quest Browser requires local network bridging.

> [!IMPORTANT]
> **Do not bind to 127.0.0.1 for Quest testing!**  
> Running with `--host 127.0.0.1` binds strictly to the PC's loopback interface. A physical Quest headset running on your Wi-Fi cannot access your PC through loopback. You must bind to `0.0.0.0`.

### Step-by-Step LAN Setup:
1. **Find your PC's Wi-Fi IPv4 Address:**
   ```powershell
   ipconfig
   # Note IPv4 Address under Wireless LAN adapter Wi-Fi (e.g. 10.5.32.225)
   ```
2. **Start the Production Preview Server bound to 0.0.0.0:**
   ```powershell
   npm run preview -- --host 0.0.0.0 --port 8081
   ```
3. **Pre-Flight Sanity Check (Test from Smartphone First):**
   Before putting on the headset, connect your phone to the same Wi-Fi and open:  
   `https://<YOUR_PC_IP>:8081/` (e.g., `https://10.5.32.225:8081/`).  
   - If the page loads (after accepting the self-signed certificate warning), your LAN routing is working.
   - If the connection times out, your Wi-Fi router has **AP Client Isolation** enabled (common on university/corporate networks like `uet.edu.pk`). In that case, use a secure tunnel (see Step 4).
4. **Alternative Tunneling Option (Bypasses AP Isolation & Cert Warnings):**
   If router AP isolation blocks local IP connections:
   ```powershell
   npx cloudflared tunnel --url https://localhost:8081
   # Or: npx localtunnel --port 8081
   ```
   This gives a public HTTPS URL with a trusted CA certificate that loads on Quest Browser with zero SSL warnings.
5. **Open in Meta Quest Browser:**
   - Put on Meta Quest 3/3S and launch **Meta Quest Browser**.
   - Navigate to `https://<YOUR_PC_IP>:8081/` (or the tunnel URL).
   - If using local IP: Click **Advanced** $\to$ **Proceed to <IP> (unsafe)** to accept the self-signed developer certificate.

---

## 2. Meta Quest Horizon OS Settings Checklist

Before entering the WebXR session, verify Horizon OS headset settings:

- [ ] **Hand Tracking Enabled:**
  - Navigate to: **Settings** $\to$ **Movement tracking** $\to$ **Hand Tracking** $\to$ Toggle **ON**.
  - Enable **Auto-switch between hands and controllers**.
- [ ] **Seated Boundary Configuration:**
  - Set Boundary to **Stationary** (Seated airplane-seat mode).
  - Ensure you are seated comfortably in a chair with desk or lap space clear.
- [ ] **WebXR Hand Input Flag in Quest Browser:**
  - Navigate to `chrome://flags` in Quest Browser.
  - Verify **WebXR Hand Input** is set to **Default** or **Enabled**.

---

## 3. Entering Immersive WebXR Mode

1. Once the page loads in Meta Quest Browser, observe the 2D windowed briefing.
2. In the bottom-right of the window (or via the 3D left panel), locate:
   `[Enter VR Headset / XR Mode]`
   *(Alternatively, click the goggles icon in the Meta Quest Browser navigation bar).*
3. Horizon OS will prompt: *"Allow this site to enter immersive VR?"*
4. Select **Allow**.
5. Put controllers down on the table to activate **Hands-First Tracking**.

---

## 4. Hands-First Physical Interaction Verification Matrix

| Console Element | Target 3D Position | Expected Physical Gesture | Visual & Auditory Feedback | Observed Pass/Fail |
|:---|:---|:---|:---|:---:|
| **Seated Eye Level** | $[0, 1.25, 0.32]\text{ m}$ | Natural forward gaze | Globe and CubeSat centered at chest height | `[ ] PASS / FAIL` |
| **Tactile Start Pad** | Console desk | Index-finger poke or ray-pinch | Beep tone; pass commences; sector beacons pulse | `[ ] PASS / FAIL` |
| **Earth Globe Sectors** | $[0, 0.98, -0.58]\text{ m}$ | Point index finger ray at Sector B beacon and pinch thumb/index | Reticle snaps to Sector B; beacon rings expand; audio ping | `[ ] PASS / FAIL` |
| **Sensor Mode Pad** | Console desk (left) | Direct poke with index finger | Switches between OPTICAL (cyan) and RADAR (amber) | `[ ] PASS / FAIL` |
| **Scanner Tool** | Console desk (right) | Hand pinch or poke | Satellite fires swath beam across globe; telemetry sound cue | `[ ] PASS / FAIL` |
| **Evidence Cube (Tray)** | Console desk (left tray) | Near-hand squeeze/pinch grab | Physical cube lifts with hand; haptic sound trigger | `[ ] PASS / FAIL` |
| **Processing Cradle** | $[0.24, 0.79, -0.55]\text{ m}$ | Deposit cube into cradle | Cube snaps to cradle slot; compression hum; size shrinks to 1 MB | `[ ] PASS / FAIL` |
| **Downlink Bay Slots** | $[0.39, 0.79, -0.46]\text{ m}$ | Deposit cube into bay slot 1–3 | Bay clamps engage; transmission queue locks | `[ ] PASS / FAIL` |
| **Commit Downlink Pad** | Console desk (large button) | Direct hand slap or index poke | S-Band carrier alarm; live transmission starts | `[ ] PASS / FAIL` |
| **Debrief AAR Screen** | World-space spatial panel | Point index finger ray and pinch `[RESTART PASS]` | Mission state resets; console cubes return to standby | `[ ] PASS / FAIL` |

---

## 5. Comfort, Ergonomics & Performance Checklist

- [ ] **Forward Reach Envelope:** All interactive items (globe, cubes, cradle, bay, pads) sit strictly between $0.35\text{ m}$ and $0.65\text{ m}$ from the player's chest. Zero standing or extreme leaning required.
- [ ] **Framerate & Stability:** Visual motion of rotating Earth and floating CubeSat is smooth without judder, micro-stutters, or tracking loss.
- [ ] **No Motion Sickness Vectors:** Player camera is completely stationary (zero artificial locomotion, zero smooth turning).
- [ ] **Text Legibility:** Spatial panels and telemetry numbers are sharp and readable at arm's length without eye strain.

---

## 6. Known Limitations & Fallback Paths

1. **AP Isolation & Self-Signed SSL:** If Meta Quest Browser refuses to connect to the local IP, use a Cloudflare tunnel or localtunnel (`npx cloudflared tunnel --url https://localhost:8081`) to eliminate router firewall and certificate warnings.
2. **Controller Compatibility:** If lighting conditions are too dim for optical hand tracking, pick up the Meta Quest Touch Plus controllers; the same raycasts and grip triggers operate identically via controller emulation.
3. **Seated Calibration:** If the console appears too high or low relative to your physical chair, press the **Meta Quest button** on the right controller (or long-pinch right thumb/index) to reset headset zero-origin.
