/**
 * ClinicalAutoCloseBaseEstimator — deterministic Auto Close Base parameter estimation.
 *
 * Analyzes the trimmed working mesh (boundary, AABB, surface scale) and selects
 * strategy + clinical parameters within hard safety limits.
 * Does not mutate geometry.
 */

import { computeAABB, type TriangleMesh } from '../../geometry-kernel/mesh/TriangleMesh.js';
import { runGeometryQualityPipeline } from '../../geometry-kernel/quality/GeometryQualityPipeline.js';
import type { ClinicalCloseBaseParameters } from './ClinicalCloseBaseParameters.js';
import {
  CLOSE_BASE_PARAMETER_LIMITS,
  sanitizeCloseBaseParameters
} from './ClinicalCloseBaseParameters.js';
import type { CloseBaseOrientation, CloseBaseStrategyId } from './ClinicalCloseBaseStrategy.js';

export const AUTO_CLOSE_BASE_ALGORITHM_VERSION = 'clinical-auto-close-base-v1';

/** Hard safety clamps — never exceed regardless of scan scale. */
export const AUTO_CLOSE_BASE_SAFETY = Object.freeze({
  heightMin: 1.0,
  heightMax: 12.0,
  thicknessMin: 0.8,
  thicknessMax: 4.0,
  offsetMin: 0.1,
  offsetMax: 2.5,
  /** Reject if open boundary edges are below this (unless surface fill). */
  minBoundaryEdgesForPlane: 6,
  /** Reject catastrophically empty / tiny meshes. */
  minTriangles: 32,
  minSpanMm: 5,
  /** Prefer surface fill when open boundary is tiny relative to model. */
  surfaceFillMaxBoundaryRatio: 0.02,
  /** Prefer offset walls when perimeter is large vs diagonal. */
  offsetPerimeterRatio: 2.8
});

export type AutoCloseBaseUiState =
  | 'idle'
  | 'analyzing'
  | 'creating'
  | 'checking'
  | 'preview-ready'
  | 'needs-review'
  | 'failed';

export interface AutoCloseBaseAnalysis {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly boundaryEdges: number;
  readonly components: number;
  readonly degenerateCount: number;
  readonly spanX: number;
  readonly spanY: number;
  readonly spanZ: number;
  readonly diagonal: number;
  readonly qualityOk: boolean;
  readonly qualityCodes: readonly string[];
  readonly qualityWarnings: readonly string[];
}

export interface ClinicalAutoCloseBaseEstimate {
  readonly ok: boolean;
  readonly needsReview: boolean;
  readonly algorithmVersion: string;
  readonly uiState: AutoCloseBaseUiState;
  readonly parameters: ClinicalCloseBaseParameters;
  readonly strategy: CloseBaseStrategyId;
  readonly orientation: CloseBaseOrientation;
  readonly analysis: AutoCloseBaseAnalysis;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
  readonly message: string;
  readonly timingMs: number;
  readonly fingerprint: string;
}

const edgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

const countBoundaryEdges = (mesh: TriangleMesh): number => {
  const use = new Map<string, number>();
  const triCount = Math.floor(mesh.indices.length / 3);
  for (let t = 0; t < triCount; t += 1) {
    const i0 = mesh.indices[t * 3]!;
    const i1 = mesh.indices[t * 3 + 1]!;
    const i2 = mesh.indices[t * 3 + 2]!;
    for (const [a, b] of [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ] as const) {
      const key = edgeKey(a, b);
      use.set(key, (use.get(key) ?? 0) + 1);
    }
  }
  let boundary = 0;
  for (const count of use.values()) {
    if (count === 1) {
      boundary += 1;
    }
  }
  return boundary;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const roundClinical = (value: number, step: number): number =>
  Math.round(value / step) * step;

/**
 * Prefer clinical inferior base (Y-up → xz). If Y span is tiny vs other axes,
 * fall back to the axis with the smallest extent (most "flat" base direction).
 */
export const estimateBaseOrientation = (
  spanX: number,
  spanY: number,
  spanZ: number
): CloseBaseOrientation => {
  const minSpan = Math.min(spanX, spanY, spanZ);
  // Clinical default: base along −Y when Y is a meaningful arch height.
  if (spanY >= minSpan * 0.55 && spanY >= AUTO_CLOSE_BASE_SAFETY.minSpanMm * 0.5) {
    return 'xz';
  }
  if (minSpan === spanX) {
    return 'yz';
  }
  if (minSpan === spanZ) {
    return 'xy';
  }
  return 'xz';
};

export const estimateCloseBaseStrategy = (
  analysis: AutoCloseBaseAnalysis
): { readonly strategy: CloseBaseStrategyId; readonly reason: string } => {
  const safety = AUTO_CLOSE_BASE_SAFETY;
  const perimeterProxy = analysis.boundaryEdges;
  const sizeProxy = Math.max(1, analysis.diagonal);
  const boundaryRatio = perimeterProxy / (sizeProxy * 4);

  if (analysis.boundaryEdges === 0) {
    return {
      strategy: 'surface',
      reason: 'No open boundary — surface fill (may be a no-op if already closed)'
    };
  }
  if (
    analysis.boundaryEdges < safety.minBoundaryEdgesForPlane ||
    boundaryRatio < safety.surfaceFillMaxBoundaryRatio
  ) {
    return {
      strategy: 'surface',
      reason: 'Small open boundary — local surface fill preferred'
    };
  }
  if (perimeterProxy / Math.max(1, analysis.triangleCount / 50) > safety.offsetPerimeterRatio) {
    return {
      strategy: 'offset',
      reason: 'Large trimmed perimeter — offset walls for thickness control'
    };
  }
  return {
    strategy: 'plane',
    reason: 'Open trim boundary — plane base under the arch'
  };
};

/**
 * Scale height / thickness / offset from model size with deterministic safety clamps.
 */
export const estimateCloseBaseParameters = (
  analysis: AutoCloseBaseAnalysis,
  strategy: CloseBaseStrategyId,
  orientation: CloseBaseOrientation
): ClinicalCloseBaseParameters => {
  const safety = AUTO_CLOSE_BASE_SAFETY;
  const limits = CLOSE_BASE_PARAMETER_LIMITS;
  const verticalSpan =
    orientation === 'xz' ? analysis.spanY : orientation === 'yz' ? analysis.spanX : analysis.spanZ;
  const lateral = Math.max(
    orientation === 'xz' ? Math.max(analysis.spanX, analysis.spanZ) : 0,
    orientation === 'xy' ? Math.max(analysis.spanX, analysis.spanY) : 0,
    orientation === 'yz' ? Math.max(analysis.spanY, analysis.spanZ) : 0,
    analysis.diagonal * 0.35
  );

  // Height ~ 8–14% of vertical span, floored by clinical minimums.
  let height = roundClinical(clamp(verticalSpan * 0.1, safety.heightMin, safety.heightMax), 0.5);
  let thickness = roundClinical(
    clamp(Math.min(lateral * 0.02, height * 0.45), safety.thicknessMin, safety.thicknessMax),
    0.1
  );
  let offset = roundClinical(
    clamp(lateral * 0.008, safety.offsetMin, safety.offsetMax),
    0.05
  );

  if (strategy === 'offset') {
    thickness = roundClinical(
      clamp(thickness * 1.15, safety.thicknessMin, safety.thicknessMax),
      0.1
    );
    offset = roundClinical(clamp(offset * 1.25, safety.offsetMin, safety.offsetMax), 0.05);
    height = roundClinical(clamp(Math.max(height, thickness + 0.5), safety.heightMin, safety.heightMax), 0.5);
  }
  if (strategy === 'surface') {
    // Surface fill ignores extrusion; keep modest params for UI consistency.
    height = roundClinical(clamp(height * 0.5, safety.heightMin, 4), 0.5);
  }

  height = clamp(height, limits.heightMin, limits.heightMax);
  thickness = clamp(thickness, limits.thicknessMin, Math.min(limits.thicknessMax, height));
  offset = clamp(offset, limits.marginMin, limits.marginMax);

  return sanitizeCloseBaseParameters({
    strategy,
    height,
    thickness,
    orientation,
    margin: offset,
    smoothing: false
  });
};

export const estimateAutoCloseBase = (mesh: TriangleMesh): ClinicalAutoCloseBaseEstimate => {
  const started = performance.now();
  const safety = AUTO_CLOSE_BASE_SAFETY;
  const quality = runGeometryQualityPipeline(mesh);
  const aabb = computeAABB(mesh.positions);
  const spanX = Math.max(0, aabb.max[0] - aabb.min[0]);
  const spanY = Math.max(0, aabb.max[1] - aabb.min[1]);
  const spanZ = Math.max(0, aabb.max[2] - aabb.min[2]);
  const diagonal = Math.hypot(spanX, spanY, spanZ);
  const boundaryEdges = countBoundaryEdges(mesh);
  const triangleCount = Math.floor(mesh.indices.length / 3);
  const vertexCount = Math.floor(mesh.positions.length / 3);

  const analysis: AutoCloseBaseAnalysis = Object.freeze({
    vertexCount,
    triangleCount,
    boundaryEdges,
    components: quality.stats.components,
    degenerateCount: quality.stats.degenerateCount,
    spanX,
    spanY,
    spanZ,
    diagonal,
    qualityOk: quality.ok,
    qualityCodes: Object.freeze([...quality.codes]),
    qualityWarnings: Object.freeze([...quality.warnings])
  });

  const reasons: string[] = [];
  const warnings: string[] = [...quality.warnings];

  if (triangleCount < safety.minTriangles || vertexCount < 12) {
    return Object.freeze({
      ok: false,
      needsReview: true,
      algorithmVersion: AUTO_CLOSE_BASE_ALGORITHM_VERSION,
      uiState: 'needs-review' as const,
      parameters: sanitizeCloseBaseParameters({}),
      strategy: 'plane' as const,
      orientation: 'xz' as const,
      analysis,
      reasons: Object.freeze(['Mesh is too small for automatic base generation']),
      warnings: Object.freeze(warnings),
      message: 'Automatic base generation needs review.',
      timingMs: performance.now() - started,
      fingerprint: mesh.fingerprint
    });
  }

  if (diagonal < safety.minSpanMm) {
    return Object.freeze({
      ok: false,
      needsReview: true,
      algorithmVersion: AUTO_CLOSE_BASE_ALGORITHM_VERSION,
      uiState: 'needs-review' as const,
      parameters: sanitizeCloseBaseParameters({}),
      strategy: 'plane' as const,
      orientation: 'xz' as const,
      analysis,
      reasons: Object.freeze(['Model bounds are degenerate']),
      warnings: Object.freeze(warnings),
      message: 'Automatic base generation needs review.',
      timingMs: performance.now() - started,
      fingerprint: mesh.fingerprint
    });
  }

  if (quality.codes.includes('INPUT_INVALID')) {
    return Object.freeze({
      ok: false,
      needsReview: true,
      algorithmVersion: AUTO_CLOSE_BASE_ALGORITHM_VERSION,
      uiState: 'failed' as const,
      parameters: sanitizeCloseBaseParameters({}),
      strategy: 'plane' as const,
      orientation: 'xz' as const,
      analysis,
      reasons: Object.freeze(['Mesh input is invalid']),
      warnings: Object.freeze(warnings),
      message: 'Automatic base generation needs review.',
      timingMs: performance.now() - started,
      fingerprint: mesh.fingerprint
    });
  }

  if (analysis.degenerateCount > Math.max(256, triangleCount * 0.15)) {
    warnings.push('High degenerate triangle ratio');
    return Object.freeze({
      ok: false,
      needsReview: true,
      algorithmVersion: AUTO_CLOSE_BASE_ALGORITHM_VERSION,
      uiState: 'needs-review' as const,
      parameters: sanitizeCloseBaseParameters({}),
      strategy: 'plane' as const,
      orientation: 'xz' as const,
      analysis,
      reasons: Object.freeze(['Mesh quality is too poor for automatic base']),
      warnings: Object.freeze(warnings),
      message: 'Automatic base generation needs review.',
      timingMs: performance.now() - started,
      fingerprint: mesh.fingerprint
    });
  }

  const orientation = estimateBaseOrientation(spanX, spanY, spanZ);
  reasons.push(`Base direction → ${orientation} (clinical inferior preference with span check)`);
  const { strategy, reason } = estimateCloseBaseStrategy(analysis);
  reasons.push(reason);
  const parameters = estimateCloseBaseParameters(analysis, strategy, orientation);
  reasons.push(
    `Estimated height ${String(parameters.height)} · thickness ${String(parameters.thickness)} · offset ${String(parameters.margin)}`
  );

  const needsReview =
    !quality.ok ||
    analysis.components > 3 ||
    (strategy === 'surface' && analysis.boundaryEdges === 0);

  if (needsReview) {
    warnings.push('Result should be reviewed before accept');
  }

  return Object.freeze({
    ok: true,
    needsReview,
    algorithmVersion: AUTO_CLOSE_BASE_ALGORITHM_VERSION,
    uiState: 'preview-ready' as const,
    parameters,
    strategy,
    orientation,
    analysis,
    reasons: Object.freeze(reasons),
    warnings: Object.freeze(warnings),
    message: needsReview
      ? 'Auto base preview ready — review recommended'
      : 'Auto base parameters estimated',
    timingMs: performance.now() - started,
    fingerprint: mesh.fingerprint
  });
};
