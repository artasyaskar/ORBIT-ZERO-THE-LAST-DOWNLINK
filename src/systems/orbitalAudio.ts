/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Procedural Web Audio synthesizer for orbital scan pulses, SAR radar chirps,
 * onboard compression hums, downlink telemetry bursts, and error alerts.
 * Zero external audio files required; gracefully no-ops in headless environments.
 */

export type OrbitalSoundCue =
  | 'SELECT_SECTOR'
  | 'TOGGLE_SENSOR'
  | 'SCAN_OPTICAL'
  | 'SCAN_RADAR'
  | 'PROCESS_SUCCESS'
  | 'QUEUE_SLOT'
  | 'DISCARD_CUBE'
  | 'DOWNLINK_COMMIT'
  | 'DOWNLINK_TICK'
  | 'ERROR_REJECT'
  | 'MISSION_RESET'
  | 'CUBE_GRAB'
  | 'CUBE_DOCK'
  | 'OPTIMAL_VICTORY'
  | 'SCENARIO_CYCLE'
  | 'WAND_LOCK'
  | 'PACKET_RECEIVED'
  | 'LINK_CUTOFF';

export class OrbitalAudioController {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.65;

  public setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
  }

  public dispose(): void {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playCue(cue: OrbitalSoundCue): void {
    if (this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    switch (cue) {
      case 'SELECT_SECTOR':
        this.tone(ctx, 540, 680, 0.08, 'sine', 0.08, now);
        break;
      case 'TOGGLE_SENSOR':
        this.tone(ctx, 420, 620, 0.09, 'triangle', 0.09, now);
        break;
      case 'SCAN_OPTICAL':
        this.tone(ctx, 760, 1180, 0.16, 'sine', 0.11, now);
        this.tone(ctx, 1180, 920, 0.12, 'sine', 0.08, now + 0.12);
        break;
      case 'SCAN_RADAR':
        this.tone(ctx, 240, 680, 0.22, 'sawtooth', 0.09, now);
        this.tone(ctx, 580, 880, 0.14, 'triangle', 0.08, now + 0.14);
        break;
      case 'PROCESS_SUCCESS':
        this.tone(ctx, 360, 540, 0.12, 'triangle', 0.1, now);
        this.tone(ctx, 540, 810, 0.16, 'sine', 0.11, now + 0.1);
        break;
      case 'QUEUE_SLOT':
        this.tone(ctx, 620, 840, 0.1, 'sine', 0.09, now);
        break;
      case 'DISCARD_CUBE':
        this.tone(ctx, 440, 220, 0.14, 'triangle', 0.08, now);
        break;
      case 'DOWNLINK_COMMIT':
        this.tone(ctx, 440, 660, 0.12, 'sine', 0.1, now);
        this.tone(ctx, 660, 880, 0.12, 'sine', 0.1, now + 0.11);
        this.tone(ctx, 880, 1320, 0.24, 'triangle', 0.12, now + 0.22);
        break;
      case 'PACKET_RECEIVED':
        this.tone(ctx, 660, 880, 0.08, 'sine', 0.08, now);
        this.tone(ctx, 880, 1100, 0.12, 'sine', 0.06, now + 0.08);
        break;
      case 'LINK_CUTOFF':
        this.tone(ctx, 420, 180, 0.25, 'triangle', 0.09, now);
        break;
      case 'DOWNLINK_TICK':
        // High-precision telemetry carrier pulse (1040Hz 40ms sine pip)
        this.tone(ctx, 1040, 1040, 0.04, 'sine', 0.06, now);
        break;
      case 'CUBE_GRAB':
        // Crisp magnetic unlatch transient (320Hz -> 580Hz sine + soft release click)
        this.tone(ctx, 320, 580, 0.07, 'sine', 0.08, now);
        this.tone(ctx, 1200, 350, 0.02, 'triangle', 0.05, now + 0.01);
        break;
      case 'CUBE_DOCK':
        // Heavy mechanical solenoid dock (140Hz -> 85Hz triangle thud + 880Hz confirmation pip)
        this.tone(ctx, 140, 85, 0.11, 'triangle', 0.12, now);
        this.tone(ctx, 880, 960, 0.06, 'sine', 0.08, now + 0.04);
        break;
      case 'OPTIMAL_VICTORY':
        // Warm 4-note aerospace commendation chord: C5 + E5 + G5 + C6
        this.tone(ctx, 523.25, 523.25, 0.45, 'sine', 0.09, now);
        this.tone(ctx, 659.25, 659.25, 0.45, 'sine', 0.09, now + 0.08);
        this.tone(ctx, 783.99, 783.99, 0.5, 'sine', 0.09, now + 0.16);
        this.tone(ctx, 1046.5, 1046.5, 0.65, 'triangle', 0.11, now + 0.24);
        break;
      case 'SCENARIO_CYCLE':
        // Upward aerospace scenario sequence transition sweep
        this.tone(ctx, 440, 740, 0.12, 'triangle', 0.09, now);
        this.tone(ctx, 740, 880, 0.08, 'sine', 0.09, now + 0.1);
        break;
      case 'WAND_LOCK':
        // High-frequency target acquisition lock chirp
        this.tone(ctx, 880, 1320, 0.05, 'sine', 0.07, now);
        break;
      case 'ERROR_REJECT':
        this.tone(ctx, 210, 165, 0.2, 'sawtooth', 0.11, now);
        break;
      case 'MISSION_RESET':
        this.tone(ctx, 520, 780, 0.14, 'sine', 0.09, now);
        break;
    }
  }

  private tone(
    ctx: AudioContext,
    startHz: number,
    endHz: number,
    durationSec: number,
    type: OscillatorType,
    gainPeak: number,
    startTime: number,
  ): void {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(startHz, startTime);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(40, endHz),
        startTime + durationSec,
      );

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

      osc.connect(gain);
      gain.connect(this.master ?? ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + durationSec + 0.02);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    } catch {
      // Ignore audio errors when autoplay is blocked
    }
  }
}
