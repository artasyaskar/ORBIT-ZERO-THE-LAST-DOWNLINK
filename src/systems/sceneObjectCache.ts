import type { Object3D } from '@iwsdk/core';

export interface SceneObjectCacheOptions {
  /** Current scene root. A cached object that is no longer under this root is stale. */
  root: () => Object3D | null | undefined;
  /** Authoritative (slow) lookup, e.g. `world.getSceneObject`. */
  resolve: (id: string) => Object3D | undefined;
  /**
   * Optional extra check that a cached object is still the one `resolve` would return
   * (same node id, same active level). Cheap property comparisons only.
   */
  isCurrent?: (id: string, object: Object3D) => boolean;
}

/**
 * Memoizes scene-node lookups that would otherwise traverse the whole scene on every call.
 *
 * A hit is returned only when the cached object is still attached under the current root and
 * still passes `isCurrent`. Anything else (removed, reparented out of the scene, replaced by a
 * rebuilt node, belonging to another level) is dropped and re-resolved. Misses are never cached,
 * so a node that is added later is found on the next call.
 */
export class SceneObjectCache {
  private readonly entries = new Map<string, Object3D>();
  public readonly stats = { hits: 0, resolved: 0, notFound: 0, invalidated: 0 };

  constructor(private readonly options: SceneObjectCacheOptions) {}

  get<T extends Object3D = Object3D>(id: string): T | undefined {
    const cached = this.entries.get(id);
    if (cached) {
      if (this.isLive(id, cached)) {
        this.stats.hits++;
        return cached as T;
      }
      this.entries.delete(id);
      this.stats.invalidated++;
    }
    const found = this.options.resolve(id);
    if (found) {
      this.entries.set(id, found);
      this.stats.resolved++;
    } else {
      this.stats.notFound++;
    }
    return found as T | undefined;
  }

  /** Drop one entry, or all of them (scene teardown, level change, mission transition). */
  invalidate(id?: string): void {
    if (id === undefined) this.entries.clear();
    else this.entries.delete(id);
  }

  get size(): number {
    return this.entries.size;
  }

  private isLive(id: string, object: Object3D): boolean {
    const root = this.options.root();
    if (!root) return false;
    let attached = false;
    for (let p: Object3D | null = object; p; p = p.parent) {
      if (p === root) {
        attached = true;
        break;
      }
    }
    return attached && (this.options.isCurrent ? this.options.isCurrent(id, object) : true);
  }
}
