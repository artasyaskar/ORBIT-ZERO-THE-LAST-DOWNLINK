/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * COMMANDER ARIA-7: Holographic Voice Handler, Procedural Radio DSP & Subtitle Ribbon
 *
 * Provides a Project IGI / Gameloft-style tactical AI commander:
 * 1. Web Speech API synthesis with aerospace cadence (rate: 1.08, pitch: 0.95).
 * 2. Apollo Quindar tone pair (2525Hz intro, 2475Hz outro) + VHF 1800Hz walkie-talkie squelch bursts.
 * 3. Priority pre-emption: CRITICAL sensor / queue warnings pre-empt lower priority lines.
 * 4. Silent / Headless fallback: In Playwright or audio-less systems, timers smoothly advance.
 * 5. Single-line cinematic subtitle ribbon (#aria-subtitle-bar) replacing walls of 2D text.
 * 6. Audio-reactive metrics driving 3D Holographic Avatar core pulse and waveform rings.
 */

import type { OrbitalAudioController } from './orbitalAudio';
import type { SectorId, SensorMode } from '../mission/types';

export type VoicePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type VoiceDialogueId =
  | 'PASS_START'
  | 'SECTOR_B_OPTICAL_WARNING'
  | 'SECTOR_B_SAR_OPTIMAL'
  | 'SECTOR_C_SAR_WARNING'
  | 'SECTOR_C_OPTICAL_OPTIMAL'
  | 'SECTOR_E_SAR_ADVISORY'
  | 'QUEUE_OVERFLOW'
  | 'DOWNLINK_TRANSMIT'
  | 'DEBRIEF_VICTORY'
  | 'DEBRIEF_RETRY'
  | 'SCAN_ACQUIRED'
  | 'PROCESS_SUCCESS';

export interface DialogueLine {
  id: VoiceDialogueId;
  spoken: string;
  subtitle: string;
  priority: VoicePriority;
  rate?: number;
  pitch?: number;
  cooldownSec?: number;
}

export const DIALOGUE_CATALOG: Record<VoiceDialogueId, DialogueLine> = {
  PASS_START: {
    id: 'PASS_START',
    spoken:
      'Orbit Zero online. Simulated telemetry alert: Category 4 monsoon breached Indus levees. Select a sector on the globe to begin.',
    subtitle: '[ARIA-7] Indus levees breached [SIMULATED]. Select target sector on globe.',
    priority: 'HIGH',
    cooldownSec: 8,
  },
  SECTOR_B_OPTICAL_WARNING: {
    id: 'SECTOR_B_OPTICAL_WARNING',
    spoken:
      'Warning! Sector B is under 95% storm clouds. Optical light will scatter—switch to C-Band Active SAR to pierce the cloud deck!',
    subtitle: '[ARIA-7] WARNING: Sector B under 95% cloud deck. Switch to Active SAR to penetrate.',
    priority: 'CRITICAL',
    cooldownSec: 4,
  },
  SECTOR_B_SAR_OPTIMAL: {
    id: 'SECTOR_B_SAR_OPTIMAL',
    spoken:
      'Sensor lock optimal. C-band radar will penetrate rain cores. Fire the swath scan.',
    subtitle: '[ARIA-7] OPTIMAL LOCK: SAR armed for cloud penetration. Ready to fire.',
    priority: 'MEDIUM',
    cooldownSec: 5,
  },
  SECTOR_C_SAR_WARNING: {
    id: 'SECTOR_C_SAR_WARNING',
    spoken:
      'Hold on! Sector C is a steel truss bridge under clear skies. Radar will bounce off metal structures creating multipath glare. Switch to High-Res Optical!',
    subtitle: '[ARIA-7] CAUTION: Steel truss bridge causes radar multipath glare. Use High-Res Optical.',
    priority: 'CRITICAL',
    cooldownSec: 4,
  },
  SECTOR_C_OPTICAL_OPTIMAL: {
    id: 'SECTOR_C_OPTICAL_OPTIMAL',
    spoken:
      'Visual lock confirmed. Clear atmospheric window. High-res optical will capture road clearance. Fire swath.',
    subtitle: '[ARIA-7] OPTIMAL LOCK: Clear skies. Optical camera calibrated. Fire swath.',
    priority: 'MEDIUM',
    cooldownSec: 5,
  },
  SECTOR_E_SAR_ADVISORY: {
    id: 'SECTOR_E_SAR_ADVISORY',
    spoken:
      'Shelter ridge locked under dense storm cover. Active SAR radar penetrates the cloud deck; note steep terrain layover near Kilometer 4.',
    subtitle: '[ARIA-7] ADVISORY: Storm cover over ridge. Use Active SAR (note slope layover).',
    priority: 'LOW',
    cooldownSec: 6,
  },
  QUEUE_OVERFLOW: {
    id: 'QUEUE_OVERFLOW',
    spoken:
      'Warning! Total downlink time exceeds our 10-second Karachi horizon window! Drag raw data cubes into the Amber Cradle to run onboard compression.',
    subtitle: '[ARIA-7] DOWNLINK OVERFLOW: Queue exceeds the downlink window! Compress packets in Amber Cradle.',
    priority: 'CRITICAL',
    cooldownSec: 6,
  },
  DOWNLINK_TRANSMIT: {
    id: 'DOWNLINK_TRANSMIT',
    spoken:
      'Downlink handshake locked to Karachi station. S-band carrier active. Streaming telemetry packets now.',
    subtitle: '[ARIA-7] Karachi S-band carrier lock confirmed. Streaming telemetry packets.',
    priority: 'HIGH',
    cooldownSec: 8,
  },
  DEBRIEF_VICTORY: {
    id: 'DEBRIEF_VICTORY',
    spoken:
      'Outstanding triage, Operator! Karachi response teams received all verified corridor vectors before horizon cutoff. Mission Grade: S-Rank.',
    subtitle: '[ARIA-7] MISSION ACCOMPLISHED: All priority ground requests verified. S-Rank orbital mastery.',
    priority: 'HIGH',
    cooldownSec: 10,
  },
  DEBRIEF_RETRY: {
    id: 'DEBRIEF_RETRY',
    spoken:
      'Pass window closed. Telemetry packet loss detected. Ground teams need full verified coverage. Prepare for orbital re-entry.',
    subtitle: '[ARIA-7] PASS CONCLUDED: Telemetry incomplete. Prepare for next orbital pass.',
    priority: 'HIGH',
    cooldownSec: 10,
  },
  SCAN_ACQUIRED: {
    id: 'SCAN_ACQUIRED',
    spoken: 'Observation swath acquired. Data cube materialized in tray.',
    subtitle: '[ARIA-7] Telemetry acquired. Cube ready in tray.',
    priority: 'LOW',
    cooldownSec: 4,
  },
  PROCESS_SUCCESS: {
    id: 'PROCESS_SUCCESS',
    spoken: 'Feature extraction complete. Packet size halved for high-speed downlink.',
    subtitle: '[ARIA-7] Compression complete. Packet size halved.',
    priority: 'LOW',
    cooldownSec: 4,
  },
};

const PRIORITY_RANK: Record<VoicePriority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export interface VoiceCommanderConfig {
  audio: OrbitalAudioController;
  subtitlesEnabled?: boolean;
  voiceEnabled?: boolean;
}

export class VoiceCommander {
  private audio: OrbitalAudioController;
  private queue: DialogueLine[] = [];
  private activeLine: DialogueLine | null = null;
  private isSpeaking = false;
  private isMuted = false;
  /** Pass paused: speech stopped, queue kept (see setHeld). */
  private held = false;
  private cooldownTimestamps = new Map<VoiceDialogueId, number>();
  private speechTimeoutId: number | null = null;
  private radioTransientTimeoutId: number | null = null;
  private advanceQueueTimeoutId: number | null = null;
  private subtitleFadeTimeoutId: number | null = null;
  private subtitleBarEl: HTMLDivElement | null = null;
  private subtitleTextEl: HTMLSpanElement | null = null;
  private subtitleBadgeEl: HTMLSpanElement | null = null;
  private chosenVoice: SpeechSynthesisVoice | null = null;
  private voicesChangedHandler: (() => void) | null = null;
  /** Single caption feed: every spoken ARIA line is mirrored here for spatial/DOM presenters. */
  public onCaption: ((text: string, priority: VoicePriority) => void) | null = null;

  // Audio-reactive avatar metrics
  private speechIntensity = 0;
  private targetIntensity = 0;

  constructor(config: VoiceCommanderConfig) {
    this.audio = config.audio;
    this.isMuted = config.voiceEnabled === false;
    this.initSpeechVoices();
    if (config.subtitlesEnabled !== false) {
      this.ensureSubtitleBar();
    }
  }

  public dispose(): void {
    this.stopCurrentSpeech();
    this.queue = [];
    this.onCaption = null;
    if (this.voicesChangedHandler && typeof window !== 'undefined' && 'speechSynthesis' in window &&
        window.speechSynthesis.onvoiceschanged === this.voicesChangedHandler) {
      window.speechSynthesis.onvoiceschanged = null;
    }
    this.voicesChangedHandler = null;
    if (this.subtitleBarEl) {
      this.subtitleBarEl.remove();
      this.subtitleBarEl = null;
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted && this.isSpeaking) {
      this.stopCurrentSpeech();
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /**
   * While the pass is paused nothing is spoken. A line cut off by the pause goes back to the front of the
   * queue and is spoken again on release; lines triggered meanwhile wait behind it.
   */
  public setHeld(held: boolean): void {
    if (this.held === held) return;
    this.held = held;
    if (held) {
      const interrupted = this.isSpeaking ? this.activeLine : null;
      this.stopCurrentSpeech();
      if (interrupted) this.queue.unshift(interrupted);
      this.activeLine = null;
      return;
    }
    if (!this.isSpeaking) this.advanceQueue();
  }

  public getIsHeld(): boolean {
    return this.held;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  public getActiveSubtitle(): string {
    return this.activeLine?.subtitle || '';
  }

  public getAvatarMetrics(delta: number): {
    isSpeaking: boolean;
    intensity: number;
    coreScale: number;
    ringSpeedMultiplier: number;
    ringExpansion: number;
  } {
    // Smooth lerp speech intensity
    const factor = Math.min(1, delta * 12);
    this.speechIntensity += (this.targetIntensity - this.speechIntensity) * factor;

    const isSpeaking = this.isSpeaking;
    const intensity = this.speechIntensity;
    return {
      isSpeaking,
      intensity,
      coreScale: isSpeaking ? 1.0 + Math.sin(Date.now() * 0.015) * 0.12 * intensity : 1.0,
      ringSpeedMultiplier: isSpeaking ? 4.5 * intensity : 1.0,
      ringExpansion: isSpeaking ? 0.22 * intensity : 0.0,
    };
  }

  public tick(delta: number): void {
    if (this.isSpeaking) {
      // Procedural synthetic audio envelope modulation
      this.targetIntensity = 0.85 + Math.sin(Date.now() * 0.02) * 0.15;
    } else {
      this.targetIntensity = 0;
    }
  }

  /**
   * Main entry point to evaluate mission conditions and enqueue appropriate tactical voice guidance.
   */
  public handleSectorSelection(sectorId: SectorId, armedSensor: SensorMode): void {
    if (sectorId === 'B') {
      if (armedSensor === 'OPTICAL') {
        this.trigger('SECTOR_B_OPTICAL_WARNING');
      } else {
        this.trigger('SECTOR_B_SAR_OPTIMAL');
      }
    } else if (sectorId === 'C') {
      if (armedSensor === 'RADAR') {
        this.trigger('SECTOR_C_SAR_WARNING');
      } else {
        this.trigger('SECTOR_C_OPTICAL_OPTIMAL');
      }
    } else if (sectorId === 'E') {
      if (armedSensor === 'RADAR') {
        this.trigger('SECTOR_E_SAR_ADVISORY');
      }
    }
  }

  public trigger(dialogueId: VoiceDialogueId): boolean {
    const line = DIALOGUE_CATALOG[dialogueId];
    if (!line) return false;

    const now = Date.now();
    const lastTriggered = this.cooldownTimestamps.get(dialogueId) || 0;
    const cooldownMs = (line.cooldownSec ?? 5) * 1000;

    // Do not repeat if within cooldown, UNLESS it is CRITICAL pre-emption
    if (line.priority !== 'CRITICAL' && now - lastTriggered < cooldownMs) {
      return false;
    }

    this.cooldownTimestamps.set(dialogueId, now);

    // Pre-emption logic:
    // If incoming line has higher priority than currently active speech, pre-empt!
    // Also: a new CRITICAL line (e.g. QUEUE_OVERFLOW) pre-empts any active line of different ID immediately.
    if (
      this.activeLine &&
      (PRIORITY_RANK[line.priority] > PRIORITY_RANK[this.activeLine.priority] ||
        (line.priority === 'CRITICAL' && this.activeLine.id !== line.id))
    ) {
      this.stopCurrentSpeech();
      this.queue.unshift(line);
      this.advanceQueue();
      return true;
    }

    // Otherwise insert by priority order
    const insertIdx = this.queue.findIndex(
      (q) => PRIORITY_RANK[q.priority] < PRIORITY_RANK[line.priority],
    );
    if (insertIdx === -1) {
      this.queue.push(line);
    } else {
      this.queue.splice(insertIdx, 0, line);
    }

    if (!this.isSpeaking) {
      this.advanceQueue();
    }
    return true;
  }

  /**
   * Withdraw a state-dependent line whose triggering condition no longer holds
   * (e.g. QUEUE_OVERFLOW after compression brings the queue back inside the window).
   * Removes it from the pending queue and, if it is currently on screen/speaking,
   * stops speech and hides the subtitle immediately.
   * Returns true if anything was withdrawn.
   */
  public retract(dialogueId: VoiceDialogueId): boolean {
    let removed = false;
    const before = this.queue.length;
    this.queue = this.queue.filter((q) => q.id !== dialogueId);
    if (this.queue.length !== before) removed = true;

    if (this.activeLine && this.activeLine.id === dialogueId) {
      this.stopCurrentSpeech();
      this.activeLine = null;
      if (this.subtitleFadeTimeoutId !== null) {
        clearTimeout(this.subtitleFadeTimeoutId);
        this.subtitleFadeTimeoutId = null;
      }
      this.hideSubtitle();
      removed = true;
      this.advanceQueue();
    }
    return removed;
  }

  /** Clear all pending/active dialogue and cooldowns (mission restart / scenario switch). */
  public reset(): void {
    this.stopCurrentSpeech();
    this.queue = [];
    this.activeLine = null;
    this.cooldownTimestamps.clear();
    if (this.subtitleFadeTimeoutId !== null) {
      clearTimeout(this.subtitleFadeTimeoutId);
      this.subtitleFadeTimeoutId = null;
    }
    this.hideSubtitle();
  }

  public speakDirect(spoken: string, subtitle: string, priority: VoicePriority = 'HIGH'): void {
    const customLine: DialogueLine = {
      id: 'PASS_START' as VoiceDialogueId,
      spoken,
      subtitle,
      priority,
      rate: 1.08,
      pitch: 0.95,
      cooldownSec: 2,
    };

    if (this.activeLine && PRIORITY_RANK[priority] > PRIORITY_RANK[this.activeLine.priority]) {
      this.stopCurrentSpeech();
      this.queue.unshift(customLine);
      this.advanceQueue();
      return;
    }

    const insertIdx = this.queue.findIndex(
      (q) => PRIORITY_RANK[q.priority] < PRIORITY_RANK[priority],
    );
    if (insertIdx === -1) {
      this.queue.push(customLine);
    } else {
      this.queue.splice(insertIdx, 0, customLine);
    }

    if (!this.isSpeaking) {
      this.advanceQueue();
    }
  }

  private advanceQueue(): void {
    if (this.held) return; // paused pass: setHeld(false) speaks the queue
    if (this.queue.length === 0) {
      this.activeLine = null;
      this.isSpeaking = false;
      return;
    }

    const nextLine = this.queue.shift()!;
    this.speakLine(nextLine);
  }

  private speakLine(line: DialogueLine): void {
    this.activeLine = line;
    this.isSpeaking = true;

    // Update Subtitle Ribbon immediately
    this.displaySubtitle(line.subtitle, line.priority);

    if (this.isMuted) {
      // If muted, display subtitle and advance after standard reading duration
      const durationMs = Math.max(2200, line.spoken.length * 60);
      this.speechTimeoutId = setTimeout(() => {
        this.onSpeechFinished();
      }, durationMs) as unknown as number;
      return;
    }

    // 1. Duck background audio
    this.audio.setDucked(true);

    // 2. Play Quindar Intro tone & VHF radio squelch burst
    this.audio.playQuindarTone(true);
    this.audio.playRadioSquelchBurst();

    // 3. Initiate Web Speech API Synthesis after 140ms radio transient
    const startSpeech = () => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        this.fallbackTimer(line);
        return;
      }

      try {
        const utterance = new SpeechSynthesisUtterance(line.spoken);
        utterance.rate = line.rate ?? 1.08;
        utterance.pitch = line.pitch ?? 0.95;
        utterance.lang = 'en-US';
        if (this.chosenVoice) {
          utterance.voice = this.chosenVoice;
        }

        let hasFinished = false;
        const finishOnce = () => {
          if (hasFinished) return;
          hasFinished = true;
          this.onSpeechFinished();
        };

        utterance.onend = finishOnce;
        utterance.onerror = finishOnce;

        // Fallback timer: prevents test/headless deadlock if browser speech doesn't fire onend
        const fallbackMs = Math.max(2000, line.spoken.length * 85);
        this.speechTimeoutId = setTimeout(finishOnce, fallbackMs) as unknown as number;

        window.speechSynthesis.speak(utterance);
      } catch {
        this.fallbackTimer(line);
      }
    };

    if (this.radioTransientTimeoutId !== null) {
      clearTimeout(this.radioTransientTimeoutId);
      this.radioTransientTimeoutId = null;
    }
    this.radioTransientTimeoutId = setTimeout(startSpeech, 140) as unknown as number;
  }

  private fallbackTimer(line: DialogueLine): void {
    const fallbackMs = Math.max(1800, line.spoken.length * 75);
    this.speechTimeoutId = setTimeout(() => {
      this.onSpeechFinished();
    }, fallbackMs) as unknown as number;
  }

  private onSpeechFinished(): void {
    if (this.speechTimeoutId !== null) {
      clearTimeout(this.speechTimeoutId);
      this.speechTimeoutId = null;
    }

    if (!this.isMuted) {
      // 4. Outro: Quindar Outro tone & radio squelch burst
      this.audio.playQuindarTone(false);
      this.audio.playRadioSquelchBurst();

      // Unduck background audio after outro tail
      setTimeout(() => {
        this.audio.setDucked(false);
      }, 250);
    }

    this.isSpeaking = false;

    // Keep subtitle visible for an additional reading buffer before fading out
    if (this.subtitleFadeTimeoutId !== null) {
      clearTimeout(this.subtitleFadeTimeoutId);
    }
    this.subtitleFadeTimeoutId = setTimeout(() => {
      this.hideSubtitle();
    }, 2800) as unknown as number;

    // Short gap before next transmission
    if (this.advanceQueueTimeoutId !== null) {
      clearTimeout(this.advanceQueueTimeoutId);
    }
    this.advanceQueueTimeoutId = setTimeout(() => {
      this.advanceQueueTimeoutId = null;
      this.advanceQueue();
    }, 400) as unknown as number;
  }

  private stopCurrentSpeech(): void {
    if (this.radioTransientTimeoutId !== null) {
      clearTimeout(this.radioTransientTimeoutId);
      this.radioTransientTimeoutId = null;
    }
    if (this.advanceQueueTimeoutId !== null) {
      clearTimeout(this.advanceQueueTimeoutId);
      this.advanceQueueTimeoutId = null;
    }
    if (this.speechTimeoutId !== null) {
      clearTimeout(this.speechTimeoutId);
      this.speechTimeoutId = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    this.audio.setDucked(false);
    this.isSpeaking = false;
  }

  private initSpeechVoices(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const findVoice = () => {
      try {
        const voices = window.speechSynthesis.getVoices();
        // Prefer crisp US English tactical voices
        this.chosenVoice =
          voices.find(
            (v) =>
              v.lang.startsWith('en') &&
              /Google US English|Microsoft Zira|Samantha|Natural|English/i.test(v.name),
          ) ||
          voices.find((v) => v.lang.startsWith('en')) ||
          voices[0] ||
          null;
      } catch {}
    };

    findVoice();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      this.voicesChangedHandler = findVoice;
      window.speechSynthesis.onvoiceschanged = findVoice;
    }
  }

  // ==========================================================================
  // Diegetic Cinematic Subtitle Ribbon DOM (#aria-subtitle-bar)
  // ==========================================================================

  private ensureSubtitleBar(): void {
    if (typeof document === 'undefined') return;

    // Check if aria-subtitle-bar already exists inside orbit-zero-aria-hud
    const hudBar = document.querySelector('#orbit-zero-aria-hud #aria-subtitle-bar') as HTMLDivElement | null;
    if (hudBar) {
      if (this.subtitleBarEl && this.subtitleBarEl !== hudBar && this.subtitleBarEl.parentElement) {
        this.subtitleBarEl.parentElement.removeChild(this.subtitleBarEl);
      }
      this.subtitleBarEl = hudBar;
      this.subtitleBadgeEl = hudBar.querySelector('#aria-subtitle-badge');
      this.subtitleTextEl = hudBar.querySelector('#aria-subtitle-text');
      return;
    }

    const ariaHud = document.getElementById('orbit-zero-aria-hud');
    const mountTarget = ariaHud ?? document.body;
    if (mountTarget) {
      this.subtitleBarEl = document.createElement('div');
      this.subtitleBarEl.id = 'aria-subtitle-bar';
      this.subtitleBarEl.style.cssText = `
        background: rgba(6, 12, 24, 0.75);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(34, 211, 238, 0.4);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6), 0 0 10px rgba(34, 211, 238, 0.15);
        border-radius: 6px;
        padding: 6px 14px;
        font-size: 11px;
        color: #e2e8f0;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: none;
      `;

      this.subtitleBadgeEl = document.createElement('span');
      this.subtitleBadgeEl.id = 'aria-subtitle-badge';
      this.subtitleBadgeEl.style.cssText = `color: #22d3ee; font-weight: 700; font-size: 10px; letter-spacing: 0.5px;`;
      this.subtitleBadgeEl.innerText = '[ ARIA-7 ]';

      this.subtitleTextEl = document.createElement('span');
      this.subtitleTextEl.id = 'aria-subtitle-text';
      this.subtitleTextEl.style.cssText = `color: #cbd5e1;`;

      this.subtitleBarEl.appendChild(this.subtitleBadgeEl);
      this.subtitleBarEl.appendChild(this.subtitleTextEl);
      mountTarget.appendChild(this.subtitleBarEl);
    }
  }

  private displaySubtitle(text: string, priority: VoicePriority): void {
    if (typeof document === 'undefined') return;
    this.onCaption?.(text.replace(/^\[ARIA-7\]\s*/i, ''), priority);
    this.ensureSubtitleBar();
    const inHud = document.querySelector('#orbit-zero-aria-hud #aria-subtitle-bar') as HTMLDivElement | null;
    if (inHud) {
      this.subtitleBarEl = inHud;
      this.subtitleBadgeEl = inHud.querySelector('#aria-subtitle-badge');
      this.subtitleTextEl = inHud.querySelector('#aria-subtitle-text');
    }
    if (!this.subtitleBarEl || !this.subtitleTextEl) return;

    // Clean up '[ARIA-7]' tag if present in raw string
    const cleanText = text.replace(/^\[ARIA-7\]\s*/i, '');
    this.subtitleTextEl.textContent = cleanText;

    // Apply priority color styling
    if (priority === 'CRITICAL') {
      this.subtitleBarEl.style.borderColor = 'rgba(239, 68, 68, 0.8)';
      this.subtitleBarEl.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.8), 0 0 24px rgba(239, 68, 68, 0.35)';
      if (this.subtitleBadgeEl) {
        this.subtitleBadgeEl.style.color = '#f87171';
        this.subtitleBadgeEl.style.borderColor = 'rgba(239, 68, 68, 0.6)';
        this.subtitleBadgeEl.style.background = 'rgba(153, 27, 27, 0.3)';
      }
    } else if (priority === 'HIGH') {
      this.subtitleBarEl.style.borderColor = 'rgba(245, 158, 11, 0.7)';
      this.subtitleBarEl.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.75), 0 0 20px rgba(245, 158, 11, 0.25)';
      if (this.subtitleBadgeEl) {
        this.subtitleBadgeEl.style.color = '#fbbf24';
        this.subtitleBadgeEl.style.borderColor = 'rgba(245, 158, 11, 0.5)';
        this.subtitleBadgeEl.style.background = 'rgba(180, 83, 9, 0.25)';
      }
    } else {
      this.subtitleBarEl.style.borderColor = 'rgba(6, 182, 212, 0.45)';
      this.subtitleBarEl.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.75), 0 0 20px rgba(6, 182, 212, 0.2)';
      if (this.subtitleBadgeEl) {
        this.subtitleBadgeEl.style.color = '#22d3ee';
        this.subtitleBadgeEl.style.borderColor = 'rgba(34, 211, 238, 0.4)';
        this.subtitleBadgeEl.style.background = 'rgba(8, 145, 178, 0.2)';
      }
    }

    this.subtitleBarEl.style.opacity = '1';
  }

  private hideSubtitle(): void {
    if (this.subtitleBarEl) {
      const isInsideHud = Boolean(this.subtitleBarEl.closest('#orbit-zero-aria-hud'));
      this.subtitleBarEl.style.opacity = '0';
      this.subtitleBarEl.style.transform = isInsideHud ? 'none' : 'translateX(-50%) translateY(8px)';
    }
  }
}
