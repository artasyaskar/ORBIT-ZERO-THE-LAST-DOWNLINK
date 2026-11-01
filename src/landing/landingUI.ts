/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Cinematic Landing UI Layer (RC9.2 Polish)
 *
 * Implements a high-precision military/aerospace tactical operations interface:
 * - Strictly zero generic "vibe-coded" aesthetics (no emojis, no generic SaaS cards).
 * - Vector SVG tactical displays and spatial cockpit HUD glyphs.
 * - Monospace telemetry timestamps, mission coordinates, and classified directive styling.
 * - Ergonomic navigation with high-visibility, 100% reliable Return to Orbit action.
 * - Interactive audio telemetry status toggle.
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

          <div class="oz-mission-brief-card">
            <div class="oz-card-corner oz-corner-tl">+</div>
            <div class="oz-card-corner oz-corner-tr">+</div>
            <div class="oz-card-corner oz-corner-bl">+</div>
            <div class="oz-card-corner oz-corner-br">+</div>
            <div class="oz-card-stamp">CLASSIFIED OPERATIONAL DIRECTIVE // ADVISORY-2026</div>
            <p class="oz-opening-msg">Welcome to ORBIT ZERO.</p>
            <p class="oz-mission-text">
              Beyond Earth, every observation matters.<br />
              Every decision has a consequence.
            </p>
          </div>

          <div class="oz-hero-cta-group">
            <button id="btn-enter-experience" class="oz-btn-primary" autofocus>
              <span class="oz-btn-bracket">[</span>
              <span class="oz-btn-text">ENTER EXPERIENCE</span>
              <span class="oz-btn-arrow">→</span>
              <span class="oz-btn-bracket">]</span>
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
          <div class="oz-selection-nav">
            <button id="btn-back-orbit" class="oz-btn-back" title="Return to Hero Screen">
              <span class="oz-nav-arrow">◀</span>
              <span class="oz-nav-text">RETURN TO ORBIT VIEW</span>
            </button>
          </div>

          <div class="oz-selection-header">
            <h2 class="oz-selection-heading">CHOOSE YOUR EXPERIENCE</h2>
            <p class="oz-selection-subheading">SELECT OPERATOR TERMINAL MODE</p>
          </div>

          <div class="oz-cards-grid">
            <!-- OPTION 1: DESKTOP TACTICAL WORKSTATION -->
            <div class="oz-card oz-card-desktop" id="card-desktop" tabindex="0">
              <div class="oz-card-corner oz-corner-tl">+</div>
              <div class="oz-card-corner oz-corner-tr">+</div>
              <div class="oz-card-corner oz-corner-bl">+</div>
              <div class="oz-card-corner oz-corner-br">+</div>
              <div class="oz-card-topbar">
                <span class="oz-card-proto">PROTOCOL: DESKTOP_WORKSTATION</span>
                <span class="oz-card-stat">60 FPS // LOW-LATENCY</span>
              </div>
              <div class="oz-card-icon-wrap">
                <svg class="oz-card-svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8">
                  <rect x="6" y="8" width="36" height="24" rx="2" stroke="currentColor"/>
                  <line x1="6" y1="26" x2="42" y2="26" stroke="rgba(0,240,255,0.4)"/>
                  <path d="M12 16h10M12 21h16M32 16h4"/>
                  <path d="M18 32l-3 8h18l-3-8"/>
                  <circle cx="34" cy="12" r="1.5" fill="currentColor"/>
                </svg>
              </div>
              <h3 class="oz-card-title">DESKTOP EXPERIENCE</h3>
              <p class="oz-card-desc">
                High-precision orbital sensor triage via 3D mouse raycasting and physical console instrumentation.
              </p>
              <ul class="oz-card-features">
                <li><span class="oz-tick">[+]</span> Direct 3D Mouse Raycasting & Pick Controls</li>
                <li><span class="oz-tick">[+]</span> Magnetic Snap Cradle & Physical Unqueue</li>
                <li><span class="oz-tick">[+]</span> Real-Time Aerospace Telemetry HUD</li>
                <li><span class="oz-tick">[+]</span> 100% Playable on Standard Laptops / PCs</li>
              </ul>
              <button id="btn-play-desktop" class="oz-btn-card oz-btn-desktop">
                PLAY ON DESKTOP
              </button>
            </div>

            <!-- OPTION 2: VR SPATIAL COCKPIT -->
            <div class="oz-card oz-card-vr" id="card-vr" tabindex="0">
              <div class="oz-card-corner oz-corner-tl">+</div>
              <div class="oz-card-corner oz-corner-tr">+</div>
              <div class="oz-card-corner oz-corner-bl">+</div>
              <div class="oz-card-corner oz-corner-br">+</div>
              <div class="oz-card-topbar">
                <span class="oz-card-proto">PROTOCOL: SPATIAL_COCKPIT</span>
                <span class="oz-card-stat">90 FPS // WEBAUDIO DSP</span>
              </div>
              <div class="oz-card-icon-wrap">
                <svg class="oz-card-svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M8 18c0-3.3 2.7-6 6-6h20c3.3 0 6 2.7 6 6v10c0 4.4-3.6 8-8 8h-4l-4-3-4 3h-4c-4.4 0-8-3.6-8-8V18z"/>
                  <path d="M10 20c3-2 8-2 11 0M27 20c3-2 8-2 11 0"/>
                  <circle cx="16" cy="24" r="2.5" fill="currentColor"/>
                  <circle cx="32" cy="24" r="2.5" fill="currentColor"/>
                </svg>
              </div>
              <h3 class="oz-card-title">VR EXPERIENCE</h3>
              <p class="oz-card-desc">
                Enter the orbital cockpit through an immersive WebXR spatial session on Meta Quest Browser.
              </p>
              <ul class="oz-card-features">
                <li><span class="oz-tick">[+]</span> Hands-First 1:1 Pinch & Poke Interaction</li>
                <li><span class="oz-tick">[+]</span> Seated Airplane-Seat Ergonomics (0.35–0.65m)</li>
                <li><span class="oz-tick">[+]</span> Volumetric 3D Holographic Telemetry</li>
                <li><span class="oz-tick">[+]</span> Meta Quest Browser & Horizon OS Native</li>
              </ul>
              <button id="btn-enter-vr" class="oz-btn-card oz-btn-vr">
                ENTER VR
              </button>
              <div id="vr-status-badge" class="oz-vr-status">Checking WebXR...</div>
            </div>
          </div>

          <!-- VR ADVISORY MODAL / NOTIFICATION -->
          <div id="oz-vr-advisory" class="oz-advisory oz-hidden">
            <div class="oz-advisory-content">
              <div class="oz-card-corner oz-corner-tl">+</div>
              <div class="oz-card-corner oz-corner-tr">+</div>
              <div class="oz-card-corner oz-corner-bl">+</div>
              <div class="oz-card-corner oz-corner-br">+</div>
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
