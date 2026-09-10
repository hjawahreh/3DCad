import type { ImportRequest } from './request.js';
import type { ImportLifecyclePhase } from './lifecycle.js';
import type { ImportProgress } from './progress.js';
import type {
  ImporterPluginId,
  ImportRevision,
  ImportRequestId,
  ImportSessionId
} from './types.js';

/**
 * Opaque imported entity descriptor — no geometry payloads.
 * Plugins supply identifiers/refs only; host/domain materialize later.
 */
export interface ImportedEntityDescriptor {
  readonly id: string;
  readonly kind: string;
  readonly sourceName: string | undefined;
  readonly attributes: Readonly<Record<string, string>>;
}

/**
 * Immutable platform document model produced by a successful import.
 * Not a Scene graph — no GPU/mesh data.
 */
export interface ImmutableImportedDocument {
  readonly documentId: string;
  readonly sourceRequestId: ImportRequestId;
  readonly importerId: ImporterPluginId;
  readonly entities: readonly ImportedEntityDescriptor[];
  readonly warnings: readonly string[];
  readonly createdAt: number;
}

export interface ImportOutcomeSuccess {
  readonly ok: true;
  readonly document: ImmutableImportedDocument;
}

export interface ImportOutcomeFailure {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
}

export type ImportOutcome = ImportOutcomeSuccess | ImportOutcomeFailure;

/**
 * Immutable import session snapshot.
 */
export interface ImmutableImportSnapshot {
  readonly sessionId: ImportSessionId;
  readonly request: ImportRequest;
  readonly phase: ImportLifecyclePhase;
  readonly revision: ImportRevision;
  readonly importerId: ImporterPluginId | undefined;
  readonly progress: ImportProgress | undefined;
  readonly outcome: ImportOutcome | undefined;
  readonly durationMs: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export const freezeImportSnapshot = (
  input: ImmutableImportSnapshot
): ImmutableImportSnapshot => Object.freeze({ ...input });

export interface ImportState {
  readonly phase: ImportLifecyclePhase;
  readonly snapshot: ImmutableImportSnapshot;
}
