/**
 * Measurement engine — Euclidean / angle / surface-path distances (CLN-010).
 * Read-only; uses 3D coordinates only (never screen-space).
 */

import {
  ANALYSIS_ALGORITHM_VERSIONS,
  createAnalysisId,
  createMeasurementId,
  type AnalysisVec3,
  type ClinicalAnalysisResult,
  type ClinicalMeasurementResult,
  type DistanceKind
} from '../types.js';
import {
  CANONICAL_ANGLE_UNIT,
  CANONICAL_LENGTH_UNIT,
  ANALYSIS_TOLERANCE,
  clampDisplay,
  formatAngleDeg,
  formatLengthMm
} from '../units.js';
import { vDistance, vDot, vNormalize, vSub } from './VecMath.js';

export interface PointPairInput {
  readonly a: AnalysisVec3;
  readonly b: AnalysisVec3;
  readonly sourceObjectIds: readonly string[];
  readonly sourceRevision: number;
  readonly geometryFingerprint?: string | undefined;
  readonly now: number;
  readonly kind?: DistanceKind;
  /** Optional vertex adjacency for surface-path (vertex index graph). */
  readonly surface?:
    | {
        readonly positions: Float32Array;
        readonly adjacency: readonly (readonly number[])[];
        readonly vertexA: number;
        readonly vertexB: number;
      }
    | undefined;
}

export interface AngleInput {
  readonly a: AnalysisVec3;
  readonly vertex: AnalysisVec3;
  readonly b: AnalysisVec3;
  readonly sourceObjectIds: readonly string[];
  readonly sourceRevision: number;
  readonly geometryFingerprint?: string | undefined;
  readonly now: number;
}

const euclideanDistanceMm = (a: AnalysisVec3, b: AnalysisVec3): number =>
  vDistance(a, b);

/** Dijkstra on undirected vertex adjacency — surface-path length in mm. */
export const surfacePathDistanceMm = (
  positions: Float32Array,
  adjacency: readonly (readonly number[])[],
  start: number,
  end: number
): { readonly distance: number; readonly ok: boolean } => {
  const n = adjacency.length;
  if (start < 0 || end < 0 || start >= n || end >= n) {
    return { distance: Number.NaN, ok: false };
  }
  if (start === end) {
    return { distance: 0, ok: true };
  }
  const dist = new Float64Array(n);
  dist.fill(Number.POSITIVE_INFINITY);
  dist[start] = 0;
  const visited = new Uint8Array(n);
  for (let iter = 0; iter < n; iter += 1) {
    let u = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i += 1) {
      if (visited[i] === 0 && dist[i]! < best) {
        best = dist[i]!;
        u = i;
      }
    }
    if (u < 0 || best === Number.POSITIVE_INFINITY) {
      break;
    }
    visited[u] = 1;
    if (u === end) {
      break;
    }
    const ux = positions[u * 3]!;
    const uy = positions[u * 3 + 1]!;
    const uz = positions[u * 3 + 2]!;
    for (const v of adjacency[u] ?? []) {
      if (visited[v] === 1) continue;
      const vx = positions[v * 3]!;
      const vy = positions[v * 3 + 1]!;
      const vz = positions[v * 3 + 2]!;
      const w = Math.hypot(vx - ux, vy - uy, vz - uz);
      const nd = dist[u]! + w;
      if (nd < dist[v]!) {
        dist[v] = nd;
      }
    }
  }
  const d = dist[end]!;
  if (!Number.isFinite(d)) {
    return { distance: Number.NaN, ok: false };
  }
  return { distance: d, ok: true };
};

export const buildVertexAdjacency = (
  vertexCount: number,
  indices: Uint32Array
): readonly (readonly number[])[] => {
  const sets = Array.from({ length: vertexCount }, () => new Set<number>());
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i]!;
    const b = indices[i + 1]!;
    const c = indices[i + 2]!;
    sets[a]?.add(b);
    sets[a]?.add(c);
    sets[b]?.add(a);
    sets[b]?.add(c);
    sets[c]?.add(a);
    sets[c]?.add(b);
  }
  return Object.freeze(sets.map((s) => Object.freeze([...s])));
};

export const measureAngleDegrees = (
  a: AnalysisVec3,
  vertex: AnalysisVec3,
  b: AnalysisVec3
): number => {
  const va = vNormalize(vSub(a, vertex));
  const vb = vNormalize(vSub(b, vertex));
  const c = Math.min(1, Math.max(-1, vDot(va, vb)));
  return (Math.acos(c) * 180) / Math.PI;
};

export class ClinicalMeasurementEngine {
  public measureDistance(input: PointPairInput): ClinicalAnalysisResult {
    const kind: DistanceKind = input.kind ?? 'euclidean';
    let valueMm = Number.NaN;
    let validity: ClinicalMeasurementResult['validity'] = 'VALID';
    const warnings: string[] = [];

    if (kind === 'euclidean') {
      valueMm = euclideanDistanceMm(input.a, input.b);
    } else if (input.surface !== undefined) {
      const path = surfacePathDistanceMm(
        input.surface.positions,
        input.surface.adjacency,
        input.surface.vertexA,
        input.surface.vertexB
      );
      if (!path.ok) {
        validity = 'INVALID';
        warnings.push('Surface path between vertices is unavailable');
      } else {
        valueMm = path.distance;
      }
    } else {
      validity = 'INCOMPLETE';
      warnings.push('Surface-path distance requires mesh adjacency');
    }

    if (!Number.isFinite(valueMm)) {
      validity = validity === 'VALID' ? 'INVALID' : validity;
    }

    const displayValue = clampDisplay(valueMm, 2);
    const measurement: ClinicalMeasurementResult = Object.freeze({
      measurementId: createMeasurementId('dist', input.now),
      measurementType: 'distance',
      sourceRevision: input.sourceRevision,
      sourceObjectIds: Object.freeze([...input.sourceObjectIds]),
      geometricReferences: Object.freeze(['point-a', 'point-b']),
      value: Object.freeze({
        value: displayValue,
        unit: CANONICAL_LENGTH_UNIT,
        display: Number.isFinite(displayValue) ? formatLengthMm(displayValue) : '—',
        uncertainty: ANALYSIS_TOLERANCE.lengthEqualityMm
      }),
      validity,
      warnings: Object.freeze(warnings),
      computationVersion:
        kind === 'euclidean'
          ? ANALYSIS_ALGORITHM_VERSIONS.distance
          : ANALYSIS_ALGORITHM_VERSIONS.surfacePath,
      timestamp: input.now,
      distanceKind: kind,
      metadata: Object.freeze({
        rawValue: valueMm,
        kind
      })
    });

    return Object.freeze({
      analysisId: createAnalysisId('distance', input.now),
      analysisType: 'distance',
      sourceRevision: input.sourceRevision,
      segmentationRevision: undefined,
      geometryFingerprint: input.geometryFingerprint,
      algorithmVersion: measurement.computationVersion,
      validity,
      warnings: Object.freeze(warnings),
      measurements: Object.freeze([measurement]),
      payload: Object.freeze({
        a: input.a,
        b: input.b,
        kind
      }),
      timestamp: input.now,
      decisionSupportOnly: true
    });
  }

  public measureAngle(input: AngleInput): ClinicalAnalysisResult {
    const deg = measureAngleDegrees(input.a, input.vertex, input.b);
    const validity =
      Number.isFinite(deg) && deg >= 0 && deg <= 180 ? 'VALID' : 'INVALID';
    const displayValue = clampDisplay(deg, 1);
    const measurement: ClinicalMeasurementResult = Object.freeze({
      measurementId: createMeasurementId('angle', input.now),
      measurementType: 'angle',
      sourceRevision: input.sourceRevision,
      sourceObjectIds: Object.freeze([...input.sourceObjectIds]),
      geometricReferences: Object.freeze(['point-a', 'vertex', 'point-b']),
      value: Object.freeze({
        value: displayValue,
        unit: CANONICAL_ANGLE_UNIT,
        display: Number.isFinite(displayValue) ? formatAngleDeg(displayValue) : '—',
        uncertainty: ANALYSIS_TOLERANCE.angleEqualityDeg
      }),
      validity,
      warnings: Object.freeze([]),
      computationVersion: ANALYSIS_ALGORITHM_VERSIONS.angle,
      timestamp: input.now,
      metadata: Object.freeze({ rawValue: deg })
    });

    return Object.freeze({
      analysisId: createAnalysisId('angle', input.now),
      analysisType: 'angle',
      sourceRevision: input.sourceRevision,
      segmentationRevision: undefined,
      geometryFingerprint: input.geometryFingerprint,
      algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.angle,
      validity,
      warnings: Object.freeze([]),
      measurements: Object.freeze([measurement]),
      payload: Object.freeze({
        a: input.a,
        vertex: input.vertex,
        b: input.b
      }),
      timestamp: input.now,
      decisionSupportOnly: true
    });
  }
}
