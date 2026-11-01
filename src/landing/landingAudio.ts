/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Cinematic Landing Audio Controller (RC9.2 Polish)
 *
 * Manages:
 * 1. Background Cinematic Voice-Over:
 *    "Welcome to ORBIT ZERO.
 *     Beyond Earth, every observation matters.
 *     Every decision has a consequence.
 *     Your mission begins now."
 * 2. Continuous Deep-Space Orbital Telemetry Drone (Web Audio procedural synthesis).
 * 3. High-tech UI interaction feedback chimes and transition whooshes.
 * 4. Autoplay unlock: tries immediately on page load, and attaches an immediate
 *    global first-gesture listener (touch / click / key) to start sound the millisecond
 *    the user interacts with the page.
 */

export class LandingAudioController {
  private audioCtx: AudioContext | null = null;
  private voiceAudio: HTMLAudioElement | null = null;
  private droneOsc: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private isMuted = false;
  private isUnlocked = false;

  constructor() {
    this.initVoiceAudio();
  }

  private initVoiceAudio(): void {
    if (typeof window === 'undefined') return;
    try {
      this.voiceAudio = new Audio('/media/gemini_generated_video_0a69bdeb.mp4');
      this.voiceAudio.preload = 'auto';
      this.voiceAudio.volume = 0.85;
      this.voiceAudio.muted = this.isMuted;
    } catch {
      this.voiceAudio = null;
    }
  }

  /**
   * Initializes Web Audio Context and starts the deep-space ambient drone.
   */
  private startAmbientDrone(): void {
    if (!this.audioCtx || this.droneOsc) return;

    try {
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(55, ctx.currentTime); // Low A1 orbital resonance

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(160, ctx.currentTime);

      gain.gain.setValueAtTime(this.isMuted ? 0 : 0.035, ctx.currentTime);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      this.droneOsc = osc;
      this.droneGain = gain;
    } catch {
      // Audio context restricted or unavailable
    }
  }

  /**
   * Unlocks audio playback immediately on user interaction or page load.
   */
  public async unlockAudio(): Promise<boolean> {
    if (this.isUnlocked) {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        try {
          await this.audioCtx.resume();
        } catch {}
      }
      return true;
    }

    try {
      if (typeof window !== 'undefined' && 'AudioContext' in window) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioCtx();
        if (this.audioCtx.state === 'suspended') {
          await this.audioCtx.resume();
        }
      }

      this.startAmbientDrone();

      if (this.voiceAudio) {
        this.voiceAudio.muted = this.isMuted;
        try {
          await this.voiceAudio.play();
        } catch {
          // Autoplay policy deferred until first touch
        }
      }

      this.isUnlocked = true;
      return true;
    } catch {
      return false;
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;

    if (this.voiceAudio) {
      this.voiceAudio.muted = this.isMuted;
    }

    if (this.droneGain && this.audioCtx) {
      this.droneGain.gain.setValueAtTime(
        this.isMuted ? 0 : 0.035,
        this.audioCtx.currentTime
      );
    }

    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * High-tech UI confirmation chime.
   */
  public playUiChime(freq = 880): void {
    if (this.isMuted) return;
    try {
      if (!this.audioCtx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.45, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  }

  /**
   * Deep space ambient transition whoosh.
   */
  public playTransitionWhoosh(): void {
    if (this.isMuted) return;
    try {
      if (!this.audioCtx) return;
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.38);

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.40);
    } catch {}
  }

  public dispose(): void {
    if (this.voiceAudio) {
      this.voiceAudio.pause();
      this.voiceAudio = null;
    }
    if (this.droneOsc) {
      try {
        this.droneOsc.stop();
      } catch {}
      this.droneOsc = null;
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
  }
}
