/**
 * Patch clinical mesh descriptors from kernel commit results without storing buffers.
 * Updates counts + optional geometry revision metadata on ClinicalMeshDescriptor.
 */

import type { ClinicalMeshDescriptor } from '../import/ClinicalMeshDescriptor.js';

/** Kernel / bridge commit summary — metadata only, no vertex buffers. */
export interface ClinicalGeometryKernelCommitResult {
  readonly objectId: string;
  readonly revision: number;
  readonly fingerprint: string;
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly backend?: string | undefined;
}

/**
 * Separate metadata map managers may merge when not writing onto descriptors.
 * Prefer `applyClinicalGeometryCommitToDescriptor` when optional descriptor fields are enough.
 */
export interface ClinicalGeometryObjectMetadata {
  readonly objectId: string;
  readonly geometryRevision: number;
  readonly geometryFingerprint: string;
  readonly geometryBackend: string | undefined;
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly updatedAt: number;
}

export type ClinicalGeometryMetadataMap = ReadonlyMap<string, ClinicalGeometryObjectMetadata>;

export const clinicalGeometryMetadataFromCommit = (
  commit: ClinicalGeometryKernelCommitResult,
  updatedAt = Date.now()
): ClinicalGeometryObjectMetadata =>
  Object.freeze({
    objectId: commit.objectId,
    geometryRevision: commit.revision,
    geometryFingerprint: commit.fingerprint,
    geometryBackend: commit.backend,
    vertexCount: commit.vertexCount,
    faceCount: commit.faceCount,
    updatedAt
  });

export const mergeClinicalGeometryMetadata = (
  previous: ClinicalGeometryMetadataMap | undefined,
  entry: ClinicalGeometryObjectMetadata
): ClinicalGeometryMetadataMap => {
  const next = new Map(previous ?? []);
  next.set(entry.objectId, entry);
  return next;
};

/** Immutable descriptor patch: counts + optional revision fingerprint fields. */
export const applyClinicalGeometryCommitToDescriptor = (
  descriptor: ClinicalMeshDescriptor,
  commit: ClinicalGeometryKernelCommitResult
): ClinicalMeshDescriptor => {
  if ((descriptor.id as string) !== commit.objectId) {
    return descriptor;
  }
  return Object.freeze({
    ...descriptor,
    vertexCount: commit.vertexCount,
    faceCount: commit.faceCount,
    geometryRevision: commit.revision,
    geometryFingerprint: commit.fingerprint,
    ...(commit.backend !== undefined ? { geometryBackend: commit.backend } : {})
  });
};

export const applyClinicalGeometryCommitToObjects = (
  objects: readonly ClinicalMeshDescriptor[],
  commit: ClinicalGeometryKernelCommitResult
): readonly ClinicalMeshDescriptor[] =>
  Object.freeze(
    objects.map((obj) => applyClinicalGeometryCommitToDescriptor(obj, commit))
  );
