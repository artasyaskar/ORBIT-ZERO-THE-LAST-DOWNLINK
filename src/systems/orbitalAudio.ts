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
  | 'LINK_CUTOFF'
  | 'QUINDAR_INTRO'
  | 'QUINDAR_OUTRO'
  | 'RADIO_SQUELCH'
  | 'SWITCH_CLICK'
  | 'COMPRESSION_CHIRP'
  | 'MAGNETIC_HOVER'
  | 'FSK_BURST'
  | 'SOLENOID_LATCH'
  | 'HANDSHAKE_CONFIRM'
  | 'HOVER_TICK';

export class OrbitalAudioController {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.65;
  private isDucked = false;
  private held = false;

  public setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    this.applyMasterGain();
  }

  public setDucked(ducked: boolean): void {
    this.isDucked = ducked;
    this.applyMasterGain(0.08);
  }

  /**
   * Silence everything while the pass is paused (Quest menu, headset off, tab hidden). The context is
   * suspended and no cue is scheduled meanwhile; cues queued on a frozen clock would all fire on resume.
   */
  public setHeld(held: boolean): void {
    if (this.held === held) return;
    this.held = held;
    if (!this.ctx) return;
    if (held) void this.ctx.suspend().catch(() => {});
    else void this.ctx.resume().catch(() => {});
  }

  public getState(): { held: boolean; context: AudioContextState | 'none' } {
    return { held: this.held, context: this.ctx?.state ?? 'none' };
  }

  private applyMasterGain(rampTime = 0.03): void {
    if (!this.master || !this.ctx) return;
    const effectiveVolume = this.isDucked ? this.volume * 0.35 : this.volume;
    try {
      this.master.gain.setTargetAtTime(effectiveVolume, this.ctx.currentTime, rampTime);
    } catch {
      this.master.gain.value = effectiveVolume;
    }
  }

  public dispose(): void {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined' || this.held) return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
        // Master Dynamics Compressor / Safety Brickwall Limiter prevents digital clipping (0 dBFS)
        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.value = -2.5;
        limiter.knee.value = 4.0;
        limiter.ratio.value = 16.0;
        limiter.attack.value = 0.002;
        limiter.release.value = 0.040;
        limiter.connect(this.ctx.destination);

        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(limiter);
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
      case 'HOVER_TICK':
        // Quiet 25 ms tick when a hand laser lands on something it can press
        this.tone(ctx, 1500, 1750, 0.025, 'sine', 0.035, now);
        break;
      case 'ERROR_REJECT':
        this.tone(ctx, 210, 165, 0.2, 'sawtooth', 0.11, now);
        break;
      case 'MISSION_RESET':
        this.tone(ctx, 520, 780, 0.14, 'sine', 0.09, now);
        break;
      case 'QUINDAR_INTRO':
        this.playQuindarTone(true);
        break;
      case 'QUINDAR_OUTRO':
        this.playQuindarTone(false);
        break;
      case 'RADIO_SQUELCH':
        this.playRadioSquelchBurst();
        break;
      case 'SWITCH_CLICK':
        this.playMechanicalSwitchClick(true);
        break;
      case 'COMPRESSION_CHIRP':
        this.playCompressionChirp();
        break;
      case 'MAGNETIC_HOVER':
        this.playMagneticHoverBuzz();
        break;
      case 'FSK_BURST':
        this.playBell202FskBurst();
        break;
      case 'SOLENOID_LATCH':
        this.playHeavySolenoidLatch();
        break;
      case 'HANDSHAKE_CONFIRM':
        this.playHandshakeConfirm();
        break;
    }
  }

  /**
   * Procedural Mechanical Switch Click Audio:
   * Snappy aerospace tactile microswitch click (2,400 Hz -> 320 Hz on depress, 1,800 Hz -> 540 Hz on release).
   */
  public playMechanicalSwitchClick(isDepress = true): void {
    if (this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'triangle';
      const startFreq = isDepress ? 2400 : 1800;
      const endFreq = isDepress ? 320 : 540;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.018);

      gain.gain.setValueAtTime(0.18 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);

      osc.connect(gain);
      gain.connect(this.master ?? ctx.destination);
      osc.start(now);
      osc.stop(now + 0.025);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {
      // Graceful degradation in headless
    }
  }

  /**
   * Phase 4: Procedural Laser Compression Chirp Audio:
   * Upward frequency sweep (1,200 Hz -> 3,200 Hz over 280ms) for Amber Cradle feature extraction.
   */
  public playCompressionChirp(): void {
    if (this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(3200, now + 0.28);

      gain.gain.setValueAtTime(0.12 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc.connect(gain);
      gain.connect(this.master ?? ctx.destination);
      osc.start(now);
      osc.stop(now + 0.34);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {}
  }

  /**
   * Phase 4: Procedural Magnetic Snap Hover Buzz Audio:
   * Low-frequency magnetic induction tone (220 Hz triangle) when entering drop socket proximity.
   */
  public playMagneticHoverBuzz(): void {
    if (this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);

      gain.gain.setValueAtTime(0.08 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.master ?? ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {}
  }

  /**
   * Phase 5: Bell 202 FSK Telemetry Bursts:
   * Rapid data packet bursts alternating between 1,200 Hz (mark) and 2,200 Hz (space).
   */
  public playBell202FskBurst(): void {
    if (this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'square';
      // Step through 4 fast FSK mark/space baud shifts (1200 / 2200 Hz)
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.setValueAtTime(2200, now + 0.035);
      osc.frequency.setValueAtTime(1200, now + 0.070);
      osc.frequency.setValueAtTime(2200, now + 0.105);

      gain.gain.setValueAtTime(0.06 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gain);
      gain.connect(this.master ?? ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {}
  }

  /**
   * Phase 5: Heavy Mechanical Solenoid Latch:
   * Low-frequency mechanical impulse (80 Hz -> 35 Hz) for committing downlink transmission.
   */
  public playHeavySolenoidLatch(): void {
    if (this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.16);

      gain.gain.setValueAtTime(0.22 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.master ?? ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {}
  }

  /**
   * Phase 5: Final Ground Handshake Confirmation Chime:
   * 4-note ascending arpeggio celebrating ground station verification (C5 -> E5 -> G5 -> C6).
   */
  public playHandshakeConfirm(): void {
    if (this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const now = ctx.currentTime;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + i * 0.08;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.12 * this.volume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);

        osc.connect(gain);
        gain.connect(this.master ?? ctx.destination);
        osc.start(start);
        osc.stop(start + 0.24);
        osc.onended = () => {
          try {
            osc.disconnect();
            gain.disconnect();
          } catch {}
        };
      });
    } catch {}
  }

  /**
   * NASA Apollo Quindar Tone Generator:
   * 2,525 Hz for PTT key-down (intro); 2,475 Hz for PTT key-up (outro).
   * 120ms duration with soft exponential attack and decay.
   */
  public playQuindarTone(isIntro: boolean): void {
    if (this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isIntro ? 2525 : 2475, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08 * this.volume, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.master ?? ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {
      // Audio context may be suspended or blocked
    }
  }

  /**
   * Walkie-Talkie Bandpass VHF Radio Squelch Burst:
   * 90ms shaped white noise filtered through 1,800 Hz bandpass (Q: 3.5).
   */
  public playRadioSquelchBurst(): void {
    if (this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const sampleRate = ctx.sampleRate || 44100;
      const bufferSize = Math.max(256, Math.floor(sampleRate * 0.09));
      const noiseBuffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(1800, ctx.currentTime);
      bandpass.Q.setValueAtTime(3.5, ctx.currentTime);

      const gain = ctx.createGain();
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.12 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

      whiteNoise.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(this.master ?? ctx.destination);
      whiteNoise.start(now);
      whiteNoise.onended = () => {
        try {
          whiteNoise.disconnect();
          bandpass.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {
      // Graceful fallback in test / headless
    }
  }

  public playSubBassPulse(): void {
    if (this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      // Deep sub-bass punch (55Hz-90Hz sweep)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(55, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.16);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12 * this.volume, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

      osc.connect(gain);
      gain.connect(this.master ?? ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {}
  }

  public playTensionHeartbeat(): void {
    if (this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      // Low-end sonar pulse (tense heartbeat on final 3 seconds)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(25, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.04);
      osc.frequency.exponentialRampToValueAtTime(25, now + 0.08);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.09 * this.volume, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.master ?? ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {}
  }

  public playLightningCrack(): void {
    if (this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      // Bright lightning crack (noise spike)
      const noise = ctx.createBufferSource();
      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = (Math.random() - 0.5) * 0.8;
      }
      noise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(6000, ctx.currentTime);
      filter.Q.setValueAtTime(2, ctx.currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15 * this.volume, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.master ?? ctx.destination);
      noise.start(ctx.currentTime);
      noise.stop(ctx.currentTime + 0.12);
      noise.onended = () => {
        try {
          noise.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {}
  }

  public playMagneticSnap(): void {
    if (this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      // Magnetic snap (rising sine chirp)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.06);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08 * this.volume, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.master ?? ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {}
  }

  public playCarrierAcquisition(): void {
    if (this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      // Rising frequency sweep (S-band carrier synthesizer acquisition lock)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'square';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(1800, now + 0.4);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.1 * this.volume, now + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

      osc.connect(gain);
      gain.connect(this.master ?? ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {}
  }

  public playLaserCharge(): void {
    this.playCarrierAcquisition();
  }

  public playSuccessFanfare(): void {
    if (this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      // Tactical success fanfare (3-note chord progression)
      const notes = [659, 784, 1047]; // E, G, C (major chord)
      const now = ctx.currentTime;
      const duration = 0.4;

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + idx * 0.1;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.08 * this.volume, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc.connect(gain);
        gain.connect(this.master ?? ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
        osc.onended = () => {
          try {
            osc.disconnect();
            gain.disconnect();
          } catch {}
        };
      });
    } catch {}
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
