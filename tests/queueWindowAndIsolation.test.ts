/**
 * Regression tests: authoritative downlink-window overflow logic, ARIA-7 retraction of stale
 * overflow advisories, and cross-mission state isolation.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MissionEngine } from '../src/mission/missionEngine';
import { VoiceCommander } from '../src/systems/voiceCommander';
import { OrbitalAudioController } from '../src/systems/orbitalAudio';

const overflows = (eng: MissionEngine): boolean => {
  const s = eng.getState();
  return s.downlinkCommittedSec > s.downlinkWindowSec + 0.01;
};

describe('Downlink window overflow: authoritative engine state', () => {
  it('7.6 / 10.0 s is not an overflow; 12.4 / 10.0 s and 10.2 / 10.0 s are', () => {
    const eng = new MissionEngine('FIRELINE_PASS');
    const b = eng.scanSector('B', 'THERMAL').packet!;
    const c = eng.scanSector('C', 'OPTICAL').packet!;
    const e = eng.scanSector('E', 'THERMAL').packet!;
    eng.queuePacket(b.id);
    eng.queuePacket(c.id);
    eng.queuePacket(e.id);
    expect(eng.getState().downlinkCommittedSec).toBe(12.4);
    expect(overflows(eng)).toBe(true);

    eng.processPacket(b.id);
    expect(eng.getState().downlinkCommittedSec).toBe(10.0);
    expect(overflows(eng)).toBe(false); // exactly at the window: fits

    eng.processPacket(e.id);
    expect(eng.getState().downlinkCommittedSec).toBe(7.6);
    expect(eng.getState().downlinkWindowSec).toBe(10.0);
    expect(overflows(eng)).toBe(false);
  });

  it('only compressing the optical packet leaves 10.2 s: genuine overflow', () => {
    const eng = new MissionEngine('FIRELINE_PASS');
    const b = eng.scanSector('B', 'THERMAL').packet!;
    const c = eng.scanSector('C', 'OPTICAL').packet!;
    const e = eng.scanSector('E', 'THERMAL').packet!;
    eng.queuePacket(b.id);
    eng.queuePacket(c.id);
    eng.queuePacket(e.id);
    eng.processPacket(c.id);
    expect(eng.getState().downlinkCommittedSec).toBe(10.2);
    expect(overflows(eng)).toBe(true);
  });

  it('unqueueing an excessive packet updates the overflow state', () => {
    const eng = new MissionEngine('FIRELINE_PASS');
    const b = eng.scanSector('B', 'THERMAL').packet!;
    const c = eng.scanSector('C', 'OPTICAL').packet!;
    const e = eng.scanSector('E', 'THERMAL').packet!;
    eng.queuePacket(b.id);
    eng.queuePacket(c.id);
    eng.queuePacket(e.id);
    expect(overflows(eng)).toBe(true);
    eng.unqueuePacket(e.id);
    expect(eng.getState().downlinkCommittedSec).toBe(8.2);
    expect(overflows(eng)).toBe(false);
  });
});

describe('ARIA-7 stale QUEUE_OVERFLOW advisory', () => {
  let audio: OrbitalAudioController;
  let voice: VoiceCommander;

  beforeEach(() => {
    vi.useFakeTimers();
    audio = new OrbitalAudioController();
    vi.spyOn(audio, 'playQuindarTone').mockImplementation(() => {});
    vi.spyOn(audio, 'playRadioSquelchBurst').mockImplementation(() => {});
    vi.spyOn(audio, 'setDucked').mockImplementation(() => {});
    voice = new VoiceCommander({ audio, subtitlesEnabled: false });
  });

  afterEach(() => {
    voice.dispose();
    audio.dispose();
    vi.useRealTimers();
  });

  it('retract() withdraws the active overflow line once the queue fits', () => {
    voice.trigger('QUEUE_OVERFLOW');
    expect(voice.getActiveSubtitle()).toContain('DOWNLINK OVERFLOW');
    expect(voice.retract('QUEUE_OVERFLOW')).toBe(true);
    expect(voice.getActiveSubtitle()).toBe('');
    expect(voice.getIsSpeaking()).toBe(false);
  });

  it('retract() removes a still-pending overflow line from the queue', () => {
    voice.trigger('PASS_START'); // occupies the speaker
    voice.trigger('SCAN_ACQUIRED');
    voice.trigger('QUEUE_OVERFLOW'); // CRITICAL pre-empts
    voice.retract('QUEUE_OVERFLOW');
    expect(voice.getActiveSubtitle()).not.toContain('OVERFLOW');
  });

  it('retract() does not touch unrelated lines', () => {
    voice.trigger('PASS_START');
    expect(voice.retract('QUEUE_OVERFLOW')).toBe(false);
    expect(voice.getActiveSubtitle()).toContain('Indus');
  });

  it('reset() clears active and pending dialogue (restart / campaign switch)', () => {
    voice.trigger('QUEUE_OVERFLOW');
    voice.trigger('PASS_START');
    voice.reset();
    expect(voice.getActiveSubtitle()).toBe('');
    expect(voice.getIsSpeaking()).toBe(false);
    vi.advanceTimersByTime(10000);
    expect(voice.getActiveSubtitle()).toBe('');
  });

  it('the overflow line is still available for genuine overflow', () => {
    expect(voice.trigger('QUEUE_OVERFLOW')).toBe(true);
    expect(voice.getActiveSubtitle()).toContain('DOWNLINK OVERFLOW');
  });
});

describe('Cross-mission state isolation', () => {
  it('switching Fireline -> Monsoon -> Fireline leaves no stale packets, queue or debrief', () => {
    const eng = new MissionEngine('FIRELINE_PASS');
    const b = eng.scanSector('B', 'THERMAL').packet!;
    eng.queuePacket(b.id);
    expect(eng.getState().scenarioId).toBe('FIRELINE_PASS');

    eng.setScenario('STANDARD_INDUS_PASS');
    let s = eng.getState();
    expect(s.scenarioId).toBe('STANDARD_INDUS_PASS');
    expect(s.packets).toHaveLength(0);
    expect(s.queuePacketIds).toHaveLength(0);
    expect(s.downlinkCommittedSec).toBe(0);
    expect(s.debrief).toBeFalsy();

    eng.setScenario('FIRELINE_PASS');
    s = eng.getState();
    expect(s.scenarioId).toBe('FIRELINE_PASS');
    expect(s.packets).toHaveLength(0);
  });

  it('a Fireline victory debrief only contains FIRELINE_PASS evidence (B/C/E, THERMAL+OPTICAL, 76 MB, 7.6 s, 10 Wh)', () => {
    const eng = new MissionEngine('FIRELINE_PASS');
    const b = eng.scanSector('B', 'THERMAL').packet!;
    const c = eng.scanSector('C', 'OPTICAL').packet!;
    const e = eng.scanSector('E', 'THERMAL').packet!;
    eng.processPacket(b.id);
    eng.processPacket(e.id);
    eng.queuePacket(b.id);
    eng.queuePacket(c.id);
    eng.queuePacket(e.id);
    const deb = eng.commitDownlink()!;
    const s = eng.getState();
    expect(s.scenarioId).toBe('FIRELINE_PASS');
    expect(deb.outcome).toBe('SUCCESS');
    expect(deb.totalScore).toBe(100);
    expect(deb.certification).toBe('GOLD');
    expect(deb.transmittedPayloadMb).toBe(76);
    expect(deb.powerUsed).toBe(42);
    expect(s.power).toBe(10);
    const sensors = s.packets.map((p) => `${p.sectorId}:${p.sensorMode}`).sort();
    expect(sensors).toEqual(['B:THERMAL', 'C:OPTICAL', 'E:THERMAL']);
    expect(s.packets.some((p) => p.sensorMode === 'RADAR')).toBe(false);
  });

  it('a Monsoon victory debrief is identifiable as STANDARD_INDUS_PASS with RADAR evidence', () => {
    const eng = new MissionEngine('STANDARD_INDUS_PASS');
    const b = eng.scanSector('B', 'RADAR').packet!;
    expect(eng.getState().scenarioId).toBe('STANDARD_INDUS_PASS');
    expect(b.sensorMode).toBe('RADAR');
  });
});

