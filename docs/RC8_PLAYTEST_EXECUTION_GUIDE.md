# ORBIT ZERO: THE LAST DOWNLINK
# RC8 Human Playtest Execution Guide (Three Real Participants)

**Document Version:** 1.0 (Freeze Baseline `e6059f4`)  
**Target:** Facilitator Manual for Conducting 3 Real Human Evaluations  
**Ethics & Validity Standard:** Double-blind observation — Zero coaching, zero priming, zero fabricated results.  

---

## 1. Facilitator Rules of Engagement

The objective of this playtest is to measure **unassisted human comprehension, interaction discovery, and genuine enjoyment**. If you explain the mechanics or help the player, the test data is invalidated.

### 5 Strict Facilitator Invariants:
1. **Never explain the game beforehand:** Do NOT explain radar physics, Beer-Lambert extinction, the cradle compression ratio, or the knapsack time limit before they start.
2. **Read the neutral prompt verbatim:** Read only the script in Section 2. Do not add hints or advice.
3. **Observe in absolute silence:** Sit or stand slightly behind the player where you can observe their screen and mouse/hand movements without hovering over them. Take notes quietly.
4. **The 30-Second Rule:** If a participant appears stuck or confused, wait in silence for at least 30 seconds to allow them to explore. If they ask *"What do I do now?"*, reply neutrally: *"What does the screen tell you?"* or *"Try exploring the controls you see."*
5. **Record failures as valuable data:** If a player misclicks, queues the wrong packet, or runs out of time, that is a discovery for the design team, not a player failure.

---

## 2. Participant Profiles & Test Environment Setup

### Local Server Launch Command:
Ensure the build is frozen and running locally over HTTPS:
```powershell
# In PowerShell (d:\ORBIT-ZERO-THE-LAST-DOWNLINK):
npm run preview
```
Open Chrome or Edge and navigate to:
`https://localhost:8081/` *(or the port displayed in terminal; accept self-signed SSL warning)*.

---

### Target Participant Cohort:

| Participant Slot | Target Profile | Primary Evaluation Question |
|:---|:---|:---|
| **Participant 1** | **General User / Non-Gamer** (no aerospace or engineering background) | Can an everyday person understand the crisis, find the start button, and complete the triage without technical jargon confusion? |
| **Participant 2** | **Strategy / Puzzle Gamer** (plays strategy, management, or tactical puzzle games) | Does the resource trade-off (40 Wh battery vs 10.0s downlink window) create authentic tactical tension and puzzle satisfaction? |
| **Participant 3** | **Software Developer / Technical Peer** | Is the interaction feedback responsive, are scientific terms credible without being overwhelming, and does the debrief feel consequential? |

---

## 3. Verbatim Opening Script

Read this exact script to each participant before they touch the mouse/keyboard:

> *"Welcome to ORBIT ZERO: THE LAST DOWNLINK. You are an orbital intelligence operator commanding an Earth-observation satellite during an extreme disaster crisis in Sindh. A category 4 monsoon supercell has breached river levees, and 120,000 residents are trapped by rising waters.*  
>  
> *Your mission is to evaluate target sectors, decide which sensors to use, acquire evidence, and transmit verified telemetry to ground rescue teams before your satellite's 10.0-second contact window closes.*  
>  
> *Everything you need is on the screen. Please play through at your own pace. I cannot answer gameplay questions during the pass. Whenever you are ready, click the screen to begin."*

---

## 4. Observer Scorecards (To Be Filled in Real-Time)

### Participant 1 Scorecard (Non-Technical / General User):
- **Participant Codename / Initial:** `____________________`
- **Device / Input Mode:** `Desktop Chrome [Mouse & Keyboard]`
- **Observation Metrics:**
  - [ ] **Objective Comprehension:** Did they understand the goal is saving flood victims via satellite scans? (Time taken: `___` seconds)
  - [ ] **Time to Start:** Did they notice and click `COMMENCE CRISIS PASS`? (Time taken: `___` seconds)
  - [ ] **First Scan Decision:** Did they select a sector and fire the scanner? (Time taken: `___` seconds)
  - [ ] **Evidence Interpretation:** Did they read the telemetry card on the right? (Yes / No)
  - [ ] **Compression Discovery:** Did they discover the `PROCESS [P]` button/cradle? (Discovered naturally / Missed)
  - [ ] **Transmission Commit:** Did they queue packets and hit `TRANSMIT [T]` before window closed? (Yes / No)
  - [ ] **Assistance Required:** Did you have to intervene? (Zero / Minor prompt / Major intervention)
  - [ ] **Final Outcome:** Phase reached: `___________`, Final Grade: `___`, Score: `___/100`

---

### Participant 2 Scorecard (Strategy / Puzzle Gamer):
- **Participant Codename / Initial:** `____________________`
- **Device / Input Mode:** `Desktop Chrome [Mouse & Keyboard]`
- **Observation Metrics:**
  - [ ] **Resource Awareness:** Did they notice the 40 Wh battery and 10.0s window constraints? (Yes / No)
  - [ ] **Sensor Choice Understanding:** Did they switch between Optical and Radar based on weather? (Yes / No / Guessed)
  - [ ] **Knapsack Optimization:** Did they calculate whether raw packets ($4.5\text{ s}$) would overflow the $10.0\text{ s}$ window? (Yes / No)
  - [ ] **Downlink Climax Tension:** Did they watch the countdown timer and streaming bar during transmission? (Observed body language / comment: `____________________`)
  - [ ] **Debrief Scrutiny:** Did they read the Ground Rescue Impact and Telemetry Accounting? (Yes / No)
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
  - [ ] **Final Outcome:** Phase reached: `___________`, Final Grade: `___`, Score: `___/100`

---

## 5. Post-Session Interview Questions

Ask these exact 3 questions to every participant immediately after the Debrief screen appears:

1. **"What was the most interesting or satisfying part of the experience?"**
   - *Participant Response:* `__________________________________________________`
2. **"What confused, frustrated, or slowed you down?"**
   - *Participant Response:* `__________________________________________________`
3. **"Would you voluntarily play another mission to try a different strategy or improve your score? Why or why not?"**
   - *Participant Response:* `__________________________________________________`

---

## 6. How to Report the Results

Once all three playtests are complete, compile the raw observations into a concise document or reply with:
- The 3 completed scorecards.
- Key surprises (things players did that we never anticipated).
- Highest-friction usability obstacles.
- Honest verdict on whether players found the experience fun and memorable.
