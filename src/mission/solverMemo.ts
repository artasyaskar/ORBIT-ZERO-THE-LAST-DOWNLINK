import { solveMission } from './missionPlanner';
import type { MissionScenarioConfig, MissionSolution, MissionState } from './types';

export type SolverInput = Pick<
  MissionState,
  'scenarioId' | 'power' | 'maxPower' | 'maxStorage' | 'downlinkWindowSec' | 'packets'
>;

const customScenarioTokens = new WeakMap<object, number>();
let nextCustomScenarioToken = 1;

/**
 * Identity token for a custom (procedural) scenario. Procedural configs reuse the base scenario
 * id (`STANDARD_INDUS_PASS`) for every seed, so the id alone cannot tell two seeds apart; the
 * object identity of the generated config can.
 */
function customToken(custom: MissionScenarioConfig | null | undefined): number {
  if (!custom) return 0;
  let token = customScenarioTokens.get(custom);
  if (token === undefined) {
    token = nextCustomScenarioToken++;
    customScenarioTokens.set(custom, token);
  }
  return token;
}

/**
 * Every field `solveMission` reads, serialized. Packets are keyed by their evidence-relevant
 * fields, not just id/processed, so a change in queue membership, confidence, cost or request
 * mapping can never reuse an older plan.
 */
export function solverCacheKey(state: SolverInput, custom?: MissionScenarioConfig | null): string {
  const packets = state.packets.map((p) => [
    p.id, p.sectorId, p.sensorMode, p.confidence, p.processed ? 1 : 0, p.queued ? 1 : 0,
    p.storageCost, p.transmitSec, p.satisfiesRequestId, p.payloadMb ?? null,
  ]);
  return JSON.stringify([
    state.scenarioId, customToken(custom), state.power, state.maxPower, state.maxStorage,
    state.downlinkWindowSec, packets,
  ]);
}

/** Single-slot memo around `solveMission`. Results are identical to calling the solver. */
export class SolverMemo {
  private key = '';
  private solution: MissionSolution | null = null;
  public readonly stats = { hits: 0, solves: 0 };

  constructor(private readonly solve: typeof solveMission = solveMission) {}

  get(state: SolverInput, custom?: MissionScenarioConfig | null): MissionSolution {
    const key = solverCacheKey(state, custom);
    if (this.solution && key === this.key) {
      this.stats.hits++;
      return this.solution;
    }
    this.solution = this.solve(state, custom);
    this.key = key;
    this.stats.solves++;
    return this.solution;
  }

  clear(): void {
    this.key = '';
    this.solution = null;
  }
}
