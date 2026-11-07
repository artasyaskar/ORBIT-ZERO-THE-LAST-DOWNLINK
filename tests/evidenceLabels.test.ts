import { describe, expect, it } from 'vitest';
import { MissionEngine } from '../src/mission/missionEngine';
import { getScenarioSector } from '../src/mission/missionConfig';
import type { MissionScenarioId, SectorId, SensorMode } from '../src/mission/types';

/**
 * Evidence-label audit: the text a player reads on a data cube must belong to the sensor that
 * produced it. A thermal cube must not be explained with SAR physics, an optical cube must not
 * quote a temperature, and a radar cube must not claim thermal emission. Processing must never
 * be described as adding certainty.
 */
const SCENARIOS: MissionScenarioId[] = [
  'FIRELINE_PASS',
  'STANDARD_INDUS_PASS',
  'AFTERSHOCK_PASS',
  'MONSOON_SUPERCELL_PASS',
  'SOLAR_BROWNOUT_PASS',
];
const SECTORS: SectorId[] = ['A', 'B', 'C', 'D', 'E', 'F'];
const SENSORS: SensorMode[] = ['OPTICAL', 'THERMAL', 'RADAR'];

const FORBIDDEN: Record<SensorMode, RegExp> = {
  // Cross-references such as "SAR would penetrate this" are legitimate caveats; these are not.
  THERMAL: /backscatter|radar return|speckle|corner reflector/i,
  OPTICAL: /radiometric|backscatter|speckle|brightness temperature/i,
  RADAR: /kelvin|radiometric|brightness temperature|thermal emission recorded/i,
};

describe('Evidence labels match the sensor that produced them', () => {
  const rows: Array<{ scenario: MissionScenarioId; sector: SectorId; sensor: SensorMode; text: string; processedText: string }> = [];
  for (const scenario of SCENARIOS) {
    for (const sector of SECTORS) {
      for (const sensor of SENSORS) {
        const engine = new MissionEngine(scenario);
        const res = engine.scanSector(sector, sensor);
        const p = res.packet;
        if (!p) continue;
        const text = [p.headline, p.finding, p.scientificReason, p.scientificCaveat ?? ''].join(' ');
        engine.processPacket(p.id);
        const q = engine.getState().packets.find((x) => x.id === p.id)!;
        rows.push({ scenario, sector, sensor, text, processedText: [q.headline, q.finding, q.scientificReason, q.scientificCaveat ?? ''].join(' ') });
      }
    }
  }

  it('covers a meaningful number of observations', () => {
    expect(rows.length).toBeGreaterThan(40);
  });

  it('never explains a cube with another sensor\'s physics', () => {
    const bad = rows.filter((r) => FORBIDDEN[r.sensor].test(r.text)).map((r) => `${r.scenario}/${r.sector}/${r.sensor}: ${r.text.slice(0, 120)}`);
    expect(bad).toEqual([]);
  });

  it('only gives a thermal cube a cloud-blocking explanation where the sector is actually clouded', () => {
    const bad = rows.filter((r) => r.sensor === 'THERMAL' && getScenarioSector(r.scenario, r.sector).cloudCover === 'CLEAR' && /cloud/i.test(r.text)).map((r) => `${r.scenario}/${r.sector}: ${r.text.slice(0, 120)}`);
    expect(bad).toEqual([]);
  });

  it('never claims that processing raised certainty', () => {
    const bad = rows.filter((r) => /(increas|improv|raises?|boost)\w*\s+(the\s+)?(confidence|certainty)/i.test(r.processedText)).map((r) => `${r.scenario}/${r.sector}/${r.sensor}`);
    expect(bad).toEqual([]);
  });
});
