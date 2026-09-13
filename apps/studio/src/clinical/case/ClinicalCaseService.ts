/**
 * ClinicalCaseService — save / open / hydrate cases via CasePersistenceContract.
 * Uses existing session.openCase, MeshRegistry registration, and scene publish APIs.
 */

import { computeAABB, createMesh, type TriangleMesh } from '../../geometry-kernel/mesh/TriangleMesh.js';
import { registerParsedClinicalMeshWithReport } from '../import/ClinicalMeshRegistration.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import {
  clinicalFailure,
  clinicalSuccess,
  type ClinicalCaseId,
  type ClinicalResult
} from '../runtime/types.js';
import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import {
  createClinicalCasePersistence,
  type CasePersistenceContract,
  type PersistedClinicalCase,
  type PersistedMeshGeometry
} from './ClinicalCasePersistence.js';
import type { RecentCaseEntry } from './RecentCases.js';
import { deriveClinicalCaseWorkflowStatus } from './ClinicalCaseWorkflowStatus.js';
import { hydrateClinicalPipelineFromDocument } from './ClinicalCaseResume.js';
import {
  buildClinicalHandoffSnapshot,
  rebuildClinicalHandoffFromDocument,
  type ClinicalHandoffSnapshot
} from '../handoff/ClinicalHandoffSnapshot.js';
import { recordClinicalGeometryDevDiag } from '../diagnostics/ClinicalGeometryDevDiagnostics.js';
import { validateClinicalCase } from './ClinicalCaseValidation.js';
import type { ClinicalSegmentationValidationReport } from '../segmentation/ClinicalSegmentationValidation.js';

const collectMeshes = (workspace: ClinicalWorkspace): readonly PersistedMeshGeometry[] => {
  const doc = workspace.session.getPublicState().activeCase;
  if (doc === undefined) {
    return Object.freeze([]);
  }
  const registry = workspace.getHost().runtimes.kernel.registry;
  const meshes: PersistedMeshGeometry[] = [];
  for (const obj of doc.objects) {
    const working =
      registry.getByObjectId(obj.id as string, 'working') ??
      registry.getByObjectId(obj.id as string, 'source');
    if (working === undefined) {
      continue;
    }
    const source = registry.getByObjectId(obj.id as string, 'source');
    const includeSource =
      source !== undefined &&
      source.fingerprint !== working.fingerprint &&
      (source.positions.length !== working.positions.length ||
        source.indices.length !== working.indices.length ||
        source.fingerprint !== working.fingerprint);
    meshes.push(
      Object.freeze({
        objectId: obj.id as string,
        positions: new Float32Array(working.positions),
        indices: new Uint32Array(working.indices),
        revision: working.revision,
        ...(includeSource
          ? {
              sourcePositions: new Float32Array(source.positions),
              sourceIndices: new Uint32Array(source.indices)
            }
          : {})
      })
    );
  }
  return Object.freeze(meshes);
};

const clearWorkspaceGeometry = (workspace: ClinicalWorkspace): void => {
  const host = workspace.getHost();
  workspace.importCoordinator.objects.clear();
  workspace.importCoordinator.sceneBuilder.publishEmpty(host, host.runtimes.scene);
  host.runtimes.kernel.registry.clear();
  host.sessions.selectionSession?.clear();
};

const hydrateMeshes = (
  workspace: ClinicalWorkspace,
  payload: PersistedClinicalCase
): ClinicalResult<void> => {
  const host = workspace.getHost();
  const registry = host.runtimes.kernel.registry;
  registry.clear();

  for (const mesh of payload.meshes) {
    const bounds = computeAABB(mesh.positions);
    if (mesh.sourcePositions !== undefined && mesh.sourceIndices !== undefined) {
      // Restore immutable SOURCE + persisted WORKING without re-deriving ops.
      const registered = registerParsedClinicalMeshWithReport(
        registry,
        mesh.objectId,
        {
          positions: mesh.sourcePositions,
          indices: mesh.sourceIndices,
          bounds: computeAABB(mesh.sourcePositions),
          vertexCount: Math.floor(mesh.sourcePositions.length / 3),
          faceCount: Math.floor(mesh.sourceIndices.length / 3),
          unitsHint: undefined,
          warnings: Object.freeze([])
        },
        mesh.revision
      );
      // Replace working with the persisted clinical working geometry (may include trim/base).
      const working = createMesh({
        id: registered.working.id,
        objectId: mesh.objectId,
        role: 'working',
        revision: mesh.revision,
        positions: mesh.positions,
        indices: mesh.indices
      });
      registry.commitWorking(mesh.objectId, working);
    } else {
      // Legacy / single-buffer: normalize at hydrate (idempotent if already indexed).
      registerParsedClinicalMeshWithReport(
        registry,
        mesh.objectId,
        {
          positions: mesh.positions,
          indices: mesh.indices,
          bounds,
          vertexCount: Math.floor(mesh.positions.length / 3),
          faceCount: Math.floor(mesh.indices.length / 3),
          unitsHint: undefined,
          warnings: Object.freeze([])
        },
        mesh.revision
      );
    }
  }

  workspace.importCoordinator.objects.replaceAll(payload.document.objects);
  const sceneResult = workspace.importCoordinator.sceneBuilder.buildAndPublish(
    host,
    payload.document,
    { fitCamera: false }
  );
  if (!sceneResult.ok) {
    return clinicalFailure('unavailable', sceneResult.error.message);
  }
  if (payload.document.objects.length > 0) {
    workspace.viewport.presentClinicalAnteriorView();
  }
  return clinicalSuccess(undefined);
};

export class ClinicalCaseService {
  private lastHandoff: ClinicalHandoffSnapshot | undefined;

  public constructor(
    private readonly persistence: CasePersistenceContract = createClinicalCasePersistence()
  ) {}

  public getPersistence(): CasePersistenceContract {
    return this.persistence;
  }

  /** Last built or restored clinical handoff (provider-agnostic contract). */
  public getLastHandoff(): ClinicalHandoffSnapshot | undefined {
    return this.lastHandoff;
  }

  /** Rebuild handoff from the active document without saving. */
  public rebuildHandoffFromActive(workspace: ClinicalWorkspace): ClinicalHandoffSnapshot | undefined {
    const doc = workspace.session.getPublicState().activeCase;
    if (doc === undefined) return undefined;
    const handoff = rebuildClinicalHandoffFromDocument(doc);
    this.lastHandoff = handoff;
    return handoff;
  }

  public async listCases(): Promise<readonly RecentCaseEntry[]> {
    const stored = await this.persistence.list();
    return stored;
  }

  public async saveActiveCase(workspace: ClinicalWorkspace): Promise<ClinicalResult<ClinicalDocumentSnapshot>> {
    const doc = workspace.session.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case to save');
    }
    const meshes = collectMeshes(workspace);
    const missing = doc.objects.filter(
      (o) => !meshes.some((m) => m.objectId === (o.id as string))
    );
    if (missing.length > 0) {
      return clinicalFailure(
        'validation',
        `Cannot save: mesh data missing for ${missing.map((m) => m.displayName).join(', ')}`
      );
    }

    const now = Date.now();
    const savedDoc: ClinicalDocumentSnapshot = Object.freeze({
      ...doc,
      dirty: false,
      updatedAt: now,
      caseMeta: Object.freeze({ ...doc.caseMeta, updatedAt: now })
    });

    const caseValidation =
      workspace.importCoordinator.getLastCaseValidation() ??
      (() => {
        const registry = workspace.getHost().runtimes.kernel.registry;
        const meshes = new Map<string, TriangleMesh>();
        for (const obj of doc.objects) {
          const mesh =
            registry.getByObjectId(obj.id as string, 'working') ??
            registry.getByObjectId(obj.id as string, 'source');
          if (mesh !== undefined) {
            meshes.set(obj.id as string, mesh);
          }
        }
        try {
          return validateClinicalCase({ document: savedDoc, meshes, requireDualArch: false });
        } catch {
          return undefined;
        }
      })();

    const segValidations: ClinicalSegmentationValidationReport[] = [];
    for (const obj of savedDoc.objects) {
      const verdict = obj.segmentationMeta?.validationVerdict;
      if (verdict === undefined) continue;
      segValidations.push(
        Object.freeze({
          version: 'clinical-seg-validation-v2',
          predictionId: obj.segmentationMeta?.predictionId ?? 'persisted',
          providerId: obj.segmentationMeta?.providerId ?? 'unknown',
          verdict,
          checks: Object.freeze([]),
          toothCount: obj.segmentationMeta?.instanceCount ?? 0,
          identifiedCount: 0,
          needsReviewCount: obj.segmentationMeta?.needsReviewCount ?? 0,
          fatalCheckIds: Object.freeze(
            verdict === 'FAIL' ? (['persisted-fail'] as string[]) : []
          ),
          validatedAt: now
        })
      );
    }

    const handoff = buildClinicalHandoffSnapshot({
      document: savedDoc,
      ...(caseValidation !== undefined ? { caseValidation } : {}),
      ...(segValidations.length > 0 ? { segmentationValidations: segValidations } : {}),
      now
    });
    this.lastHandoff = handoff;
    recordClinicalGeometryDevDiag({
      operation: 'clinical-handoff-save',
      ...(handoff.caseValidationVerdict !== undefined
        ? { caseValidationVerdict: handoff.caseValidationVerdict }
        : {}),
      ...(handoff.segmentationValidationVerdict !== undefined
        ? { segmentationValidationVerdict: handoff.segmentationValidationVerdict }
        : {})
    });

    try {
      await this.persistence.save({
        document: savedDoc,
        meshes,
        savedAt: now,
        handoff
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Case save failed';
      return clinicalFailure('unavailable', message);
    }

    const cleared = workspace.session.clearDirty();
    if (!cleared.ok) {
      return cleared;
    }
    // Re-apply timestamps without flipping dirty
    workspace.session.applyDocument(savedDoc, false);
    workspace.session.getRecentCases().register(savedDoc, now);
    workspace.session.getDiagnostics().record(
      'info',
      `Saved case ${savedDoc.caseMeta.name} (${deriveClinicalCaseWorkflowStatus(savedDoc)}); handoff=${handoff.version} readyForMovement=${String(handoff.readyForMovement)}`,
      'case'
    );
    return clinicalSuccess(savedDoc);
  }

  public async openCase(
    workspace: ClinicalWorkspace,
    caseId: ClinicalCaseId
  ): Promise<ClinicalResult<ClinicalDocumentSnapshot>> {
    const host = workspace.getHost();
    let payload: PersistedClinicalCase | undefined;
    try {
      payload = await this.persistence.load(caseId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Case load failed';
      return clinicalFailure('unavailable', message);
    }
    if (payload === undefined) {
      return clinicalFailure('not-found', 'Case could not be found. It may have been removed.');
    }

    const active = workspace.session.getPublicState().activeCase;
    if (active?.dirty === true) {
      return clinicalFailure('dirty', 'Save or close the current case before opening another');
    }

    if (active !== undefined) {
      const closed = workspace.session.closeCase(true);
      if (!closed.ok) {
        return clinicalFailure(closed.error.code, closed.error.message);
      }
      clearWorkspaceGeometry(workspace);
    } else {
      clearWorkspaceGeometry(workspace);
    }

    const opened = workspace.session.openCase(
      Object.freeze({
        ...payload.document,
        objects: Object.freeze([...payload.document.objects]),
        orientationMeta: payload.document.orientationMeta ?? undefined,
        dirty: false
      })
    );
    if (!opened.ok) {
      return opened;
    }

    const hydrated = hydrateMeshes(workspace, {
      ...payload,
      document: opened.value
    });
    if (!hydrated.ok) {
      return clinicalFailure(hydrated.error.code, hydrated.error.message);
    }

    host.sessions.cameraSession?.resetView();
    if (opened.value.objects.length > 0) {
      workspace.viewport.presentClinicalAnteriorView();
    }
    hydrateClinicalPipelineFromDocument(workspace, opened.value);
    // Authoritative handoff is rebuilt from restored document (provider-agnostic).
    // Persisted handoffJson is audit/cache only — never trust backend-leaking v1 blobs.
    this.lastHandoff = rebuildClinicalHandoffFromDocument(opened.value, Date.now());
    workspace.session.getRecentCases().register(opened.value, Date.now());
    workspace.session.notifyUi();
    return clinicalSuccess(opened.value);
  }
}
