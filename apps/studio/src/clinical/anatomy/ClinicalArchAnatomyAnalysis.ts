/**
 * ClinicalArchAnatomyAnalysis — geometry-driven arch / anatomy cues for
 * Import → Preparation → Segmentation.
 *
 * Deterministic · confidence-scored · no demo coordinates · no fake clinical certainty.
 * Does not mutate meshes.
 */

import { computeAABB, type TriangleMesh } from '../../geometry-kernel/mesh/TriangleMesh.js';
import { principalAxesFromPoints } from '../analysis/engine/PrincipalAxes.js';
import type { AnalysisVec3 } from '../analysis/types.js';
import { vNormalize } from '../analysis/engine/VecMath.js';

export const ARCH_ANATOMY_ANALYSIS_VERSION = 'clinical-arch-anatomy-v2';

export type AnatomyConfidence = 'high' | 'moderate' | 'low' | 'unavailable';

export type ClinicalDentalRegionKind =
  | 'left-posterior'
  | 'left-anterior'
  | 'midline'
  | 'right-anterior'
  | 'right-posterior'
  | 'unknown';

export interface ClinicalArchFrameHint {
  readonly left: AnalysisVec3;
  readonly superior: AnalysisVec3;
  readonly anterior: AnalysisVec3;
  readonly centroid: AnalysisVec3;
  readonly confidence: AnatomyConfidence;
}

export interface ClinicalArchRegionHint {
  readonly archRole: 'upper' | 'lower' | 'unknown';
  readonly confidence: AnatomyConfidence;
  readonly reason: string;
}

export interface ClinicalLateralityHint {
  readonly leftDirection: AnalysisVec3;
  readonly rightDirection: AnalysisVec3;
  readonly confidence: AnatomyConfidence;
  readonly message: string;
}

export interface ClinicalAnteroposteriorHint {
  readonly anteriorDirection: AnalysisVec3;
  readonly posteriorDirection: AnalysisVec3;
  readonly confidence: AnatomyConfidence;
  readonly message: string;
}

export interface ClinicalDentalRegionHint {
  readonly id: string;
  readonly kind: ClinicalDentalRegionKind;
  readonly centroid: readonly [number, number, number];
  readonly confidence: AnatomyConfidence;
}

export interface ClinicalToothRegionCandidate {
  readonly id: string;
  readonly centroid: readonly [number, number, number];
  /** Position along arch left axis relative to centroid (negative = right in RHS). */
  readonly archCoordinate: number;
  readonly approxRadius: number;
  readonly dentalRegion: ClinicalDentalRegionKind;
  readonly confidence: AnatomyConfidence;
}

export interface ClinicalArchAnatomyReport {
  readonly version: string;
  readonly objectId: string;
  readonly archRoleDeclared: 'upper' | 'lower' | undefined;
  readonly archRegion: ClinicalArchRegionHint;
  readonly frame: ClinicalArchFrameHint;
  readonly laterality: ClinicalLateralityHint;
  readonly anteroposterior: ClinicalAnteroposteriorHint;
  readonly occlusalHint: {
    readonly normal: AnalysisVec3;
    readonly confidence: AnatomyConfidence;
    readonly message: string;
  };
  readonly dentalRegions: readonly ClinicalDentalRegionHint[];
  readonly toothRegionCandidates: readonly ClinicalToothRegionCandidate[];
  readonly warnings: readonly string[];
  readonly timingMs: number;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

const freezeVec = (v: AnalysisVec3): AnalysisVec3 =>
  Object.freeze({ x: round3(v.x), y: round3(v.y), z: round3(v.z) });

const sampleFaceCentroids = (mesh: TriangleMesh, maxSamples = 2048): number[] => {
  const triCount = Math.floor(mesh.indices.length / 3);
  if (triCount <= 0) return [];
  const stride = Math.max(1, Math.floor(triCount / maxSamples));
  const out: number[] = [];
  for (let t = 0; t < triCount; t += stride) {
    const i0 = mesh.indices[t * 3]!;
    const i1 = mesh.indices[t * 3 + 1]!;
    const i2 = mesh.indices[t * 3 + 2]!;
    out.push(
      (mesh.positions[i0 * 3]! + mesh.positions[i1 * 3]! + mesh.positions[i2 * 3]!) / 3,
      (mesh.positions[i0 * 3 + 1]! + mesh.positions[i1 * 3 + 1]! + mesh.positions[i2 * 3 + 1]!) /
        3,
      (mesh.positions[i0 * 3 + 2]! + mesh.positions[i1 * 3 + 2]! + mesh.positions[i2 * 3 + 2]!) /
        3
    );
  }
  return out;
};

const inferArchRole = (
  declared: 'upper' | 'lower' | undefined,
  centroidY: number,
  caseMeanY: number | undefined
): ClinicalArchRegionHint => {
  if (declared === 'upper' || declared === 'lower') {
    return Object.freeze({
      archRole: declared,
      confidence: 'high',
      reason: 'Declared by import arch assignment'
    });
  }
  if (caseMeanY !== undefined && Number.isFinite(centroidY)) {
    if (centroidY > caseMeanY + 1) {
      return Object.freeze({
        archRole: 'upper',
        confidence: 'low',
        reason: 'Heuristic: superior to case mean (unconfirmed)'
      });
    }
    if (centroidY < caseMeanY - 1) {
      return Object.freeze({
        archRole: 'lower',
        confidence: 'low',
        reason: 'Heuristic: inferior to case mean (unconfirmed)'
      });
    }
  }
  return Object.freeze({
    archRole: 'unknown',
    confidence: 'unavailable',
    reason: 'No reliable arch cue'
  });
};

const classifyDentalRegion = (
  archCoordinate: number,
  halfSpan: number
): ClinicalDentalRegionKind => {
  if (!(halfSpan > 1e-6) || !Number.isFinite(archCoordinate)) {
    return 'unknown';
  }
  const u = archCoordinate / halfSpan;
  // left axis points to patient's left (+X clinical); negative archCoordinate → right side
  if (u > 0.55) return 'left-posterior';
  if (u > 0.18) return 'left-anterior';
  if (u >= -0.18) return 'midline';
  if (u >= -0.55) return 'right-anterior';
  return 'right-posterior';
};

const emptyReport = (
  input: {
    readonly objectId: string;
    readonly archRole?: 'upper' | 'lower';
  },
  started: number,
  reason: string
): ClinicalArchAnatomyReport => {
  const identity = Object.freeze({ x: 0, y: 0, z: 0 });
  const xAxis = Object.freeze({ x: 1, y: 0, z: 0 });
  const yAxis = Object.freeze({ x: 0, y: 1, z: 0 });
  const zAxis = Object.freeze({ x: 0, y: 0, z: 1 });
  return Object.freeze({
    version: ARCH_ANATOMY_ANALYSIS_VERSION,
    objectId: input.objectId,
    archRoleDeclared: input.archRole,
    archRegion: Object.freeze({
      archRole: input.archRole ?? 'unknown',
      confidence: input.archRole ? 'high' : 'unavailable',
      reason: input.archRole ? 'Declared arch role' : reason
    }),
    frame: Object.freeze({
      left: xAxis,
      superior: yAxis,
      anterior: zAxis,
      centroid: identity,
      confidence: 'unavailable' as const
    }),
    laterality: Object.freeze({
      leftDirection: xAxis,
      rightDirection: Object.freeze({ x: -1, y: 0, z: 0 }),
      confidence: 'unavailable' as const,
      message: reason
    }),
    anteroposterior: Object.freeze({
      anteriorDirection: zAxis,
      posteriorDirection: Object.freeze({ x: 0, y: 0, z: -1 }),
      confidence: 'unavailable' as const,
      message: reason
    }),
    occlusalHint: Object.freeze({
      normal: yAxis,
      confidence: 'unavailable' as const,
      message: reason
    }),
    dentalRegions: Object.freeze([]),
    toothRegionCandidates: Object.freeze([]),
    warnings: Object.freeze([reason]),
    timingMs: performance.now() - started
  });
};

/**
 * Derive arch frame / laterality / AP / dental regions / coarse tooth-region seeds.
 * Candidates are geometric peaks only — not identified teeth.
 */
export const analyzeClinicalArchAnatomy = (input: {
  readonly objectId: string;
  readonly archRole?: 'upper' | 'lower';
  readonly mesh: TriangleMesh;
  readonly caseMeanCentroidY?: number;
  /** Optional preferred superior / anterior from accepted clinical orientation (mesh-local). */
  readonly preferredSuperior?: AnalysisVec3;
  readonly preferredAnterior?: AnalysisVec3;
}): ClinicalArchAnatomyReport => {
  const started = performance.now();
  const warnings: string[] = [];
  const centroids = sampleFaceCentroids(input.mesh);
  if (centroids.length < 9) {
    return emptyReport(input, started, 'Insufficient geometry for anatomy analysis');
  }

  const points: AnalysisVec3[] = [];
  for (let i = 0; i < centroids.length; i += 3) {
    points.push(
      Object.freeze({
        x: centroids[i]!,
        y: centroids[i + 1]!,
        z: centroids[i + 2]!
      })
    );
  }

  const pca = principalAxesFromPoints(points);
  const centroid = pca.centroid;
  const axes = pca.axes;

  const varianceAlong = (axis: AnalysisVec3): number => {
    let acc = 0;
    for (const p of points) {
      const dx = p.x - centroid.x;
      const dy = p.y - centroid.y;
      const dz = p.z - centroid.z;
      const d = dx * axis.x + dy * axis.y + dz * axis.z;
      acc += d * d;
    }
    return acc / Math.max(1, points.length);
  };

  const scored = axes.map((axis, index) => ({
    axis,
    index,
    variance: varianceAlong(axis)
  }));
  scored.sort((a, b) => a.variance - b.variance);
  const short = scored[0]!;
  const mid = scored[1]!;
  const long = scored[2]!;

  const anisotropy = long.variance / Math.max(1e-12, short.variance);
  const ambiguous = !(anisotropy > 1.15);

  let superior = vNormalize(short.axis);
  let anterior = vNormalize(mid.axis);

  // When clinical orientation axes are provided, snap PCA axes toward them (geometry still drives magnitudes).
  if (input.preferredSuperior !== undefined) {
    const pref = vNormalize(input.preferredSuperior);
    const dot =
      superior.x * pref.x + superior.y * pref.y + superior.z * pref.z;
    superior = dot < 0 ? Object.freeze({ x: -superior.x, y: -superior.y, z: -superior.z }) : superior;
  } else if (superior.y < 0) {
    superior = Object.freeze({ x: -superior.x, y: -superior.y, z: -superior.z });
  }

  if (input.preferredAnterior !== undefined) {
    const pref = vNormalize(input.preferredAnterior);
    const dot =
      anterior.x * pref.x + anterior.y * pref.y + anterior.z * pref.z;
    anterior = dot < 0 ? Object.freeze({ x: -anterior.x, y: -anterior.y, z: -anterior.z }) : anterior;
  } else if (anterior.z < 0) {
    anterior = Object.freeze({ x: -anterior.x, y: -anterior.y, z: -anterior.z });
  }

  // Re-orthogonalize left = superior × anterior, then re-derive anterior for RH frame.
  let left = vNormalize(
    Object.freeze({
      x: superior.y * anterior.z - superior.z * anterior.y,
      y: superior.z * anterior.x - superior.x * anterior.z,
      z: superior.x * anterior.y - superior.y * anterior.x
    })
  );
  anterior = vNormalize(
    Object.freeze({
      x: left.y * superior.z - left.z * superior.y,
      y: left.z * superior.x - left.x * superior.z,
      z: left.x * superior.y - left.y * superior.x
    })
  );

  // Prefer longest PCA direction as left/right when it agrees with constructed left.
  const longN = vNormalize(long.axis);
  const longDotLeft =
    longN.x * left.x + longN.y * left.y + longN.z * left.z;
  if (Math.abs(longDotLeft) > 0.5) {
    left =
      longDotLeft >= 0
        ? longN
        : Object.freeze({ x: -longN.x, y: -longN.y, z: -longN.z });
    anterior = vNormalize(
      Object.freeze({
        x: left.y * superior.z - left.z * superior.y,
        y: left.z * superior.x - left.x * superior.z,
        z: left.x * superior.y - left.y * superior.x
      })
    );
  }

  const frameConf: AnatomyConfidence = ambiguous
    ? 'unavailable'
    : anisotropy > 1.8
      ? 'moderate'
      : 'low';
  if (ambiguous) {
    warnings.push('Ambiguous geometry — arch axes are low confidence');
  }

  const archRegion = inferArchRole(input.archRole, centroid.y, input.caseMeanCentroidY);

  // Project samples onto arch (left) axis for region / tooth seeds — not world AABB X.
  const archCoords = points.map((p) => {
    const dx = p.x - centroid.x;
    const dy = p.y - centroid.y;
    const dz = p.z - centroid.z;
    return dx * left.x + dy * left.y + dz * left.z;
  });
  let minA = Infinity;
  let maxA = -Infinity;
  for (const a of archCoords) {
    if (a < minA) minA = a;
    if (a > maxA) maxA = a;
  }
  const archSpan = Math.max(1e-6, maxA - minA);
  const halfSpan = archSpan * 0.5;

  const bins = 12;
  const binBest: { height: number; c: [number, number, number]; arch: number }[] =
    Array.from({ length: bins }, () => ({
      height: -Infinity,
      c: [0, 0, 0],
      arch: 0
    }));

  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const arch = archCoords[i]!;
    const u = (arch - minA) / archSpan;
    const b = Math.min(bins - 1, Math.max(0, Math.floor(u * bins)));
    const height =
      (p.x - centroid.x) * superior.x +
      (p.y - centroid.y) * superior.y +
      (p.z - centroid.z) * superior.z;
    if (height > binBest[b]!.height) {
      binBest[b] = {
        height,
        c: [round3(p.x), round3(p.y), round3(p.z)],
        arch: round3(arch)
      };
    }
  }

  const toothRegionCandidates: ClinicalToothRegionCandidate[] = [];
  for (let b = 0; b < bins; b += 1) {
    const best = binBest[b]!;
    if (!Number.isFinite(best.height) || best.height === -Infinity) continue;
    const dentalRegion = classifyDentalRegion(best.arch, halfSpan);
    toothRegionCandidates.push(
      Object.freeze({
        id: `region-${String(b).padStart(2, '0')}`,
        centroid: Object.freeze(best.c) as readonly [number, number, number],
        archCoordinate: best.arch,
        approxRadius: round3(archSpan / bins),
        dentalRegion,
        confidence: frameConf === 'unavailable' ? 'unavailable' : 'low'
      })
    );
  }
  // Deterministic order: left → right along arch axis (descending archCoordinate).
  toothRegionCandidates.sort((a, b) => b.archCoordinate - a.archCoordinate);

  if (toothRegionCandidates.length < 4) {
    warnings.push('Few tooth-region candidates — scan may be incomplete or atypical');
  }

  const regionKinds: ClinicalDentalRegionKind[] = [
    'left-posterior',
    'left-anterior',
    'midline',
    'right-anterior',
    'right-posterior'
  ];
  const dentalRegions: ClinicalDentalRegionHint[] = regionKinds.map((kind) => {
    const members = toothRegionCandidates.filter((c) => c.dentalRegion === kind);
    if (members.length === 0) {
      return Object.freeze({
        id: `dental-${kind}`,
        kind,
        centroid: Object.freeze([
          round3(centroid.x),
          round3(centroid.y),
          round3(centroid.z)
        ] as const),
        confidence: 'unavailable' as const
      });
    }
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const m of members) {
      sx += m.centroid[0];
      sy += m.centroid[1];
      sz += m.centroid[2];
    }
    const n = members.length;
    return Object.freeze({
      id: `dental-${kind}`,
      kind,
      centroid: Object.freeze([
        round3(sx / n),
        round3(sy / n),
        round3(sz / n)
      ] as const),
      confidence: frameConf === 'unavailable' ? 'unavailable' : 'low'
    });
  });

  const aabb = computeAABB(input.mesh.positions);
  const diag = Math.hypot(
    aabb.max[0] - aabb.min[0],
    aabb.max[1] - aabb.min[1],
    aabb.max[2] - aabb.min[2]
  );
  if (!(diag > 1e-3)) {
    warnings.push('Degenerate bounds — anatomy cues are unreliable');
  }

  return Object.freeze({
    version: ARCH_ANATOMY_ANALYSIS_VERSION,
    objectId: input.objectId,
    archRoleDeclared: input.archRole,
    archRegion,
    frame: Object.freeze({
      left: freezeVec(left),
      superior: freezeVec(superior),
      anterior: freezeVec(anterior),
      centroid: freezeVec(centroid),
      confidence: frameConf
    }),
    laterality: Object.freeze({
      leftDirection: freezeVec(left),
      rightDirection: freezeVec({
        x: -left.x,
        y: -left.y,
        z: -left.z
      }),
      confidence: frameConf,
      message:
        frameConf === 'unavailable'
          ? 'Left/right axes unavailable for this geometry'
          : 'Left/right from longest arch PCA axis (geometric only)'
    }),
    anteroposterior: Object.freeze({
      anteriorDirection: freezeVec(anterior),
      posteriorDirection: freezeVec({
        x: -anterior.x,
        y: -anterior.y,
        z: -anterior.z
      }),
      confidence: frameConf,
      message:
        frameConf === 'unavailable'
          ? 'Anterior/posterior axes unavailable for this geometry'
          : 'Anterior/posterior from mid PCA axis (geometric only)'
    }),
    occlusalHint: Object.freeze({
      normal: freezeVec(superior),
      confidence: frameConf,
      message:
        frameConf === 'unavailable'
          ? 'Occlusal direction unavailable'
          : 'Occlusal normal approximated as shortest PCA axis (geometric only)'
    }),
    dentalRegions: Object.freeze(dentalRegions),
    toothRegionCandidates: Object.freeze(toothRegionCandidates),
    warnings: Object.freeze(warnings),
    timingMs: performance.now() - started
  });
};

/** Compact operator-facing summary for clinical UI. */
export const summarizeArchAnatomyForUi = (
  report: ClinicalArchAnatomyReport
): {
  readonly archRole: string;
  readonly archConfidence: AnatomyConfidence;
  readonly frameConfidence: AnatomyConfidence;
  readonly occlusalConfidence: AnatomyConfidence;
  readonly candidateCount: number;
  readonly dentalRegionCount: number;
  readonly warnings: readonly string[];
} =>
  Object.freeze({
    archRole: report.archRegion.archRole,
    archConfidence: report.archRegion.confidence,
    frameConfidence: report.frame.confidence,
    occlusalConfidence: report.occlusalHint.confidence,
    candidateCount: report.toothRegionCandidates.length,
    dentalRegionCount: report.dentalRegions.filter((r) => r.confidence !== 'unavailable')
      .length,
    warnings: report.warnings
  });
