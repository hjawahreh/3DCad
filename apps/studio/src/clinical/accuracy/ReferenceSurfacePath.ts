/**
 * CLN-001A — reference trim boundary representation (clinical GT path).
 * Distinct from engine SurfacePath; used only for accuracy comparison.
 */

export interface ReferenceSurfacePathPoint {
  readonly position: readonly [number, number, number];
  /** Optional face id on the reference mesh. */
  readonly faceIndex?: number;
}

export interface ReferenceSurfacePath {
  readonly caseId: string;
  readonly archRole: 'upper' | 'lower';
  readonly closed: boolean;
  readonly points: readonly ReferenceSurfacePathPoint[];
  readonly source: 'expert-annotation' | 'benchmark' | 'unknown';
  readonly notes?: string;
}

export const isReferenceSurfacePath = (v: unknown): v is ReferenceSurfacePath => {
  if (v === null || typeof v !== 'object') return false;
  const o = v as ReferenceSurfacePath;
  return (
    typeof o.caseId === 'string' &&
    (o.archRole === 'upper' || o.archRole === 'lower') &&
    typeof o.closed === 'boolean' &&
    Array.isArray(o.points)
  );
};
