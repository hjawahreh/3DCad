import {
  asPickingId,
  sceneFailure,
  sceneSuccess,
  type DomainEntityId,
  type PickingId,
  type SceneResult
} from './types.js';

/**
 * Stable GPU-oriented picking IDs. Assignment is deterministic by domain id order,
 * not by projection batch order.
 */
export class PickingIdRegistry {
  private readonly byDomain = new Map<DomainEntityId, PickingId>();
  private readonly byPicking = new Map<PickingId, DomainEntityId>();
  private nextId = 1;

  public assign(domainId: DomainEntityId): PickingId {
    const existing = this.byDomain.get(domainId);
    if (existing !== undefined) {
      return existing;
    }
    const id = asPickingId(this.nextId);
    this.nextId += 1;
    this.byDomain.set(domainId, id);
    this.byPicking.set(id, domainId);
    return id;
  }

  public resolve(pickingId: PickingId): SceneResult<DomainEntityId> {
    const domainId = this.byPicking.get(pickingId);
    if (domainId === undefined) {
      return sceneFailure('not-found', `Unknown picking id ${String(pickingId)}`);
    }
    return sceneSuccess(domainId);
  }

  public release(domainId: DomainEntityId): void {
    const pickingId = this.byDomain.get(domainId);
    if (pickingId === undefined) {
      return;
    }
    this.byDomain.delete(domainId);
    this.byPicking.delete(pickingId);
  }

  public size(): number {
    return this.byDomain.size;
  }

  public clear(): void {
    this.byDomain.clear();
    this.byPicking.clear();
    this.nextId = 1;
  }
}
