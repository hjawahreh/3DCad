/**
 * Document commit for accepted segmentation — metadata only, no mesh buffers.
 */

import type { StudioCompositionRoot } from '../../application/composition-root.js';
import {
  withClinicalObjects,
  type ClinicalDocumentSnapshot
} from '../document/ClinicalDocument.js';
import type { ClinicalObjectId, ClinicalMeshDescriptor } from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { ClinicalSession } from '../runtime/session.js';
import { clinicalFailure, clinicalSuccess, type ClinicalResult } from '../runtime/types.js';
import type { SegmentationPrediction } from './prediction/types.js';

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

  public applyAcceptCommit(input: {
    readonly session: ClinicalSession;
    readonly objectId: ClinicalObjectId;
    readonly prediction: SegmentationPrediction;
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
      const nextObj: ClinicalMeshDescriptor = Object.freeze({
        ...obj,
        geometryFingerprint: input.prediction.geometryFingerprint,
        geometryRevision: input.prediction.sourceRevision,
        geometryBackend: input.prediction.providerId,
        segmentationMeta: Object.freeze({
          predictionId: input.prediction.predictionId,
          providerId: input.prediction.providerId,
          modelId: input.prediction.modelId,
          modelVersion: input.prediction.modelVersion,
          instanceCount: input.prediction.instances.length,
          caseBand: input.prediction.confidence.caseBand,
          geometryFingerprint: input.prediction.geometryFingerprint,
          sourceRevision: input.prediction.sourceRevision
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
