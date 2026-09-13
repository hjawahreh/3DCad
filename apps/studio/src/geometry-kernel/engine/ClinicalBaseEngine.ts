/**
 * GEO-001D — ClinicalBaseEngine V2.
 * Boundary-driven clinical base from trimmed WORKING mesh (not AABB slab).
 */

import type { GeometryBackend } from '../adapters/GeometryBackend.js';
import { NativeReferenceBackend } from '../adapters/GeometryBackend.js';
import { analyzeMesh, calculateMetrics } from './MeshAnalysis.js';
import { repairMesh } from './MeshRepair.js';
import { selectBackendForCapability } from './BackendCapability.js';
import {
  constructClinicalBase,
  type BaseQualityReport
} from './ClinicalBaseConstruction.js';
import type {
  BaseEngineInput,
  BaseEngineResult,
  GeometryDiagnostics
} from './types.js';

export type { BaseQualityReport };

const fail = (
  code: string,
  stage: string,
  message: string,
  started: number,
  backend: string,
  revision: number,
  extras?: Partial<BaseEngineResult> & { readonly baseQuality?: BaseQualityReport }
): BaseEngineResult => {
  const diagnostics: GeometryDiagnostics = {
    code,
    stage,
    operation: 'createBase',
    backend,
    geometryRevision: revision,
    warnings: extras?.baseQuality
      ? [
          ...Object.entries(extras.baseQuality.stageTimingsMs).map(
            ([k, v]) => `timing:${k}=${v.toFixed(1)}ms`
          )
        ]
      : [],
    errors: [message],
    durationMs: performance.now() - started
  };
  return {
    success: false,
    boundaryLoops: 0,
    addedTriangles: 0,
    diagnostics,
    durationMs: diagnostics.durationMs,
    ...extras
  };
};

export class ClinicalBaseEngine {
  public constructor(
    private readonly backend: GeometryBackend = new NativeReferenceBackend(),
    private readonly options?: { readonly vtkHealthy?: boolean }
  ) {
    void this.backend;
    void this.options;
  }

  public async createBase(input: BaseEngineInput): Promise<BaseEngineResult> {
    const started = performance.now();
    const selection = selectBackendForCapability(
      'BASE_GENERATION',
      this.options?.vtkHealthy === undefined ? undefined : { vtkHealthy: this.options.vtkHealthy }
    );
    const mesh = input.trimmedMesh;
    const qualityBefore = analyzeMesh(mesh);
    const metricsBefore = calculateMetrics(mesh, qualityBefore);

    const constructed = constructClinicalBase({
      mesh,
      strategy: input.baseStrategy,
      height: input.parameters.height ?? 2,
      thickness: input.parameters.thickness ?? 1.5,
      offset: input.parameters.offset ?? 0,
      ...(input.parameters.clinicalBaseNormal !== undefined
        ? { clinicalBaseNormal: input.parameters.clinicalBaseNormal }
        : {}),
      preferClinicalFrame: input.parameters.preferClinicalFrame === true,
      ...(input.role === undefined ? {} : { role: input.role }),
      ...(input.revision === undefined ? {} : { revision: input.revision })
    });

    if (!constructed.ok) {
      return fail(
        constructed.code,
        'construct',
        constructed.message,
        started,
        'clinical-base-v2',
        mesh.revision,
        {
          qualityBefore,
          ...(constructed.selectedBoundary !== undefined
            ? { selectedBoundary: constructed.selectedBoundary }
            : {}),
          ...(constructed.quality !== undefined ? { baseQuality: constructed.quality } : {})
        }
      );
    }

    const cleaned = repairMesh(constructed.mesh);
    const qualityAfter = analyzeMesh(cleaned);
    if (qualityAfter.gate === 'FAIL') {
      return fail(
        'OUTPUT_QUALITY_FAIL',
        'validate-output',
        qualityAfter.errors.join('; ') || 'Base output failed quality gate',
        started,
        'clinical-base-v2',
        mesh.revision,
        {
          qualityBefore,
          qualityAfter,
          selectedBoundary: constructed.selectedBoundary,
          baseQuality: constructed.quality
        }
      );
    }

    // Re-check blocking failures after repair (fingerprint may change).
    if (constructed.quality.blockingFailures.length > 0) {
      return fail(
        constructed.quality.blockingFailures[0]!,
        'validate-output',
        `Base quality gate failed: ${constructed.quality.blockingFailures.join(', ')}`,
        started,
        'clinical-base-v2',
        mesh.revision,
        {
          qualityBefore,
          qualityAfter,
          selectedBoundary: constructed.selectedBoundary,
          baseQuality: constructed.quality
        }
      );
    }

    const metricsAfter = calculateMetrics(cleaned, qualityAfter);
    const durationMs = performance.now() - started;
    return {
      success: true,
      outputMesh: cleaned,
      boundaryLoops: 1,
      addedTriangles: constructed.addedTriangles,
      selectedBoundary: constructed.selectedBoundary,
      diagnostics: {
        code: 'OK',
        stage: 'complete',
        operation: 'createBase',
        backend: 'clinical-base-v2',
        geometryRevision: cleaned.revision,
        metricsBefore,
        metricsAfter,
        warnings: [
          ...constructed.warnings,
          ...qualityAfter.warnings,
          selection.reason,
          `selectedBoundary=#${String(constructed.selectedBoundary.id)} score=${constructed.selectedBoundary.score.toFixed(2)}`,
          ...constructed.selectedBoundary.reasons,
          ...Object.entries(constructed.quality.stageTimingsMs).map(
            ([k, v]) => `timing:${k}=${v.toFixed(1)}ms`
          ),
          `boundaryMatch:ratio=${constructed.quality.boundaryMatch.perimeterRatio.toFixed(3)}`,
          `slab=${String(constructed.quality.slabDetection.detected)}`,
          `bridges=${String(constructed.quality.diagonalBridgeDetection.suspiciousFaceCount)}`
        ],
        errors: [],
        durationMs
      },
      durationMs,
      qualityBefore,
      qualityAfter,
      baseQuality: constructed.quality
    };
  }
}
