import type { ImportRequest } from './request.js';
import type { ImportProgressReporter } from './progress.js';
import type {
  ImmutableImportedDocument,
  ImportedEntityDescriptor
} from './state.js';
import type { ImporterPluginId, ImportResultType } from './types.js';
import { importFailure, importSuccess } from './types.js';

export interface ImporterCapabilities {
  readonly extensions: readonly string[];
  readonly mimeTypes: readonly string[];
  readonly formats: readonly string[];
  readonly maxBytesHint: number | undefined;
  readonly supportsCancellation: boolean;
  readonly supportsProgress: boolean;
}

export interface ImporterPluginInfo {
  readonly id: ImporterPluginId;
  readonly name: string;
  readonly version: string;
  readonly priority: number;
  readonly enabled: boolean;
  readonly capabilities: ImporterCapabilities;
}

export interface ImporterExecuteContext {
  readonly request: ImportRequest;
  readonly signal: AbortSignal | undefined;
  readonly reportProgress: ImportProgressReporter;
  readonly now: () => number;
}

/**
 * Generic importer plug-in interface.
 * Implementations live outside this package — no parsers here.
 */
export interface ImporterPlugin {
  readonly info: ImporterPluginInfo;
  canHandle(request: ImportRequest): boolean;
  validate?(request: ImportRequest): ImportResultType<void>;
  import(context: ImporterExecuteContext): Promise<ImportResultType<ImmutableImportedDocument>>;
}

export const freezeImportedDocument = (input: {
  readonly documentId: string;
  readonly sourceRequestId: ImportRequest['id'];
  readonly importerId: ImporterPluginId;
  readonly entities: readonly ImportedEntityDescriptor[];
  readonly warnings?: readonly string[];
  readonly createdAt: number;
}): ImmutableImportedDocument =>
  Object.freeze({
    documentId: input.documentId,
    sourceRequestId: input.sourceRequestId,
    importerId: input.importerId,
    entities: Object.freeze([...input.entities]),
    warnings: Object.freeze([...(input.warnings ?? [])]),
    createdAt: input.createdAt
  });

/** Test/host helper: trivial importer that emits descriptors without parsing. */
export const createPassthroughImporter = (input: {
  readonly id: ImporterPluginId;
  readonly name: string;
  readonly extensions: readonly string[];
  readonly mimeTypes?: readonly string[];
  readonly priority?: number;
}): ImporterPlugin => {
  const info: ImporterPluginInfo = Object.freeze({
    id: input.id,
    name: input.name,
    version: '0.1.0',
    priority: input.priority ?? 100,
    enabled: true,
    capabilities: Object.freeze({
      extensions: Object.freeze([...input.extensions.map((e) => e.toLowerCase())]),
      mimeTypes: Object.freeze([...(input.mimeTypes ?? [])]),
      formats: Object.freeze([...input.extensions.map((e) => e.toLowerCase())]),
      maxBytesHint: undefined,
      supportsCancellation: true,
      supportsProgress: true
    })
  });
  return {
    info,
    canHandle: (request) =>
      info.capabilities.extensions.includes(request.extension) ||
      (request.mimeType !== undefined &&
        info.capabilities.mimeTypes.includes(request.mimeType)),
    import: async (context) => {
      if (context.signal?.aborted === true) {
        return importFailure('cancelled', 'Import cancelled before execute');
      }
      context.reportProgress({
        completed: 1,
        total: 1,
        ratio: 1,
        message: 'passthrough',
        stage: 'complete',
        updatedAt: context.now()
      });
      return importSuccess(
        freezeImportedDocument({
          documentId: `doc-${context.request.id as string}`,
          sourceRequestId: context.request.id,
          importerId: info.id,
          entities: [
            Object.freeze({
              id: `entity-${context.request.fileName}`,
              kind: 'imported-ref',
              sourceName: context.request.fileName,
              attributes: Object.freeze({ extension: context.request.extension })
            })
          ],
          createdAt: context.now()
        })
      );
    }
  };
};
