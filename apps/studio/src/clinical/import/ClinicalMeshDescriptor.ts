/**
 * Immutable clinical mesh descriptor — metadata only, no mutable mesh buffers.
 */

import { IDENTITY_MAT4, type Mat4 } from '@cad-studio/scene';

export type ClinicalMeshFormat = 'stl' | 'obj' | 'ply' | 'unknown';

export type ClinicalArchRole = 'upper' | 'lower';

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
  /** Clinical arch assignment for multi-scan cases. */
  readonly archRole?: ClinicalArchRole | undefined;
  /** Column-major 4×4; defaults to identity at import. */
  readonly transform: ClinicalTransform;
  /** Working-mesh revision after a committed geometry operation (metadata only). */
  readonly geometryRevision?: number;
  /** Kernel fingerprint for the current working geometry revision. */
  readonly geometryFingerprint?: string;
  /** Geometry backend id that produced the current working revision. */
  readonly geometryBackend?: string;
  /**
   * Compact accepted segmentation metadata.
   * Face membership is mesh-local indices (face-membership-v1), not VTK/renderer ids.
   * Giant mesh vertex buffers must never be stored here.
   */
  readonly segmentationMeta?: {
    readonly predictionId: string;
    readonly providerId: string;
    readonly modelId: string;
    readonly modelVersion: string;
    readonly instanceCount: number;
    readonly caseBand: string;
    /** Geometry fingerprint membership was computed against. */
    readonly geometryFingerprint: string;
    /** Geometry revision membership was computed against. */
    readonly sourceRevision: number;
    readonly needsReviewCount?: number;
    readonly validationVerdict?: 'PASS' | 'WARNING' | 'FAIL';
    /** Explicit integrity status — CURRENT until geometry mutation / mismatch. */
    readonly status?: 'CURRENT' | 'STALE' | 'INVALID' | 'NOT_AVAILABLE';
    readonly staleReason?: string;
    readonly acceptedAt?: number;
    readonly invalidatedAt?: number;
    /** Persisted face membership bound to geometryFingerprint/sourceRevision. */
    readonly faceMembership?: {
      readonly version: 'face-membership-v1';
      readonly meshFaceCount: number;
      readonly instances: readonly {
        readonly instanceId: string;
        readonly faceIndices: readonly number[];
      }[];
      readonly membershipFingerprint: string;
    };
    readonly teeth?: readonly {
      readonly instanceId: string;
      readonly fdi: number | undefined;
      readonly status: string;
      readonly confidence: number;
      readonly needsReview: boolean;
      readonly faceCount?: number;
      readonly centroid?: readonly [number, number, number];
      readonly localFrame?: {
        readonly origin: readonly [number, number, number];
        readonly xAxis: readonly [number, number, number];
        readonly yAxis: readonly [number, number, number];
        readonly zAxis: readonly [number, number, number];
        readonly confidence: string;
      };
      /** Arch-order neighbors only — not contact geometry. Optional for ONNX. */
      readonly neighbors?: {
        readonly archPreviousId: string | undefined;
        readonly archNextId: string | undefined;
        readonly confidence: string;
        readonly basis: string;
      };
    }[];
  };
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

/** Operator-facing format copy — PLY is ASCII-only in this import path. */
export const CLINICAL_IMPORT_FORMAT_LABELS = Object.freeze({
  stl: 'STL',
  obj: 'OBJ',
  ply: 'PLY (ASCII)'
} as const);
