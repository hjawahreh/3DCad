import type { ImportCancellation } from './cancellation.js';
import type { ImportEvents } from './events.js';
import type { ImportLifecycle } from './lifecycle.js';
import type { ImporterPlugin } from './plugin.js';
import type { ImportPluginRegistry } from './plugin-registry.js';
import { createImportProgress } from './progress.js';
import type { ImportRequest } from './request.js';
import type { ImmutableImportSnapshot, ImportOutcome } from './state.js';
import { freezeImportSnapshot } from './state.js';
import type { ImportValidator } from './validator.js';
import type { ImportClock, ImportSessionId } from './types.js';
import { asImportRevision, importFailure, importSuccess, type ImportResultType } from './types.js';

export interface ImportPipelineDeps {
  readonly sessionId: ImportSessionId;
  readonly request: ImportRequest;
  readonly lifecycle: ImportLifecycle;
  readonly events: ImportEvents;
  readonly validator: ImportValidator;
  readonly plugins: ImportPluginRegistry;
  readonly cancellation: ImportCancellation;
  readonly clock: ImportClock;
  readonly onSnapshot: (snapshot: ImmutableImportSnapshot) => void;
}

/**
 * Coordinates validate → select → initialize → import → finalize.
 * No mesh parsing — delegates to ImporterPlugin.
 */
export class ImportPipeline {
  public constructor(private readonly deps: ImportPipelineDeps) {}

  public async run(): Promise<ImportResultType<ImmutableImportSnapshot>> {
    const started = this.deps.clock.now();
    let revision = 0;
    let importerId: ImporterPlugin['info']['id'] | undefined;
    let progress = createImportProgress({
      completed: 0,
      total: 4,
      stage: 'start',
      updatedAt: started
    });
    let outcome: ImportOutcome | undefined;

    const publish = (phase: string): ImmutableImportSnapshot => {
      revision += 1;
      const snapshot = freezeImportSnapshot({
        sessionId: this.deps.sessionId,
        request: this.deps.request,
        phase: this.deps.lifecycle.getPhase(),
        revision: asImportRevision(revision),
        importerId,
        progress,
        outcome,
        durationMs: this.deps.clock.now() - started,
        createdAt: started,
        updatedAt: this.deps.clock.now()
      });
      this.deps.onSnapshot(snapshot);
      this.deps.events.emit({
        type: 'lifecycle',
        phase,
        requestId: this.deps.request.id,
        at: this.deps.clock.now()
      });
      return snapshot;
    };

    const fail = (code: Parameters<typeof importFailure>[0], message: string) => {
      this.deps.lifecycle.force('failed');
      outcome = Object.freeze({ ok: false as const, code, message });
      this.deps.events.emit({
        type: 'error',
        code,
        message,
        at: this.deps.clock.now()
      });
      return importFailure(code, message);
    };

    // Validate
    if (!this.deps.lifecycle.transition('validating')) {
      this.deps.lifecycle.force('validating');
    }
    publish('validating');
    const cancelled = this.deps.cancellation.throwIfCancelled();
    if (!cancelled.ok) {
      this.deps.lifecycle.force('cancelled');
      outcome = Object.freeze({
        ok: false as const,
        code: 'cancelled',
        message: cancelled.error.message
      });
      publish('cancelled');
      return cancelled;
    }

    const validation = this.deps.validator.validate(this.deps.request);
    if (!validation.ok) {
      this.deps.events.emit({
        type: 'validation',
        ok: false,
        message: validation.error.message,
        at: this.deps.clock.now()
      });
      return fail(validation.error.code, validation.error.message);
    }
    this.deps.events.emit({
      type: 'validation',
      ok: true,
      message: validation.value.messages.join('; ') || 'ok',
      at: this.deps.clock.now()
    });
    progress = createImportProgress({
      completed: 1,
      total: 4,
      stage: 'validated',
      updatedAt: this.deps.clock.now()
    });
    this.deps.events.emit({ type: 'progress', progress, at: this.deps.clock.now() });

    // Select importer
    this.deps.lifecycle.force('selecting');
    publish('selecting');
    const selected = this.deps.plugins.resolve(this.deps.request);
    if (!selected.ok) {
      return fail(selected.error.code, selected.error.message);
    }
    const plugin = selected.value;
    importerId = plugin.info.id;
    this.deps.events.emit({
      type: 'plugin',
      operation: 'selected',
      pluginId: plugin.info.id as string,
      at: this.deps.clock.now()
    });
    if (plugin.validate !== undefined) {
      const pluginValidation = plugin.validate(this.deps.request);
      if (!pluginValidation.ok) {
        return fail(pluginValidation.error.code, pluginValidation.error.message);
      }
    }
    progress = createImportProgress({
      completed: 2,
      total: 4,
      stage: 'selected',
      message: plugin.info.name,
      updatedAt: this.deps.clock.now()
    });
    this.deps.events.emit({ type: 'progress', progress, at: this.deps.clock.now() });

    // Initialize + import
    this.deps.lifecycle.force('initializing');
    publish('initializing');
    this.deps.lifecycle.force('importing');
    publish('importing');

    const again = this.deps.cancellation.throwIfCancelled();
    if (!again.ok) {
      this.deps.lifecycle.force('cancelled');
      outcome = Object.freeze({
        ok: false as const,
        code: 'cancelled',
        message: again.error.message
      });
      publish('cancelled');
      return again;
    }

    let importResult;
    try {
      importResult = await plugin.import({
        request: this.deps.request,
        signal: this.deps.cancellation.signal,
        reportProgress: (p) => {
          progress = p;
          this.deps.events.emit({
            type: 'progress',
            progress: p,
            at: this.deps.clock.now()
          });
          this.deps.onSnapshot(
            freezeImportSnapshot({
              sessionId: this.deps.sessionId,
              request: this.deps.request,
              phase: this.deps.lifecycle.getPhase(),
              revision: asImportRevision(++revision),
              importerId,
              progress,
              outcome,
              durationMs: this.deps.clock.now() - started,
              createdAt: started,
              updatedAt: this.deps.clock.now()
            })
          );
        },
        now: this.deps.clock.now
      });
    } catch (cause) {
      return fail(
        'pipeline',
        cause instanceof Error ? cause.message : 'Importer threw unexpectedly'
      );
    }

    if (this.deps.cancellation.isCancelled()) {
      this.deps.lifecycle.force('cancelled');
      outcome = Object.freeze({
        ok: false as const,
        code: 'cancelled',
        message: this.deps.cancellation.getReason() ?? 'Import cancelled'
      });
      publish('cancelled');
      return importFailure('cancelled', outcome.message);
    }

    if (!importResult.ok) {
      return fail(importResult.error.code, importResult.error.message);
    }

    // Finalize
    this.deps.lifecycle.force('finalizing');
    progress = createImportProgress({
      completed: 4,
      total: 4,
      stage: 'finalizing',
      updatedAt: this.deps.clock.now()
    });
    publish('finalizing');

    outcome = Object.freeze({ ok: true as const, document: importResult.value });
    this.deps.lifecycle.force('completed');
    const finalSnapshot = publish('completed');
    this.deps.events.emit({
      type: 'complete',
      snapshot: finalSnapshot,
      at: this.deps.clock.now()
    });
    return importSuccess(finalSnapshot);
  }
}
