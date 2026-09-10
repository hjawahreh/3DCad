/**
 * Authoritative clinical mesh roles — orchestration refs only (no mesh buffers).
 *
 * Source: original imported mesh; immutable and always recoverable.
 * Working: current clinical geometry revision; mutated only by committed ops.
 * Preview: temporary geometry; must never mutate document, source, working, or history.
 * Display: rendering-oriented mesh; may be optimized; never replaces clinical fidelity.
 */

export type ClinicalMeshRole = 'source' | 'working' | 'preview' | 'display';

export const CLINICAL_MESH_ROLES = Object.freeze([
  'source',
  'working',
  'preview',
  'display'
] as const satisfies readonly ClinicalMeshRole[]);

/** Lightweight revision pointer into geometry owned outside the clinical document. */
export interface ClinicalMeshRevisionRef {
  readonly objectId: string;
  readonly revision: number;
  readonly fingerprint: string;
  readonly role: ClinicalMeshRole;
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly backend: string;
}

export const createClinicalMeshRevisionRef = (
  input: ClinicalMeshRevisionRef
): ClinicalMeshRevisionRef => Object.freeze({ ...input });

export const isAuthoritativeMeshRole = (role: ClinicalMeshRole): boolean =>
  role === 'source' || role === 'working';

export const isEphemeralMeshRole = (role: ClinicalMeshRole): boolean =>
  role === 'preview' || role === 'display';
