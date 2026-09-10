export type ResourceKind =
  | 'renderer'
  | 'canvas'
  | 'session'
  | 'scheduler'
  | 'overlay'
  | 'other';

export interface TrackedResource {
  readonly id: string;
  readonly kind: ResourceKind;
  readonly dispose: () => void;
}

/**
 * Tracks disposable runtime resources to prevent leaks on shutdown.
 * Ownership: session-owned; disposeAll is idempotent per resource.
 */
export class ResourceLifecycle {
  private readonly resources = new Map<string, TrackedResource>();
  private disposed = false;

  public track(resource: TrackedResource): void {
    if (this.disposed) {
      resource.dispose();
      return;
    }
    const existing = this.resources.get(resource.id);
    if (existing !== undefined) {
      existing.dispose();
    }
    this.resources.set(resource.id, resource);
  }

  public untrack(id: string): void {
    this.resources.delete(id);
  }

  public has(id: string): boolean {
    return this.resources.has(id);
  }

  public size(): number {
    return this.resources.size;
  }

  public disposeAll(): void {
    this.disposed = true;
    const items = [...this.resources.values()].reverse();
    this.resources.clear();
    for (const item of items) {
      item.dispose();
    }
  }

  public isDisposed(): boolean {
    return this.disposed;
  }
}
