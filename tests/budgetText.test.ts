import { describe, expect, it } from 'vitest';
import { MISSION_SCENARIOS, MISSION_BUDGET } from '../src/mission/missionConfig';
import { budgetLine, compressedSizeLine, fmtRate, processCostLine, rawPayloadRange, scanCostLine } from '../src/mission/budgetText';
import { buildTutorialSteps, TUTORIAL_STEPS } from '../src/mission/tutorialEngine';

describe('budgetText: every player-facing number comes from the budget', () => {
  it('formats the shipped budget', () => {
    expect(fmtRate(MISSION_BUDGET)).toBe('10 MB/s');
    expect(processCostLine(MISSION_BUDGET)).toBe('-6 Wh -> 1 STR / 18 MB / 1.8s Tx');
    expect(compressedSizeLine(MISSION_BUDGET)).toBe('1 STR / 18 MB / 1.8s Tx');
    expect(scanCostLine(MISSION_BUDGET, 'THERMAL')).toBe('Thermal IR (11 Wh, 3 STR, 42 MB / 4.2s Tx)');
    expect(rawPayloadRange(MISSION_BUDGET, ['OPTICAL', 'THERMAL', 'RADAR'])).toBe('40-45 MB');
    expect(budgetLine(MISSION_SCENARIOS.AFTERSHOCK_PASS.budget)).toContain(`${MISSION_SCENARIOS.AFTERSHOCK_PASS.budget.initialPower} Wh`);
  });

  it('follows a retuned budget instead of printing stale numbers', () => {
    const tuned = {
      ...MISSION_BUDGET,
      downlinkThroughputMbps: 12.5,
      onboardProcess: { ...MISSION_BUDGET.onboardProcess, powerCost: 7, compressedPayloadMb: 20, compressedTransmitSec: 1.6 },
    };
    expect(fmtRate(tuned)).toBe('12.5 MB/s');
    expect(processCostLine(tuned)).toBe('-7 Wh -> 1 STR / 20 MB / 1.6s Tx');
  });

  it('derives payload size when a custom budget omits payloadMb', () => {
    const custom = { ...MISSION_BUDGET, opticalScan: { powerCost: 8, storageCost: 3, transmitSec: 4.0 } };
    expect(scanCostLine(custom, 'OPTICAL')).toBe('Optical (8 Wh, 3 STR, 40 MB / 4.0s Tx)');
  });

  it('builds Academy step text from the Academy budget', () => {
    const tuned = {
      ...MISSION_SCENARIOS.ORBITAL_ACADEMY.budget,
      onboardProcess: { ...MISSION_BUDGET.onboardProcess, powerCost: 9 },
    };
    const steps = buildTutorialSteps(tuned);
    const process = steps.find((s) => s.id === 'STEP_6_PROCESS')!;
    expect(process.desktopInstruction).toContain('-9 Wh');
    expect(process.desktopInstruction).not.toContain('-6 Wh');
    expect(TUTORIAL_STEPS).toHaveLength(9);
    expect(TUTORIAL_STEPS[0].vrInstruction).toContain('35-60 cm');
  });
});
