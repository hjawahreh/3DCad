/**
 * ClinicalOrientationManager — apply transforms to clinical document (commit path).
 */

import type { ClinicalSession } from '../runtime/session.js';
import {
  withClinicalObjects,
  withOrientationMeta,
  type ClinicalDocumentSnapshot,
  type ClinicalOrientationMeta
} from '../document/ClinicalDocument.js';
import type {
  ClinicalObjectId,
  ClinicalTransform
} from '../import/ClinicalMeshDescriptor.js';
import { clinicalFailure, clinicalSuccess, type ClinicalResult } from '../runtime/types.js';
import { cloneTransform } from './ClinicalTransformMath.js';

export class ClinicalOrientationManager {
  public resolveTarget(
    session: ClinicalSession,
    preferredId?: ClinicalObjectId
  ): ClinicalResult<{ readonly objectId: ClinicalObjectId; readonly transform: ClinicalTransform }> {
    const doc = session.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    if (doc.objects.length === 0) {
      return clinicalFailure('validation', 'Import a model before orientation');
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
      doc.objects.find((o) => o.archRole === 'upper' && o.visible) ??
      doc.objects.find((o) => o.visible) ??
      doc.objects[0];
    if (obj === undefined) {
      return clinicalFailure('not-found', 'No orientable object');
    }
    return clinicalSuccess({
      objectId: obj.id,
      transform: cloneTransform(obj.transform)
    });
  }

  public applyTransform(
    session: ClinicalSession,
    objectId: ClinicalObjectId,
    transform: ClinicalTransform,
    now: number
  ): ClinicalResult<{
    readonly previous: ClinicalDocumentSnapshot;
    readonly next: ClinicalDocumentSnapshot;
  }> {
    const doc = session.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    if (!doc.objects.some((o) => o.id === objectId)) {
      return clinicalFailure('not-found', `Object ${objectId} not found`);
    }
    const previous = doc;
    const objects = doc.objects.map((obj) =>
      obj.id === objectId
        ? Object.freeze({ ...obj, transform: cloneTransform(transform) })
        : obj
    );
    const next = withClinicalObjects(doc, objects, now);
    const applied = session.applyDocument(next, true);
    if (!applied.ok) {
      return applied;
    }
    return clinicalSuccess({ previous, next: applied.value });
  }

  /** Apply one case-level transform to every object (preserves relative bite). */
  public applyCaseTransform(
    session: ClinicalSession,
    transform: ClinicalTransform,
    now: number,
    orientationMeta?: ClinicalOrientationMeta
  ): ClinicalResult<{
    readonly previous: ClinicalDocumentSnapshot;
    readonly next: ClinicalDocumentSnapshot;
  }> {
    const doc = session.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    if (doc.objects.length === 0) {
      return clinicalFailure('validation', 'No models to orient');
    }
    const previous = doc;
    const objects = doc.objects.map((obj) =>
      Object.freeze({ ...obj, transform: cloneTransform(transform) })
    );
    let next = withClinicalObjects(doc, objects, now);
    if (orientationMeta !== undefined) {
      next = withOrientationMeta(next, orientationMeta, now);
    }
    const applied = session.applyDocument(next, true);
    if (!applied.ok) {
      return applied;
    }
    return clinicalSuccess({ previous, next: applied.value });
  }

  public previewDocument(
    doc: ClinicalDocumentSnapshot,
    objectId: ClinicalObjectId,
    transform: ClinicalTransform
  ): ClinicalDocumentSnapshot {
    const objects = doc.objects.map((obj) =>
      obj.id === objectId
        ? Object.freeze({ ...obj, transform: cloneTransform(transform) })
        : obj
    );
    return Object.freeze({
      ...doc,
      objects: Object.freeze(objects)
    });
  }

  public previewCaseDocument(
    doc: ClinicalDocumentSnapshot,
    transform: ClinicalTransform
  ): ClinicalDocumentSnapshot {
    const objects = doc.objects.map((obj) =>
      Object.freeze({ ...obj, transform: cloneTransform(transform) })
    );
    return Object.freeze({
      ...doc,
      objects: Object.freeze(objects)
    });
  }
}
