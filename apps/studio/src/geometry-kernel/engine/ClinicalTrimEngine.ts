/**
 * GEO-001 PHASE D — ClinicalTrimEngine (façade over Hybrid/reference trim).
 * Validates SurfacePath, runs backend clip, quality-gates output.
 */

import type { GeometryBackend } from '../adapters/GeometryBackend.js';
import { NativeReferenceBackend } from '../adapters/GeometryBackend.js';
import { runTrim } from '../adapters/AsyncGeometryBackend.js';
import { normalizeTrimKeepMode } from '../ops/trimMesh.js';
import { extractBoundaryLoops } from './TopologyGraph.js';
import { analyzeMesh, calculateMetrics } from './MeshAnalysis.js';
import { repairMesh } from './MeshRepair.js';
import { selectBackendForCapability } from './BackendCapability.js';
import { measureSurfacePathQuality, validateSurfacePath } from './SurfacePath.js';
import type {
  GeometryDiagnostics,
  TrimEngineInput,
  TrimEngineResult
} from './types.js';

const newellNormal = (
  points: readonly { readonly x: number; readonly y: number; readonly z: number }[]
): readonly [number, number, number] => {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
};

const fail = (
  code: string,
  stage: string,
  message: string,
  started: number,
  backend: string,
  revision: number,
  extras?: Partial<TrimEngineResult>
): TrimEngineResult => {
  const diagnostics: GeometryDiagnostics = {
    code,
    stage,
    operation: 'trim',
    backend,
    geometryRevision: revision,
    warnings: [],
    errors: [message],
    durationMs: performance.now() - started
  };
  return {
    success: false,
    removedSurfaceArea: 0,
    inputTriangleCount: extras?.inputTriangleCount ?? 0,
    outputTriangleCount: 0,
    affectedTriangleCount: 0,
    newVertexCount: 0,
    boundaryLoops: 0,
    diagnostics,
    durationMs: diagnostics.durationMs,
    ...extras
  };
};

export class ClinicalTrimEngine {
  public constructor(
    private readonly backend: GeometryBackend = new NativeReferenceBackend(),
    private readonly options?: { readonly vtkHealthy?: boolean }
  ) {}

  public async trim(input: TrimEngineInput): Promise<TrimEngineResult> {
    const started = performance.now();
    const selection = selectBackendForCapability(
      'TRIM_CLIPPING',
      this.options?.vtkHealthy === undefined ? undefined : { vtkHealthy: this.options.vtkHealthy }
    );
    const mesh = input.mesh;
    const inputTris = Math.floor(mesh.indices.length / 3);
    const qualityBefore = analyzeMesh(mesh);
    const metricsBefore = calculateMetrics(mesh, qualityBefore);

    const validated = validateSurfacePath(mesh, input.surfacePath, {
      minSamples: 3,
      minLengthMm: 0.5
    });
    if (!validated.ok) {
      return fail(validated.code, 'validate-path', validated.message, started, selection.backendId, mesh.revision, {
        inputTriangleCount: inputTris,
        qualityBefore
      });
    }
    if (!input.surfacePath.closed) {
      return fail(
        'PATH_NOT_CLOSED',
        'validate-path',
        'Trim requires a closed surface path',
        started,
        selection.backendId,
        mesh.revision,
        { inputTriangleCount: inputTris, qualityBefore }
      );
    }

    const loop3d = input.surfacePath.samples.map((s) => ({
      x: s.point[0],
      y: s.point[1],
      z: s.point[2]
    }));
    const boundary = loop3d.map((p) => ({ x: p.x, y: p.y }));
    const keepMode = normalizeTrimKeepMode(input.keepMode);
    const loopNormal = newellNormal(loop3d);

    const preferVtk = this.options?.vtkHealthy !== false && selection.backendId.startsWith('vtk');
    const primaryAlgorithm = preferVtk ? 'vtk-select-polydata' : 'exact-edge-clip';
    let trimmed;
    let usedBackend = selection.backendId;
    try {
      trimmed = await runTrim(this.backend, mesh, {
        boundary,
        loop3d,
        loopNormal,
        keepMode,
        algorithm: primaryAlgorithm,
        ...(input.role === undefined ? {} : { role: input.role }),
        ...(input.revision === undefined ? {} : { revision: input.revision })
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Trim backend failed';
      // Explicit fallback only when VTK is unavailable — never silent greedy substitution.
      if (
        preferVtk &&
        /UNSUPPORTED_OPERATION|unreachable|requires Vtk/i.test(message)
      ) {
        try {
          trimmed = await runTrim(this.backend, mesh, {
            boundary,
            loop3d,
            loopNormal,
            keepMode,
            algorithm: 'exact-edge-clip',
            ...(input.role === undefined ? {} : { role: input.role }),
            ...(input.revision === undefined ? {} : { revision: input.revision })
          });
          usedBackend = 'clinical-reference-v1';
        } catch (err2) {
          const message2 = err2 instanceof Error ? err2.message : message;
          const code = /NO_REGION|no geometry change/i.test(message2)
            ? 'NO_REGION'
            : 'TRIM_BACKEND_FAILED';
          return fail(code, 'clip', message2, started, usedBackend, mesh.revision, {
            inputTriangleCount: inputTris,
            qualityBefore
          });
        }
      } else {
        const code = /NO_REGION|no geometry change/i.test(message)
          ? 'NO_REGION'
          : /self-intersect/i.test(message)
            ? 'SELF_INTERSECTS'
            : 'TRIM_BACKEND_FAILED';
        return fail(code, 'clip', message, started, selection.backendId, mesh.revision, {
          inputTriangleCount: inputTris,
          qualityBefore
        });
      }
    }

    const cleaned = repairMesh(trimmed.mesh);
    const qualityAfter = analyzeMesh(cleaned);
    if (qualityAfter.gate === 'FAIL') {
      return fail(
        'OUTPUT_QUALITY_FAIL',
        'validate-output',
        qualityAfter.errors.join('; ') || 'Trim output failed quality gate',
        started,
        selection.backendId,
        mesh.revision,
        { inputTriangleCount: inputTris, qualityBefore, qualityAfter }
      );
    }

    const outputTris = Math.floor(cleaned.indices.length / 3);
    const removedTriangles = trimmed.removedTriangles;
    const removedSurfaceArea = Math.max(0, qualityBefore.surfaceArea - qualityAfter.surfaceArea);

    // Reject tiny unrelated notches: removed area must be meaningful vs path length heuristic.
    const pathLen = input.surfacePath.length;
    const pathQuality = measureSurfacePathQuality(input.surfacePath);
    const minArea = Math.max(0.25, pathLen * pathLen * 0.002);
    if (removedTriangles <= 0 || (removedSurfaceArea < minArea && removedTriangles < 3)) {
      return fail(
        'TRIM_SELECTION_MISMATCH',
        'validate-region',
        'Selected/removed region does not correspond to the surface path enclosure',
        started,
        selection.backendId,
        mesh.revision,
        { inputTriangleCount: inputTris, qualityBefore, qualityAfter }
      );
    }
    // Reject remote oversized deletion relative to enclosed loop estimate.
    if (
      pathQuality.enclosedRegionEstimate > 1e-3 &&
      removedSurfaceArea > Math.max(pathQuality.enclosedRegionEstimate * 40, pathLen * pathLen * 0.35)
    ) {
      return fail(
        'TRIM_SELECTION_MISMATCH',
        'validate-region',
        'Selected/removed region does not correspond to the surface path enclosure',
        started,
        selection.backendId,
        mesh.revision,
        { inputTriangleCount: inputTris, qualityBefore, qualityAfter }
      );
    }
    if (cleaned.fingerprint === mesh.fingerprint) {
      return fail(
        'NO_GEOMETRY_CHANGE',
        'validate-region',
        'Trim produced no geometry change.',
        started,
        selection.backendId,
        mesh.revision,
        { inputTriangleCount: inputTris, qualityBefore, qualityAfter }
      );
    }

    const loops = extractBoundaryLoops(cleaned);
    const metricsAfter = calculateMetrics(cleaned, qualityAfter);
    const durationMs = performance.now() - started;
    return {
      success: true,
      outputMesh: cleaned,
      selectedRegion: {
        triangleCount: removedTriangles,
        surfaceArea: removedSurfaceArea
      },
      removedRegion: {
        triangleCount: removedTriangles,
        surfaceArea: removedSurfaceArea
      },
      removedSurfaceArea,
      inputTriangleCount: inputTris,
      outputTriangleCount: outputTris,
      affectedTriangleCount: removedTriangles,
      newVertexCount: Math.max(0, Math.floor(cleaned.positions.length / 3) - Math.floor(mesh.positions.length / 3)),
      boundaryLoops: loops.length,
      diagnostics: {
        code: 'OK',
        stage: 'complete',
        operation: 'trim',
        backend: usedBackend,
        geometryRevision: cleaned.revision,
        ...(input.targetArch === undefined ? {} : { targetArch: input.targetArch }),
        metricsBefore,
        metricsAfter,
        warnings: [
          ...trimmed.warnings,
          ...qualityAfter.warnings,
          selection.reason,
          ...(usedBackend !== selection.backendId
            ? [`explicit-fallback:${selection.backendId}→${usedBackend}`]
            : [])
        ],
        errors: [],
        durationMs
      },
      durationMs,
      qualityBefore,
      qualityAfter
    };
  }
}
