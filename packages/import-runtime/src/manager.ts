import type { ImportRequest } from './request.js';
import type { ImmutableImportSnapshot } from './state.js';
import { freezeImportSnapshot } from './state.js';
import type { ImportLifecyclePhase } from './lifecycle.js';
import type { ImportClock, ImportSessionId } from './types.js';
import { asImportRevision } from './types.js';
import { createImportProgress } from './progress.js';

/**
 * Owns working import state and publishes immutable snapshots.
 */
export class ImportManager {
  private snapshot: ImmutableImportSnapshot;
  private revision = 0;

  public constructor(
    sessionId: ImportSessionId,
    request: ImportRequest,
    phase: ImportLifecyclePhase,
    clock: ImportClock
  ) {
    const now = clock.now();
    this.snapshot = freezeImportSnapshot({
      sessionId,
      request,
      phase,
      revision: asImportRevision(0),
      importerId: undefined,
      progress: createImportProgress({
        completed: 0,
        stage: 'created',
        updatedAt: now
      }),
      outcome: undefined,
      durationMs: 0,
      createdAt: now,
      updatedAt: now
    });
  }

  public getSnapshot(): ImmutableImportSnapshot {
    return this.snapshot;
  }

  public publish(snapshot: ImmutableImportSnapshot): ImmutableImportSnapshot {
    this.revision = Number(snapshot.revision);
    this.snapshot = snapshot;
    return this.snapshot;
  }

  public getRevision(): number {
    return this.revision;
  }
}
