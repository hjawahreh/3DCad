import type { ViewportSession } from './session.js';
import type { ViewportId } from './types.js';
import { viewportFailure, viewportSuccess, type ViewportResult } from './types.js';

/**
 * Host binding for a single viewport id → session.
 * Ownership: runtime-owned registry entry.
 */
export class ViewportHost {
  private session: ViewportSession | undefined;

  public constructor(public readonly viewportId: ViewportId) {}

  public bind(session: ViewportSession): ViewportResult<void> {
    if (this.session !== undefined && this.session !== session) {
      return viewportFailure('conflict', `Viewport ${this.viewportId} already has a session`);
    }
    this.session = session;
    return viewportSuccess(undefined);
  }

  public getSession(): ViewportSession | undefined {
    return this.session;
  }

  public unbind(): void {
    this.session = undefined;
  }
}

/**
 * Registry of viewport hosts / sessions.
 * No hidden globals — instantiate per application runtime.
 */
export class ViewportRegistry {
  private readonly hosts = new Map<string, ViewportHost>();

  public getOrCreate(viewportId: ViewportId): ViewportHost {
    const key = viewportId as string;
    const existing = this.hosts.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const host = new ViewportHost(viewportId);
    this.hosts.set(key, host);
    return host;
  }

  public get(viewportId: ViewportId): ViewportHost | undefined {
    return this.hosts.get(viewportId as string);
  }

  public registerSession(session: ViewportSession): ViewportResult<void> {
    const host = this.getOrCreate(session.viewportId);
    return host.bind(session);
  }

  public unregister(viewportId: ViewportId): void {
    const host = this.hosts.get(viewportId as string);
    host?.unbind();
    this.hosts.delete(viewportId as string);
  }

  public list(): readonly ViewportHost[] {
    return Object.freeze([...this.hosts.values()]);
  }

  public clear(): void {
    for (const host of this.hosts.values()) {
      host.getSession()?.dispose();
      host.unbind();
    }
    this.hosts.clear();
  }

  public size(): number {
    return this.hosts.size;
  }
}
