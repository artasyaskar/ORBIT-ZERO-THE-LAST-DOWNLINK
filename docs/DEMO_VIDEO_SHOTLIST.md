# ORBIT ZERO: THE LAST DOWNLINK
## Official Competition Gameplay Demo Video Shot List (< 3 Minutes)

**Target Video Duration:** 2 minutes 45 seconds (Strictly under 3:00 minute competition limit)  
**Capture Platform:** Direct 1080p WebXR capture from Meta Quest 3 via Meta Quest Developer Hub (MQDH) or desktop IWER 60 FPS recording  
**Audio Track:** In-engine procedural Web Audio synthesis + real player vocal walkthrough (zero AI video generators or synthetic stock footage)

---

## 1. Video Architecture Overview

```
0:00 ──► [01. THE HOOK: Seated Cockpit & Indus Basin] (0:20)
0:20 ──► [02. THE MISSION: Ground Requests & Simulated Window] (0:20)
0:40 ──► [03. SENSOR PHYSICS: Optical Obscuration vs. SAR Penetration] (0:30)
1:10 ──► [04. TACTILE CRADLE: Onboard Feature Extraction & Memory Math] (0:25)
1:35 ──► [05. THE SIGNATURE MOMENT: Waveguide Bay Prioritization Under Pressure] (0:30)
2:05 ──► [06. THE LAST DOWNLINK: S-Band Carrier Transmission & Loss of Signal] (0:20)
2:25 ──► [07. EVIDENCE-FIRST DEBRIEF: Traceable Provenance & Real Consequences] (0:20)
```

---

## 2. Timed Scene-by-Scene Shot Breakdown

### Scene 1: The Hook — Seated Orbital Cupola (0:00 – 0:20)
- **Visual:** Player seated in orbital cupola. Forward view shows the 3D South Asia Earth hero globe floating at arm's reach (`0.54 m`). Karachi night lights and animated monsoon cloud layers visible across the Indus basin. A 3U CubeSat flies in tandem orbit with subtle green ADCS attitude lock and cyan EPS status LEDs.
- **Action:** Player raises hands into frame; Quest hand tracking meshes are clearly visible. Player looks around the modular cockpit deck showing tactile hardware: scanner holster, evidence tray, processing cradle, downlink bay.
- **Narrative Voiceover:** *"Every scan costs something. Every packet competes for the last downlink. Welcome to ORBIT ZERO: an emergency-intelligence triage puzzle built hands-first for Meta Horizon OS."*

### Scene 2: The Briefing — 3 Ground Requests (0:20 – 0:40)
- **Visual:** Camera pans slightly left to the spatial Briefing Panel.
- **Action:** Player reaches out and pinches to recenter viewpoint with one click. Points to the three ground emergency requests:
  - `REQ_1`: Assess Highway Inundation under storm clouds.
  - `REQ_2`: Assess River Crossing Approach in clear slot.
  - `REQ_3`: Evaluate Highland Spur floodline.
- **Narrative Voiceover:** *"Disaster teams on the ground in the Indus River basin have sent three urgent intelligence requests. Our satellite is about to pass beyond the radio horizon in a simulated downlink window. We must gather the right evidence before the window closes."*

### Scene 3: Sensor Phenomenology — Optical vs. SAR (0:40 – 1:10)
- **Visual:** Hand picks up the handheld scanner wand from its holster. Aiming laser and projection cone illuminate Sector B.
- **Action:**
  1. *Optical Rejection:* Player attempts an optical scan on Sector B. Thick cloud deck blocks visible light; system returns `[X] UNVERIFIED` with cloud Mie scattering explanation.
  2. *Sensor Switch:* Player toggles the tactile console switch to **RADAR (SAR)**. Wand laser glows cyan.
  3. *SAR Penetration:* Player scans Sector B again. Microwave beam pierces the storm; an acrylic physical Evidence Cube materializes and docks into Tray Slot 1 with `[OK] CONFIRMED` surface floodline telemetry.
- **Narrative Voiceover:** *"Passive optical cameras cannot see through monsoon clouds. Switching to coherent C-band radar penetrates the weather, detecting specular water reflection across the highway alignment."*

### Scene 4: The Processing Cradle — Feature Extraction (1:10 – 1:35)
- **Visual:** Close-up on the physical Evidence Cube showing live holographic 512x512 canvas texture.
- **Action:** Player picks up the cube from the tray with bare hands and drops it into the illuminated **Processing Cradle**.
- **Feedback:** Cradle halo pulses cyan with haptic hum; raw raster (3 STR, 4.5s Tx) compresses into vectorized water-mask boundary data (1 STR, 1.8s Tx) for 6 power units.
- **Narrative Voiceover:** *"Raw satellite rasters are too large for our communication pipe. Dropping the cube into the processing cradle vectorizes flood boundaries onboard, cutting transmission time by over 60%."*

### Scene 5: The Signature Moment — Downlink Bay Prioritization (1:35 – 2:05)
- **Visual:** Player scans Sector C with Optical and Sector E with Radar. The 3-slot Downlink Bay sits directly ahead.
- **Action:** Player slots all three cubes into the Downlink Bay. Overhead HUD shows the queue countdown:
  - Demonstrates poor order: raw uncompressed cubes exceed the 10.0s window.
  - Player rearranges cubes: compressed packets fit cleanly into 5.4s of the 10.0s window with a 4.6s safety margin.
- **Narrative Voiceover:** *"This is the heart of ORBIT ZERO: triage under pressure. The player decides which evidence deserves the limited radio horizon."*

### Scene 6: The Last Downlink — S-Band Microwave Beam (2:05 – 2:25)
- **Visual:** Player pushes the physical glowing **COMMIT DOWNLINK** button.
- **Action:** Live S-band microwave waveguide activates. Concentric animated data pulse rings shoot upward toward the CubeSat. Countdown timer ticks: 5.4s... 3.2s... 1.0s... 0.0s. Transmitter locks on ground station dish as the Indus horizon dips beneath the satellite curve.
- **Audio Cue:** Flight director voice: *"CARRIER LOCK: All queued evidence packets received by ground station. Loss of signal."*

### Scene 7: Traceable Debrief & Ground Consequences (2:25 – 2:45)
- **Visual:** Spatial Debrief Visor deploys.
- **Action:** Displays **Grade S 100/100 Optimal Triage**. Shows the full 4-stage evidence provenance chain (`OBS -> CRADLE -> BAY -> S-BAND-TX`), request outcomes, ground rescue units successfully dispatched, and counterfactual replay breakdown.
- **Closing Screen:**
  - *Title:* ORBIT ZERO: THE LAST DOWNLINK
  - *Track:* Meta VR Start Developer Competition 2026 (Gaming Track)
  - *Platform:* Meta Quest Browser (Horizon OS)
  - *URL:* Accessible on hosted HTTPS origin.

---

## 3. Production Notes for the Creator

1. **No Pre-Rendered Cutscenes:** Every second of footage must come directly from real-time gameplay.
2. **Show Bare Hands:** Ensure hands and fingers are frequently in frame making pinch, point, and grab gestures.
3. **Pacing:** Avoid lingering on static menus; keep the camera focused on the central triangle: Earth $\to$ Processing Cradle $\to$ Downlink Bay.
4. **Resolution:** Capture at 1080p (or 1440x1000) at 60 FPS minimum with smooth head motion.
