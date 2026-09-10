/**
 * Crash recovery hooks — record last-known-good bootstrap markers.
 */

export interface CrashRecoveryMarker {
  readonly lastBootstrapAt: number;
  readonly lastProjectId: string | undefined;
  readonly uncleanShutdown: boolean;
}

export class CrashRecoveryHooks {
  private readonly storageKey = 'cad-studio.crash.v1';
  private marker: CrashRecoveryMarker;

  public constructor() {
    this.marker = this.load() ?? {
      lastBootstrapAt: 0,
      lastProjectId: undefined,
      uncleanShutdown: false
    };
  }

  public get(): CrashRecoveryMarker {
    return this.marker;
  }

  public markBootstrap(projectId?: string): void {
    this.marker = Object.freeze({
      lastBootstrapAt: Date.now(),
      lastProjectId: projectId,
      uncleanShutdown: true
    });
    this.persist();
  }

  public markCleanShutdown(): void {
    this.marker = Object.freeze({
      ...this.marker,
      uncleanShutdown: false
    });
    this.persist();
  }

  public detectUncleanShutdown(): boolean {
    return this.marker.uncleanShutdown === true && this.marker.lastBootstrapAt > 0;
  }

  private load(): CrashRecoveryMarker | undefined {
    if (typeof localStorage === 'undefined') {
      return undefined;
    }
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw === null) {
        return undefined;
      }
      return JSON.parse(raw) as CrashRecoveryMarker;
    } catch {
      return undefined;
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.marker));
    } catch {
      // ignore
    }
  }
}
