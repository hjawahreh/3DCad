import { ImportCancellation } from './cancellation.js';
import type { ImportConfiguration } from './configuration.js';
import { resolveImportConfiguration } from './configuration.js';
import type { ImportContext } from './context.js';
import { ImportDiagnostics } from './diagnostics.js';
import { ImportEvents } from './events.js';
import { ImportLifecycle } from './lifecycle.js';
import { ImportManager } from './manager.js';
import { ImportMetrics } from './metrics.js';
import { ImportPipeline } from './pipeline.js';
import type { ImportPluginRegistry } from './plugin-registry.js';
import type { ImportRequest } from './request.js';
import type { ImmutableImportSnapshot } from './state.js';
import type { ImportValidator } from './validator.js';
import {
  createDefaultImportClock,
  type ImportClock,
  type ImportSessionId,
  type ProjectSessionId,
  importFailure,
  importSuccess,
  type ImportResultType
} from './types.js';

export interface ImportSessionOptions {
  readonly sessionId: ImportSessionId;
  readonly configuration?: Partial<ImportConfiguration>;
  readonly clock?: ImportClock;
  readonly plugins: ImportPluginRegistry;
  readonly validator: ImportValidator;
  readonly projectSessionId?: ProjectSessionId;
}

/**
 * One import session — may run concurrently with other sessions.
 * Coordinates pipeline only; does not parse geometry.
 *
 * Ownership: runtime-owned until dispose.
 * Threading: single-owner per session; do not share a session across threads.
 */
export class ImportSession {
  public readonly sessionId: ImportSessionId;
  public readonly projectSessionId: ProjectSessionId | undefined;

  private readonly configuration: ImportConfiguration;
  private readonly clock: ImportClock;
  private readonly plugins: ImportPluginRegistry;
  private readonly validator: ImportValidator;
  private readonly lifecycle = new ImportLifecycle();
  private readonly events = new ImportEvents();
  private readonly metrics = new ImportMetrics();
  private readonly diagnostics = new ImportDiagnostics();
  private cancellation: ImportCancellation | undefined;
  private manager: ImportManager | undefined;
  private running = false;

  public constructor(options: ImportSessionOptions) {
    this.sessionId = options.sessionId;
    this.projectSessionId = options.projectSessionId;
    this.configuration = resolveImportConfiguration(options.configuration);
    this.clock = options.clock ?? createDefaultImportClock();
    this.plugins = options.plugins;
    this.validator = options.validator;
  }

  public getLifecyclePhase(): string {
    return this.lifecycle.getPhase();
  }

  public getEvents(): ImportEvents {
    return this.events;
  }

  public getMetrics(): ImportMetrics {
    return this.metrics;
  }

  public getDiagnostics(): ImportDiagnostics {
    return this.diagnostics;
  }

  public getSnapshot(): ImmutableImportSnapshot | undefined {
    return this.manager?.getSnapshot();
  }

  public getContext(): ImportContext {
    return {
      sessionId: this.sessionId,
      projectSessionId: this.projectSessionId,
      configuration: this.configuration,
      clock: this.clock,
      events: this.events,
      signal: this.cancellation?.signal
    };
  }

  public cancel(reason?: string): ImportResultType<void> {
    if (this.cancellation === undefined) {
      return importFailure('unavailable', 'No active import to cancel');
    }
    const result = this.cancellation.cancel(reason);
    this.diagnostics.recordCancellation(reason ?? 'user-cancel', this.clock.now());
    return result;
  }

  /**
   * Run the full import pipeline for a request.
   */
  public async run(
    request: ImportRequest,
    signal?: AbortSignal
  ): Promise<ImportResultType<ImmutableImportSnapshot>> {
    if (this.running) {
      return importFailure('conflict', 'Import session already running');
    }
    if (this.lifecycle.isTerminal() && this.lifecycle.getPhase() !== 'created') {
      // allow re-run only from created; otherwise need new session
      if (this.lifecycle.getPhase() !== 'disposed') {
        this.lifecycle.force('created');
      }
    }
    if (this.lifecycle.getPhase() === 'disposed') {
      return importFailure('unavailable', 'Import session disposed');
    }

    this.running = true;
    this.cancellation = new ImportCancellation(signal);
    this.manager = new ImportManager(
      this.sessionId,
      request,
      'created',
      this.clock
    );
    this.metrics.begin();
    const started = this.clock.now();

    const pipeline = new ImportPipeline({
      sessionId: this.sessionId,
      request,
      lifecycle: this.lifecycle,
      events: this.events,
      validator: this.validator,
      plugins: this.plugins,
      cancellation: this.cancellation,
      clock: this.clock,
      onSnapshot: (snapshot) => {
        this.manager?.publish(snapshot);
      }
    });

    try {
      const result = await pipeline.run();
      const duration = this.clock.now() - started;
      if (!result.ok) {
        this.recordFailureDiagnostics(result.error.code, result.error.message);
        if (result.error.code === 'cancelled') {
          this.metrics.endCancelled(duration);
        } else {
          this.metrics.endFailure(duration);
        }
        this.running = false;
        return result;
      }
      this.metrics.endSuccess(duration);
      this.running = false;
      return result;
    } catch (cause) {
      const duration = this.clock.now() - started;
      const message = cause instanceof Error ? cause.message : 'Unexpected pipeline failure';
      this.diagnostics.recordPipelineFailure(message, this.clock.now());
      this.metrics.endFailure(duration);
      this.lifecycle.force('failed');
      this.running = false;
      return importFailure('unexpected', message, cause);
    }
  }

  public dispose(): ImportResultType<void> {
    this.cancellation?.cancel('dispose');
    this.events.clear();
    this.diagnostics.clear();
    this.manager = undefined;
    this.lifecycle.force('disposed');
    this.running = false;
    return importSuccess(undefined);
  }

  private recordFailureDiagnostics(code: string, message: string): void {
    if (code === 'unsupported' || code === 'not-found') {
      this.diagnostics.recordMissingImporter(message, this.clock.now());
    } else if (code === 'validation' || code === 'invalid') {
      this.diagnostics.recordValidationFailure(message, this.clock.now());
    } else if (code === 'cancelled') {
      this.diagnostics.recordCancellation(message, this.clock.now());
    } else {
      this.diagnostics.recordPipelineFailure(message, this.clock.now());
    }
  }
}
