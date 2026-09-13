/**
 * Clinical auto-preparation runner — safe deterministic prep before Trim.
 * Diagnostics + derived caches only. Does not mutate source mesh topology.
 */

import { computeAABB, type TriangleMesh } from '../../geometry-kernel/mesh/TriangleMesh.js';
import type { MeshRegistry } from '../../geometry-kernel/mesh/MeshRegistry.js';
import type { GeometryCache } from '../../geometry-kernel/cache/GeometryCache.js';
import { runGeometryQualityPipeline } from '../../geometry-kernel/quality/GeometryQualityPipeline.js';
import { buildSpatialIndex } from '../../geometry-kernel/spatial/SpatialIndex.js';
import type { ClinicalArchRole } from '../import/ClinicalMeshDescriptor.js';
import {
  analyzeClinicalArchAnatomy,
  type ClinicalArchAnatomyReport
} from '../anatomy/ClinicalArchAnatomyAnalysis.js';

export const AUTO_PREPARATION_ALGORITHM_VERSION = 'clinical-auto-prep-v1';

export type AutoPreparationUiState =
  | 'not-started'
  | 'analyzing'
  | 'preparing'
  | 'ready'
  | 'warning'
  | 'failed';

export interface AutoPreparationStep {
  readonly id: string;
  readonly label: string;
  readonly done: boolean;
  readonly archRole?: ClinicalArchRole | undefined;
}

export interface AutoPreparationArchResult {
  readonly objectId: string;
  readonly archRole: ClinicalArchRole | undefined;
  readonly displayName: string;
  readonly ok: boolean;
  readonly hardFailure: boolean;
  readonly message: string;
  readonly warnings: readonly string[];
  readonly timingMs: number;
  readonly stats: {
    readonly vertexCount: number;
    readonly triangleCount: number;
    readonly boundaryEdges: number;
    readonly components: number;
    readonly degenerateCount: number;
  };
  readonly fingerprint: string;
  readonly revision: number;
  /** Compact anatomy analysis summary (confidence-scored geometry hints). */
  readonly anatomy?: {
    readonly archRole: 'upper' | 'lower' | 'unknown';
    readonly archConfidence: string;
    readonly frameConfidence: string;
    readonly occlusalConfidence: string;
    readonly candidateCount: number;
    readonly dentalRegionCount: number;
    readonly lateralityMessage: string;
    readonly anteroposteriorMessage: string;
  };
  /** Full geometry-driven anatomy report for UI / segmentation consumers. */
  readonly anatomyReport?: ClinicalArchAnatomyReport;
}

export interface ClinicalAutoPreparationReport {
  readonly ok: boolean;
  readonly uiState: AutoPreparationUiState;
  readonly algorithmVersion: string;
  readonly steps: readonly AutoPreparationStep[];
  readonly arches: readonly AutoPreparationArchResult[];
  readonly warnings: readonly string[];
  readonly message: string;
  readonly timingMs: number;
  readonly preparedAt: number;
  readonly sourceFingerprint: string;
}

export interface AutoPreparationProgress {
  readonly message: string;
  readonly steps: readonly AutoPreparationStep[];
}

/** Area-weighted vertex normals — derived cache only, does not rewrite source mesh. */
export const computeVertexNormals = (
  positions: Float32Array,
  indices: Uint32Array
): Float32Array => {
  const normals = new Float32Array(positions.length);
  const triCount = Math.floor(indices.length / 3);
  for (let t = 0; t < triCount; t += 1) {
    const i0 = indices[t * 3]!;
    const i1 = indices[t * 3 + 1]!;
    const i2 = indices[t * 3 + 2]!;
    const ax = positions[i0 * 3]!;
    const ay = positions[i0 * 3 + 1]!;
    const az = positions[i0 * 3 + 2]!;
    const bx = positions[i1 * 3]!;
    const by = positions[i1 * 3 + 1]!;
    const bz = positions[i1 * 3 + 2]!;
    const cx = positions[i2 * 3]!;
    const cy = positions[i2 * 3 + 1]!;
    const cz = positions[i2 * 3 + 2]!;
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const i of [i0, i1, i2]) {
      normals[i * 3]! += nx;
      normals[i * 3 + 1]! += ny;
      normals[i * 3 + 2]! += nz;
    }
  }
  const vCount = Math.floor(positions.length / 3);
  for (let v = 0; v < vCount; v += 1) {
    const x = normals[v * 3]!;
    const y = normals[v * 3 + 1]!;
    const z = normals[v * 3 + 2]!;
    const len = Math.hypot(x, y, z);
    if (len > 1e-12) {
      normals[v * 3] = x / len;
      normals[v * 3 + 1] = y / len;
      normals[v * 3 + 2] = z / len;
    }
  }
  return normals;
};

const archLabel = (role: ClinicalArchRole | undefined, fallback: string): string => {
  if (role === 'upper') return 'Upper Arch';
  if (role === 'lower') return 'Lower Arch';
  return fallback;
};

const isHardFailure = (codes: readonly string[], stats: { vertexCount: number; triangleCount: number }): boolean => {
  if (stats.vertexCount === 0 || stats.triangleCount === 0) return true;
  return codes.some(
    (c) => c === 'INPUT_INVALID' || c === 'TOPOLOGY_INVALID'
  );
};

export interface PrepareArchInput {
  readonly objectId: string;
  readonly archRole: ClinicalArchRole | undefined;
  readonly displayName: string;
  readonly mesh: TriangleMesh;
  readonly caseMeanCentroidY?: number;
}

/**
 * Prepare one arch: quality diagnostics + bounds/normals/spatial caches.
 * Idempotent for the same revision+fingerprint (reuses cache entries).
 */
export const prepareArchGeometry = (
  input: PrepareArchInput,
  cache: GeometryCache
): AutoPreparationArchResult => {
  const started = performance.now();
  const { objectId, mesh } = input;
  const revision = mesh.revision;
  const fingerprint = mesh.fingerprint;

  const cachedTopology = cache.getTopology(objectId, revision, fingerprint);
  const quality = cachedTopology ?? runGeometryQualityPipeline(mesh, { buildSpatial: true });
  if (cachedTopology === undefined) {
    cache.putTopology(objectId, revision, fingerprint, quality);
  }

  let bounds = cache.getBounds(objectId, revision, fingerprint);
  if (bounds === undefined) {
    bounds = computeAABB(mesh.positions);
    cache.putBounds(objectId, revision, fingerprint, bounds);
  }

  let normals = cache.getNormals(objectId, revision, fingerprint);
  if (normals === undefined) {
    normals = computeVertexNormals(mesh.positions, mesh.indices);
    cache.putNormals(objectId, revision, fingerprint, normals);
  }

  if (quality.spatialReady && cache.getSpatial(objectId, revision, fingerprint) === undefined) {
    try {
      const spatial = buildSpatialIndex(mesh);
      cache.putSpatial(objectId, revision, fingerprint, spatial);
    } catch {
      // Spatial failure is non-fatal for preparation readiness.
    }
  }

  const hard = isHardFailure(quality.codes as readonly string[], quality.stats);
  const label = archLabel(input.archRole, input.displayName);
  const message = hard
    ? `${label} could not be prepared because the geometry contains invalid or empty mesh data.`
    : quality.warnings.length > 0
      ? `${label} prepared with warnings.`
      : `${label} prepared.`;

  let anatomy: AutoPreparationArchResult['anatomy'];
  let anatomyReport: AutoPreparationArchResult['anatomyReport'];
  if (!hard) {
    try {
      const report = analyzeClinicalArchAnatomy({
        objectId,
        mesh,
        ...(input.archRole !== undefined ? { archRole: input.archRole } : {}),
        ...(input.caseMeanCentroidY !== undefined
          ? { caseMeanCentroidY: input.caseMeanCentroidY }
          : {})
      });
      anatomyReport = report;
      anatomy = Object.freeze({
        archRole: report.archRegion.archRole,
        archConfidence: report.archRegion.confidence,
        frameConfidence: report.frame.confidence,
        occlusalConfidence: report.occlusalHint.confidence,
        candidateCount: report.toothRegionCandidates.length,
        dentalRegionCount: report.dentalRegions.filter((r) => r.confidence !== 'unavailable')
          .length,
        lateralityMessage: report.laterality.message,
        anteroposteriorMessage: report.anteroposterior.message
      });
    } catch {
      // Anatomy is advisory — never fail preparation on analysis errors.
    }
  }

  const anatomyWarnings = anatomyReport?.warnings ?? [];

  return Object.freeze({
    objectId,
    archRole: input.archRole,
    displayName: input.displayName,
    ok: !hard,
    hardFailure: hard,
    message,
    warnings: Object.freeze([...quality.warnings, ...anatomyWarnings]),
    timingMs: performance.now() - started,
    stats: Object.freeze({
      vertexCount: quality.stats.vertexCount,
      triangleCount: quality.stats.triangleCount,
      boundaryEdges: quality.stats.boundaryEdges,
      components: quality.stats.components,
      degenerateCount: quality.stats.degenerateCount
    }),
    fingerprint,
    revision,
    ...(anatomy !== undefined ? { anatomy } : {}),
    ...(anatomyReport !== undefined ? { anatomyReport } : {})
  });
};

export const runClinicalAutoPreparation = (input: {
  readonly arches: readonly PrepareArchInput[];
  readonly registry: MeshRegistry;
  readonly cache: GeometryCache;
  readonly now?: number;
  readonly onProgress?: (progress: AutoPreparationProgress) => void;
}): ClinicalAutoPreparationReport => {
  const started = performance.now();
  const now = input.now ?? Date.now();
  const steps: AutoPreparationStep[] = [];
  const mark = (step: AutoPreparationStep, message: string): void => {
    const idx = steps.findIndex((s) => s.id === step.id);
    if (idx >= 0) steps[idx] = step;
    else steps.push(step);
    input.onProgress?.({
      message,
      steps: Object.freeze([...steps])
    });
  };

  if (input.arches.length === 0) {
    return Object.freeze({
      ok: false,
      uiState: 'failed',
      algorithmVersion: AUTO_PREPARATION_ALGORITHM_VERSION,
      steps: Object.freeze([]),
      arches: Object.freeze([]),
      warnings: Object.freeze(['No scans available to prepare.']),
      message: 'Preparation failed. Import an Upper or Lower Arch scan first.',
      timingMs: performance.now() - started,
      preparedAt: now,
      sourceFingerprint: 'none'
    });
  }

  mark(
    { id: 'validate', label: 'Mesh validation', done: false },
    'Preparing your scans for trimming.'
  );

  // Dual-arch mean Y supports undeclared arch role heuristics (low confidence only).
  let caseMeanCentroidY: number | undefined;
  if (input.arches.length >= 2) {
    let sum = 0;
    let n = 0;
    for (const arch of input.arches) {
      const aabb = computeAABB(arch.mesh.positions);
      sum += (aabb.min[1] + aabb.max[1]) * 0.5;
      n += 1;
    }
    if (n > 0) caseMeanCentroidY = sum / n;
  }

  mark(
    { id: 'anatomy', label: 'Arch anatomy analysis', done: false },
    'Analyzing arch anatomy…'
  );

  const results: AutoPreparationArchResult[] = [];
  for (const arch of input.arches) {
    const label = archLabel(arch.archRole, arch.displayName);
    mark(
      {
        id: `arch-${arch.objectId}`,
        label: `Checking ${label}`,
        done: false,
        archRole: arch.archRole
      },
      `Checking ${label.toLowerCase()}…`
    );
    const result = prepareArchGeometry(
      {
        ...arch,
        ...(caseMeanCentroidY !== undefined ? { caseMeanCentroidY } : {})
      },
      input.cache
    );
    results.push(result);
    mark(
      {
        id: `arch-${arch.objectId}`,
        label: `Checking ${label}`,
        done: true,
        archRole: arch.archRole
      },
      result.message
    );
  }

  mark({ id: 'anatomy', label: 'Arch anatomy analysis', done: true }, 'Anatomy analysis…');
  mark({ id: 'validate', label: 'Mesh validation', done: true }, 'Geometry checks…');
  mark({ id: 'geometry', label: 'Geometry checks', done: true }, 'Normals…');
  mark({ id: 'normals', label: 'Normals', done: true }, 'Bounds…');
  mark({ id: 'bounds', label: 'Bounds', done: true }, 'Spatial data…');
  mark({ id: 'spatial', label: 'Spatial data', done: true }, 'Clinical readiness…');
  mark({ id: 'ready', label: 'Clinical readiness', done: true }, 'Preparation complete.');

  const hardFailures = results.filter((r) => r.hardFailure);
  const warnings = results.flatMap((r) =>
    r.warnings.map((w) => `${archLabel(r.archRole, r.displayName)}: ${w}`)
  );
  const sourceFingerprint = results
    .map((r) => `${r.objectId}:${r.revision}:${r.fingerprint}`)
    .sort()
    .join('|');

  if (hardFailures.length > 0) {
    const first = hardFailures[0]!;
    return Object.freeze({
      ok: false,
      uiState: 'failed',
      algorithmVersion: AUTO_PREPARATION_ALGORITHM_VERSION,
      steps: Object.freeze([...steps]),
      arches: Object.freeze(results),
      warnings: Object.freeze(warnings),
      message: first.message,
      timingMs: performance.now() - started,
      preparedAt: now,
      sourceFingerprint
    });
  }

  const hasWarnings = warnings.length > 0;
  return Object.freeze({
    ok: true,
    uiState: hasWarnings ? 'warning' : 'ready',
    algorithmVersion: AUTO_PREPARATION_ALGORITHM_VERSION,
    steps: Object.freeze([...steps]),
    arches: Object.freeze(results),
    warnings: Object.freeze(warnings),
    message: hasWarnings
      ? 'Ready with warnings. Some scan regions may require review.'
      : 'Your scans are ready.',
    timingMs: performance.now() - started,
    preparedAt: now,
    sourceFingerprint
  });
};
