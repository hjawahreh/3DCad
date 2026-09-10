import type { ProjectId, ProjectLocationRef } from './types.js';

/**
 * Project metadata — host-facing descriptors, not file contents.
 */
export interface ProjectMetadata {
  readonly id: ProjectId;
  readonly name: string;
  readonly location: ProjectLocationRef | undefined;
  readonly createdAt: number;
  readonly modifiedAt: number;
  readonly openedAt: number | undefined;
  readonly formatVersion: string;
  readonly tags: readonly string[];
}

export const createProjectMetadata = (input: {
  readonly id: ProjectId;
  readonly name: string;
  readonly location?: ProjectLocationRef;
  readonly createdAt: number;
  readonly formatVersion?: string;
  readonly tags?: readonly string[];
}): ProjectMetadata =>
  Object.freeze({
    id: input.id,
    name: input.name,
    location: input.location,
    createdAt: input.createdAt,
    modifiedAt: input.createdAt,
    openedAt: undefined,
    formatVersion: input.formatVersion ?? '1.0',
    tags: Object.freeze([...(input.tags ?? [])])
  });

export const touchMetadata = (
  meta: ProjectMetadata,
  at: number,
  patch?: { readonly name?: string; readonly location?: ProjectLocationRef }
): ProjectMetadata =>
  Object.freeze({
    ...meta,
    name: patch?.name ?? meta.name,
    location: patch?.location ?? meta.location,
    modifiedAt: at
  });
