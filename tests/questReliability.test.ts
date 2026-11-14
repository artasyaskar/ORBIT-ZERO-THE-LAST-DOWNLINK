/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Quest Browser & WebXR Reliability Regression Tests
 *
 * Verifies headset-critical edge cases that cannot rely solely on desktop runs:
 * - Quest Chromium Web Speech paused-queue resume & 350ms dead-TTS watchdog recovery
 * - AbortError headset-sleep WebXR recovery copy (jargon-free)
 * - Seated Quest mobile TBDR frustum depth precision ratio (iwsdk.config.json)
 * - In-headset Mission HUD campaign switcher & Daily Seeded Crisis parity buttons
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrbitalAudioController } from '../src/systems/orbitalAudio';
import { VoiceCommander } from '../src/systems/voiceCommander';
import { launchProblem } from '../src/ui/xrEntryText';

describe('Quest Browser & WebXR Reliability Hardening', () => {
  let audio: OrbitalAudioController;
  let voiceCommander: VoiceCommander | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    audio = new OrbitalAudioController();
    vi.spyOn(audio, 'playQuindarTone').mockImplementation(() => {});
    vi.spyOn(audio, 'playRadioSquelchBurst').mockImplementation(() => {});
    vi.spyOn(audio, 'setDucked').mockImplementation(() => {});
  });

  afterEach(() => {
    voiceCommander?.dispose();
    voiceCommander = null;
    audio.dispose();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('resumes paused Quest Chromium speechSynthesis on setHeld(false) and startSpeech', () => {
    const synth = {
      paused: true,
      speaking: true,
      pending: false,
      onvoiceschanged: null as (() => void) | null,
      getVoices: vi.fn(() => []),
      resume: vi.fn(() => {
        synth.paused = false;
      }),
      cancel: vi.fn(),
      speak: vi.fn(),
    };
    class MockUtterance {
      text: string;
      rate = 1;
      pitch = 1;
      lang = 'en-US';
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }

    vi.stubGlobal('window', { speechSynthesis: synth });
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);

    voiceCommander = new VoiceCommander({ audio, subtitlesEnabled: false });
    voiceCommander.trigger('PASS_START');

    // Quindar intro is 140ms; startSpeech should unpause speechSynthesis before speak()
    vi.advanceTimersByTime(160);
    expect(synth.resume).toHaveBeenCalledTimes(1);
    expect(synth.speak).toHaveBeenCalledTimes(1);

    // Simulate OS interruption hold while Chromium leaves speechSynthesis paused again
    voiceCommander.setHeld(true);
    synth.paused = true;
    voiceCommander.setHeld(false);
    expect(synth.resume.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(voiceCommander.getIsSpeaking()).toBe(true);
  });

  it('recovers cleanly via the 350ms dead-TTS watchdog when speech engine never starts or fires onend', () => {
    const synth = {
      paused: false,
      speaking: false,
      pending: false,
      onvoiceschanged: null as (() => void) | null,
      getVoices: vi.fn(() => []),
      resume: vi.fn(),
      cancel: vi.fn(),
      // Intentionally inert speak(): neither sets speaking=true nor invokes onend/onerror
      speak: vi.fn(),
    };
    class MockUtterance {
      text: string;
      rate = 1;
      pitch = 1;
      lang = 'en-US';
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }

    vi.stubGlobal('window', { speechSynthesis: synth });
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);

    voiceCommander = new VoiceCommander({ audio, subtitlesEnabled: false });
    const spoken = 'Short tactical status check across orbital relays for confirmation now.';
    const watchdogEndMs = 140 + 350 + Math.max(1500, spoken.length * 75 - 350);
    const defaultTimeoutMs = 140 + Math.max(2000, spoken.length * 85);
    expect(watchdogEndMs).toBeLessThan(defaultTimeoutMs);

    voiceCommander.speakDirect(spoken, 'Status check.', 'HIGH');
    expect(voiceCommander.getIsSpeaking()).toBe(true);

    vi.advanceTimersByTime(watchdogEndMs + 25);
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(voiceCommander.getIsSpeaking()).toBe(false);
  });

  it('provides headset sleep/trigger recovery guidance on WebXR AbortError without jargon', () => {
    const err = Object.assign(new Error('Session aborted during sleep'), { name: 'AbortError' });
    const problem = launchProblem(err);
    expect(problem.message).toBe('VR did not start.');
    expect(problem.hint).toMatch(/headset|trigger/i);
    expect(`${problem.message} ${problem.hint}`).not.toMatch(/XRSession|requestSession|DOMException|WebXR/);
  });

  it('keeps iwsdk.config.json depth buffer frustum ratio mobile-Quest-friendly (<= 5000:1)', () => {
    const cfg = JSON.parse(readFileSync(resolve(process.cwd(), 'iwsdk.config.json'), 'utf8')) as {
      world?: { render?: { near?: number; far?: number } };
    };
    const near = cfg.world?.render?.near ?? 0;
    const far = cfg.world?.render?.far ?? Infinity;
    expect(near).toBeGreaterThanOrEqual(0.02);
    expect(far / near).toBeLessThanOrEqual(5000);
  });

  it('exposes Switch Op and Daily Crisis actions directly inside the headset Mission HUD', () => {
    const xml = readFileSync(resolve(process.cwd(), 'public/ui/mission-hud.uikitml'), 'utf8');
    expect(xml).toContain('id="Btn_CardNextOp"');
    expect(xml).toContain('id="Btn_CardDaily"');
    expect(xml).toContain('id="Btn_HudDaily"');
  });
});
