# ORBIT ZERO: THE LAST DOWNLINK
# RC8 Phase 2: Gameplay Quality & Player Experience Validation

**Date:** October 31, 2026  
**Document Class:** Gameplay Mechanics & Player Psychology Audit  
**Auditor:** Flight Software & Mission Simulation Engineering  
**Baseline Commit:** `2fce0ec` + RC8 Playtest  

---

## 1. Honest Critical Evaluation of the 8 Core Questions

### Question 1: Does the player have meaningful choices?
**Evaluation: YES, the core decision nodes are genuine dilemmas rather than trivial clicks.**
- **Choice 1 (Sensor Modality vs Atmospheric Obstruction):**
  - Sector B is covered by a 95% convective storm deck ($\tau > 15$). Optical costs $8\text{ Wh}$ but returns an extinguished frame ($T < 0.001\%$, $\text{SNR} < 0\text{ dB}$). Active SAR costs $14\text{ Wh}$ but pierces the clouds to detect water sheets.
  - Sector C is a steel truss bridge under clear skies. Optical costs $8\text{ Wh}$ and clearly reveals road deck asphalt. SAR costs $14\text{ Wh}$ and produces $+18.5\text{ dB}$ dihedral multipath glare off the steel beams, making road flooding ambiguous.
  - *Player Impact:* Firing Radar everywhere is a trap: it wastes battery and creates blinding glare on steel structures. Firing Optical everywhere fails in clouds.
- **Choice 2 (Cradle Feature Extraction vs Battery Conservation):**
  - Processing costs $6\text{ Wh}$ of energy, shrinking packet size from $3.0\text{ MB}$ ($4.5\text{ s}$ TX) to $1.0\text{ MB}$ ($1.8\text{ s}$ TX).
  - With $40\text{ Wh}$ total battery, the player cannot afford to compress every packet if they also fire multiple SAR scans.
  - *Player Impact:* The player must choose *which* packets to compress based on their available transmission window.

### Question 2: Can different strategies produce different outcomes?
**Evaluation: YES, empirically proven across 10 distinct strategy profiles.**
- The automated strategy matrix proves that different strategies lead to drastically different outcomes:
  - **Optimal Evidence-First:** Scores $100$ ($S$-grade), $0$ dropped packets, $7\text{ Wh}$ battery reserve.
  - **Greedy Scan-Everything:** Scores $30$ ($C$-grade), suffers `INSUFFICIENT_POWER` and tray overflow.
  - **Wrong Sensor Selection:** Scores $18$ ($C$-grade), downlinks cloud washout, leaves ground teams blind.
  - **Poor Packet Prioritization:** Scores $60$ ($B$-grade), heavy raw packet causes the critical highland spur evidence to drop at the $10.0\text{ s}$ LOS cutoff.
  - **Deliberately Poor Decisions:** Scores $0$ ($C$-grade), downlinks useless unverified frames.

### Question 3: Are the consequences understandable?
**Evaluation: Mostly YES, but requires clear ground context.**
- In RC7, the debrief card was updated to display **Ground Rescue Impact**:
  - `REQ 1` (Road Inundation): Explains whether relief convoys were diverted around flooded levees.
  - `REQ 2` (Crossing Approach): Explains whether heavy engineering equipment safely crossed the steel bridge.
  - `REQ 3` (Shelter Basin): Explains whether highland shelter evacuation was authorized.
- *Caveat:* These outcomes must always be labeled as `[Simulated Crisis Response Model]` to maintain scientific and ethical integrity.

### Question 4: Does the player have a reason to care about the three rescue requests?
**Evaluation: PARTIALLY — Narrative stakes need stronger human framing.**
- The stakes are real: 120,000 residents trapped by rising floodwaters in Sindh.
- However, when the player looks at the screen, the requests are labeled as `REQ 1`, `REQ 2`, `REQ 3`. This sounds like an engineering bug tracker or procurement document.
- *Improvement for RC8:* Rebrand the requests with operational human stakes:
  - `PRIMARY CONVOY ARTERY (Sector B)`
  - `RIVER CROSSING ESCAPE ROUTE (Sector C)`
  - `HIGHLAND COMMUNITY REFUGE (Sector E)`

### Question 5: Is the resource-management challenge enjoyable or merely tedious?
**Evaluation: ENJOYABLE when paced well, TEDIOUS if text is too dense.**
- The knapsack math ($10.0\text{ s}$ window, $4.5\text{ s}$ raw vs $1.8\text{ s}$ compressed) is satisfying to solve. It creates the "puzzle aha!" moment.
- What made it feel tedious previously was that the player had to read lengthy scientific paragraphs to discover basic rules.
- *Improvement for RC8:* Use visual badges, progress bars, and high-contrast color coding so the player understands their margins at a single glance.

### Question 6: Does the downlink create genuine tension?
**Evaluation: YES, the countdown creates authentic urgency.**
- The real-time S-Band transmission over the $10.0\text{ s}$ contact window with carrier lock, packet progress bars, and LOS warning creates genuine spatial tension.
- When a packet is in danger of being cut off, the amber `LOS RISK ⚠️` indicator forces the player to watch the clock with their breath held.

### Question 7: Does the debrief make the player's decisions feel important?
**Evaluation: YES, but needs cleaner layout.**
- Showing the delivered vs dropped packets, grade breakdown, and counterfactual analysis ("If you had compressed Sector B, you would have had 2.7s more downlink time") provides genuine closure and accountability.

### Question 8: Does the game provide a satisfying reason to replay?
**Evaluation: YES, through scenario variety and score improvement.**
- With 3 distinct crisis passes (`STANDARD_INDUS_PASS`, `MONSOON_SUPERCELL_PASS`, `SOLAR_BROWNOUT_PASS`), each pass requires a different balance of sensors and compression.
- Replaying to turn a $B$ or $C$ grade into an $S$ grade by shaving transmission seconds is engaging.
