/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Cinematic Landing UI Layer (RC9.3 Polish)
 *
 * Grounded in authentic aerospace command ergonomics:
 * - Clean, non-boxed, elegant floating welcome typography (zero bulky dark containers, zero + marks).
 * - Compact, centered mode selection cards with modern spatial glassmorphism.
 * - Prominent, 100% reliable "RETURN TO ORBIT VIEW" navigation.
 * - High-contrast tactile action buttons.
 */

import type { MissionScenarioId } from '../mission/types';

export interface CampaignCardSpec {
  id: 'ORBITAL_ACADEMY' | 'FIRELINE_PASS' | 'STANDARD_INDUS_PASS' | 'AFTERSHOCK_PASS';
  scenarioId: MissionScenarioId;
  startTutorial: boolean;
  opCode: string;
  title: string;
  region: string;
  budgetLine: string;
  sensorsLine: string;
  briefing: string;
  requestsSummary: string;
}

export const CAMPAIGN_MENU_CARDS: readonly CampaignCardSpec[] = [
  {
    id: 'ORBITAL_ACADEMY',
    scenarioId: 'ORBITAL_ACADEMY',
    startTutorial: true,
    opCode: 'OP 00: ORBITAL ACADEMY',
    title: 'Hand Gesture & Triage Training',
    region: 'Bolan Fireline Emergency Zone — Guided 9-Step Spatial Certification [SIMULATED]',
    budgetLine: '52 Wh Power • 9 STR Buffer (18 MB/STR) • 10.0s Window @ 10.0 MB/s',
    sensorsLine: 'Teaches: Point, Pinch, Grab, Place & Release, Tracking Recovery',
    briefing:
      'Interactive 9-step onboarding for Meta Quest hand tracking and desktop controls. Learn how to point at globe sectors, pinch to scan Sector B (Bolan Canyon Highway) with Thermal IR, grab 3D Data Cubes, release inside the 15 cm Processing Cradle (3 STR -> 1 STR, 42 MB -> 18 MB) & 18 cm Downlink Bay snap zones, and recover smoothly if hand tracking drops.',
    requestsSummary:
      'STEP 1-3: Point & Pinch Scan • STEP 4-6: Grab, Inspect & Cradle Compress (42 MB -> 18 MB) • STEP 7-9: Dock & Transmit',
  },
  {
    id: 'FIRELINE_PASS',
    scenarioId: 'FIRELINE_PASS',
    startTutorial: false,
    opCode: 'OP 01: FIRELINE',
    title: 'Bolan Fireline Emergency Zone',
    region: 'Bolan Canyon & Juniper Ridge — Smoke Penetration Triage [SIMULATED]',
    budgetLine: '52 Wh Power • 9 STR Buffer (18 MB/STR) • 10.0s Window @ 10.0 MB/s',
    sensorsLine: 'Sensors: Thermal IR (11 Wh, 42 MB) • Optical (8 Wh, 40 MB) • SAR (14 Wh, 45 MB)',
    briefing:
      'Dense biomass smoke plumes obscure Sector B (Bolan Canyon Highway) and Sector E (Juniper Ridge Fuel Depot), blocking passive Optical cameras via Mie scattering. Use Mid-Wave Thermal IR (3.9 um) to penetrate smoke and locate 860 K flame fronts, and use 0.75m GSD Optical on clear-sky Sector C (Bolan Viaduct & Firebreak). Pre-scan clue: a thermal anomaly is also reported in Sector D (Sibi Basalt & Kiln Flats), where industrial surface heating is a possible alternative explanation to active vegetation combustion.',
    requestsSummary:
      'REQ 1: Sector B Active Flame Front ([OK] CONFIRMED) • REQ 2: Sector C Viaduct Firebreak ([OK] CONFIRMED) • REQ 3: Sector E Fuel Depot Perimeter ([OK] CONFIRMED)',
  },
  {
    id: 'STANDARD_INDUS_PASS',
    scenarioId: 'STANDARD_INDUS_PASS',
    startTutorial: false,
    opCode: 'OP 02: MONSOON SHIELD',
    title: 'Indus Basin Flood Response',
    region: 'Sukkur & Guddu Barrage — Storm Cloud SAR Triage [SIMULATED]',
    budgetLine: '55 Wh Power • 9 STR Buffer (18 MB/STR) • 10.0s Window @ 10.0 MB/s',
    sensorsLine: 'Sensors: SAR Radar (14 Wh, 45 MB) • Optical (8 Wh, 40 MB)',
    briefing:
      'Opaque monsoon storm clouds cover Sector B (Levee Breach) and Sector E (Relief Staging), blocking Optical reflectance. Use 5.4 GHz SAR Radar to penetrate cloud decks (smooth open water appears dark; flooded vegetation shows bright double-bounce returns), and use clear-sky Optical on Sector C to avoid steel bridge multipath glare.',
    requestsSummary:
      'REQ 1: Sector B Levee Breach ([OK] CONFIRMED) • REQ 2: Sector C Evacuation Bridge ([OK] CONFIRMED) • REQ 3: Sector E Relief Access ([?] PROBABLE+)',
  },
  {
    id: 'AFTERSHOCK_PASS',
    scenarioId: 'AFTERSHOCK_PASS',
    startTutorial: false,
    opCode: 'OP 03: AFTERSHOCK',
    title: 'Quetta Fault Seismic Crisis',
    region: 'Hanna Valley & Chaman Fault — Multi-Temporal Change Detection [SIMULATED]',
    budgetLine: '50 Wh Power • Tight 6 STR Partition (18 MB/STR) • 9.0s Window @ 10.0 MB/s',
    sensorsLine: 'Sensors: SAR + Cradle Pre/Post Baseline • Optical • Thermal IR',
    briefing:
      'Post-earthquake silicate dust plumes shroud Sector B (Hanna Valley Gorge) and Sector E (Chaman Fault Substation), while degraded solid-state memory restricts storage to 6 Storage Units (STR). Compress cubes mid-pass in the Processing Cradle (3 STR -> 1 STR, 18 MB / 1.8s) to run Pre/Post-Event Multi-Temporal SAR Backscatter Comparison and upgrade [?] PROBABLE SAR scans to [OK] CONFIRMED potential surface-change evidence.',
    requestsSummary:
      'REQ 1: Sector B Landslide Dam ([OK] CONFIRMED) • REQ 2: Sector C Hospital Viaduct ([OK] CONFIRMED) • REQ 3: Sector E Fault Substation ([OK] CONFIRMED)',
  },
] as const;

export interface LandingLaunchSelection {
  launchXR: boolean;
  scenarioId: MissionScenarioId;
  startTutorial: boolean;
}

export interface LandingUIEvents {
  onEnterExperience: () => void;
  onSelectCampaign?: (card: CampaignCardSpec) => void;
  onPlayDesktop: (selection: LandingLaunchSelection) => void;
  onEnterVR: (selection: LandingLaunchSelection) => void;
  onToggleMute: () => boolean;
  onBackToOrbit: () => void;
}

export class LandingUI {
  private container: HTMLElement;
  private events: LandingUIEvents;
  private rootEl!: HTMLDivElement;
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private heroScreenEl!: HTMLDivElement;
  private selectionScreenEl!: HTMLDivElement;
  private muteBtnEl!: HTMLButtonElement;
  private vrAdvisoryEl!: HTMLDivElement;

  private isWebXRSupported = false;
  private selectedCard: CampaignCardSpec = CAMPAIGN_MENU_CARDS[1]; // Default to OP 01: FIRELINE

  constructor(container: HTMLElement, events: LandingUIEvents) {
    this.container = container;
    this.events = events;

    this.checkWebXRSupport();
    this.buildDOM();
    this.attachListeners();
  }

  private async checkWebXRSupport(): Promise<void> {
    if (typeof navigator !== 'undefined' && 'xr' in navigator && (navigator as any).xr?.isSessionSupported) {
      try {
        this.isWebXRSupported = await (navigator as any).xr.isSessionSupported('immersive-vr');
      } catch {
        this.isWebXRSupported = false;
      }
    } else {
      this.isWebXRSupported = false;
    }
    this.updateVRCardState();
  }

  private buildDOM(): void {
    this.rootEl = document.createElement('div');
    this.rootEl.id = 'orbit-landing-root';
    this.rootEl.innerHTML = `
      <!-- TOP NAVIGATION BAR -->
      <header class="oz-landing-header">
        <div class="oz-brand-badge">
          <span class="oz-dot-live"></span>
          <span class="oz-badge-text">ORBITAL OPERATIONS // 400 KM LEO</span>
        </div>
        <div class="oz-header-actions">
          <div class="oz-telemetry-pill">
            <span class="oz-telemetry-label">GROUND LINK:</span>
            <span class="oz-telemetry-val">KARACHI [LOCK]</span>
          </div>
          <button id="btn-landing-mute" class="oz-btn-mute-toggle" title="Toggle Mission Audio" aria-label="Toggle Mission Audio">
            <span id="mute-icon" class="oz-mute-icon">🔊</span>
            <span id="mute-label" class="oz-mute-text">AUDIO ON</span>
          </button>
        </div>
      </header>

      <!-- SCREEN 1: HERO VIEW -->
      <main id="oz-hero-screen" class="oz-screen oz-screen-active">
        <div class="oz-hero-content">
          <div class="oz-telemetry-stamp">
            <span>ROLE: ORBITAL TRIAGE OFFICER</span> • <span>LINK: 10.0 MB/s S-BAND</span> • <span>50–55 Wh BUDGET</span>
          </div>

          <h1 class="oz-hero-title">
            <span class="oz-title-glow">ORBIT ZERO</span>
            <span class="oz-hero-subtitle">THE LAST DOWNLINK</span>
          </h1>

          <p class="oz-supporting-line">HANDS-FIRST SPATIAL SATELLITE TRIAGE STRATEGY GAME [SIMULATED]</p>

          <!-- CLEAN, ELEGANT FLOATING QUOTE + MISSION PURPOSE -->
          <div class="oz-hero-welcome">
            <p class="oz-welcome-line">Every scan costs capacitor energy (Wh). Every data cube (MB) competes for the last downlink.</p>
            <p class="oz-welcome-text">
              Command a multi-sensor Earth-observation satellite passing over South Asia.<br />
              Inspect Optical, Thermal IR, and SAR Radar physics, compress valid evidence in the Processing Cradle (45 MB → 18 MB), and transmit verified intelligence to Karachi Ground Station before Loss of Signal.
            </p>
          </div>

          <div class="oz-hero-cta-group">
            <button id="btn-enter-experience" class="oz-btn-primary" autofocus>
              <span class="oz-btn-text">ENTER MISSION CONTROL</span>
              <span class="oz-btn-arrow">→</span>
            </button>
            <button id="btn-hero-tutorial" class="oz-btn-ghost oz-btn-hero-secondary">
              <span class="oz-btn-text">OP 00: ORBITAL ACADEMY (TUTORIAL)</span>
            </button>
          </div>
        </div>

        <div class="oz-hero-footer">
          <div class="oz-system-indicator">
            <span class="oz-badge-chip">GROUND STATION: KARACHI (10.0 MB/s)</span>
            <span class="oz-badge-chip">3 CAMPAIGN OPERATIONS + ACADEMY</span>
            <span class="oz-badge-chip">META VR START 2026</span>
          </div>
          <p class="oz-credit-line">
            Earth day, night and relief maps: Solar System Scope, CC BY 4.0, based on NASA data.
            <a href="assets/ATTRIBUTION.md" target="_blank" rel="noopener">Full asset credits</a>
          </p>
        </div>
      </main>

      <!-- SCREEN 2: CAMPAIGN & EXPERIENCE SELECTION -->
      <section id="oz-selection-screen" class="oz-screen oz-screen-hidden" aria-hidden="true">
        <div class="oz-selection-content">
          <!-- PROMINENT BACK NAVIGATION (ALWAYS VISIBLE & UNBLOCKED) -->
          <div class="oz-selection-nav">
            <button id="btn-back-orbit" class="oz-btn-back" title="Return to Orbit View">
              <span class="oz-nav-arrow">←</span>
              <span class="oz-nav-text">RETURN TO ORBIT VIEW</span>
            </button>
          </div>

          <div class="oz-selection-header">
            <h2 class="oz-selection-heading">SELECT CAMPAIGN OPERATION & TERMINAL</h2>
            <p class="oz-selection-subheading">100% POINTER / PINCH OPERABLE — NO KEYBOARD REQUIRED</p>
          </div>

          <!-- 4-OPERATION CAMPAIGN SELECTOR -->
          <div id="oz-campaign-grid" class="oz-campaign-grid" role="radiogroup" aria-label="Select Campaign Operation">
            <button type="button" role="radio" id="card-op-academy" class="oz-op-card" data-op-id="ORBITAL_ACADEMY">
              <span class="oz-op-code">OP 00: ORBITAL ACADEMY</span>
              <strong class="oz-op-title">Hand Gesture Tutorial</strong>
              <span class="oz-op-meta">9-Step Point, Pinch, Grab & Dock</span>
            </button>
            <button type="button" role="radio" id="card-op-fireline" class="oz-op-card oz-op-card-active" data-op-id="FIRELINE_PASS">
              <span class="oz-op-code">OP 01: FIRELINE</span>
              <strong class="oz-op-title">Bolan Fireline Zone</strong>
              <span class="oz-op-meta">52 Wh • 9 STR (18 MB/STR) • Thermal IR</span>
            </button>
            <button type="button" role="radio" id="card-op-monsoon" class="oz-op-card" data-op-id="STANDARD_INDUS_PASS">
              <span class="oz-op-code">OP 02: MONSOON SHIELD</span>
              <strong class="oz-op-title">Indus Basin Flood</strong>
              <span class="oz-op-meta">55 Wh • 9 STR (18 MB/STR) • SAR Cloud</span>
            </button>
            <button type="button" role="radio" id="card-op-aftershock" class="oz-op-card" data-op-id="AFTERSHOCK_PASS">
              <span class="oz-op-code">OP 03: AFTERSHOCK</span>
              <strong class="oz-op-title">Quetta Fault Crisis</strong>
              <span class="oz-op-meta">50 Wh • 6 STR (18 MB/STR) • Change Det.</span>
            </button>
          </div>

          <!-- MISSION BRIEFING PREVIEW PANEL -->
          <div id="oz-mission-briefing-preview" class="oz-briefing-preview">
            <div class="oz-briefing-top">
              <div>
                <span id="oz-briefing-opcode" class="oz-briefing-opcode">OP 01: FIRELINE</span>
                <h3 id="oz-briefing-title" class="oz-briefing-title">Bolan Fireline Emergency Zone — Bolan Canyon & Juniper Ridge [SIMULATED]</h3>
              </div>
              <span id="oz-briefing-budget" class="oz-briefing-budget">52 Wh Power • 9 STR Buffer (18 MB/STR) • 10.0s Window @ 10.0 MB/s</span>
            </div>
            <p id="oz-briefing-text" class="oz-briefing-text">
              Dense biomass smoke plumes obscure Sector B (Bolan Canyon Highway) and Sector E (Juniper Ridge Fuel Depot), blocking passive Optical cameras via Mie scattering. Use Mid-Wave Thermal IR (3.9 um) to penetrate smoke and locate 860 K flame fronts, and use 0.75m GSD Optical on clear-sky Sector C (Bolan Viaduct & Firebreak). Pre-scan clue: a thermal anomaly is also reported in Sector D (Sibi Basalt & Kiln Flats), where industrial surface heating is a possible alternative explanation to active vegetation combustion.
            </p>
            <div id="oz-briefing-requests" class="oz-briefing-requests">
              REQ 1: Sector B Active Flame Front ([OK] CONFIRMED) • REQ 2: Sector C Viaduct Firebreak ([OK] CONFIRMED) • REQ 3: Sector E Fuel Depot Perimeter ([OK] CONFIRMED)
            </div>
          </div>

          <div class="oz-cards-grid">
            <!-- OPTION 1: DESKTOP WORKSTATION (COMPACT & SLEEK) -->
            <div class="oz-card oz-card-desktop" id="card-desktop" tabindex="0">
              <div class="oz-card-header">
                <span class="oz-card-badge">DESKTOP WORKSTATION</span>
                <span class="oz-card-fps">POINTER + DRAG</span>
              </div>
              <h3 class="oz-card-title">DESKTOP EXPERIENCE</h3>
              <p class="oz-card-desc">
                Operate the satellite console using pointer clicks and 3D drag-and-drop (zero keyboard required).
              </p>
              <div class="oz-card-pills">
                <span class="oz-pill">3D RAYCAST</span>
                <span class="oz-pill">SNAP CRADLE</span>
                <span class="oz-pill">TELEMETRY HUD</span>
              </div>
              <button id="btn-play-desktop" class="oz-btn-card oz-btn-desktop">
                PLAY ON DESKTOP
              </button>
            </div>

            <!-- OPTION 2: VR SPATIAL COCKPIT (COMPACT & SLEEK) -->
            <div class="oz-card oz-card-vr" id="card-vr" tabindex="0">
              <div class="oz-card-header">
                <span class="oz-card-badge">SPATIAL COCKPIT</span>
                <span class="oz-card-fps">HANDS-FIRST</span>
              </div>
              <h3 class="oz-card-title">VR EXPERIENCE</h3>
              <p class="oz-card-desc">
                Immerse yourself inside the seated orbital command module on Meta Quest Browser with hands-first pinch & grab.
              </p>
              <div class="oz-card-pills">
                <span class="oz-pill">HAND TRACKING</span>
                <span class="oz-pill">PINCH & POKE</span>
                <span class="oz-pill">SEATED COCKPIT</span>
              </div>
              <button id="btn-enter-vr" class="oz-btn-card oz-btn-vr">
                ENTER VR
              </button>
              <div id="vr-status-badge" class="oz-vr-status">Checking WebXR...</div>
            </div>
          </div>

          <!-- VR ADVISORY MODAL -->
          <div id="oz-vr-advisory" class="oz-advisory oz-hidden">
            <div class="oz-advisory-content">
              <h4>📡 WEBXR HEADSET ADVISORY</h4>
              <p id="oz-vr-advisory-text">
                WebXR Immersive Session is not detected on this browser. To play in VR, please open this link inside the <b>Meta Quest Browser</b> on your Quest 2/3/3S/Pro headset.
              </p>
              <div class="oz-advisory-actions">
                <button id="btn-advisory-play-desktop" class="oz-btn-primary oz-btn-small">
                  PLAY ON DESKTOP INSTEAD
                </button>
                <button id="btn-advisory-close" class="oz-btn-ghost oz-btn-small">
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;

    this.container.appendChild(this.rootEl);

    this.heroScreenEl = this.rootEl.querySelector('#oz-hero-screen')!;
    this.selectionScreenEl = this.rootEl.querySelector('#oz-selection-screen')!;
    this.muteBtnEl = this.rootEl.querySelector('#btn-landing-mute')!;
    this.vrAdvisoryEl = this.rootEl.querySelector('#oz-vr-advisory')!;
  }

  private updateVRCardState(): void {
    const vrBadge = this.rootEl.querySelector('#vr-status-badge');
    if (!vrBadge) return;

    if (this.isWebXRSupported) {
      vrBadge.textContent = '● WebXR Ready — Headset Detected';
      vrBadge.className = 'oz-vr-status oz-vr-ready';
    } else {
      vrBadge.textContent = '○ WebXR Available on Meta Quest Browser';
      vrBadge.className = 'oz-vr-status oz-vr-fallback';
    }
  }

  /** Initial radio state without firing onSelectCampaign (the default card is pre-selected in markup). */
  private syncCampaignCardA11y(): void {
    this.rootEl.querySelectorAll<HTMLButtonElement>('.oz-op-card').forEach((btn) => {
      const isSelected = btn.getAttribute('data-op-id') === this.selectedCard.id;
      btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      btn.tabIndex = isSelected ? 0 : -1;
    });
  }

  public selectCampaignCard(opId: CampaignCardSpec['id']): void {
    const found = CAMPAIGN_MENU_CARDS.find((c) => c.id === opId);
    if (!found) return;
    this.selectedCard = found;

    const cards = this.rootEl.querySelectorAll<HTMLButtonElement>('.oz-op-card');
    cards.forEach((btn) => {
      const isSelected = btn.getAttribute('data-op-id') === opId;
      btn.classList.toggle('oz-op-card-active', isSelected);
      btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      btn.tabIndex = isSelected ? 0 : -1; // roving tabindex: the group is one tab stop
    });

    const opCodeEl = this.rootEl.querySelector('#oz-briefing-opcode');
    const titleEl = this.rootEl.querySelector('#oz-briefing-title');
    const budgetEl = this.rootEl.querySelector('#oz-briefing-budget');
    const textEl = this.rootEl.querySelector('#oz-briefing-text');
    const reqEl = this.rootEl.querySelector('#oz-briefing-requests');

    if (opCodeEl) opCodeEl.textContent = found.opCode;
    if (titleEl) titleEl.textContent = `${found.title} — ${found.region}`;
    if (budgetEl) budgetEl.textContent = found.budgetLine;
    if (textEl) textEl.textContent = found.briefing;
    if (reqEl) reqEl.textContent = found.requestsSummary;

    this.events.onSelectCampaign?.(found);
  }

  public getSelectedLaunch(launchXR: boolean): LandingLaunchSelection {
    return {
      launchXR,
      scenarioId: this.selectedCard.scenarioId,
      startTutorial: this.selectedCard.startTutorial,
    };
  }

  private attachListeners(): void {
    // "ENTER MISSION CONTROL" primary CTA
    this.rootEl.querySelector('#btn-enter-experience')?.addEventListener('click', () => {
      this.events.onEnterExperience();
      this.transitionToSelection();
    });

    // "OP 00: ORBITAL ACADEMY (TUTORIAL)" secondary CTA on Hero screen
    this.rootEl.querySelector('#btn-hero-tutorial')?.addEventListener('click', () => {
      this.selectCampaignCard('ORBITAL_ACADEMY');
      this.events.onEnterExperience();
      this.transitionToSelection();
    });

    // Campaign operation cards
    const opCards = this.rootEl.querySelectorAll<HTMLButtonElement>('.oz-op-card');
    opCards.forEach((btn) => {
      btn.addEventListener('click', () => {
        const opId = btn.getAttribute('data-op-id') as CampaignCardSpec['id'] | null;
        if (opId) {
          this.selectCampaignCard(opId);
        }
      });
      // WAI-ARIA radio group keys: arrows move selection and focus together, Home/End jump.
      btn.addEventListener('keydown', (e: KeyboardEvent) => {
        const list = Array.from(opCards);
        const at = list.indexOf(btn);
        let next = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (at + 1) % list.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (at - 1 + list.length) % list.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = list.length - 1;
        if (next < 0) return;
        e.preventDefault();
        const target = list[next];
        const opId = target.getAttribute('data-op-id') as CampaignCardSpec['id'] | null;
        if (opId) this.selectCampaignCard(opId);
        target.focus();
      });
    });
    this.syncCampaignCardA11y();

    // "PLAY ON DESKTOP" card & button CTA
    this.rootEl.querySelector('#card-desktop')?.addEventListener('click', () => {
      this.events.onPlayDesktop(this.getSelectedLaunch(false));
    });

    // "ENTER VR" card & button CTA
    this.rootEl.querySelector('#card-vr')?.addEventListener('click', () => {
      if (this.isWebXRSupported) {
        this.events.onEnterVR(this.getSelectedLaunch(true));
      } else {
        this.showVRAdvisory();
      }
    });

    // "RETURN TO ORBIT VIEW" back button (100% reliable click handler)
    const backBtn = this.rootEl.querySelector('#btn-back-orbit');
    backBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.events.onBackToOrbit();
      this.transitionToHero();
    });

    // Audio Mute / Unmute Toggle
    this.muteBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const isMuted = this.events.onToggleMute();
      this.updateMuteIcon(isMuted);
    });

    // Advisory fallbacks
    this.rootEl.querySelector('#btn-advisory-play-desktop')?.addEventListener('click', () => {
      this.hideVRAdvisory();
      this.events.onPlayDesktop(this.getSelectedLaunch(false));
    });
    this.rootEl.querySelector('#btn-advisory-close')?.addEventListener('click', () => {
      this.hideVRAdvisory();
    });

    // Keyboard accessibility: Escape closes advisory
    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!this.vrAdvisoryEl.classList.contains('oz-hidden')) {
          this.hideVRAdvisory();
        }
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
  }

  public transitionToSelection(): void {
    this.heroScreenEl.classList.remove('oz-screen-active');
    this.heroScreenEl.classList.add('oz-screen-hidden');
    this.heroScreenEl.setAttribute('aria-hidden', 'true');

    this.selectionScreenEl.classList.remove('oz-screen-hidden');
    this.selectionScreenEl.classList.add('oz-screen-active');
    this.selectionScreenEl.setAttribute('aria-hidden', 'false');

    // Focus desktop button for accessibility
    setTimeout(() => {
      (this.rootEl.querySelector('#btn-play-desktop') as HTMLButtonElement)?.focus();
    }, 200);
  }

  public transitionToHero(): void {
    this.selectionScreenEl.classList.remove('oz-screen-active');
    this.selectionScreenEl.classList.add('oz-screen-hidden');
    this.selectionScreenEl.setAttribute('aria-hidden', 'true');

    this.heroScreenEl.classList.remove('oz-screen-hidden');
    this.heroScreenEl.classList.add('oz-screen-active');
    this.heroScreenEl.setAttribute('aria-hidden', 'false');

    setTimeout(() => {
      (this.rootEl.querySelector('#btn-enter-experience') as HTMLButtonElement)?.focus();
    }, 200);
  }

  public showVRAdvisory(): void {
    this.vrAdvisoryEl.classList.remove('oz-hidden');
  }

  public hideVRAdvisory(): void {
    this.vrAdvisoryEl.classList.add('oz-hidden');
  }

  public updateMuteIcon(isMuted: boolean): void {
    const icon = this.rootEl.querySelector('#mute-icon');
    const label = this.rootEl.querySelector('#mute-label');
    if (icon) {
      icon.textContent = isMuted ? '🔇' : '🔊';
    }
    if (label) {
      label.textContent = isMuted ? 'MUTED' : 'AUDIO ON';
    }
  }

  public dispose(): void {
    if (this.onKeyDown) {
      window.removeEventListener('keydown', this.onKeyDown);
      this.onKeyDown = null;
    }
    if (this.rootEl?.parentElement) {
      this.rootEl.parentElement.removeChild(this.rootEl);
    }
  }
}
