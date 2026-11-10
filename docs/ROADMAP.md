# ORBIT ZERO: Post-Contest Product Roadmap (Tier 2)

> **Scope Rule:** All items below are explicitly deferred until **after** the Meta VR Start Developer Competition 2026 submission lock (Nov 16 code freeze / Nov 19 deadline). Competition builds remain 100% static, backend-free, offline-safe WebXR.

---

## Phase 5: Meta Horizon Store PWA / TWA Distribution
- **Web App Manifest & Store Icons:** Package static `dist/` build as a Meta Horizon Store PWA/TWA (`display: standalone`, auto-enter WebXR hint, 512px maskable icons, splash card).
- **Digital Asset Links:** Serve signed `.well-known/assetlinks.json` via production HTTPS domain so Horizon Store TWA opens fullscreen without browser chrome.
- **VRC Checklist Verification:** Validate Meta Virtual Reality Check requirements on physical Quest 3 / Quest 3S (comfort rating, entitlement-free guest launch, focus-loss suspend < 1 frame drift, 72 Hz / 90 Hz frame pacing).

## Phase 6: Optional Accounts, Leaderboards & Verified Run Codes
- **Hash-Verified Run Code Relay:** Optional lightweight Edge endpoint accepting signed compact Run Codes (`OZ-DAILY-YYYYMMDD-100S-...`) derived from deterministic action journals (`getJournal()`) so friends can compare Daily Challenge efficiency without sending raw replay logs.
- **Zero-Auth Guest Local First:** Preserve complete offline/unauthenticated single-player parity (`orbit-zero-profile-v1` in `localStorage`) so network outages or enterprise proxies never block play.

## Phase 7: New Crisis Theatres & Telemetry Analytics
- **Additional Theatres:**
  - *Operation 04 — Cryo Melt:* Polar ice-shelf fracture + SAR vs. Thermal sea-ice lead discrimination.
  - *Operation 05 — Ash Corridor:* Volcanic tephra plume vs. aviation corridor clearance under strict orbital window cutoff.
- **Telemetry Opt-In (Aggregated Funnel Only):** Anonymous client-side drop-off timing (Step 1..9 completion, first-scan sensor accuracy, first-run retry rate) stored locally or posted only with explicit consent.
- **Localization & Audio Narration:** Localized spatial UIKit text bundles + pre-rendered lightweight Opus radio voice clips as fallback where OS Web Speech synthesis lacks high-quality offline voices.
