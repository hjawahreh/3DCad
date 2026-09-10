import type { ProjectMetadata } from './metadata.js';
import type { ProjectSettings } from './settings.js';
import type { ProjectId, ProjectRevision } from './types.js';
import type { ProjectLifecyclePhase } from './lifecycle.js';

export interface ProjectState {
  readonly id: ProjectId;
  readonly metadata: ProjectMetadata;
  readonly settings: ProjectSettings;
  readonly revision: ProjectRevision;
  readonly dirty: boolean;
  readonly readOnly: boolean;
  readonly documentRevision: number;
}

/**
 * Immutable project snapshot for consumers / recovery / history coordination.
 * Ownership: value object; safe to share after publication.
 */
export interface ImmutableProjectSnapshot {
  readonly id: ProjectId;
  readonly metadata: ProjectMetadata;
  readonly settings: ProjectSettings;
  readonly revision: ProjectRevision;
  readonly dirty: boolean;
  readonly readOnly: boolean;
  readonly documentRevision: number;
  readonly phase: ProjectLifecyclePhase;
  readonly createdAt: number;
}

export const freezeProjectSnapshot = (input: {
  readonly id: ProjectId;
  readonly metadata: ProjectMetadata;
  readonly settings: ProjectSettings;
  readonly revision: ProjectRevision;
  readonly dirty: boolean;
  readonly readOnly: boolean;
  readonly documentRevision: number;
  readonly phase: ProjectLifecyclePhase;
  readonly createdAt: number;
}): ImmutableProjectSnapshot =>
  Object.freeze({
    id: input.id,
    metadata: input.metadata,
    settings: input.settings,
    revision: input.revision,
    dirty: input.dirty,
    readOnly: input.readOnly,
    documentRevision: input.documentRevision,
    phase: input.phase,
    createdAt: input.createdAt
  });

export interface ProjectPublicState {
  readonly phase: ProjectLifecyclePhase;
  readonly snapshot: ImmutableProjectSnapshot | undefined;
  readonly dirty: boolean;
  readonly readOnly: boolean;
}
