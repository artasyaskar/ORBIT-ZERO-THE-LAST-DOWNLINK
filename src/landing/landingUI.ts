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
import {
  describeWeather,
  getScenarioRequests,
  getScenarioSector,
  getScenarioThresholds,
  GROUND_REQUEST_ORDER,
  DOWNLINK_THROUGHPUT_MBPS,
  MISSION_SCENARIOS,
  requestValue,
  SENSOR_PLAIN_GUIDE,
} from '../mission/missionConfig';
import { formatClock } from '../mission/guidance';
import { TUTORIAL_STEPS } from '../mission/tutorialEngine';
import { loadMissionProfile, starsFor, starString } from '../systems/missionProfile';

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

const RAW_CAMPAIGN_CARDS: readonly CampaignCardSpec[] = [
  {
    id: 'ORBITAL_ACADEMY',
    scenarioId: 'ORBITAL_ACADEMY',
    startTutorial: true,
    opCode: 'OP 00: ORBITAL ACADEMY',
    title: 'Hand Gesture & Triage Training',
    region: 'Bolan Fireline Emergency Zone — Guided 9-Step Spatial Certification [SIMULATED]',
    budgetLine: '', // derived from the scenario budget in deriveCard
    sensorsLine: 'Teaches: Point, Pinch, Grab, Place & Release, Tracking Recovery',
    briefing: '', // derived from storyLine in deriveCard
    requestsSummary:
      'STEP 1-3: Point & Pinch Scan • STEP 4-6: Grab, Inspect & Cradle Compress • STEP 7-9: Dock & Transmit',
  },
  {
    id: 'FIRELINE_PASS',
    scenarioId: 'FIRELINE_PASS',
    startTutorial: false,
    opCode: 'OP 01: FIRELINE',
    title: 'Bolan Fireline Emergency Zone',
    region: 'Bolan Canyon & Juniper Ridge — Smoke Penetration Triage [SIMULATED]',
    budgetLine: '', // derived from the scenario budget in deriveCard
    sensorsLine: '', // derived from availableSensors in deriveCard
    briefing: '', // derived from storyLine in deriveCard
    requestsSummary: '', // derived from the scenario requests in deriveCard
  },
  {
    id: 'STANDARD_INDUS_PASS',
    scenarioId: 'STANDARD_INDUS_PASS',
    startTutorial: false,
    opCode: 'OP 02: MONSOON SHIELD',
    title: 'Indus Basin Flood Response',
    region: 'Sukkur & Guddu Barrage — Storm Cloud SAR Triage [SIMULATED]',
    budgetLine: '', // derived from the scenario budget in deriveCard
    sensorsLine: '', // derived from availableSensors in deriveCard
    briefing: '', // derived from storyLine in deriveCard
    requestsSummary: '', // derived from the scenario requests in deriveCard
  },
  {
    id: 'AFTERSHOCK_PASS',
    scenarioId: 'AFTERSHOCK_PASS',
    startTutorial: false,
    opCode: 'OP 03: AFTERSHOCK',
    title: 'Quetta Fault Seismic Crisis',
    region: 'Hanna Valley & Chaman Fault — Multi-Temporal Change Detection [SIMULATED]',
    budgetLine: '', // derived from the scenario budget in deriveCard
    sensorsLine: '', // derived from availableSensors in deriveCard
    briefing: '', // derived from storyLine in deriveCard
    requestsSummary: '', // derived from the scenario requests in deriveCard
  },
] as const;

/**
 * Card text is derived from the scenario config so the landing page can never disagree with the game
 * (budgets, clock, win line) and never prints the sensor answer: only the weather clue.
 */
function deriveCard(card: CampaignCardSpec): CampaignCardSpec {
  const s = MISSION_SCENARIOS[card.scenarioId];
  if (!s) return card;
  const requests = getScenarioRequests(card.scenarioId);
  const { successScore } = getScenarioThresholds(card.scenarioId);
  const clock = s.passDurationSec ? `${formatClock(s.passDurationSec)} pass clock` : 'no clock';
  const sensors = (s.availableSensors ?? ['RADAR', 'OPTICAL']).map((m) => SENSOR_PLAIN_GUIDE[m].label).join(' • ');
  return {
    ...card,
    budgetLine: `${s.budget.initialPower} Wh battery • ${s.budget.maxStorage} memory blocks • ${s.budget.downlinkDurationSec.toFixed(1)}s window • ${clock} • win at ${successScore}+ pts`,
    sensorsLine: card.startTutorial ? card.sensorsLine : `Sensors: ${sensors}`,
    briefing: s.storyLine ?? card.briefing,
    requestsSummary: card.startTutorial
      ? card.requestsSummary
      : GROUND_REQUEST_ORDER.map((id) => {
        const r = requests[id];
        const sector = getScenarioSector(card.scenarioId, r.targetSectorId);
        return `Sector ${r.targetSectorId}: ${r.shortLabel.split('|')[1]?.trim() ?? r.title} (${requestValue(r)} pts, ${describeWeather(sector.cloudCover).toLowerCase()})`;
      }).join(' • '),
  };
}

export const CAMPAIGN_MENU_CARDS: readonly CampaignCardSpec[] = RAW_CAMPAIGN_CARDS.map(deriveCard);

/** First-time players start in the 90-second Academy; returning players go straight to OP 01. */
export function defaultCampaignCard(): CampaignCardSpec {
  return loadMissionProfile().tutorialComplete ? CAMPAIGN_MENU_CARDS[1] : CAMPAIGN_MENU_CARDS[0];
}

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
  private selectedCard: CampaignCardSpec = defaultCampaignCard();

  constructor(container: HTMLElement, events: LandingUIEvents) {
    this.container = container;
    this.events = events;

    this.buildDOM();
    this.refreshCardsFromConfig();
    this.attachListeners();
    void this.checkWebXRSupport();
  }

  private async checkWebXRSupport(): Promise<void> {
    if (typeof window !== 'undefined' && ((window as any).IWER_DEVICE || (window as any).__ORBIT_IWER__)) {
      this.isWebXRSupported = true;
      this.updateVRCardState();
      return;
    }
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
            <span>ROLE: ORBITAL TRIAGE OFFICER</span> • <span>ONE PASS</span> • <span>THREE REQUESTS</span> • <span>ONE DOWNLINK</span>
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
              Read the weather, pick the sensor that can see through it, shrink the evidence, and choose what reaches the ground before the window closes. You cannot always save everyone.
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
            <span class="oz-badge-chip">GROUND STATION: KARACHI (${DOWNLINK_THROUGHPUT_MBPS} MB/s)</span>
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
              <span class="oz-op-meta"></span>
            </button>
            <button type="button" role="radio" id="card-op-monsoon" class="oz-op-card" data-op-id="STANDARD_INDUS_PASS">
              <span class="oz-op-code">OP 02: MONSOON SHIELD</span>
              <strong class="oz-op-title">Indus Basin Flood</strong>
              <span class="oz-op-meta"></span>
            </button>
            <button type="button" role="radio" id="card-op-aftershock" class="oz-op-card" data-op-id="AFTERSHOCK_PASS">
              <span class="oz-op-code">OP 03: AFTERSHOCK</span>
              <strong class="oz-op-title">Quetta Fault Crisis</strong>
              <span class="oz-op-meta"></span>
            </button>
          </div>

          <!-- MISSION BRIEFING PREVIEW PANEL -->
          <div id="oz-mission-briefing-preview" class="oz-briefing-preview">
            <div class="oz-briefing-top">
              <div>
                <span id="oz-briefing-opcode" class="oz-briefing-opcode">OP 01: FIRELINE</span>
                <h3 id="oz-briefing-title" class="oz-briefing-title">Bolan Fireline Emergency Zone — Bolan Canyon & Juniper Ridge [SIMULATED]</h3>
              </div>
              <span id="oz-briefing-budget" class="oz-briefing-budget"></span>
            </div>
            <!-- Filled by refreshCardsFromConfig() from the scenario config. -->
            <p id="oz-briefing-text" class="oz-briefing-text"></p>
            <div id="oz-briefing-requests" class="oz-briefing-requests"></div>
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
                <button id="btn-advisory-try-vr" class="oz-btn-ghost oz-btn-small">
                  OPEN VR LOBBY ANYWAY
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

  /** Writes config-derived text into the card grid and the briefing preview for the default card. */
  private refreshCardsFromConfig(): void {
    const metaFor: Record<string, string> = {};
    const profile = loadMissionProfile();
    for (const card of CAMPAIGN_MENU_CARDS) {
      const s = MISSION_SCENARIOS[card.scenarioId];
      const record = profile.mastery[card.scenarioId];
      const stars = card.startTutorial ? '' : ` • ${starString(starsFor(record, getScenarioThresholds(card.scenarioId).successScore))}`;
      metaFor[card.id] = card.startTutorial
        ? `No clock • ${TUTORIAL_STEPS.length} guided steps${profile.tutorialComplete ? ' • DONE' : ''}`
        : `${s.budget.initialPower} Wh • ${s.budget.downlinkDurationSec.toFixed(1)}s window • ${s.passDurationSec ? formatClock(s.passDurationSec) : 'no'} clock${stars}`;
    }
    this.rootEl.querySelectorAll<HTMLButtonElement>('.oz-op-card').forEach((btn) => {
      const id = btn.getAttribute('data-op-id') ?? '';
      const meta = btn.querySelector('.oz-op-meta');
      if (meta && metaFor[id]) meta.textContent = metaFor[id];
      btn.classList.toggle('oz-op-card-active', id === this.selectedCard.id);
    });
    const set = (sel: string, text: string) => { const el = this.rootEl.querySelector(sel); if (el) el.textContent = text; };
    set('#oz-briefing-opcode', this.selectedCard.opCode);
    set('#oz-briefing-title', `${this.selectedCard.title} — ${this.selectedCard.region}`);
    set('#oz-briefing-budget', this.selectedCard.budgetLine);
    set('#oz-briefing-text', this.selectedCard.briefing);
    set('#oz-briefing-requests', this.selectedCard.requestsSummary);
    this.syncCampaignCardA11y();
  }

  private updateVRCardState(): void {
    if (!this.rootEl) return;
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
    this.rootEl.querySelector('#btn-advisory-try-vr')?.addEventListener('click', () => {
      this.hideVRAdvisory();
      this.events.onEnterVR(this.getSelectedLaunch(true));
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
