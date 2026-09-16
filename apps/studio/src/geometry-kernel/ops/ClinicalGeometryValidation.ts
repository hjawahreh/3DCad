/**
 * GEO-002 — shared clinical geometry validation levels.
 */

import type { TriangleMesh } from '../mesh/TriangleMesh.js';
import {
  runGeometryQualityPipeline,
  type GeometryQualityLevel,
  type GeometryQualityReport
} from '../quality/GeometryQualityPipeline.js';
import { analyzeMesh } from '../engine/MeshAnalysis.js';
import { validateSurfacePath, type SurfacePath } from '../engine/SurfacePath.js';
import type { BoundaryLoopCandidate } from '../engine/types.js';
import { BoundaryOperations } from './BoundaryOperations.js';

export const ClinicalGeometryValidation = {
  validateMesh(
    mesh: TriangleMesh,
    level: GeometryQualityLevel = 2
  ): GeometryQualityReport {
    return runGeometryQualityPipeline(mesh, { level });
  },

  validateBoundary(mesh: TriangleMesh, loop: BoundaryLoopCandidate) {
    return BoundaryOperations.validateLoop(mesh, loop);
  },

  validateSurfacePath(mesh: TriangleMesh, path: SurfacePath) {
    return validateSurfacePath(mesh, path);
  },

  validateTrimResult(
    input: TriangleMesh,
    output: TriangleMesh,
    level: GeometryQualityLevel = 1
  ): { ok: boolean; report: GeometryQualityReport; changed: boolean } {
    const report = runGeometryQualityPipeline(output, { level });
    const changed =
      output.fingerprint !== input.fingerprint &&
      Math.floor(output.indices.length / 3) !== Math.floor(input.indices.length / 3);
    return { ok: report.ok && changed, report, changed };
  },

  validateBaseResult(mesh: TriangleMesh) {
    const q = analyzeMesh(mesh);
    return {
      ok: q.gate !== 'FAIL' && q.boundaryEdgeCount === 0 && q.nonManifoldEdgeCount === 0,
      report: q
    };
  }
} as const;
