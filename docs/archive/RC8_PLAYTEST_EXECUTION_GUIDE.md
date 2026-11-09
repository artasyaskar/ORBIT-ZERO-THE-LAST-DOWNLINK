# ORBIT ZERO: THE LAST DOWNLINK
# RC8 Human Playtest Execution Guide (Three Real Participants)

**Document Version:** 1.1 (Freeze Baseline `e6059f4`)  
**Target:** Facilitator Manual for Conducting 3 Real Human Evaluations  
**Methodology Standard:** Neutral moderated usability playtest — Exploratory qualitative feedback (3 participants identify recurring friction, not statistically representative conclusions); zero coaching, zero priming, zero fabricated results.  

---

## 1. Facilitator Rules of Engagement

The objective of this playtest is to measure **unassisted human comprehension, interaction discovery, and genuine enjoyment**. If you explain the mechanics or coach the player, the test data is invalidated.

### 5 Strict Facilitator Invariants:
1. **Never explain the game beforehand:** Do NOT explain satellites, sensors, scanning, processing, packet queuing, or the downlink window before they start. Let them discover what the interface is telling them.
2. **Read the neutral prompt verbatim:** Read only the unprimed script in Section 3. Do not add hints, background lore, or operational advice.
3. **Observe in absolute silence:** Sit or stand slightly behind the player where you can observe their screen and mouse/hand movements without hovering over them. Take notes quietly.
4. **The 30-Second Rule:** If a participant appears stuck or confused, wait in silence for at least 30 seconds to allow them to explore. If they ask *"What do I do now?"*, reply neutrally: *"What does the screen tell you?"* or *"Try interacting with anything that looks usable."*
5. **Assistance Protocol:** Don't explain mechanics unless the participant cannot proceed because of a technical failure. Record any assistance you provide on the scorecard.

---

## 2. Participant Profiles & Test Environment Setup

### Server Launch Commands:

#### Option A: Local Desktop Playtesting (Recommended for Initial Usability):
Run the server bound to loopback on the testing laptop:
```powershell
npm run preview -- --host 127.0.0.1 --port 8081
```
Open Google Chrome or Microsoft Edge and navigate to:
`https://localhost:8081/` *(Accept self-signed SSL warning by clicking "Advanced" -> "Proceed to localhost")*.

#### Option B: LAN Testing from Another Device (Laptop / Tablet on same Wi-Fi):
Run the server bound to all network interfaces (`0.0.0.0`):
```powershell
npm run preview -- --host 0.0.0.0 --port 8081
```
Find your PC's IP address (`ipconfig` -> IPv4 Address, e.g. `10.5.32.225`).  
On the client device, navigate to:  
`https://<YOUR_PC_IP>:8081/` (e.g. `https://10.5.32.225:8081/`).  
*(Note: Requires both devices to be on the same Wi-Fi subnet without router AP client isolation)*.

---

### Target Participant Cohort (Exploratory Usability Study):
*Three participants cannot establish statistically representative conclusions; this cohort provides focused qualitative discovery of recurring friction.*

| Participant Slot | Target Profile | Primary Usability Question |
|:---|:---|:---|
| **Participant 1** | **General User / Non-Gamer** (no aerospace or engineering background) | Can an everyday person understand the crisis, find the start button, and complete the triage without technical jargon confusion? |
| **Participant 2** | **Strategy / Puzzle Gamer** (plays strategy, management, or tactical puzzle games) | Does the resource trade-off (40 Wh battery vs 10.0s downlink window) create authentic tactical tension and puzzle satisfaction? |
| **Participant 3** | **Software Developer / Technical Peer** | Is the interaction feedback responsive, are scientific terms credible without being overwhelming, and does the debrief feel consequential? |

---

## 3. Verbatim Opening Script (Completely Unprimed)

Read this exact script to each participant before they touch the mouse/keyboard. Do NOT explain sensors, scanning, processing, packet queuing, or the downlink mechanics:

> *"Welcome to ORBIT ZERO: THE LAST DOWNLINK.*  
>  
> *Please explore the experience and try to complete the mission. Take your time, and interact with anything that looks usable.*  
>  
> *I won't explain the controls or help you during the session because I want to understand how easy the experience is for a new player.*  
>  
> *Please think aloud if something confuses you. There are no wrong answers in this test."*

---

## 4. Observer Scorecards (To Be Filled in Real-Time)

### Participant 1 Scorecard (Non-Technical / General User):
- **Participant Codename / Initial:** `____________________`
- **Device / Input Mode:** `Desktop Chrome [Mouse & Keyboard]`
- **Observation Metrics:**
  - [ ] **Objective Comprehension:** Did they understand what the mission is without explanation? (Time taken: `___` seconds)
  - [ ] **Time to Start:** Did they notice and click `COMMENCE CRISIS PASS`? (Time taken: `___` seconds)
  - [ ] **First Action Taken:** What was the very first element they clicked? (`____________________`)
  - [ ] **Sensor Discovery:** Did they discover that sensors can be toggled between Optical and Radar? (Yes / No / Missed)
  - [ ] **Evidence Interpretation:** Did they read the telemetry card on the right? (Yes / No)
  - [ ] **Compression Discovery:** Did they discover the `PROCESS [P]` button or cradle? (Discovered naturally / Missed)
  - [ ] **Transmission Commit:** Did they queue packets and hit `TRANSMIT [T]`? (Yes / No)
  - [ ] **Assistance Required:** Record any assistance given: `__________________________________________________`
  - [ ] **Final Outcome:** Phase reached: `___________`, Final Grade: `___`, Score: `___/100`

---

### Participant 2 Scorecard (Strategy / Puzzle Gamer):
- **Participant Codename / Initial:** `____________________`
- **Device / Input Mode:** `Desktop Chrome [Mouse & Keyboard]`
- **Observation Metrics:**
  - [ ] **Resource Awareness:** Did they notice the 40 Wh battery and 10.0s window constraints? (Yes / No)
  - [ ] **Sensor Choice Understanding:** Did they switch between Optical and Radar based on weather, or guess? (`____________________`)
  - [ ] **Knapsack Optimization:** Did they calculate whether raw packets ($4.5\text{ s}$) would overflow the $10.0\text{ s}$ window? (Yes / No)
  - [ ] **Downlink Climax Tension:** Did they watch the countdown timer and streaming bar during transmission? (Observed body language: `____________________`)
  - [ ] **Debrief Scrutiny:** Did they read the Ground Rescue Impact and Telemetry Accounting? (Yes / No)
  - [ ] **Assistance Required:** Record any assistance given: `__________________________________________________`
  - [ ] **Final Outcome:** Phase reached: `___________`, Final Grade: `___`, Score: `___/100`

---

### Participant 3 Scorecard (Developer / Technical Peer):
- **Participant Codename / Initial:** `____________________`
- **Device / Input Mode:** `Desktop Chrome [Mouse & Keyboard]`
- **Observation Metrics:**
  - [ ] **Visual Hierarchy:** Did the layout feel clean or cluttered? Any text overlap noted? (`____________________`)
  - [ ] **Scientific Terminology:** Did terms like SAR, Optical extinction, and SNR feel intuitive or confusing? (`____________________`)
  - [ ] **Interaction Latency:** Any noticeable stutter, lag, or dropped frames during 3D globe rotation? (Yes / No)
  - [ ] **Recovery & Unqueue:** Did they attempt to unqueue or reorder packets? (Yes / No)
  - [ ] **Assistance Required:** Record any assistance given: `__________________________________________________`
  - [ ] **Final Outcome:** Phase reached: `___________`, Final Grade: `___`, Score: `___/100`

---

## 5. Standardized Post-Session Questions

Ask these exact 3 questions to every participant immediately after the Debrief screen appears:

1. **"What was the most interesting or satisfying part of the experience?"**
   - *Participant Response:* `__________________________________________________`
2. **"What confused, frustrated, or slowed you down?"**
   - *Participant Response:* `__________________________________________________`
3. **"Would you voluntarily play another mission to try a different strategy or improve your score? Why or why not?"**
   - *Participant Response:* `__________________________________________________`

---

## 6. How to Report the Results

Once all three playtests are complete, compile the raw observations into a concise summary:
- The 3 completed scorecards with exact timestamps.
- Recurring points of confusion or misclicks across participants.
- Highest-friction usability obstacles.
- Honest assessment of whether players found the experience engaging and intuitive.
