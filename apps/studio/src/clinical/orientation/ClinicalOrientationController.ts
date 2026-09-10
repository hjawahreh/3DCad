/**
 * ClinicalOrientationController — user actions over session + gizmo + manager.
 */

import { IDENTITY_MAT4 } from '@cad-studio/scene';
import { asInteractionTargetId } from '@cad-studio/interaction-runtime';
import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { ClinicalObjectId, ClinicalTransform } from '../import/ClinicalMeshDescriptor.js';
import {
  asClinicalToolId,
  clinicalFailure,
  clinicalSuccess,
  type ClinicalResult
} from '../runtime/types.js';
import { ClinicalOrientationGizmo } from './ClinicalOrientationGizmo.js';
import { ClinicalOrientationHistory } from './ClinicalOrientationHistory.js';
import { ClinicalOrientationManager } from './ClinicalOrientationManager.js';
import {
  ClinicalOrientationDiagnostics,
  ClinicalOrientationMetrics
} from './ClinicalOrientationObservability.js';
import { ClinicalOrientationSession } from './ClinicalOrientationSession.js';
import type {
  OrientationHandle,
  OrientationIncrement,
  OrientationMode
} from './ClinicalOrientationState.js';
import {
  applyRotationDelta,
  cloneTransform,
  rotateAroundAxis,
  snapToWorldAxes
} from './ClinicalTransformMath.js';

const GIZMO_OWNER = asInteractionTargetId(ClinicalOrientationGizmo.OWNER);

export class ClinicalOrientationController {
  public readonly session: ClinicalOrientationSession;
  public readonly gizmo: ClinicalOrientationGizmo;
  public readonly manager: ClinicalOrientationManager;
  public readonly history: ClinicalOrientationHistory;
  public readonly diagnostics: ClinicalOrientationDiagnostics;
  public readonly metrics: ClinicalOrientationMetrics;

  private interactionUnsub: (() => void) | undefined;
  private dragBaseline: ClinicalTransform = IDENTITY_MAT4;

  public constructor(
    private readonly clinicalSession: ClinicalSession,
    private readonly sceneBuilder: ClinicalSceneBuilder
  ) {
    this.session = new ClinicalOrientationSession();
    this.gizmo = new ClinicalOrientationGizmo();
    this.manager = new ClinicalOrientationManager();
    this.history = new ClinicalOrientationHistory();
    this.diagnostics = new ClinicalOrientationDiagnostics();
    this.metrics = new ClinicalOrientationMetrics();
  }

  public enter(preferredId?: ClinicalObjectId): ClinicalResult<void> {
    const target = this.manager.resolveTarget(this.clinicalSession, preferredId);
    if (!target.ok) {
      this.diagnostics.recordValidationFailure(target.error.message);
      return target;
    }
    const activated = this.clinicalSession.activateTool(asClinicalToolId('orient'));
    if (!activated.ok) {
      this.diagnostics.recordValidationFailure(activated.error.message);
      return activated;
    }
    const now = Date.now();
    this.session.begin({
      objectId: target.value.objectId,
      baseline: target.value.transform,
      now
    });
    this.diagnostics.recordSessionStart();
    this.bindInteraction();
    this.publishPreview();
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public setMode(mode: OrientationMode): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Orientation not active');
    }
    this.session.setMode(mode);
    if (mode === 'axis-x' || mode === 'axis-y' || mode === 'axis-z') {
      this.metrics.recordAxis(mode);
    }
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public setIncrement(degrees: OrientationIncrement): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Orientation not active');
    }
    this.session.setIncrement(degrees);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public rotateBy(degrees: number, axisOverride?: 'x' | 'y' | 'z' | 'free'): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Orientation not active');
    }
    const state = this.session.getState();
    const axis = axisOverride ?? state.activeAxis;
    const delta = rotateAroundAxis(axis, degrees);
    const next = applyRotationDelta(state.preview, delta);
    this.session.setPreview(next);
    this.metrics.recordAxis(axis);
    this.publishPreview();
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public rotateIncremental(sign: 1 | -1 = 1): ClinicalResult<void> {
    const state = this.session.getState();
    return this.rotateBy(sign * state.incrementDegrees);
  }

  public snap(): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Orientation not active');
    }
    const snapped = snapToWorldAxes(this.session.getState().preview);
    this.session.setMode('snap');
    this.session.setPreview(snapped, { snapPreview: true });
    this.metrics.recordSnap();
    this.publishPreview();
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public resetOrientation(): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Orientation not active');
    }
    const state = this.session.getState();
    if (state.targetObjectId === undefined) {
      return clinicalFailure('validation', 'No target object');
    }
    // Reset preview to identity (world axes); baseline kept for cancel restore.
    this.session.setPreview(IDENTITY_MAT4);
    this.metrics.recordReset();
    this.publishPreview();
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public accept(): ClinicalResult<void> {
    const state = this.session.getState();
    if (!this.isActive() || state.targetObjectId === undefined) {
      return clinicalFailure('lifecycle', 'Orientation not active');
    }
    this.session.getWorkflow().transition('committing');
    const now = Date.now();
    const applied = this.manager.applyTransform(
      this.clinicalSession,
      state.targetObjectId,
      state.preview,
      now
    );
    if (!applied.ok) {
      this.diagnostics.recordValidationFailure(applied.error.message);
      return applied;
    }
    this.history.push({
      label: 'Orient model',
      objectId: state.targetObjectId,
      previous: applied.value.previous,
      next: applied.value.next,
      createdAt: now
    });
    const duration = now - (state.sessionStartedAt ?? now);
    this.diagnostics.recordAccepted(duration);
    this.metrics.recordOrientationComplete(duration);
    this.session.markCommitted();
    this.unbindInteraction();
    this.clinicalSession.getTools().deactivate();
    this.republishDocument('orientation-commit');
    this.session.clear();
    this.clinicalSession.notifyUi();
    this.clinicalSession.getHost().notifications.push(
      'success',
      'Orientation',
      'Transform committed'
    );
    return clinicalSuccess(undefined);
  }

  public cancel(): ClinicalResult<void> {
    if (this.session.getState().phase === 'idle') {
      return clinicalSuccess(undefined);
    }
    this.session.markCancelled();
    this.diagnostics.recordCancelled();
    this.unbindInteraction();
    this.clinicalSession.getTools().deactivate();
    this.republishDocument('orientation-cancel');
    this.session.clear();
    this.clinicalSession.notifyUi();
    this.clinicalSession.getHost().notifications.push(
      'info',
      'Orientation',
      'Cancelled — document unchanged'
    );
    return clinicalSuccess(undefined);
  }

  public undo(): ClinicalResult<void> {
    const entry = this.history.undo();
    if (!entry.ok) {
      return entry;
    }
    this.diagnostics.recordUndoRedo('undo');
    const applied = this.clinicalSession.applyDocument(entry.value.previous, true);
    if (!applied.ok) {
      return applied;
    }
    this.republishDocument('orientation-undo');
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public redo(): ClinicalResult<void> {
    const entry = this.history.redo();
    if (!entry.ok) {
      return entry;
    }
    this.diagnostics.recordUndoRedo('redo');
    const applied = this.clinicalSession.applyDocument(entry.value.next, true);
    if (!applied.ok) {
      return applied;
    }
    this.republishDocument('orientation-redo');
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public beginHandleDrag(handle: OrientationHandle, pointerId: number, x: number, y: number): void {
    if (!this.isActive()) {
      return;
    }
    this.dragBaseline = cloneTransform(this.session.getState().preview);
    this.gizmo.beginDrag({ handle, pointerId, x, y });
    this.session.setActiveHandle(handle);
    this.session.setMode(
      handle === 'x' ? 'axis-x' : handle === 'y' ? 'axis-y' : handle === 'z' ? 'axis-z' : 'free'
    );
    this.clinicalSession.getHost().sessions.interactionSession?.capturePointer(
      pointerId,
      GIZMO_OWNER
    );
  }

  public moveHandleDrag(x: number, y: number): void {
    const drag = this.gizmo.moveDrag(x, y);
    if (drag === undefined) {
      return;
    }
    const degrees = this.gizmo.deltaDegrees(drag);
    const axis = this.gizmo.axisForHandle(drag.handle);
    const delta = rotateAroundAxis(axis, degrees);
    const next = applyRotationDelta(this.dragBaseline, delta);
    this.session.setPreview(next);
    this.publishPreview();
    this.clinicalSession.notifyUi();
  }

  public endHandleDrag(): void {
    const drag = this.gizmo.endDrag();
    this.session.setActiveHandle(undefined);
    if (drag !== undefined) {
      this.clinicalSession.getHost().sessions.interactionSession?.releasePointer(
        drag.pointerId,
        GIZMO_OWNER
      );
      this.metrics.recordAxis(drag.handle);
    }
    this.clinicalSession.notifyUi();
  }

  public hoverHandle(handle: OrientationHandle | undefined): void {
    this.session.setHover(handle);
    this.clinicalSession.notifyUi();
  }

  public isActive(): boolean {
    const phase = this.session.getState().phase;
    return (
      phase === 'entering' ||
      phase === 'active' ||
      phase === 'previewing' ||
      phase === 'committing'
    );
  }

  public dispose(): void {
    this.unbindInteraction();
    this.session.clear();
  }

  private publishPreview(): void {
    const state = this.session.getState();
    const doc = this.clinicalSession.getPublicState().activeCase;
    if (doc === undefined || state.targetObjectId === undefined) {
      return;
    }
    const previewDoc = this.manager.previewDocument(doc, state.targetObjectId, state.preview);
    const host = this.clinicalSession.getHost();
    this.sceneBuilder.buildAndPublish(host, previewDoc, {
      fitCamera: false,
      clearSelection: false,
      invalidateReason: 'orientation-preview'
    });
  }

  private republishDocument(reason: string): void {
    const doc = this.clinicalSession.getPublicState().activeCase;
    const host = this.clinicalSession.getHost();
    if (doc === undefined) {
      this.sceneBuilder.publishEmpty(host, host.runtimes.scene);
      return;
    }
    this.sceneBuilder.buildAndPublish(host, doc, {
      fitCamera: false,
      clearSelection: false,
      invalidateReason: reason
    });
  }

  private bindInteraction(): void {
    this.unbindInteraction();
    const interaction = this.clinicalSession.getHost().sessions.interactionSession;
    if (interaction === undefined) {
      return;
    }
    this.interactionUnsub = interaction.subscribe((event) => {
      if (!this.isActive() || event.kind !== 'pointer') {
        return;
      }
      const drag = this.gizmo.getDrag();
      if (drag === undefined || event.pointerId !== drag.pointerId) {
        return;
      }
      if (event.phase === 'move') {
        this.moveHandleDrag(event.position.x, event.position.y);
      }
      if (event.phase === 'up' || event.phase === 'cancel') {
        this.endHandleDrag();
      }
    });
  }

  private unbindInteraction(): void {
    this.interactionUnsub?.();
    this.interactionUnsub = undefined;
    this.gizmo.endDrag();
  }
}
