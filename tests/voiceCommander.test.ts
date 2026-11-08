/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Unit Test Suite for COMMANDER ARIA-7 Voice Commander & Radio DSP
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  DIALOGUE_CATALOG,
  VoiceCommander,
} from '../src/systems/voiceCommander';
import { OrbitalAudioController } from '../src/systems/orbitalAudio';

describe('VoiceCommander (Commander ARIA-7)', () => {
  let audio: OrbitalAudioController;
  let voiceCommander: VoiceCommander;

  beforeEach(() => {
    vi.useFakeTimers();
    audio = new OrbitalAudioController();
    vi.spyOn(audio, 'playQuindarTone').mockImplementation(() => {});
    vi.spyOn(audio, 'playRadioSquelchBurst').mockImplementation(() => {});
    vi.spyOn(audio, 'setDucked').mockImplementation(() => {});

    voiceCommander = new VoiceCommander({
      audio,
      subtitlesEnabled: false,
    });
  });

  afterEach(() => {
    voiceCommander.dispose();
    audio.dispose();
    vi.useRealTimers();
  });

  it('initializes with expected default state', () => {
    expect(voiceCommander.getIsSpeaking()).toBe(false);
    expect(voiceCommander.getIsMuted()).toBe(false);
    expect(voiceCommander.getActiveSubtitle()).toBe('');
  });

  it('triggers PASS_START dialogue line and plays intro Quindar + squelch tones', () => {
    const ok = voiceCommander.trigger('PASS_START');
    expect(ok).toBe(true);
    expect(voiceCommander.getIsSpeaking()).toBe(true);
    expect(voiceCommander.getActiveSubtitle()).toContain('Indus levees breached');

    // Radio DSP intro should be invoked
    expect(audio.setDucked).toHaveBeenCalledWith(true);
    expect(audio.playQuindarTone).toHaveBeenCalledWith(true);
    expect(audio.playRadioSquelchBurst).toHaveBeenCalled();
  });

  it('enforces cooldowns on non-critical lines to prevent dialogue spam', () => {
    const first = voiceCommander.trigger('SECTOR_B_SAR_OPTIMAL');
    expect(first).toBe(true);

    // Second immediate trigger should be blocked by cooldown
    const second = voiceCommander.trigger('SECTOR_B_SAR_OPTIMAL');
    expect(second).toBe(false);

    // After advancing past cooldown time, trigger should succeed again
    vi.advanceTimersByTime(6000);
    const third = voiceCommander.trigger('SECTOR_B_SAR_OPTIMAL');
    expect(third).toBe(true);
  });

  it('evaluates sector and sensor combinations correctly', () => {
    // Sector B with Optical -> Critical Storm warning
    voiceCommander.handleSectorSelection('B', 'OPTICAL');
    expect(voiceCommander.getActiveSubtitle()).toContain('WARNING: Sector B');

    // Advance past speech duration and queue gap
    vi.advanceTimersByTime(12000);

    // Sector B with Radar -> Optimal lock
    voiceCommander.handleSectorSelection('B', 'RADAR');
    expect(voiceCommander.getActiveSubtitle()).toContain('OPTIMAL LOCK: SAR armed');

    vi.advanceTimersByTime(12000);

    // Sector C with Radar -> Critical bridge multipath caution
    voiceCommander.handleSectorSelection('C', 'RADAR');
    expect(voiceCommander.getActiveSubtitle()).toContain('CAUTION: Steel truss bridge');

    vi.advanceTimersByTime(12000);

    // Sector C with Optical -> Optimal lock
    voiceCommander.handleSectorSelection('C', 'OPTICAL');
    expect(voiceCommander.getActiveSubtitle()).toContain('Clear skies. Optical camera');
  });

  it('pre-empts active lower-priority line when a CRITICAL warning arrives', () => {
    // Start low-priority speech
    voiceCommander.trigger('SCAN_ACQUIRED');
    expect(voiceCommander.getActiveSubtitle()).toContain('Telemetry acquired');

    // Trigger CRITICAL warning (Sector B storm optical)
    const preempted = voiceCommander.trigger('SECTOR_B_OPTICAL_WARNING');
    expect(preempted).toBe(true);
    expect(voiceCommander.getActiveSubtitle()).toContain('Sector B under 95% cloud deck');
  });

  it('allows muting speech and DSP while retaining subtitle updates', () => {
    voiceCommander.setMuted(true);
    expect(voiceCommander.getIsMuted()).toBe(true);

    voiceCommander.trigger('QUEUE_OVERFLOW');
    expect(voiceCommander.getActiveSubtitle()).toContain('DOWNLINK OVERFLOW');

    // Radio DSP shouldn't be called when muted
    expect(audio.playQuindarTone).not.toHaveBeenCalled();
    expect(audio.playRadioSquelchBurst).not.toHaveBeenCalled();
  });

  it('holds speech while the pass is paused and speaks the interrupted line again on release', () => {
    voiceCommander.trigger('PASS_START');
    expect(voiceCommander.getIsSpeaking()).toBe(true);

    voiceCommander.setHeld(true);
    expect(voiceCommander.getIsHeld()).toBe(true);
    expect(voiceCommander.getIsSpeaking()).toBe(false);

    // A line triggered during the pause waits; nothing is spoken while held.
    voiceCommander.trigger('SCAN_ACQUIRED');
    vi.advanceTimersByTime(15000);
    expect(voiceCommander.getIsSpeaking()).toBe(false);

    // Release: the cut-off line comes first, then the one queued during the pause.
    voiceCommander.setHeld(false);
    expect(voiceCommander.getIsSpeaking()).toBe(true);
    expect(voiceCommander.getActiveSubtitle()).toContain('Indus levees breached');
    vi.advanceTimersByTime(12000);
    expect(voiceCommander.getActiveSubtitle()).toContain('Telemetry acquired');
  });

  it('computes avatar reactivity metrics during speech vs idle', () => {
    // Idle state
    const idleMetrics = voiceCommander.getAvatarMetrics(0.016);
    expect(idleMetrics.isSpeaking).toBe(false);
    expect(idleMetrics.ringSpeedMultiplier).toBe(1.0);
    expect(idleMetrics.ringExpansion).toBe(0.0);

    // Speaking state
    voiceCommander.trigger('PASS_START');
    voiceCommander.tick(0.016);
    const speakMetrics = voiceCommander.getAvatarMetrics(0.1);
    expect(speakMetrics.isSpeaking).toBe(true);
    expect(speakMetrics.ringSpeedMultiplier).toBeGreaterThan(1.0);
    expect(speakMetrics.ringExpansion).toBeGreaterThan(0.0);
  });
});
