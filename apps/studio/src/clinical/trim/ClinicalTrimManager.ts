/**
 * ClinicalTrimManager — target resolution, preview, document commit.
 */

import type { ClinicalSession } from '../runtime/session.js';
import {
  withClinicalObjects,
  type ClinicalDocumentSnapshot
} from '../document/ClinicalDocument.js';
import type {
  ClinicalArchRole,
  ClinicalObjectId
} from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { StudioCompositionRoot } from '../../application/composition-root.js';
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

export class ClinicalTrimManager {
  public resolveTarget(
    session: ClinicalSession,
    preferredId?: ClinicalObjectId
  ): ClinicalResult<{ readonly objectId: ClinicalObjectId }> {
    const doc = session.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    if (doc.objects.length === 0) {
      return clinicalFailure('validation', 'Import a model before trim');
    }
    const host = session.getHost();
    const selection = host.sessions.selectionSession?.getSnapshot();
    const selectedId =
      preferredId ??
      (selection !== undefined && selection.ids.length > 0
        ? (selection.ids[0] as unknown as ClinicalObjectId)
        : undefined);
    if (selectedId !== undefined) {
      const selected = doc.objects.find((o) => (o.id as string) === (selectedId as string));
      if (selected === undefined) {
        return clinicalFailure('not-found', 'Selected object is not in the case');
      }
      if (!selected.visible || selected.displayState === 'hidden') {
        return clinicalFailure('validation', 'Hidden arches cannot be trimmed');
      }
      return clinicalSuccess({ objectId: selected.id });
    }
    const obj = doc.objects.find((o) => o.visible && o.displayState !== 'hidden');
    if (obj === undefined) {
      return clinicalFailure('not-found', 'No visible trimmable object — select an arch');
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

  public applyTrimCommit(input: {
    readonly session: ClinicalSession;
    readonly objectId: ClinicalObjectId;
    readonly fingerprint: string;
    readonly kernelPayload: Readonly<Record<string, unknown>>;
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
    const kernelNested =
      input.kernelPayload.kernel !== undefined &&
      typeof input.kernelPayload.kernel === 'object' &&
      input.kernelPayload.kernel !== null
        ? (input.kernelPayload.kernel as Readonly<Record<string, unknown>>)
        : input.kernelPayload;
    const metrics =
      kernelNested.metrics !== undefined &&
      typeof kernelNested.metrics === 'object' &&
      kernelNested.metrics !== null
        ? (kernelNested.metrics as Readonly<Record<string, number>>)
        : undefined;
    const diagnostics = kernelNested.diagnostics;
    const metaFp = (() => {
      if (!Array.isArray(diagnostics)) return undefined;
      const prefix = 'meta:geometryFingerprint=';
      for (const row of diagnostics) {
        if (typeof row === 'string' && row.startsWith(prefix)) {
          return row.slice(prefix.length);
        }
      }
      return undefined;
    })();
    const vertexCount =
      readKernelNumber(kernelNested, 'vertexCount') ??
      (typeof metrics?.vertexCount === 'number' ? metrics.vertexCount : undefined);
    const faceCount =
      readKernelNumber(kernelNested, 'faceCount') ??
      (typeof metrics?.faceCount === 'number' ? metrics.faceCount : undefined) ??
      (typeof metrics?.triangleCount === 'number' ? metrics.triangleCount : undefined);
    const fingerprint =
      readKernelString(kernelNested, 'geometryFingerprint') ??
      metaFp ??
      input.fingerprint;
    const revision =
      readKernelNumber(kernelNested, 'revision') ??
      readKernelNumber(kernelNested, 'geometryRevision') ??
      doc.revision + 1;
    const backend = readKernelString(kernelNested, 'backend');

    const objects = doc.objects.map((obj) => {
      if (obj.id !== input.objectId) {
        return obj;
      }
      return applyClinicalGeometryCommitToDescriptor(obj, {
        objectId: obj.id as string,
        revision,
        fingerprint,
        vertexCount: vertexCount ?? Math.max(1, (obj.vertexCount ?? 1) - 1),
        faceCount: faceCount ?? obj.faceCount ?? 0,
        backend
      }, { invalidateSegmentationReason: 'Segmentation Outdated — Geometry Changed (Trim)' });
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
