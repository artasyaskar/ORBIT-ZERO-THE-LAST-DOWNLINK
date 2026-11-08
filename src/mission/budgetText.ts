/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Player-facing resource strings derived from a scenario budget.
 * Every number shown to the player (Wh, STR, MB, seconds, MB/s) must come from here
 * so the UI can never disagree with the engine. Pure TypeScript, no Three.js.
 */

import { DOWNLINK_THROUGHPUT_MBPS, STORAGE_UNIT_MB, getScanCost } from './missionConfig';
import type { ResourceBudgetConfig, SensorMode } from './types';

/** Link throughput in MB/s (the engine falls back to the same constant). */
export function rateOf(budget: ResourceBudgetConfig): number {
  return budget.downlinkThroughputMbps && budget.downlinkThroughputMbps > 0
    ? budget.downlinkThroughputMbps
    : DOWNLINK_THROUGHPUT_MBPS;
}

const SENSOR_SHORT: Record<SensorMode, string> = {
  OPTICAL: 'Optical',
  THERMAL: 'Thermal IR',
  RADAR: 'SAR Radar',
};

/** "10.0s" */
export function fmtSec(sec: number): string {
  return `${sec.toFixed(1)}s`;
}

/** "10 MB/s" (drops a trailing .0) */
export function fmtRate(budget: ResourceBudgetConfig): string {
  return `${trimNumber(rateOf(budget))} MB/s`;
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Payload size; older custom budgets may omit payloadMb, so derive it from the link model. */
function payloadOf(budget: ResourceBudgetConfig, cost: { payloadMb?: number; transmitSec: number }): number {
  if (typeof cost.payloadMb === 'number') return cost.payloadMb;
  const overhead = budget.protocolOverheadSec ?? 0;
  return Math.max(0, (cost.transmitSec - overhead) * rateOf(budget));
}

/** "52 Wh | 9 STR (18 MB/STR) | 10.0s @ 10 MB/s" */
export function budgetLine(budget: ResourceBudgetConfig, separator = ' | '): string {
  return [
    `${budget.initialPower} Wh`,
    `${budget.maxStorage} STR (${trimNumber(STORAGE_UNIT_MB)} MB/STR)`,
    `${fmtSec(budget.downlinkDurationSec)} @ ${fmtRate(budget)}`,
  ].join(separator);
}

/** "-6 Wh -> 1 STR / 18 MB / 1.8s Tx" */
export function processCostLine(budget: ResourceBudgetConfig): string {
  return `-${budget.onboardProcess.powerCost} Wh -> ${compressedSizeLine(budget)}`;
}

/** Compressed payload size in MB. */
export function compressedPayloadMb(budget: ResourceBudgetConfig): number {
  const p = budget.onboardProcess;
  return payloadOf(budget, { payloadMb: p.compressedPayloadMb, transmitSec: p.compressedTransmitSec });
}

/** "1 STR / 18 MB / 1.8s Tx" */
export function compressedSizeLine(budget: ResourceBudgetConfig): string {
  const p = budget.onboardProcess;
  return `${p.compressedStorageCost} STR / ${trimNumber(compressedPayloadMb(budget))} MB / ${fmtSec(p.compressedTransmitSec)} Tx`;
}

/** "THERMAL (11 Wh, 3 STR, 42 MB / 4.2s Tx)" style detail for one sensor. */
export function scanCostLine(budget: ResourceBudgetConfig, mode: SensorMode): string {
  const c = getScanCost(budget, mode);
  return `${SENSOR_SHORT[mode]} (${c.powerCost} Wh, ${c.storageCost} STR, ${trimNumber(payloadOf(budget, c))} MB / ${fmtSec(c.transmitSec)} Tx)`;
}

/** "40-45 MB" range of raw scan sizes over the given sensors. */
export function rawPayloadRange(budget: ResourceBudgetConfig, modes: readonly SensorMode[]): string {
  const sizes = modes.map((m) => payloadOf(budget, getScanCost(budget, m)));
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  return min === max ? `${trimNumber(min)} MB` : `${trimNumber(min)}-${trimNumber(max)} MB`;
}

/** Raw payload of one scan in MB. */
export function scanPayloadMb(budget: ResourceBudgetConfig, mode: SensorMode): number {
  return payloadOf(budget, getScanCost(budget, mode));
}

/** Raw storage cost of a scan (identical for all sensors in every shipped budget). */
export function rawStorageUnits(budget: ResourceBudgetConfig, mode: SensorMode = 'OPTICAL'): number {
  return getScanCost(budget, mode).storageCost;
}
