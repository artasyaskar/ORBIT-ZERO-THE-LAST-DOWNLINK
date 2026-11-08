import { describe, expect, it } from 'vitest';
import { Group, Object3D } from '@iwsdk/core';
import { MissionEngine } from '../src/mission/missionEngine';
import { getRecommendedSensor } from '../src/mission/missionConfig';
import { getMissionBenchmark, solveMission } from '../src/mission/missionPlanner';
import { SolverMemo, solverCacheKey } from '../src/mission/solverMemo';
import { generateProceduralCrisis } from '../src/mission/proceduralCrisis';
import { NamedChildCache, SceneObjectCache } from '../src/systems/sceneObjectCache';
import type { MissionScenarioId } from '../src/mission/types';

/** Builds a tiny scene whose nodes carry IWSDK-style ids, plus a resolver that walks it. */
function sceneFixture() {
  const root = new Group();
  let level = 'level-a';
  const node = (id: string, lvl = level) => {
    const o = new Object3D();
    o.userData.iwsdkSceneNodeId = id;
    o.userData.iwsdkSceneLevelId = lvl;
    return o;
  };
  const resolve = (id: string) => {
    let found: Object3D | undefined;
    root.traverse((o) => {
      if (!found && o.userData.iwsdkSceneNodeId === id && o.userData.iwsdkSceneLevelId === level) found = o;
    });
    return found;
  };
  let resolves = 0;
  const cache = new SceneObjectCache({
    root: () => root,
    resolve: (id) => {
      resolves++;
      return resolve(id);
    },
    isCurrent: (id, o) => o.userData.iwsdkSceneNodeId === id && o.userData.iwsdkSceneLevelId === level,
  });
  return { root, node, cache, setLevel: (l: string) => (level = l), resolves: () => resolves };
}

describe('SceneObjectCache correctness', () => {
  it('returns the same object on repeated lookups without re-resolving', () => {
    const f = sceneFixture();
    const a = f.node('globe');
    f.root.add(a);
    expect(f.cache.get('globe')).toBe(a);
    expect(f.cache.get('globe')).toBe(a);
    expect(f.resolves()).toBe(1);
    expect(f.cache.stats.hits).toBe(1);
  });

  it('does not return an object after it is removed from the scene', () => {
    const f = sceneFixture();
    const a = f.node('globe');
    f.root.add(a);
    expect(f.cache.get('globe')).toBe(a);
    f.root.remove(a);
    expect(f.cache.get('globe')).toBeUndefined();
  });

  it('follows a node that is replaced by a rebuilt node with the same id', () => {
    const f = sceneFixture();
    const a = f.node('cradle');
    f.root.add(a);
    expect(f.cache.get('cradle')).toBe(a);
    f.root.remove(a);
    const b = f.node('cradle');
    f.root.add(b);
    expect(f.cache.get('cradle')).toBe(b);
  });

  it('keeps working when a node is reparented inside the scene, and drops it when reparented out', () => {
    const f = sceneFixture();
    const group = new Group();
    const other = new Group();
    f.root.add(group, other);
    const a = f.node('pad');
    group.add(a);
    expect(f.cache.get('pad')).toBe(a);
    other.add(a); // still under root
    expect(f.cache.get('pad')).toBe(a);
    const orphanParent = new Group(); // not under root
    orphanParent.add(a);
    expect(f.cache.get('pad')).toBeUndefined();
  });

  it('rejects an object from a previous level even if it is still attached', () => {
    const f = sceneFixture();
    const oldNode = f.node('globe', 'level-a');
    f.root.add(oldNode);
    expect(f.cache.get('globe')).toBe(oldNode);
    f.setLevel('level-b');
    const newNode = f.node('globe', 'level-b');
    f.root.add(newNode);
    expect(f.cache.get('globe')).toBe(newNode);
  });

  it('never caches misses, so a node added later is found', () => {
    const f = sceneFixture();
    expect(f.cache.get('late')).toBeUndefined();
    expect(f.cache.get('late')).toBeUndefined();
    const a = f.node('late');
    f.root.add(a);
    expect(f.cache.get('late')).toBe(a);
  });

  it('invalidate() clears one entry or all entries (teardown / mission transition)', () => {
    const f = sceneFixture();
    const a = f.node('a');
    const b = f.node('b');
    f.root.add(a, b);
    f.cache.get('a');
    f.cache.get('b');
    expect(f.cache.size).toBe(2);
    f.cache.invalidate('a');
    expect(f.cache.size).toBe(1);
    f.cache.invalidate();
    expect(f.cache.size).toBe(0);
    expect(f.cache.get('a')).toBe(a);
  });

  it('treats everything as stale when there is no scene root', () => {
    const cache = new SceneObjectCache({ root: () => undefined, resolve: () => new Object3D() });
    const first = cache.get('x');
    expect(cache.get('x')).not.toBe(first);
  });
});

describe('NamedChildCache correctness (per-frame child lookups)', () => {
  const tree = () => {
    const root = new Group();
    const mid = new Group();
    const leaf = new Object3D();
    leaf.name = 'SweepBlade';
    mid.add(leaf);
    root.add(mid);
    return { root, mid, leaf };
  };

  it('returns what getObjectByName returns, and serves repeats from the cache', () => {
    const { root, leaf } = tree();
    const cache = new NamedChildCache();
    expect(cache.get(root, 'SweepBlade')).toBe(leaf);
    expect(cache.get(root, 'SweepBlade')).toBe(leaf);
    expect(cache.stats).toMatchObject({ resolved: 1, hits: 1 });
  });

  it('drops a child that was removed from the subtree or renamed', () => {
    const { root, mid, leaf } = tree();
    const cache = new NamedChildCache();
    cache.get(root, 'SweepBlade');
    mid.remove(leaf);
    expect(cache.get(root, 'SweepBlade')).toBeUndefined();
    mid.add(leaf);
    expect(cache.get(root, 'SweepBlade')).toBe(leaf);
    leaf.name = 'Renamed';
    expect(cache.get(root, 'SweepBlade')).toBeUndefined();
  });

  it('follows a replacement child with the same name', () => {
    const { root, mid, leaf } = tree();
    const cache = new NamedChildCache();
    cache.get(root, 'SweepBlade');
    mid.remove(leaf);
    const replacement = new Object3D();
    replacement.name = 'SweepBlade';
    root.add(replacement);
    expect(cache.get(root, 'SweepBlade')).toBe(replacement);
  });

  it('never caches misses (children attached later are found) and keeps roots apart', () => {
    const { root } = tree();
    const other = new Group();
    const cache = new NamedChildCache();
    expect(cache.get(root, 'Late')).toBeUndefined();
    const late = new Object3D();
    late.name = 'Late';
    root.add(late);
    expect(cache.get(root, 'Late')).toBe(late);
    expect(cache.get(other, 'Late')).toBeUndefined();
    expect(cache.get(undefined, 'Late')).toBeUndefined();
  });
});

const SCENARIOS: MissionScenarioId[] = [
  'FIRELINE_PASS',
  'STANDARD_INDUS_PASS',
  'AFTERSHOCK_PASS',
  'MONSOON_SUPERCELL_PASS',
  'SOLAR_BROWNOUT_PASS',
];

describe('SolverMemo matches the uncached solver', () => {
  it.each(SCENARIOS)('%s: identical results at every step of a representative play-through', (scenarioId) => {
    const engine = new MissionEngine(scenarioId);
    const memo = new SolverMemo();
    const check = () => {
      const state = engine.getState();
      expect(memo.get(state, engine.getActiveCustomScenario())).toEqual(solveMission(state, engine.getActiveCustomScenario()));
    };
    check();
    for (const sector of ['B', 'C', 'E'] as const) {
      const mode = getRecommendedSensor(scenarioId, sector, engine.getActiveCustomScenario());
      const res = engine.scanSector(sector, mode);
      check();
      const packet = res.packet;
      if (!packet) continue;
      engine.processPacket(packet.id);
      check();
      engine.queuePacket(packet.id);
      check();
    }
  });

  it('procedural seeds that share a scenario id never share a plan', () => {
    const memo = new SolverMemo();
    const seeds = [11, 4242, 987654];
    for (let round = 0; round < 2; round++) {
      for (const seed of seeds) {
        const engine = new MissionEngine('STANDARD_INDUS_PASS');
        engine.startProceduralCrisis(seed);
        const custom = engine.getActiveCustomScenario();
        const state = engine.getState();
        expect(memo.get(state, custom)).toEqual(solveMission(state, custom));
      }
    }
  });

  it('is invalidated by queue membership, power, storage, window and scenario changes', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    const p = engine.scanSector('B', 'THERMAL').packet!;
    const base = engine.getState();
    const key = (s: typeof base, c?: null) => solverCacheKey(s, c);
    const k0 = key(base);
    expect(key({ ...base, power: base.power - 1 })).not.toBe(k0);
    expect(key({ ...base, maxStorage: base.maxStorage + 1 })).not.toBe(k0);
    expect(key({ ...base, downlinkWindowSec: base.downlinkWindowSec - 1 })).not.toBe(k0);
    expect(key({ ...base, scenarioId: 'AFTERSHOCK_PASS' })).not.toBe(k0);
    engine.queuePacket(p.id);
    expect(key(engine.getState())).not.toBe(k0);
    expect(solverCacheKey(base, generateProceduralCrisis(1).config)).not.toBe(k0);
    expect(solverCacheKey(base, generateProceduralCrisis(1).config)).not.toBe(
      solverCacheKey(base, generateProceduralCrisis(1).config),
    ); // separate config instances are separate cache entries
  });

  it('reuses the plan only when nothing that feeds the solver changed', () => {
    const engine = new MissionEngine('FIRELINE_PASS');
    const memo = new SolverMemo();
    const state = engine.getState();
    const first = memo.get(state);
    expect(memo.get(engine.getState())).toBe(first);
    expect(memo.stats).toEqual({ hits: 1, solves: 1 });
    engine.scanSector('B', 'THERMAL');
    expect(memo.get(engine.getState())).not.toBe(first);
    expect(memo.stats.solves).toBe(2);
  });
});

describe('Mission benchmark cache does not leak between procedural seeds', () => {
  it('returns each seed its own benchmark regardless of lookup order', () => {
    const configs = [3, 91, 777, 3].map((seed) => generateProceduralCrisis(seed).config);
    const fresh = (config: (typeof configs)[number]) =>
      solveMission(
        {
          scenarioId: config.id as MissionScenarioId,
          power: config.budget.initialPower,
          maxPower: config.budget.initialPower,
          maxStorage: config.budget.maxStorage,
          downlinkWindowSec: config.budget.downlinkDurationSec,
          packets: [],
        },
        config,
      );
    for (const config of [...configs, ...configs.slice().reverse()]) {
      const cached = getMissionBenchmark(config.id as MissionScenarioId, config);
      const expected = fresh(config);
      expect(cached.score).toBe(expected.score);
      expect(cached.powerUsed).toBe(expected.powerUsed);
      expect(cached.transmitSec).toBe(expected.transmitSec);
    }
  });

  it('static scenario benchmarks are still served from cache without being shared with procedural ones', () => {
    const staticBench = getMissionBenchmark('STANDARD_INDUS_PASS');
    const proc = generateProceduralCrisis(555).config;
    getMissionBenchmark('STANDARD_INDUS_PASS', proc);
    expect(getMissionBenchmark('STANDARD_INDUS_PASS')).toEqual(staticBench);
  });
});
