/**
 * Default analysis provider registry wiring.
 */

import type { TriangleMesh } from '../../../geometry-kernel/mesh/TriangleMesh.js';
import type { ToothInstancePrediction } from '../../segmentation/prediction/types.js';
import { ANALYSIS_ALGORITHM_VERSIONS } from '../types.js';
import type { AnalysisVec3 } from '../types.js';
import { ClinicalMeasurementEngine } from '../engine/MeasurementEngine.js';
import { analyzeToothInstance } from '../engine/ToothAnalysis.js';
import { fitArchCurve } from '../engine/ArchAnalysis.js';
import { analyzeSpacing } from '../engine/SpacingAnalysis.js';
import { analyzeCrowding } from '../engine/CrowdingAnalysis.js';
import { analyzeCollision } from '../engine/CollisionQuery.js';
import { analyzeOcclusionFoundation } from '../engine/OcclusionFoundation.js';
import { analyzeBolton } from '../engine/BoltonAnalysis.js';
import {
  ClinicalAnalysisRegistry,
  type AnalysisProviderContext,
  type ClinicalAnalysisProvider
} from './AnalysisProvider.js';

export interface AnalysisDataAccess {
  getMesh(objectId: string): TriangleMesh | undefined;
  getPredictionInstances(): readonly ToothInstancePrediction[] | undefined;
  getSecondaryMesh(): TriangleMesh | undefined;
}

const engine = new ClinicalMeasurementEngine();

const incomplete = (
  id: ClinicalAnalysisProvider['id'],
  version: string,
  ctx: AnalysisProviderContext,
  message: string
) =>
  Object.freeze({
    analysisId: `analysis-${id}-${String(ctx.now)}`,
    analysisType: id,
    sourceRevision: ctx.sourceRevision,
    segmentationRevision: ctx.segmentationRevision,
    geometryFingerprint: ctx.geometryFingerprint,
    algorithmVersion: version,
    validity: 'INCOMPLETE' as const,
    warnings: Object.freeze([message]),
    measurements: Object.freeze([]),
    payload: Object.freeze({}),
    timestamp: ctx.now,
    decisionSupportOnly: true as const
  });

export const createDefaultAnalysisRegistry = (
  access: AnalysisDataAccess
): ClinicalAnalysisRegistry => {
  const registry = new ClinicalAnalysisRegistry();

  const distance: ClinicalAnalysisProvider = {
    id: 'distance',
    displayName: 'Distance',
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.distance,
    operational: true,
    run(ctx) {
      const a = ctx.params.a as AnalysisVec3 | undefined;
      const b = ctx.params.b as AnalysisVec3 | undefined;
      if (a === undefined || b === undefined) {
        return incomplete('distance', ANALYSIS_ALGORITHM_VERSIONS.distance, ctx, 'Two points required');
      }
      return engine.measureDistance({
        a,
        b,
        sourceObjectIds: [ctx.sourceObjectId],
        sourceRevision: ctx.sourceRevision,
        geometryFingerprint: ctx.geometryFingerprint,
        now: ctx.now,
        kind: (ctx.params.kind as 'euclidean' | 'surface-path' | undefined) ?? 'euclidean',
        surface: ctx.params.surface as
          | {
              readonly positions: Float32Array;
              readonly adjacency: readonly (readonly number[])[];
              readonly vertexA: number;
              readonly vertexB: number;
            }
          | undefined
      });
    }
  };

  const angle: ClinicalAnalysisProvider = {
    id: 'angle',
    displayName: 'Angle',
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.angle,
    operational: true,
    run(ctx) {
      const a = ctx.params.a as AnalysisVec3 | undefined;
      const vertex = ctx.params.vertex as AnalysisVec3 | undefined;
      const b = ctx.params.b as AnalysisVec3 | undefined;
      if (a === undefined || vertex === undefined || b === undefined) {
        return incomplete('angle', ANALYSIS_ALGORITHM_VERSIONS.angle, ctx, 'Three points required');
      }
      return engine.measureAngle({
        a,
        vertex,
        b,
        sourceObjectIds: [ctx.sourceObjectId],
        sourceRevision: ctx.sourceRevision,
        geometryFingerprint: ctx.geometryFingerprint,
        now: ctx.now
      });
    }
  };

  const tooth: ClinicalAnalysisProvider = {
    id: 'tooth-dimensions',
    displayName: 'Tooth Analysis',
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.tooth,
    operational: true,
    run(ctx) {
      const mesh = access.getMesh(ctx.sourceObjectId);
      const instances = access.getPredictionInstances();
      const instanceId = ctx.params.instanceId as string | undefined;
      if (mesh === undefined || instances === undefined) {
        return incomplete(
          'tooth-dimensions',
          ANALYSIS_ALGORITHM_VERSIONS.tooth,
          ctx,
          'Tooth analysis requires mesh and segmentation instances.'
        );
      }
      const inst =
        instanceId === undefined
          ? instances[0]
          : instances.find((i) => i.instanceId === instanceId);
      if (inst === undefined) {
        return incomplete(
          'tooth-dimensions',
          ANALYSIS_ALGORITHM_VERSIONS.tooth,
          ctx,
          'Selected tooth is unavailable.'
        );
      }
      return analyzeToothInstance(
        mesh,
        inst,
        ctx.now,
        ctx.sourceRevision,
        ctx.segmentationRevision
      );
    }
  };

  const arch: ClinicalAnalysisProvider = {
    id: 'arch',
    displayName: 'Arch Analysis',
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.arch,
    operational: true,
    run(ctx) {
      const instances = access.getPredictionInstances();
      if (instances === undefined) {
        return incomplete('arch', ANALYSIS_ALGORITHM_VERSIONS.arch, ctx, 'Arch analysis requires identification.');
      }
      return fitArchCurve(
        instances,
        ctx.now,
        ctx.sourceRevision,
        ctx.segmentationRevision,
        ctx.geometryFingerprint,
        ctx.sourceObjectId
      );
    }
  };

  const spacing: ClinicalAnalysisProvider = {
    id: 'spacing',
    displayName: 'Spacing',
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.spacing,
    operational: true,
    run(ctx) {
      const instances = access.getPredictionInstances();
      if (instances === undefined) {
        return incomplete(
          'spacing',
          ANALYSIS_ALGORITHM_VERSIONS.spacing,
          ctx,
          'Spacing requires identified teeth.'
        );
      }
      return analyzeSpacing(
        instances,
        ctx.now,
        ctx.sourceRevision,
        ctx.segmentationRevision,
        ctx.geometryFingerprint,
        ctx.sourceObjectId
      );
    }
  };

  const crowding: ClinicalAnalysisProvider = {
    id: 'crowding',
    displayName: 'Crowding',
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.crowding,
    operational: true,
    run(ctx) {
      const instances = access.getPredictionInstances();
      if (instances === undefined) {
        return incomplete(
          'crowding',
          ANALYSIS_ALGORITHM_VERSIONS.crowding,
          ctx,
          'Crowding requires identified teeth.'
        );
      }
      return analyzeCrowding(
        instances,
        ctx.now,
        ctx.sourceRevision,
        ctx.segmentationRevision,
        ctx.geometryFingerprint,
        ctx.sourceObjectId
      );
    }
  };

  const collision: ClinicalAnalysisProvider = {
    id: 'collision',
    displayName: 'Collision',
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.collision,
    operational: true,
    run(ctx) {
      const a = access.getMesh(ctx.sourceObjectId);
      const b = access.getSecondaryMesh();
      if (a === undefined || b === undefined) {
        return incomplete(
          'collision',
          ANALYSIS_ALGORITHM_VERSIONS.collision,
          ctx,
          'Collision query requires two meshes.'
        );
      }
      return analyzeCollision(a, b, ctx.now, ctx.sourceRevision);
    }
  };

  const occlusion: ClinicalAnalysisProvider = {
    id: 'occlusion',
    displayName: 'Occlusion',
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.occlusion,
    operational: true,
    run(ctx) {
      return analyzeOcclusionFoundation(
        access.getMesh(ctx.sourceObjectId),
        access.getSecondaryMesh(),
        ctx.now,
        ctx.sourceRevision
      );
    }
  };

  const bolton: ClinicalAnalysisProvider = {
    id: 'bolton',
    displayName: 'Bolton-style',
    algorithmVersion: ANALYSIS_ALGORITHM_VERSIONS.bolton,
    operational: true,
    run(ctx) {
      const instances = access.getPredictionInstances();
      if (instances === undefined) {
        return incomplete(
          'bolton',
          ANALYSIS_ALGORITHM_VERSIONS.bolton,
          ctx,
          'Bolton-style analysis requires identified teeth.'
        );
      }
      return analyzeBolton(
        instances,
        ctx.now,
        ctx.sourceRevision,
        ctx.segmentationRevision,
        ctx.geometryFingerprint
      );
    }
  };

  for (const p of [
    distance,
    angle,
    tooth,
    arch,
    spacing,
    crowding,
    collision,
    occlusion,
    bolton
  ]) {
    registry.register(p);
  }
  return registry;
};
