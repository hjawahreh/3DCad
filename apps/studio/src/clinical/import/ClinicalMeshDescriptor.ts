/**
 * Immutable clinical mesh descriptor — metadata only, no mutable mesh buffers.
 */

import { IDENTITY_MAT4, type Mat4 } from '@cad-studio/scene';

export type ClinicalMeshFormat = 'stl' | 'obj' | 'ply' | 'unknown';

export interface ClinicalBounds {
  readonly min: { readonly x: number; readonly y: number; readonly z: number };
  readonly max: { readonly x: number; readonly y: number; readonly z: number };
}

export type ClinicalObjectId = string & { readonly __brand: 'ClinicalObjectId' };

export const asClinicalObjectId = (value: string): ClinicalObjectId =>
  value as ClinicalObjectId;

/** Object transform in treatment space — orientation only mutates this, never topology. */
export type ClinicalTransform = Mat4;

export const IDENTITY_CLINICAL_TRANSFORM: ClinicalTransform = IDENTITY_MAT4;

export interface ClinicalMeshDescriptor {
  readonly id: ClinicalObjectId;
  readonly displayName: string;
  readonly sourceFile: string;
  readonly format: ClinicalMeshFormat;
  readonly units: 'mm' | 'cm' | 'm' | 'in';
  readonly bounds: ClinicalBounds;
  readonly vertexCount: number | undefined;
  readonly faceCount: number | undefined;
  readonly importedAt: number;
  readonly visible: boolean;
  readonly selectable: boolean;
  readonly hierarchyParentId: ClinicalObjectId | undefined;
  readonly importerId: string;
  readonly sourceEntityId: string;
  readonly displayState: 'default' | 'selected' | 'hidden';
  /** Column-major 4×4; defaults to identity at import. */
  readonly transform: ClinicalTransform;
  /** Working-mesh revision after a committed geometry operation (metadata only). */
  readonly geometryRevision?: number;
  /** Kernel fingerprint for the current working geometry revision. */
  readonly geometryFingerprint?: string;
  /** Geometry backend id that produced the current working revision. */
  readonly geometryBackend?: string;
}

export const DEFAULT_MESH_BOUNDS: ClinicalBounds = Object.freeze({
  min: Object.freeze({ x: -25, y: -25, z: -10 }),
  max: Object.freeze({ x: 25, y: 25, z: 10 })
});

export const inferMeshFormat = (extension: string): ClinicalMeshFormat => {
  const ext = extension.toLowerCase().replace(/^\./, '');
  if (ext === 'stl' || ext === 'obj' || ext === 'ply') {
    return ext;
  }
  return 'unknown';
};

export const CLINICAL_IMPORT_FORMATS = Object.freeze(['stl', 'obj', 'ply'] as const);
