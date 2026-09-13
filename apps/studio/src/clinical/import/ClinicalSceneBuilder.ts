/**
 * ClinicalSceneBuilder — projects clinical mesh descriptors into Scene + Viewport.
 * No geometry mutation; descriptors only.
 */

import {
  asDocumentRevisionId,
  asDomainEntityId,
  createDocumentEntity,
  createDocumentRevision,
  type SceneProjectionEngine
} from '@cad-studio/scene';
import type { StudioCompositionRoot } from '../../application/composition-root.js';
import { unionBounds, unionOrientedBounds, type ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import type { ClinicalMeshDescriptor } from './ClinicalMeshDescriptor.js';
import { clinicalFailure, clinicalSuccess, type ClinicalResult } from '../runtime/types.js';

export interface ClinicalScenePublishOptions {
  /** Opt-in camera fit. Default false — clinical anterior presentation owns framing. */
  readonly fitCamera?: boolean;
  readonly clearSelection?: boolean;
  readonly invalidateReason?: string;
  readonly displayMode?: string;
}

export class ClinicalSceneBuilder {
  public buildAndPublish(
    host: StudioCompositionRoot,
    document: ClinicalDocumentSnapshot,
    options: ClinicalScenePublishOptions = {}
  ): ClinicalResult<void> {
    const fitCamera = options.fitCamera === true;
    const clearSelection = options.clearSelection !== false;
    const invalidateReason = options.invalidateReason ?? 'clinical-import';
    const displayMode = options.displayMode;

    const scene = host.runtimes.scene;
    const viewport = host.sessions.viewportSession;
    const camera = host.sessions.cameraSession;
    const selection = host.sessions.selectionSession;

    const entities = document.objects.map((obj) => this.toEntity(obj, displayMode));
    const revision = createDocumentRevision(
      asDocumentRevisionId(document.revision as number),
      entities,
      true
    );

    const projected = scene.project(revision);
    if (!projected.ok) {
      return clinicalFailure('unavailable', projected.error.message);
    }

    if (viewport === undefined) {
      return clinicalFailure('unavailable', 'Viewport session not attached');
    }

    const published = viewport.publishScene(projected.value.snapshot);
    if (!published.ok) {
      return clinicalFailure('unavailable', published.error.message);
    }

    if (clearSelection) {
      selection?.clear();
    }

    if (fitCamera) {
      const visible = document.objects.filter((o) => o.visible);
      const bounds = unionOrientedBounds(visible) ?? unionBounds(visible);
      if (bounds !== undefined && camera !== undefined) {
        camera.fitAll(
          {
            min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
            max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z }
          },
          1.2
        );
      }
    }

    viewport.invalidate(invalidateReason);
    return clinicalSuccess(undefined);
  }

  public publishEmpty(host: StudioCompositionRoot, sceneEngine: SceneProjectionEngine): ClinicalResult<void> {
    const projected = sceneEngine.project(
      createDocumentRevision(asDocumentRevisionId(0), [], true)
    );
    if (!projected.ok) {
      return clinicalFailure('unavailable', projected.error.message);
    }
    const viewport = host.sessions.viewportSession;
    if (viewport === undefined) {
      return clinicalSuccess(undefined);
    }
    viewport.publishScene(projected.value.snapshot);
    viewport.invalidate('clinical-empty');
    return clinicalSuccess(undefined);
  }

  private toEntity(obj: ClinicalMeshDescriptor, displayMode?: string) {
    return createDocumentEntity({
      id: asDomainEntityId(obj.id),
      kind: 'mesh',
      visible: obj.visible && obj.displayState !== 'hidden',
      transform: obj.transform,
      geometryRef: `clinical:${obj.sourceEntityId}`,
      materialRef: 'clinical-default',
      localBounds: {
        min: { x: obj.bounds.min.x, y: obj.bounds.min.y, z: obj.bounds.min.z },
        max: { x: obj.bounds.max.x, y: obj.bounds.max.y, z: obj.bounds.max.z }
      },
      display: Object.freeze({
        name: obj.displayName,
        selectable: obj.selectable,
        format: obj.format,
        ...(displayMode === undefined ? {} : { displayMode })
      }),
      metadata: Object.freeze({
        sourceFile: obj.sourceFile,
        importerId: obj.importerId,
        hierarchyParentId: obj.hierarchyParentId ?? ''
      })
    });
  }
}
