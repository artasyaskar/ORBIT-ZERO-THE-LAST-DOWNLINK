# ORBIT ZERO: THE LAST DOWNLINK — Winning-Build Recommendations (Review 2)

Review date: Nov 7, 2026. Deadline: Nov 18, 12:00 PM PST (Nov 19, 1:00 AM PKT). About 10 working days remain.
Build reviewed: `2f12097` (local, 4 commits ahead of `origin/main`, not deployed).

This review looks at the redesigned build through five lenses: a first-time player, a competition judge, a UI/UX and art director, a platform executive at Meta, and the engineer who has to ship it. Every finding cites what was observed or measured. Anything not tested on a Quest headset is marked as such.

---

## 1. Honest verdict

The redesign fixed the game's core problem: it now has a real decision (read the weather, pick the sensor, choose what to sacrifice), real pressure (pass clock and live window) and a clear win/lose rule. On desktop the full loop works with the mouse only and finishes in about 2–3 minutes.

It is **not yet a winning entry**, for three reasons:

1. **Judges will play it in a Quest headset, and almost all of the new onboarding is desktop-only.** The Mission Card, the Next Step banner, the action bar and the new debrief are DOM overlays. They are hidden in XR. The headset player gets the old world-space panels with small text plus a rewritten status line.
2. **Performance is far over budget and unmeasured on device.** The emulator run measured **310 draw calls and 214,760 triangles**. `docs/ART_DIRECTION.md` sets the budget at **< 50 draw calls and < 35,000 triangles**. The main JS chunk is **7.08 MB (1.83 MB gzip)**. If Quest drops below 60 fps, the Technical score collapses, whatever else is good.
3. **The "wow" moments are told, not shown.** The puzzle relies on weather, but the globe only shows "cloudy vs clear" beacons. Smoke, storm and dust look the same. A scan produces a generic cube. The live window looks almost identical to the planning phase. Success is a text panel.

My honest estimate of the current standing, per equally weighted criterion. This is my judgement, not a measured score.

| Criterion (25% each) | Now | Reachable by Nov 17 | What moves it |
|---|---|---|---|
| Innovation & Creativity | 6/10 | 8/10 | Visible weather, sensor-specific scan reveal, physical live docking |
| Experience Design | 5/10 in XR (7/10 desktop) | 8/10 | XR Mission Card and Next Step, a shorter Academy, ground consequences |
| Technical Implementation | 4/10 (unverified fps) | 7/10 | Device-measured ≥ 72 fps, deployed link, zero console errors |
| Polish & Presentation | 5/10 | 8/10 | Weather FX, finale, sound, encoding bugs fixed, strong 2:30 video |

With 4,850 registrants, no one can promise first place. A realistic target is to **compete for the Gaming track and two special awards: Best First Five Minutes and Best Accessibility Forward Experience**. The accessibility features already exist (relaxed clock, one-hand assist, large text, captions, high contrast, reduced motion, head-point dwell); they need to be presented and verified.

---

## 2. What a first-time player experiences now (desktop, observed)

Sources: `artifacts/redesign/01…06.png` from `node tests/e2e-redesign-desktop.mjs`, all 13 checks passing.

What works:
- The Mission Card says what you are saving, what each request is worth, the weather at each target, what each sensor sees, and the win line. This is the single biggest improvement.
- The action bar makes every action visible, and the cube chips show sector, sensor, confidence, time and location.
- The debrief shows ✓ per request, "your decision", the score versus the best possible score, and a "try this" tip.

What still hurts, in order of damage:
1. **Contradictory debrief headline.** It shows "MISSION SUCCESS · GRADE A" next to "ALL THREE REQUESTS VERIFIED … (GRADE S)" (screenshot 05). Cause: `summaryHeadline` in `src/mission/scoring.ts` (~line 393) hardcodes "GRADE S" whenever `achievedBest` is true, but the grade also depends on link margin and hints.
2. **Corrupted achievement text.** The toasts render garbage such as `ðŸ›°ï¸ ZERO PACKET LOSS` and `âš¡ CLOUD PIERCER`. The source strings in `src/systems/missionControlSystem.ts` (lines ~1871, 3596–3600, 3634) are double-encoded UTF-8 (mojibake). The same achievements are also Indus-specific ("CLOUD PIERCER" requires B + RADAR) and hardcode `13.0s`.
3. **The live window feels like the planning screen.** Screenshot 04 is nearly identical to 03, apart from the timer turning red. Nothing tells you this is the climax.
4. **The ARIA box restates terrain description** ("Highland emergency fuel & medical depot beneath moderate laminar downwind smoke plume"). This reads as noise. ARIA should only speak when it has something useful to say.
5. **The action bar covers the lower console** (cradle and bay area) at 1440×960, and the cube chips wrap onto two rows. The physical stations are what make the game feel spatial, and the HUD hides them.
6. **The toast overlapped the Next Step title** in screenshots 03 and 04. It was moved to `top: 168px` after those captures; this is not re-verified by screenshot.
7. **Fireline is generous.** It ended with 16 Wh unused and 100 pts on the first try. That is fine for OP 01, but the 2:30 clock was never felt. Clock lengths need tuning with real players.

---

## 3. What a judge in a Quest headset will experience (gap analysis)

Hands-first is a hard requirement. "First five minutes" is a special award. Both are judged in the headset.

| Desktop now has | XR equivalent today | Gap |
|---|---|---|
| Mission Card (story, requests, value, weather, sensors, win line, START) | `briefing-panel.uikitml`, partially rewritten: weather, worth, win line in subtitle | No single "read this first" moment and no START. The clock starts at the first scan, so this is safe, but the player is never told the rules in XR. |
| Next Step banner | `telemetry-hud` `StatusMessageText` (now uses `getNextStep`) | Box is `height: 70px; overflow: hidden`. Three lines get clipped. |
| Request tracker chips (NEEDED / ON BOARD / LOADED / SENT) | Briefing panel REQ cards | Exists, but in small text off to the side at about 45°. |
| Pass clock | `ResourceReadout` line text | No big, glanceable clock in the forward field of view. |
| Action bar | Physical pads, lever, scanner and cradle | Good in principle; needs on-device verification. |
| ASK ARIA (paid hint) | Poke the ARIA avatar or pad | Not discoverable: nothing tells a VR player ARIA can be touched for help. |
| Debrief | `debrief-panel.uikitml` | No "score vs best possible" and no "try this" line. Mastery text still says "PROVEN OBJECTIVE …/100". |

**Conclusion: the highest-value work in the remaining 10 days is XR parity of the new onboarding.** A desktop-perfect game that is confusing in the headset will score like the original build.

---

## 4. Recommendations, prioritized

Each item lists the problem, the change, where it goes, the effort, and how to verify it.

### P0 — Must ship (blockers; target Nov 8–12)

**P0-1. Deploy and establish the device test loop (Day 1).**
- Push the 4 local commits. Add a GitHub Pages workflow (`vite.config.ts` already uses `base: './'`), or deploy to Vercel. Record the live URL in `docs/SUBMISSION_PACKAGE.md`.
- Open the URL in Quest Browser on the borrowed headset. Run `docs/QUEST_PHYSICAL_TEST_CHECKLIST.md` and fill in the PENDING fields: headset model, Horizon OS and browser versions.
- Note: `recommendations.md` showed as deleted (` D`) in `git status` before this file was rewritten. Check that this was intentional before committing.
- Verify: the live link loads from a fresh browser profile, Enter VR works, and the full Academy plus OP 01 is completed with hands only.

**P0-2. Performance budget pass to ≥ 72 fps on Quest (Days 1–3).**
- Measure first on device: OVR Metrics Tool, or the in-app F2 overlay. Then cut, starting with the biggest offenders:
  - Merge static cockpit meshes (`src/scene-assets/lib/hardsurface.ts` and `orbitalConsole.scene-asset.ts`) into a few batched meshes per material.
  - Hide or remove decorative enclosure detail that sits outside the forward field of view.
  - Reduce globe and atmosphere geometry segments, and use one cloud layer.
  - Throttle per-frame canvas and texture updates (cube canvases should redraw only on signature change, as they already do; confirm the same for the holo panels).
  - Remove unused `Points`/`Line` effects in XR.
  - Set XR framebuffer scale ≤ 1.0 and enable fixed foveation if IWSDK exposes it.
- Code-split the landing scene from the game world to cut the 7 MB main chunk.
- Target: ≤ 100 draw calls and ≤ 100k triangles in XR. The `ART_DIRECTION.md` budget (50 / 35k) is ideal but probably unrealistic in 10 days. Update the doc to the real budget instead of claiming a number the build does not meet.
- Verify: sustained ≥ 72 fps for a full pass on device, with the number recorded. If you cannot measure it, do not claim it.

**P0-3. XR onboarding parity (Days 2–4).**
- **Spatial Mission Card:** a UIKitML panel centered at about 0.9 m, in front, slightly below eye height. It shows the story line, 3 request rows (sector, value, weather, needed confidence), the win line, and two large poke buttons: START PASS and TRAINING. It closes on START and reopens at every fresh pass. Generate all text from config, the same way `missionCardHtml()` in `src/ui/desktopHudViews.ts` does. Move the shared text builders into a pure module so both DOM and UIKit use one source.
- **Next Step strip:** a dedicated, wide, short panel just above the globe. Title at ≥ 0.75° glyph height, one body line, one hands hint. Remove the 70 px clipped box.
- **Glanceable pass clock:** big digits on a diegetic display above the globe, turning amber at 25 s and red at 10 s. It doubles as the live-window countdown.
- **ARIA affordance:** a floating "ASK ARIA (−5)" label and a pulse on the avatar when the hesitation intervention fires.
- **XR debrief:** headline, score versus best possible, 3 request rows and one "try this" line. Same builders as desktop.
- Verify: an IWER run with `tests/e2e-hands-only.mjs`, a readability check with `tests/spatialReadability.test.ts` extended to the new panels, and a headset readability check.

**P0-4. Correctness bugs found in this review (half a day).**
- Grade headline contradiction: build `summaryHeadline` from the final `efficiencyGrade`, not from `achievedBest`.
- Mojibake: replace the double-encoded strings with plain ASCII or real emoji, and save the file as UTF-8. Grep for `Ã`, `ðŸ` and `â` across `src/`.
- Make achievements config-driven: trigger "sensor beat the weather" when a scan's confidence meets its request's minimum, for any scenario. Compute "Knapsack" from the actual raw versus compressed totals, not the hardcoded `13.0s`.
- Voice lines: `voiceCommander.handleSectorSelection()` only runs for `STANDARD_INDUS_PASS` and has Sector B baked in. Either make it scenario-aware, or remove it so it never contradicts the new "don't give the answer" rule.
- Remaining dead or duplicated paths: the legacy `tutorialStep` state machine in `desktopControls.ts`, `getNextTacticalHint()` in MCS (now unused for status), and the `DEFENSE_SHIELD_PASS` alias.
- Verify: unit tests for the headline and achievements; no garbage characters in a full desktop run.

**P0-5. Make the weather visible on the globe (Days 3–5).**
- The puzzle is "match the sensor to the weather", so the weather must be seen, not read.
- Per sector, show a cheap billboard volume over the beacon driven by `cloudCover`:
  - grey-white puffs for `DENSE_STORM` / `CONVECTIVE_CLOUD`
  - brown-orange drifting smoke for smoke types
  - tan haze for `SEISMIC_DUST`
  - nothing for `CLEAR`
- Use 2–4 instanced sprites per sector with one shared material, so it adds about 1–3 draw calls.
- The data already exists in `getScenarioSector()`. Today `createSectorMarkerAsset()` only receives `isCloudCovered: boolean`; pass the full weather type instead.
- Verify: screenshot each operation; a player can say which sectors are smoky without reading text.

### P1 — Make it memorable (target Nov 11–15)

**P1-1. Sensor-specific scan reveal ("the aha").**
- When a scan lands, the cube's front display (`updateCubeTelemetryCanvas()` in MCS) should show what that sensor actually saw:
  - Optical through cloud: a flat white field with "BLOCKED".
  - Thermal through smoke: dark terrain with glowing heat blobs.
  - Radar: grainy grey speckle with a bright metal glint on bridges ("blurry on metal").
  - Optical in clear sky: crisp road and bridge lines.
- Draw these procedurally on the existing 512² canvas, keyed by sensor plus confidence plus phenomenology tag.
- A previous audit noted the cube currently shows generic water/bridge art for every packet. This change turns science into something the player sees.
- Add a 0.4 s "develop" animation, and an audio sting that differs per sensor.

**P1-2. Ground-consequence finale.**
- As each packet completes in the live window:
  - its request's sector on the globe flips to a green pin;
  - a one-line "ground radio" caption and voice plays, e.g. "Convoy Alpha rerouting. Thank you, orbit." The text already exists in `consequenceOnSuccess`;
  - a chime plays.
- Packets cut off at loss of signal flip red with a short static burst.
- This gives the emotional payoff the core concept promised ("make this the visual and emotional peak") at the cost of a few nodes plus captions.

**P1-3. Live-window drama.**
- When the window opens:
  - dim the cockpit lights to about 60%;
  - show a progress bar per docked slot, which partly exists as `DownlinkSlotProgress_*`;
  - draw a horizon line moving across the globe toward the ground station;
  - start a rising tone that speeds up in the last 5 s (`playTensionHeartbeat` exists).
- Make "dock now!" obvious by pulsing the tray cubes that can still be docked.
- Verify by recording 10 s of footage; it should look different from planning at a glance.

**P1-4. Shorter, hands-first Academy (≤ 2 minutes).**
- Cut 9 steps to 5: aim, scan, inspect, compress, dock and transmit.
- Each step shows one ghost-hand animation at the target (the VR hand simulator code already renders hands) and one short sentence.
- Finish with a 10 s "you're ready" moment that launches OP 01 automatically.
- The current steps include long technical notes ("Slot 1 → 2 → 3 order at 10.0 MB/s"); move these to the debrief.

**P1-5. A reason to come back.**
- **Campaign progression:** OP 02 unlocks after any OP 01 pass, and OP 03 after OP 02. Show 1–3 stars per op (pass / Grade A / Grade S). `missionProfile` already stores `bestScore` and `bestGrade`.
- **Daily Orbit:** re-enable the daily pass, but generate it with `generateProceduralCrisis(date)`. Accept a seed only if `getMissionBenchmark()` reaches the scenario's `successScore`; reject and re-roll otherwise. This fixes the unchecked "always solvable" claim. Give procedural passes their own scenario id instead of reusing `STANDARD_INDUS_PASS`.
- Verify with a unit test over 365 dates: every daily pass is winnable.

**P1-6. Three real playtests, then tune (Nov 12–13).**
- Three people who have never seen the game. One in the headset if possible. Do not help them.
- Record time to first scan, whether they can state the goal at 60 s, the first confusion point, final score, and whether they pressed retry.
- Tune `passDurationSec`, Fireline power and Aftershock power from what you see. Today they are design guesses (150 / 150 / 140 s; 52 / 55 / 42 Wh).

### P2 — Only if P0 and P1 are done

- **Accessibility showcase** (for the special award): add a colour-blind-safe confidence palette (shape plus text are already present), and one "Accessibility" button on the Mission Card that opens the existing settings. List every option in the Devpost text and the video.
- **ARIA explains its hint:** after a hint, ARIA says why in one line ("Smoke blocks optical; thermal sees heat through it"). This strengthens the "agentic" angle without letting ARIA play for you.
- **Passthrough tabletop:** do **not** ship it unless it is purposeful and tested. The judging text says passthrough must meaningfully use the real room and hold up in untested rooms. Today the MR Tabletop toggle only hides the cabin. Hide the toggle for the submission.
- **Code health (post-deadline):** split `missionControlSystem.ts` (about 5,300 lines) into input, presentation and orchestration modules. Do not do this before the deadline; it is high risk and invisible to judges.

---

## 5. "Is everything connected?" — current status

Already single-source (done in the redesign):
- Costs, scoring values, thresholds, hint penalty, sensor guide and weather labels come from `src/mission/missionConfig.ts` (`SCORING`, `getScanCost`, `getScenarioThresholds`, `SENSOR_PLAIN_GUIDE`, `describeWeather`).
- These feed the engine, planner, debrief, desktop HUD (`src/ui/desktopHudViews.ts`), the XR briefing and telemetry panels, and the landing cards (`deriveCard()` in `src/landing/landingUI.ts`).
- Guidance is one pure function, `getNextStep()` in `src/mission/guidance.ts`, used by desktop and XR.

Still disconnected or hardcoded (to fix):

| Item | Location | Fix |
|---|---|---|
| "GRADE S" in summary headline | `scoring.ts` `summaryHeadline` | Derive from `efficiencyGrade` |
| Achievement names, conditions and `13.0s` | MCS ~1871, 3596–3634 | Config- and state-driven conditions |
| Indus-only voice coaching | MCS `handleSectorSelection` calls, `voiceCommander.ts` ~258 | Scenario-aware or removed |
| Advice strings with fixed MB/s (Fireline "B+E" text) | `scoring.ts` advice block | Template from budget |
| Procedural id reuse and unchecked solvability | `proceduralCrisis.ts` | Own id plus planner validation |
| Desktop-only onboarding builders | `desktopHudViews.ts` | Shared pure text builders for DOM and UIKit |
| Mastery text "PROVEN OBJECTIVE …/100" | MCS `syncSettings` | Use `achievableScore` and the win line |
| Old e2e scripts (`e2e-release-audit`, `e2e-spatial-rc9`, `virtual-quest/*`) | `tests/` | Re-run and update, or mark as legacy |

---

## 6. Ten-day schedule (PKT)

| Day | Work | Exit check |
|---|---|---|
| Nov 8 | P0-1 deploy, P0-4 bugs, first headset session plus fps measurement | Live URL; fps number written down |
| Nov 9–10 | P0-2 performance cuts; P0-3 XR Mission Card, Next Step strip, clock | ≥ 72 fps on device; START PASS in headset |
| Nov 11 | P0-5 globe weather; P1-1 scan reveal | Weather readable without text |
| Nov 12 | P1-2 finale, P1-3 live-window drama; playtests ×3 | Testers state the goal within 60 s |
| Nov 13 | Tuning from playtests; P1-4 Academy; XR debrief | Academy ≤ 2 min |
| Nov 14 | P1-5 stars plus validated Daily Orbit; full regression (unit, desktop e2e, hands-only e2e, headset) | All green; zero console errors |
| Nov 15 | **Feature freeze.** Record the video (headset capture or IWER) | Video uploaded publicly |
| Nov 16 | Devpost text, screenshots, honest testing statement | All fields filled |
| Nov 17 | Submit; re-open the live link from a fresh browser and from Quest | Submitted |
| Nov 18 | Buffer only. No changes | — |

---

## 7. The 2:30 video (structure)

| Time | Shot |
|---|---|
| 0:00–0:10 | Hook: hands reach for the globe; a smoke plume over the canyon; caption "1,200 evacuees. One satellite pass." |
| 0:10–0:35 | Read the weather; a wrong sensor gives a white BLOCKED cube; the right sensor reveals heat blobs (P1-1) |
| 0:35–1:05 | Compress in the cradle; the bay is too big for the window; choose what to drop (Aftershock triage) |
| 1:05–1:40 | Live window: dim cockpit, countdown, late cube docked by hand, one cube cut off at LOS |
| 1:40–2:05 | Finale: pins turn green, ground radio voices, debrief versus best possible |
| 2:05–2:20 | Retry, stars, Daily Orbit, accessibility options |
| 2:20–2:30 | Title card and honest note: "Simulated scenarios. Hands-only. Built with Meta IWSDK." |

Use real captured gameplay only. Say plainly where it was recorded (headset or emulator).

---

## 8. What not to do before the deadline

- No multiplayer, no LLM integration, no backend, no new operations.
- No large refactor of `missionControlSystem.ts`.
- No passthrough unless it is purposeful and tested in at least two rooms.
- Do not claim fps, hand-tracking quality or "tested on Quest" until it has been measured on a Quest.

---

## 9. Verification status of this review

- Measured: unit suite 300/300 passing; desktop browser e2e 13/13; hands-only IWER e2e passes; emulator renderer stats of 310 draw calls and 214,760 triangles; main chunk 7.08 MB (1.83 MB gzip).
- Observed in screenshots: the headline contradiction, the toast overlap (since moved), the action bar covering the console, and the live window looking the same as planning.
- Found in source: the mojibake achievement strings and the Indus-only voice coaching.
- Not verified: anything on a physical Quest (fps, hand tracking, readability, comfort), human playtests, or the deployed link (none exists yet).
