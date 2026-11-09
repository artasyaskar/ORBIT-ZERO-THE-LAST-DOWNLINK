import { describe, expect, it } from 'vitest';
import { gradeLabel, memoryBlocks, OUTCOME_LABELS, outcomeLabel, resultHeadline } from '../src/mission/resultLabels';
import { OUTCOME_LABELS as DEBRIEF_LABELS, plainScience } from '../src/ui/debriefText';
import { MissionEngine } from '../src/mission/missionEngine';
import { getScenarioSector, MISSION_SCENARIOS } from '../src/mission/missionConfig';
import { DIALOGUE_CATALOG } from '../src/systems/voiceCommander';

describe('One result vocabulary', () => {
  it('formats outcome + grade the same way everywhere', () => {
    expect(resultHeadline('SUCCESS', 'A')).toBe('MISSION SUCCESS | GRADE A');
    expect(resultHeadline('FAILED', 'C')).toBe('MISSION FAILED | GRADE C');
    expect(resultHeadline('SUCCESS', 'S', true)).toBe('TRAINING COMPLETE');
    expect(outcomeLabel(undefined)).toBe('MISSION FAILED');
    expect(gradeLabel('S')).toBe('GRADE S');
    expect(DEBRIEF_LABELS).toBe(OUTCOME_LABELS);
  });

  it('counts storage in memory blocks', () => {
    expect(memoryBlocks(1)).toBe('1 memory block');
    expect(memoryBlocks(3)).toBe('3 memory blocks');
  });

  it('ARIA never names a rank, medal or a fixed window length the HUD does not show', () => {
    for (const line of Object.values(DIALOGUE_CATALOG)) {
      const text = `${line.spoken} ${line.subtitle}`;
      expect(text, line.id).not.toMatch(/S-Rank|A-Rank|GOLD|SILVER|BRONZE|10-second|halved/i);
    }
  });

  it('engine status lines use plain units and never give away the sensor answer', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    expect(engine.selectSector('B').lastStatusMessage).not.toMatch(/rec\.|THERMAL|RADAR|OPTICAL/);
    const scan = engine.scanSector('B', 'THERMAL');
    expect(scan.message).toMatch(/memory blocks/);
    expect(scan.message).not.toMatch(/\bSTR\b/);
    const processed = engine.processPacket(scan.packet!.id);
    expect(processed.message).not.toMatch(/\bSTR\b|_ENCODING|_COMPRESSION/);
  });
});

describe('Scenario text belongs to its scenario', () => {
  it('the earthquake operation shows no flood text in any sector', () => {
    for (const id of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
      const sector = getScenarioSector('AFTERSHOCK_PASS', id);
      const text = [sector.name, sector.terrainSummary, ...Object.values(sector.outcomes).flatMap((o) => [o.headline, o.finding, o.scientificReason])].join(' ');
      // (The Hanna Valley landslide blocking a dam spillway is earthquake content and stays.)
      expect(text, `AFTERSHOCK sector ${id}`).not.toMatch(/\bIndus\b|flood|levee|inundat|reservoir|causeway|retention basin/i);
    }
  });

  it('the wildfire operation shows no flood text in any sector', () => {
    for (const id of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
      const sector = getScenarioSector('FIRELINE_PASS', id);
      const text = [sector.name, sector.terrainSummary, ...Object.values(sector.outcomes).flatMap((o) => [o.headline, o.finding])].join(' ');
      expect(text, `FIRELINE sector ${id}`).not.toMatch(/\bIndus\b|levee|inundat|causeway|retention basin/i);
    }
  });

  it('player-facing scenario subtitles use memory blocks, not STR', () => {
    for (const sc of Object.values(MISSION_SCENARIOS)) {
      expect(`${sc.subtitle} ${sc.briefing}`, sc.id).not.toMatch(/\bSTR\b/);
    }
  });
});

describe('plainScience', () => {
  it('drops the simulated-value prefix and bracketed remote-sensing symbols', () => {
    expect(plainScience('Simulated gameplay value (92% confidence): Thin smoke (PM2.5 radius << 3.9 um, tau_3.9 = 0.18) is clear in mid-wave IR (12.0 m GSD).'))
      .toBe('Thin smoke is clear in mid-wave IR.');
    expect(plainScience('Plain text stays.')).toBe('Plain text stays.');
  });
});
