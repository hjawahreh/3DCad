import type { Aabb, DomainEntityId, PickingId, SceneEntityId } from './types.js';
import type { VisibilityDescriptor } from './visibility-builder.js';
import type { SelectionProxy } from './selection-proxy-builder.js';
import type { RenderableDescriptor } from './snapshot.js';

export interface CachedEntityProjection {
  readonly domainEntityId: DomainEntityId;
  readonly sceneEntityId: SceneEntityId;
  readonly pickingId: PickingId;
  readonly bounds: Aabb;
  readonly visibility: VisibilityDescriptor;
  readonly selectionProxy: SelectionProxy;
  readonly renderable: RenderableDescriptor;
  readonly fingerprint: string;
}

/**
 * Per-world projection caches with explicit invalidation. No hidden globals.
 * Threading: treat as single-owner; callers must not share mutable access across threads.
 */
export class ProjectionCache {
  private readonly byDomain = new Map<DomainEntityId, CachedEntityProjection>();
  private revisionSnapshot: number | undefined;
  private hits = 0;
  private misses = 0;

  public get(domainId: DomainEntityId): CachedEntityProjection | undefined {
    const hit = this.byDomain.get(domainId);
    if (hit === undefined) {
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return hit;
  }

  public set(entry: CachedEntityProjection): void {
    this.byDomain.set(entry.domainEntityId, entry);
  }

  public invalidate(domainId: DomainEntityId): void {
    this.byDomain.delete(domainId);
  }

  public invalidateMany(ids: readonly DomainEntityId[]): void {
    for (const id of ids) {
      this.byDomain.delete(id);
    }
  }

  public clear(): void {
    this.byDomain.clear();
    this.revisionSnapshot = undefined;
    this.hits = 0;
    this.misses = 0;
  }

  public setRevision(revision: number): void {
    this.revisionSnapshot = revision;
  }

  public getRevision(): number | undefined {
    return this.revisionSnapshot;
  }

  public stats(): { readonly hits: number; readonly misses: number; readonly size: number } {
    return { hits: this.hits, misses: this.misses, size: this.byDomain.size };
  }

  public efficiency(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 1 : this.hits / total;
  }

  public values(): readonly CachedEntityProjection[] {
    return [...this.byDomain.values()];
  }
}

export const entityFingerprint = (input: {
  readonly kind: string;
  readonly layer: string;
  readonly visible: boolean;
  readonly geometryRef?: string;
  readonly materialRef?: string;
  readonly transform: readonly number[];
  readonly display?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): string =>
  JSON.stringify({
    k: input.kind,
    l: input.layer,
    v: input.visible,
    g: input.geometryRef ?? null,
    m: input.materialRef ?? null,
    t: input.transform,
    d: input.display ?? null,
    meta: input.metadata ?? null
  });
