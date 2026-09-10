import type { ProjectSessionId } from '@cad-studio/project-runtime';
import type { ImportConfiguration } from './configuration.js';
import { resolveImportConfiguration } from './configuration.js';
import { ImportDispatcher } from './dispatcher.js';
import { ImportFactory } from './factory.js';
import { ImportPluginRegistry } from './plugin-registry.js';
import { ImportRegistry } from './registry.js';
import { createImportRequest, type ImportRequest } from './request.js';
import { ImportSession, type ImportSessionOptions } from './session.js';
import type { ImmutableImportSnapshot } from './state.js';
import { ImportValidator } from './validator.js';
import {
  asImportRequestId,
  asImportRuntimeId,
  asImportSessionId,
  asImportSourceRef,
  createDefaultImportClock,
  type ImportClock,
  type ImportRuntimeId,
  type ImportSessionId,
  type ImportSourceRef,
  importFailure,
  importSuccess,
  type ImportResultType
} from './types.js';

export interface ImportRuntimeOptions {
  readonly id?: ImportRuntimeId;
  readonly clock?: ImportClock;
  readonly configuration?: Partial<ImportConfiguration>;
  readonly plugins?: ImportPluginRegistry;
  readonly registry?: ImportRegistry;
}

let sessionSerial = 0;
let requestSerial = 0;
let runtimeSerial = 0;

/**
 * Application-facing Import Runtime entry.
 * Orchestrates import workflow via plug-ins — no parsers, no geometry, no Scene mutation.
 *
 * Ownership: caller owns the runtime; dispose releases sessions.
 * Threading: runtime methods are safe for concurrent session creation;
 * each session remains single-owner.
 */
export class ImportRuntime {
  public readonly id: ImportRuntimeId;
  private readonly clock: ImportClock;
  private readonly configuration: ImportConfiguration;
  private readonly plugins: ImportPluginRegistry;
  private readonly registry: ImportRegistry;
  private readonly validator: ImportValidator;
  private readonly factory = new ImportFactory();
  private readonly dispatcher = new ImportDispatcher();
  private disposed = false;

  public constructor(options: ImportRuntimeOptions = {}) {
    runtimeSerial += 1;
    this.id = options.id ?? asImportRuntimeId(`import-runtime-${String(runtimeSerial)}`);
    this.clock = options.clock ?? createDefaultImportClock();
    this.configuration = resolveImportConfiguration(options.configuration);
    this.plugins = options.plugins ?? new ImportPluginRegistry();
    this.registry = options.registry ?? new ImportRegistry();
    this.validator = new ImportValidator(this.configuration);
  }

  public getPlugins(): ImportPluginRegistry {
    return this.plugins;
  }

  public getRegistry(): ImportRegistry {
    return this.registry;
  }

  public getFactory(): ImportFactory {
    return this.factory;
  }

  public getDispatcher(): ImportDispatcher {
    return this.dispatcher;
  }

  public getValidator(): ImportValidator {
    return this.validator;
  }

  public createSessionId(prefix = 'import-session'): ImportSessionId {
    sessionSerial += 1;
    return asImportSessionId(`${prefix}-${String(sessionSerial)}`);
  }

  public createRequestId(prefix = 'import-request'): ReturnType<typeof asImportRequestId> {
    requestSerial += 1;
    return asImportRequestId(`${prefix}-${String(requestSerial)}`);
  }

  public createRequest(input: {
    readonly source: string | ImportSourceRef;
    readonly fileName: string;
    readonly extension?: string;
    readonly mimeType?: string;
    readonly projectSessionId?: ProjectSessionId;
    readonly metadata?: Readonly<Record<string, string>>;
  }): ImportRequest {
    return createImportRequest({
      id: this.createRequestId(),
      source:
        typeof input.source === 'string' ? asImportSourceRef(input.source) : input.source,
      fileName: input.fileName,
      createdAt: this.clock.now(),
      ...(input.extension === undefined ? {} : { extension: input.extension }),
      ...(input.mimeType === undefined ? {} : { mimeType: input.mimeType }),
      ...(input.projectSessionId === undefined
        ? {}
        : { projectSessionId: input.projectSessionId }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata })
    });
  }

  public createSession(
    options: {
      readonly sessionId?: ImportSessionId;
      readonly projectSessionId?: ProjectSessionId;
      readonly configuration?: Partial<ImportConfiguration>;
    } = {}
  ): ImportResultType<ImportSession> {
    if (this.disposed) {
      return importFailure('unavailable', 'ImportRuntime disposed');
    }
    if (this.registry.activeCount() >= this.configuration.maxConcurrentSessions) {
      return importFailure(
        'unavailable',
        `Max concurrent imports (${String(this.configuration.maxConcurrentSessions)}) reached`
      );
    }

    const sessionOptions: ImportSessionOptions = {
      sessionId: options.sessionId ?? this.createSessionId(),
      configuration: {
        ...this.configuration,
        ...(options.configuration ?? {})
      },
      clock: this.clock,
      plugins: this.plugins,
      validator: this.validator,
      ...(options.projectSessionId === undefined
        ? {}
        : { projectSessionId: options.projectSessionId })
    };
    const session = new ImportSession(sessionOptions);
    const registered = this.registry.register(session);
    if (!registered.ok) {
      session.dispose();
      return registered;
    }
    return importSuccess(session);
  }

  /**
   * Convenience: create session + run import.
   */
  public async import(
    request: ImportRequest,
    signal?: AbortSignal
  ): Promise<ImportResultType<ImmutableImportSnapshot>> {
    const session = this.createSession({
      ...(request.projectSessionId === undefined
        ? {}
        : { projectSessionId: request.projectSessionId })
    });
    if (!session.ok) {
      return session;
    }
    try {
      return await session.value.run(request, signal);
    } finally {
      // keep session registered until explicit dispose for snapshot inspection
    }
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.registry.clear();
    this.validator.clear();
  }

  public isDisposed(): boolean {
    return this.disposed;
  }
}
