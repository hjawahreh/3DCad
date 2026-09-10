/**
 * ClinicalCloseBaseManager — target resolution and document commit (post-token only).
 */

import type { StudioCompositionRoot } from '../../application/composition-root.js';
import {
  withClinicalObjects,
  type ClinicalDocumentSnapshot
} from '../document/ClinicalDocument.js';
import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { ClinicalSession } from '../runtime/session.js';
import { clinicalFailure, clinicalSuccess, type ClinicalResult } from '../runtime/types.js';
import { applyClinicalGeometryCommitToDescriptor } from '../geometry/ClinicalGeometryDocumentDelta.js';

const readKernelNumber = (
  payload: Readonly<Record<string, unknown>>,
  key: string
): number | undefined => {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const readKernelString = (
  payload: Readonly<Record<string, unknown>>,
  key: string
): string | undefined => {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export class ClinicalCloseBaseManager {
  public resolveTarget(
    session: ClinicalSession,
    preferredId?: ClinicalObjectId
  ): ClinicalResult<{ readonly objectId: ClinicalObjectId }> {
    const doc = session.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    if (doc.objects.length === 0) {
      return clinicalFailure('validation', 'Import a model before Close Base');
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
      return clinicalFailure('not-found', 'No Close Base target');
    }
    return clinicalSuccess({ objectId: obj.id });
  }

  public applyCloseBaseCommit(input: {
    readonly session: ClinicalSession;
    readonly objectId: ClinicalObjectId;
    readonly fingerprint: string;
    readonly kernelPayload?: Readonly<Record<string, unknown>>;
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
    const payload = input.kernelPayload ?? {};
    const kernelNested =
      payload.kernel !== undefined && typeof payload.kernel === 'object' && payload.kernel !== null
        ? (payload.kernel as Readonly<Record<string, unknown>>)
        : payload;
    const vertexCount = readKernelNumber(kernelNested, 'vertexCount');
    const faceCount = readKernelNumber(kernelNested, 'faceCount');
    const fingerprint =
      readKernelString(kernelNested, 'geometryFingerprint') ?? input.fingerprint;
    const revision = readKernelNumber(kernelNested, 'geometryRevision') ?? doc.revision + 1;
    const backend = readKernelString(kernelNested, 'backend');

    const objects = doc.objects.map((obj) => {
      if (obj.id !== input.objectId) {
        return obj;
      }
      return applyClinicalGeometryCommitToDescriptor(obj, {
        objectId: obj.id as string,
        revision,
        fingerprint,
        vertexCount: vertexCount ?? (obj.vertexCount ?? 0) + 8,
        faceCount: faceCount ?? (obj.faceCount ?? 0) + 12,
        backend
      });
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
