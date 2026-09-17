/**
 * Document commit for accepted segmentation — metadata only, no mesh buffers.
 */

import type { StudioCompositionRoot } from '../../application/composition-root.js';
import {
  withClinicalObjects,
  type ClinicalDocumentSnapshot
} from '../document/ClinicalDocument.js';
import type {
  ClinicalObjectId,
  ClinicalArchRole,
  ClinicalMeshDescriptor
} from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { ClinicalSession } from '../runtime/session.js';
import { clinicalFailure, clinicalSuccess, type ClinicalResult } from '../runtime/types.js';
import type { SegmentationPrediction } from './prediction/types.js';
import { computeToothLocalFrame } from './ClinicalToothLocalFrame.js';
import type { ClinicalSegmentationValidationReport } from './ClinicalSegmentationValidation.js';
import { buildFaceMembershipFromPrediction } from './ClinicalSegmentationIntegrity.js';

export class ClinicalSegmentationManager {
  public resolveTarget(
    session: ClinicalSession,
    preferredId?: ClinicalObjectId
  ): ClinicalResult<{ readonly objectId: ClinicalObjectId }> {
    const doc = session.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    if (doc.objects.length === 0) {
      return clinicalFailure('validation', 'Import a model before segmentation');
    }
    const host = session.getHost();
    const selection = host.sessions.selectionSession?.getSnapshot();
    const selectedId =
      preferredId ??
      (selection !== undefined && selection.ids.length > 0
        ? (selection.ids[0] as unknown as ClinicalObjectId)
        : undefined);
    const obj =
      (selectedId !== undefined
        ? doc.objects.find((o) => (o.id as string) === (selectedId as string))
        : undefined) ??
      doc.objects.find((o) => o.visible) ??
      doc.objects[0];
    if (obj === undefined) {
      return clinicalFailure('not-found', 'No segmentation target');
    }
    return clinicalSuccess({ objectId: obj.id });
  }

  public resolveTargetByArch(
    session: ClinicalSession,
    arch: ClinicalArchRole
  ): ClinicalResult<{ readonly objectId: ClinicalObjectId }> {
    const doc = session.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    const obj = doc.objects.find((o) => o.archRole === arch);
    if (obj === undefined) {
      return clinicalFailure(
        'not-found',
        arch === 'upper' ? 'Upper arch is not in the case' : 'Lower arch is not in the case'
      );
    }
    return clinicalSuccess({ objectId: obj.id });
  }

  public applyAcceptCommit(input: {
    readonly session: ClinicalSession;
    readonly objectId: ClinicalObjectId;
    readonly prediction: SegmentationPrediction;
    readonly validationVerdict?: ClinicalSegmentationValidationReport['verdict'];
    readonly now: number;
  }): ClinicalResult<{
    readonly previous: ClinicalDocumentSnapshot;
    readonly next: ClinicalDocumentSnapshot;
  }> {
    const doc = input.session.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    const previous = doc;
    const objects = doc.objects.map((obj) => {
      if (obj.id !== input.objectId) return obj;
      const faceMembership = buildFaceMembershipFromPrediction(input.prediction, obj.faceCount);
      const nextObj: ClinicalMeshDescriptor = Object.freeze({
        ...obj,
        geometryFingerprint: input.prediction.geometryFingerprint,
        geometryRevision: input.prediction.sourceRevision,
        // Do not overwrite geometryBackend with segmentation providerId —
        // provider identity lives only under segmentationMeta (clinical contract).
        segmentationMeta: Object.freeze({
          predictionId: input.prediction.predictionId,
          providerId: input.prediction.providerId,
          modelId: input.prediction.modelId,
          modelVersion: input.prediction.modelVersion,
          instanceCount: input.prediction.instances.length,
          caseBand: input.prediction.confidence.caseBand,
          geometryFingerprint: input.prediction.geometryFingerprint,
          sourceRevision: input.prediction.sourceRevision,
          ...(input.prediction.inferenceProvenance !== undefined
            ? {
                arch: input.prediction.inferenceProvenance.arch,
                inferenceRunId: input.prediction.inferenceProvenance.inferenceRunId,
                inferenceTimestamp: input.prediction.inferenceProvenance.inferenceTimestamp
              }
            : {}),
          needsReviewCount: input.prediction.confidence.needsReviewCount,
          status: 'CURRENT' as const,
          acceptedAt: input.now,
          faceMembership,
          ...(input.prediction.inferenceProvenance?.checkpointFingerprint !== undefined
            ? {
                checkpointFingerprint: input.prediction.inferenceProvenance.checkpointFingerprint
              }
            : {}),
          ...(input.prediction.inferenceProvenance !== undefined
            ? {
                inferenceMetadata: Object.freeze({
                  ...(input.prediction.inferenceProvenance.device !== undefined
                    ? { device: input.prediction.inferenceProvenance.device }
                    : {}),
                  ...(input.prediction.inferenceProvenance.runtimeMs !== undefined
                    ? { runtimeMs: input.prediction.inferenceProvenance.runtimeMs }
                    : {}),
                  ...(input.prediction.inferenceProvenance.sampleCount !== undefined
                    ? { sampleCount: input.prediction.inferenceProvenance.sampleCount }
                    : {}),
                  preprocessingVersion: input.prediction.preprocessingVersion,
                  postprocessingVersion: input.prediction.postprocessingVersion,
                  identificationVersion: input.prediction.identificationVersion,
                  ...(input.prediction.inferenceProvenance.stages !== undefined
                    ? { stages: input.prediction.inferenceProvenance.stages }
                    : {})
                })
              }
            : {}),
          ...(input.validationVerdict !== undefined
            ? { validationVerdict: input.validationVerdict }
            : {}),
          teeth: Object.freeze(
            input.prediction.instances.map((inst) => {
              const frame = computeToothLocalFrame(inst);
              return Object.freeze({
                instanceId: inst.instanceId,
                fdi: inst.identification.fdi,
                status: inst.identification.status,
                confidence: Number(inst.confidence.toFixed(3)),
                needsReview:
                  inst.identification.status === 'UNCERTAIN' ||
                  inst.identification.status === 'UNKNOWN' ||
                  inst.confidence < 0.5,
                faceCount: inst.faceCount,
                centroid: Object.freeze([
                  inst.centroid[0],
                  inst.centroid[1],
                  inst.centroid[2]
                ] as const),
                localFrame: Object.freeze({
                  origin: Object.freeze([
                    frame.origin[0],
                    frame.origin[1],
                    frame.origin[2]
                  ] as const),
                  xAxis: Object.freeze([frame.xAxis.x, frame.xAxis.y, frame.xAxis.z] as const),
                  yAxis: Object.freeze([frame.yAxis.x, frame.yAxis.y, frame.yAxis.z] as const),
                  zAxis: Object.freeze([frame.zAxis.x, frame.zAxis.y, frame.zAxis.z] as const),
                  confidence: frame.confidence
                }),
                ...(inst.neighbors !== undefined
                  ? {
                      neighbors: Object.freeze({
                        archPreviousId: inst.neighbors.archPreviousId,
                        archNextId: inst.neighbors.archNextId,
                        confidence: inst.neighbors.confidence,
                        basis: inst.neighbors.basis
                      })
                    }
                  : {})
              });
            })
          )
        })
      });
      return nextObj;
    });
    const next = withClinicalObjects(doc, objects, input.now);
    const applied = input.session.applyDocument(next, true);
    if (!applied.ok) {
      return applied;
    }
    return clinicalSuccess({ previous, next: applied.value });
  }

  public republishDocument(
    host: StudioCompositionRoot,
    sceneBuilder: ClinicalSceneBuilder,
    doc: ClinicalDocumentSnapshot | undefined,
    reason: string
  ): void {
    if (doc === undefined) {
      sceneBuilder.publishEmpty(host, host.runtimes.scene);
      return;
    }
    sceneBuilder.buildAndPublish(host, doc, {
      fitCamera: false,
      clearSelection: false,
      invalidateReason: reason
    });
  }
}
