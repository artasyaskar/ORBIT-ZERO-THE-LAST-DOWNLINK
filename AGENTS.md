# AGENTS.md — Canonical Agent Instructions for ORBIT ZERO: THE LAST DOWNLINK

## 1. Project Identity & Mission
- **Title:** ORBIT ZERO: THE LAST DOWNLINK
- **Core Promise:** *"Every scan costs something. Every packet competes for the last downlink. Your job is to send the right evidence before the window closes."*
- **Genre & Track:** Seated, hands-first spatial strategy & emergency-intelligence triage puzzle game for the **Meta VR Start Developer Competition 2026** (**Gaming Track**, **New Experience Division**).
- **Target Platform:** Meta Quest Browser (Horizon OS) via WebXR and desktop development/emulation via IWER + Playwright.
- **Hard Deadline:** **November 18, 2026 @ 12:00 PM PST** (**November 19, 2026 @ 01:00 AM PKT / GMT+5**). Zero modifications are permitted after the deadline.

## 2. Approved Technical Architecture
- **Runtime Stack:** Meta Immersive Web SDK (`@iwsdk/core@1.0.1` latest stable), Three.js (`three@npm:super-three@0.181.0`, re-exported via `@iwsdk/core`), `@pmndrs/uikit@^1.0.74` + `@pmndrs/uikit-horizon@^1.0.74`, TypeScript, Vite (`@iwsdk/vite-plugin-dev@1.0.1`), and Vitest (`^3.0.7`).
- **Lifecycle & ECS:** Always bootstrap via `World.create(container, projectOptions)` using `projectOptions from 'virtual:iwsdk-project'` (`iwsdk.config.json`), register systems via `world.registerSystem(...)`, author reusable 3D models in `src/scene-assets/*.scene-asset.ts` registered in `src/assets.ts`, compose scenes in `public/scenes/main.iwsdk.scene.json`, and use `world.launchXR()` / `world.exitXR()`. Never manually instantiate `new THREE.WebGLRenderer()` or import directly from `'three'` in application code (always import Three.js classes from `@iwsdk/core`).
- **Strict Separation of Concerns:**
  - `src/mission/` contains **pure, deterministic TypeScript simulation logic** (zero Three.js or WebXR imports) tested via Vitest (`tests/missionEngine.test.ts`).
  - `src/components.ts` and `src/systems/` contain IWSDK ECS components and systems bridging mission state, XR hand/pointer/grab interactions (`OneHandGrabbable`, `DistanceGrabbable`, `RayInteractable`, `Pressed`, `Grabbed`), procedural Web Audio synthesis (`src/systems/orbitalAudio.ts`), and 3D presentation.
  - `public/ui/*.uikitml` contains spatial UI definitions registered as `AssetType.UIKitML` in `src/assets.ts` and mounted as world-space `UIKitMLAsset` scene nodes.
- **No Unapproved Frameworks:** Do not add React, React Three Fiber, backend databases, AI/LLM APIs, or live satellite APIs.

## 3. Non-Negotiable Product & Engineering Principles
1. **Hands-First Mandate:** Every interaction from launch to debrief and restart must be 100% completable using hands alone (no controller or keyboard required in XR), while maintaining controller/emulator compatibility.
2. **Seated Airplane-Seat Ergonomics:** All interactive objects (Earth globe, scanner tool, data cubes, processing cradle, downlink bay, UI controls) must sit comfortably within a 0.35 m – 0.65 m forward reach envelope (`< 0.6 m` radius).
3. **Deterministic Scientific Credibility:** Scenarios are fictional simulations grounded in Earth-observation physics (optical cloud obstruction vs. SAR/radar cloud penetration and geometric/speckle ambiguity; onboard feature extraction reducing packet size at an energy cost without fabricating missing evidence). Never claim real satellite control, live imagery, or real rescue predictions.
4. **Inspect Before Mutating:** Always read the target file, its types, and its tests before editing. Preserve useful existing work and comments.
5. **No Completion Without Empirical Evidence:** Never claim a feature works, a test passes, or a frame budget is met without running the verification command and reporting actual observed output. Clearly distinguish unit tests, desktop headless/emulator checks, and physical Meta Quest device tests.

## 4. Required Context Documents
Consult these documents before making architectural, gameplay, or visual changes:
- [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) — Durable product memory, verified facts, mechanics, and scope boundaries.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Module layout, ECS component/system design, data flow, and hardware constraints.
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — Phased roadmap, tasks, dependencies, and exit gates.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — Architectural Decision Records (ADRs). Do not silently reverse recorded decisions.
- [`docs/RISK_REGISTER.md`](docs/RISK_REGISTER.md) — Active technical, hardware, schedule, and compliance risks.
- [`docs/TESTING_AND_ACCEPTANCE.md`](docs/TESTING_AND_ACCEPTANCE.md) — Unit, emulator, and headset test protocols and competition compliance checklist.
- [`docs/ART_DIRECTION.md`](docs/ART_DIRECTION.md) — Orbital console aesthetic, color tokens, spatial typography, audio cues, and GPU budgets.
- Local reference files (untracked in Git, read-only): `devpost.txt` and `core_concept`.

## 5. Skill Usage Protocol
- **`hz-iwsdk-webxr` (`.agents/skills/hz-iwsdk-webxr/SKILL.md`):** Primary reference for IWSDK ECS APIs, `OneHandGrabbable` / `DistanceGrabbable`, `RayInteractable` / `PokeInteractable`, `PanelUI` / `UIKitML`, Quest Browser gotchas, and Playwright GPU profiling (`--use-angle=d3d11`).
- **Get Shit Done / GSD (`PROJECT_RULES.md`, `.agents/skills/planner`, `executor`, `verifier`):** Use for phase/wave decomposition, atomic task commits (`type(scope): description`), and three-level artifact verification (exists, substantive, wired). Never chain shell commands with `&&` or `||` in Windows PowerShell.
- **Gravitas (`.agents/skills/gravitas/SKILL.md`):** Follow the 6 invariants (ground before mutating, stay in scope, completion needs evidence, never exact-retry a failure, satisfy the contract, state what cannot be verified). Note: `doctor.py` confirmed native runtime hooks are **not** installed (`native_hooks_available: false`); enforce invariants through explicit agent workflow and verification commands.
- **UI UX Pro Max (`.agents/skills/ui-ux-pro-max/SKILL.md`):** Use selectively (`--stack threejs`, contrast, hierarchy, feedback timing). Never apply 2D SaaS web layouts, marketing landing pages, or heavy glassmorphism to the VR scene.

## 6. Verification & Reporting Standard
Every implementation turn must verify changes and report:
1. **What Changed:** Exact files created/modified and behavioral delta.
2. **Evidence:** Exact command run (`npm test`, `npm run build`, Playwright/emulator check) and observed output.
3. **Unverified Scope:** Explicitly flag any behavior that requires human visual verification in IWER or on a physical Meta Quest headset.
