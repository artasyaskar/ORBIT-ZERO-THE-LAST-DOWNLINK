# ORBIT ZERO: THE LAST DOWNLINK
# RC8 Phase 5: Neutral Human Playtest Protocol & Evaluation Framework

**Date:** October 31, 2026  
**Document Class:** User Research & Ergonomic Playtest Standard  
**Target:** First-Time Human Evaluators (Judges, External Developers, General Players)  
**Standard:** Double-blind observation — Zero priming, zero leading prompts, neutral facilitation.  

---

## 1. Playtest Objective & Guiding Principles

The objective of this protocol is to measure how an unassisted first-time player discovers, understands, interacts with, and feels about *ORBIT ZERO: THE LAST DOWNLINK*.

### Non-Negotiable Facilitation Rules:
1. **No Pre-Briefing:** Do NOT explain the game controls, the science of SAR, or the knapsack mechanic before they start.
2. **Neutral Prompt Only:** Provide only the opening instruction:
   > *"You are an orbital intelligence operator in a low-Earth orbit satellite console during an extreme disaster crisis. A Category 4 monsoon supercell has breached river levees in Sindh. Follow the on-screen mission cues and try to transmit the best evidence to ground rescue teams before the contact window closes."*
3. **No Interventions:** If the player pauses or seems stuck, observe silently for at least 30 seconds before asking a neutral open question (*"What are you currently looking at?"* or *"What do you think is happening right now?"*).
4. **Honest Recording:** Record exact timestamps, points of confusion, misclicks, and genuine unprimed feedback. Never coach the participant or explain why a mechanic works the way it does.

---

## 2. Playtest Structure & Observer Scorecard

### Test Environment Separation:
- **Track A (Desktop Demonstration / Emulator):** Chrome / Edge on desktop laptop with mouse and keyboard shortcuts.
- **Track B (WebXR Immersive Emulation):** IWER Quest 3 emulation in browser.
- **Track C (Physical Quest 3/3S Headset):** Meta Quest Browser (Horizon OS) via local HTTPS or hosted origin. *(Explicitly marked as pending physical hardware availability).*

---

### Quantitative Observation Metrics:

| Participant ID | Metric | Observed Measurement | Benchmark / Target | Evaluation |
|:---|:---|:---:|:---:|:---:|
| **Tester 1** (Non-technical player) | Time to understand crisis objective | Measured during run | $< 15\text{ s}$ | Measures onboarding clarity |
| | Time to first meaningful decision | Measured during run | $< 30\text{ s}$ | Measures transition from reading to playing |
| | Undiscovered mechanics | Record if any | 0 critical mechanics | Checks UI discoverability |
| | Transmission knapsack awareness | Yes / No / Partial | Yes (aware of $10\text{ s}$ limit) | Checks knapsack tension |
| | Debrief comprehension | High / Medium / Low | High (understands convoy outcome) | Checks narrative payoff |
| | Replay desire | 1–5 scale | $\ge 4/5$ | Measures fun & agency |
| **Tester 2** (Gamer / Strategy player) | Time to understand crisis objective | Measured during run | $< 10\text{ s}$ | Pacing & visual hierarchy |
| | Time to first meaningful decision | Measured during run | $< 20\text{ s}$ | Strategy & resource triage |
| | Compression vs raw trade-off | Deliberate / Random | Deliberate | Measures resource puzzle |
| | Downlink tension observed | High / Moderate / None | High | Measures emotional climax |
| | Score achieved | Numeric (0–100) | $\ge 60$ ($B$ or $S$ grade) | Measures mechanical mastery |
| | Replay desire | 1–5 scale | $\ge 4/5$ | Measures replayability |
| **Tester 3** (Developer / Technical peer) | UI text readability vs clutter | Clear / Cluttered | Clean & Focused | Checks visual hierarchy |
| | Scientific accessibility | Accessible / Overwhelming | Accessible & Credible | Checks terminology balance |
| | Interaction responsiveness | Instant / Laggy | Instant ($< 16\text{ ms}$) | Checks runtime performance |
| | Ground consequence authenticity | Credible / Trivial | Grounded & Impactful | Checks ethical framing |
| | Replay desire | 1–5 scale | $\ge 4/5$ | Overall judge impression |

---

## 3. Post-Session Interview Questions (Standardized)

Ask participants these 5 exact questions immediately after the debrief screen appears:

1. **"In your own words, what was your mission and what were you trying to achieve?"**
   *(Verifies whether the player understood the crisis context or was just clicking buttons).*
2. **"When you made your sensor choices, what guided your decision?"**
   *(Verifies whether the player understood the cloud vs clear sky trade-off or guessed).*
3. **"Did you feel any time pressure or resource constraints during the pass?"**
   *(Verifies whether the 40 Wh battery and 10.0s downlink window created genuine tension).*
4. **"Did the final debrief make your choices feel consequential?"**
   *(Verifies whether the ground convoy impact and telemetry accounting provided closure).*
5. **"Would you want to play another pass to improve your score or try a different crisis scenario? Why or why not?"**
   *(Direct measurement of replayability and fun).*

---

## 4. Hardware Transparency Note

- This protocol is standardized for execution across desktop browsers, WebXR desktop emulators, and physical Meta Quest headsets.
- When results are logged, each tester entry must explicitly declare the device profile used (`Desktop_NonXR`, `Desktop_IWER_Emulation`, or `Quest3_Physical_Device`).
- Data must never combine or conflate emulated pointer interactions with physical hand tracking.
