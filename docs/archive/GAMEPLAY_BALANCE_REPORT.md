# ORBIT ZERO: THE LAST DOWNLINK
## Gameplay Balance & Strategy Simulation Report (RC3 Audit)

**Audit Date:** October 30, 2026  
**Auditor:** Flight Software & Simulation Dynamics Lead  
**Scope:** Exhaustive empirical evaluation of 10 distinct player strategy archetypes across all 3 mission scenarios (30 simulated runs total). Evaluates score divergence, resource margins, error recovery, and proof of non-trivial decision-making.  
**Test Suite:** [`tests/gameplayBalanceHarness.test.ts`](../tests/gameplayBalanceHarness.test.ts) (31 automated tests passing).

---

## 1. Executive Summary

This audit definitively resolves the question of whether *ORBIT ZERO: THE LAST DOWNLINK* is an interactive puzzle requiring genuine triage strategy or merely a predetermined action sequence.

### Core Verified Findings:
1. **Scenarios Require Fundamentally Different Strategies:**
   - **`STANDARD_INDUS_PASS` (100/100 Max):** Baseline emergency pass. Requires sensor differentiation (Radar on B & E under cloud decks, Optical on C in clear weather) and dual-cube compression to fit within the 10.0s window.
   - **`MONSOON_SUPERCELL_PASS` (83/100 Max):** A damage-limitation pass. Optical is 100% cloud-blocked across all target sectors. Radar penetrates the storm, but steel truss dihedral corner reflections produce intense multipath glare on Sector C, limiting confidence to `[?] PROBABLE` (18 pts). The maximum achievable score is **83 / 100**, which is explicitly rewarded with an 'S' efficiency grade because the storm limits physical certainty, not player skill.
   - **`SOLAR_BROWNOUT_PASS` (100/100 Max):** A sequence puzzle with a degraded 6-unit storage partition and 50 PWR. Blind scanning exhausts memory on the 3rd scan; the player must interleave mid-pass cradle compressions between scans (Scan B $\to$ Compress B $\to$ Scan C $\to$ Compress C $\to$ Scan E) to complete the pass with a razor-thin 2 PWR margin.
2. **Score Divergence is Substantial (0 to 100):**
   - Optimal strategy: 83 to 100 points (Grade S).
   - Poor prioritization / delayed overflow: 30 to 60 points (Grade B/C).
   - Wrong sensor selection: 18 points (Grade C).
   - Early uncoordinated transmission: 30 points (Grade C).
   - Deliberately poor decisions: 0 points (Grade C).
3. **No Unrecoverable Soft Locks:**
   - When a player overfills storage or tray capacity, the engine returns recoverable error codes (`TRAY_FULL`, `INSUFFICIENT_STORAGE`).
   - Discarding unnecessary or unverified cubes via `discardPacket()` frees memory and physical tray slots, allowing players to recover and achieve up to a 65-point Grade B debrief.

---

## 2. Empirical Strategy Matrix (30 Runs)

All metrics below represent actual observed execution outputs from `tests/gameplayBalanceHarness.test.ts`:

### 2.1 Standard Indus Basin Daylight Pass (`STANDARD_INDUS_PASS`)
*Initial Budget: 55 PWR, 9 STR, 10.0s Window*

| Strategy Archetype | Status | Score | Grade | PWR Rem | Req. Verified | Req. Partial | Req. Unver. | Tx Pkts | Drop Pkts | Key Mistake / Behavioral Note |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **1. Optimal Evidence-First** | `COMPLETED` | **100** | **S** | 7 | 3 | 0 | 0 | 3 | 0 | Optimal triage: Radar on B & E, Optical on C, 2 cradle compressions. |
| **2. Greedy Scan-Everything** | `DROPPED` | 30 | C | 13 | 1 | 0 | 2 | 2 | 1 | Scans A, B, C, D blindly; trips `INSUFFICIENT_POWER`; 3rd packet dropped at cutoff. |
| **3. Wrong Sensor Selection** | `COMPLETED` | 18 | C | 19 | 0 | 1 | 2 | 3 | 0 | Used Optical under dense clouds on B & E; only Radar on C yielded partial data (18 pts). |
| **4. Inefficient Processing** | `DROPPED` | 30 | C | 7 | 1 | 0 | 2 | 2 | 1 | Wasted 6 PWR processing non-target Sector A; lacked time to compress primary targets. |
| **5. Poor Prioritization** | `DROPPED` | 60 | B | 13 | 2 | 0 | 1 | 2 | 1 | Queued raw 4.5s and 4.0s packets in Slots 1 & 2; Highland Spur (E) dropped at 10.0s cutoff. |
| **6. Early Transmission** | `COMPLETED` | 30 | C | 41 | 1 | 0 | 2 | 1 | 0 | Downlinked 1 packet immediately; saved power but left 2 requests unaddressed. |
| **7. Delayed Overflow** | `DROPPED` | 60 | B | 19 | 2 | 0 | 1 | 2 | 1 | Queued 13.0s raw telemetry into a 10.0s window; Slot 3 dropped by loss of signal. |
| **8. Storage Discard Recovery** | `RECOVERED` | 65 | B | 5 | 2 | 0 | 1 | 3 | 0 | Hit `TRAY_FULL`; discarded Sector A; scanned target B; recovered 65 points. |
| **9. Conservative Low-Resource**| `COMPLETED` | 30 | C | 41 | 1 | 0 | 2 | 1 | 0 | Conserved 41 PWR but satisfied only Request 2 (bridge approach). |
| **10. Deliberately Poor** | `COMPLETED` | 0 | C | 47 | 0 | 0 | 3 | 1 | 0 | Queued `[X] UNVERIFIED` cloud-blocked frame; ground received zero usable telemetry. |

---

### 2.2 Monsoon Supercell Penetration Pass (`MONSOON_SUPERCELL_PASS`)
*Initial Budget: 54 PWR, 9 STR, 9.0s Window. Cloud Wall Across B, C, E.*

| Strategy Archetype | Status | Score | Grade | PWR Rem | Req. Verified | Req. Partial | Req. Unver. | Tx Pkts | Drop Pkts | Key Mistake / Behavioral Note |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **1. Optimal Evidence-First** | `COMPLETED` | **83** | **S** | 0 | 2 | 1 | 0 | 3 | 0 | Best possible in storm: Radar on B, C, E; Bridge multipath glare limits Req 2 to `PROBABLE`. |
| **2. Greedy Scan-Everything** | `DROPPED` | 30 | C | 12 | 1 | 0 | 2 | 2 | 1 | Resource exhaustion and queue overflow under 9.0s window. |
| **3. Wrong Sensor Selection** | `COMPLETED` | 18 | C | 18 | 0 | 1 | 2 | 2 | 1 | Optical is 100% opaque across all sectors in this pass; zero clear ground contact. |
| **4. Inefficient Processing** | `DROPPED` | 30 | C | 6 | 1 | 0 | 2 | 2 | 1 | Spent power compressing irrelevant Sector A. |
| **5. Poor Prioritization** | `DROPPED` | 30 | C | 12 | 1 | 0 | 2 | 2 | 1 | Window is 9.0s; uncompressed packets severely penalize downlinks. |
| **6. Early Transmission** | `COMPLETED` | 30 | C | 40 | 1 | 0 | 2 | 1 | 0 | 2 requests completely neglected. |
| **7. Delayed Overflow** | `DROPPED` | 30 | C | 18 | 1 | 0 | 2 | 2 | 1 | 13.0s raw queue into 9.0s window results in multiple packet drops. |
| **8. Storage Discard Recovery** | `RECOVERED` | 30 | C | 4 | 1 | 0 | 2 | 3 | 0 | Recovered from tray overfill, but storm constraints limited total yield. |
| **9. Conservative Low-Resource**| `COMPLETED` | 30 | C | 34 | 1 | 0 | 2 | 1 | 0 | Scanned Sector B only; 34 PWR saved. |
| **10. Deliberately Poor** | `COMPLETED` | 0 | C | 46 | 0 | 0 | 3 | 1 | 0 | Unverified frame yielded 0 points. |

---

### 2.3 Eclipse Orbit Solar Brownout (`SOLAR_BROWNOUT_PASS`)
*Initial Budget: 50 PWR, 6 STR (Degraded Partition), 8.0s Window.*

| Strategy Archetype | Status | Score | Grade | PWR Rem | Req. Verified | Req. Partial | Req. Unver. | Tx Pkts | Drop Pkts | Key Mistake / Behavioral Note |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **1. Optimal Evidence-First** | `COMPLETED` | **100** | **S** | 2 | 3 | 0 | 0 | 3 | 0 | Interleaved scans and compressions: B $\to$ cradle $\to$ C $\to$ cradle $\to$ E. Fits in 6 STR. |
| **2. Greedy Scan-Everything** | `DROPPED` | 0 | C | 22 | 0 | 0 | 3 | 1 | 1 | Fails on 3rd scan with `INSUFFICIENT_STORAGE` (6 STR limit reached). |
| **3. Wrong Sensor Selection** | `COMPLETED` | 18 | C | 22 | 0 | 1 | 2 | 2 | 0 | Optical obscured by clouds on B & E. |
| **4. Inefficient Processing** | `COMPLETED` | 30 | C | 16 | 1 | 0 | 2 | 2 | 0 | Wasted power on Sector A; 1 request verified. |
| **5. Poor Prioritization** | `DROPPED` | 30 | C | 28 | 1 | 0 | 2 | 1 | 1 | Raw packets push queue past 8.0s cutoff. |
| **6. Early Transmission** | `COMPLETED` | 30 | C | 36 | 1 | 0 | 2 | 1 | 0 | Premature commit leaves 2 requests unsatisfied. |
| **7. Delayed Overflow** | `DROPPED` | 30 | C | 28 | 1 | 0 | 2 | 1 | 1 | 13.0s raw queue into 8.0s window drops packets. |
| **8. Storage Discard Recovery** | `RECOVERED` | 65 | B | 8 | 2 | 0 | 1 | 2 | 0 | Overfilled 6 STR partition; discarded A; compressed B; completed with 65 pts. |
| **9. Conservative Low-Resource**| `COMPLETED` | 30 | C | 36 | 1 | 0 | 2 | 1 | 0 | Optical on C only; 36 PWR saved. |
| **10. Deliberately Poor** | `COMPLETED` | 0 | C | 42 | 0 | 0 | 3 | 1 | 0 | Unverified frame downlinked; 0 points. |

---

## 3. Analysis of Decision Impact & Failure Modes

1. **Greedy Play is Actively Punished:**
   In all scenarios, attempting to scan every sector without processing or planning results in either `INSUFFICIENT_POWER` or `INSUFFICIENT_STORAGE`, yielding scores of 0 to 30.
2. **Prioritization Matters as Much as Evidence Gathering:**
   A player who collects all three pieces of correct evidence but fails to compress them or queues them in the wrong order loses up to 40 points due to the horizon cutoff (`DROPPED_BY_WINDOW`).
3. **Recovery is Viable and Rewarded:**
   Strategy 8 proves that when a player makes an initial mistake (scanning non-critical sectors or filling the tray), the `discardPacket` mechanism allows them to recover, free memory, and salvage a 65-point Grade B mission.
4. **Storm Physics Enforces Intellectual Honesty:**
   In `MONSOON_SUPERCELL_PASS`, the maximum possible score is 83 because the bridge structure produces physical multipath glare. The player is taught that in disaster response, recognizing uncertainty is superior to fabricating certainty.
