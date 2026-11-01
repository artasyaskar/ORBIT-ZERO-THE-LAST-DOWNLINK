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

export interface LandingUIEvents {
  onEnterExperience: () => void;
  onPlayDesktop: () => void;
  onEnterVR: () => void;
  onToggleMute: () => boolean;
  onBackToOrbit: () => void;
}

export class LandingUI {
  private container: HTMLElement;
  private events: LandingUIEvents;
  private rootEl!: HTMLDivElement;
  private heroScreenEl!: HTMLDivElement;
  private selectionScreenEl!: HTMLDivElement;
  private muteBtnEl!: HTMLButtonElement;
  private vrAdvisoryEl!: HTMLDivElement;

  private isWebXRSupported = false;

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
            <span>INDUS BASIN FLOOD RESPONSE</span> • <span>EVIDENCE TRIAGE</span> • <span>55 Wh POWER</span>
          </div>

          <h1 class="oz-hero-title">
            <span class="oz-title-glow">ORBIT ZERO</span>
            <span class="oz-hero-subtitle">THE LAST DOWNLINK</span>
          </h1>

          <p class="oz-supporting-line">A SATELLITE OPERATIONS EXPERIENCE</p>

          <!-- CLEAN, ELEGANT FLOATING QUOTE (NO BULKY DARK BOX, NO + MARKS) -->
          <div class="oz-hero-welcome">
            <p class="oz-welcome-line">Welcome to ORBIT ZERO.</p>
            <p class="oz-welcome-text">
              Beyond Earth, every observation matters.<br />
              Every decision has a consequence.
            </p>
          </div>

          <div class="oz-hero-cta-group">
            <button id="btn-enter-experience" class="oz-btn-primary" autofocus>
              <span class="oz-btn-text">ENTER EXPERIENCE</span>
              <span class="oz-btn-arrow">→</span>
            </button>
          </div>
        </div>

        <div class="oz-hero-footer">
          <div class="oz-system-indicator">
            <span class="oz-badge-chip">GROUND STATION: KARACHI</span>
            <span class="oz-badge-chip">WINDOW: 10.0s CONTACT</span>
            <span class="oz-badge-chip">META VR START 2026</span>
          </div>
        </div>
      </main>

      <!-- SCREEN 2: EXPERIENCE SELECTION -->
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
            <h2 class="oz-selection-heading">CHOOSE YOUR EXPERIENCE</h2>
            <p class="oz-selection-subheading">SELECT OPERATOR TERMINAL MODE</p>
          </div>

          <div class="oz-cards-grid">
            <!-- OPTION 1: DESKTOP WORKSTATION (COMPACT & SLEEK) -->
            <div class="oz-card oz-card-desktop" id="card-desktop" tabindex="0">
              <div class="oz-card-header">
                <span class="oz-card-badge">DESKTOP WORKSTATION</span>
                <span class="oz-card-fps">60 FPS</span>
              </div>
              <h3 class="oz-card-title">DESKTOP EXPERIENCE</h3>
              <p class="oz-card-desc">
                Operate the satellite mission using keyboard and mouse with precision 3D raycasting.
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
                <span class="oz-card-fps">90 FPS</span>
              </div>
              <h3 class="oz-card-title">VR EXPERIENCE</h3>
              <p class="oz-card-desc">
                Immerse yourself inside the orbital command module on Meta Quest Browser.
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

  private attachListeners(): void {
    // "ENTER EXPERIENCE" primary CTA
    this.rootEl.querySelector('#btn-enter-experience')?.addEventListener('click', () => {
      this.events.onEnterExperience();
      this.transitionToSelection();
    });

    // "PLAY ON DESKTOP" card CTA
    this.rootEl.querySelector('#btn-play-desktop')?.addEventListener('click', () => {
      this.events.onPlayDesktop();
    });

    // "ENTER VR" card CTA
    this.rootEl.querySelector('#btn-enter-vr')?.addEventListener('click', () => {
      if (this.isWebXRSupported) {
        this.events.onEnterVR();
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
      this.events.onPlayDesktop();
    });
    this.rootEl.querySelector('#btn-advisory-close')?.addEventListener('click', () => {
      this.hideVRAdvisory();
    });

    // Keyboard accessibility: Escape closes advisory
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.vrAdvisoryEl.classList.contains('oz-hidden')) {
          this.hideVRAdvisory();
        }
      }
    });
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
    if (this.rootEl?.parentElement) {
      this.rootEl.parentElement.removeChild(this.rootEl);
    }
  }
}
