/**
 * ClinicalTrimController — trim tool orchestration (drawing, preview, operation runtime, commit).
 */

import { asInteractionTargetId } from '@cad-studio/interaction-runtime';
import { asWorkflowStepId, asCommitTokenId } from '@cad-studio/tool-runtime';
import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import {
  asClinicalToolId,
  clinicalFailure,
  clinicalSuccess,
  type ClinicalResult
} from '../runtime/types.js';
import { ClinicalTrimSession } from './ClinicalTrimSession.js';
import { ClinicalTrimManager } from './ClinicalTrimManager.js';
import { ClinicalTrimOperation } from './ClinicalTrimOperation.js';
import { ClinicalTrimValidation } from './ClinicalTrimValidation.js';
import { ClinicalTrimHistory } from './ClinicalTrimHistory.js';
import {
  ClinicalTrimDiagnostics,
  ClinicalTrimMetrics
} from './ClinicalTrimObservability.js';
import { ClinicalTrimPreferencesStore } from './ClinicalTrimPreferences.js';
import {
  shouldAddFreehandPoint,
  type TrimBoundaryPoint
} from './ClinicalTrimBoundaryMath.js';
import type { TrimDrawMode } from './ClinicalTrimState.js';

const TRIM_POINTER_OWNER = asInteractionTargetId('clinical-trim-draw');

export class ClinicalTrimController {
  public readonly session: ClinicalTrimSession;
  public readonly manager: ClinicalTrimManager;
  public readonly operation: ClinicalTrimOperation;
  public readonly validation: ClinicalTrimValidation;
  public readonly history: ClinicalTrimHistory;
  public readonly diagnostics: ClinicalTrimDiagnostics;
  public readonly metrics: ClinicalTrimMetrics;
  public readonly preferences: ClinicalTrimPreferencesStore;

  private interactionUnsub: (() => void) | undefined;
  private drawingPointerId: number | undefined;
  private kernelStartedAt = 0;

  public constructor(
    private readonly clinicalSession: ClinicalSession,
    private readonly preparation: ClinicalPreparationRuntime,
    private readonly sceneBuilder: ClinicalSceneBuilder
  ) {
    this.session = new ClinicalTrimSession();
    this.manager = new ClinicalTrimManager();
    this.operation = new ClinicalTrimOperation();
    this.validation = new ClinicalTrimValidation();
    this.history = new ClinicalTrimHistory();
    this.diagnostics = new ClinicalTrimDiagnostics();
    this.metrics = new ClinicalTrimMetrics();
    this.preferences = new ClinicalTrimPreferencesStore();
  }

  public enter(preferredId?: ClinicalObjectId): ClinicalResult<void> {
    if (this.isActive()) {
      return clinicalFailure('conflict', 'Trim already active');
    }
    const target = this.manager.resolveTarget(this.clinicalSession, preferredId);
    if (!target.ok) {
      this.diagnostics.recordValidationFailure(target.error.message);
      return target;
    }
    const activated = this.clinicalSession.activateTool(asClinicalToolId('trim'));
    if (!activated.ok) {
      return activated;
    }
    const now = Date.now();
    const drawMode = this.preferences.get().drawMode;
    this.session.begin({ objectId: target.value.objectId, drawMode, now });
    this.diagnostics.recordSessionStart();
    this.metrics.recordTrimStart();
    this.bindInteraction();
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public setDrawMode(mode: TrimDrawMode): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Trim not active');
    }
    this.session.setDrawMode(mode);
    this.preferences.update({ drawMode: mode });
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public addPoint(point: TrimBoundaryPoint): ClinicalResult<void> {
    if (!this.isDrawing()) {
      return clinicalFailure('lifecycle', 'Trim not in drawing phase');
    }
    const state = this.session.getState();
    if (
      state.drawMode === 'freehand' &&
      !shouldAddFreehandPoint(state.points, point)
    ) {
      return clinicalSuccess(undefined);
    }
    this.session.addPoint(point);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public undoPoint(): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Trim not active');
    }
    this.session.undoPoint();
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public clearBoundary(): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Trim not active');
    }
    this.session.clearPoints();
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public closeBoundary(): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Trim not active');
    }
    this.session.closePoints();
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public validate(): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Trim not active');
    }
    const now = Date.now();
    const state = this.session.getState();
    const host = this.clinicalSession.getHost();
    const report = this.validation.validate({
      session: this.clinicalSession,
      preparation: this.preparation,
      points: state.points,
      closed: state.closed,
      targetObjectId: state.targetObjectId,
      kernelAvailable: host.runtimes.geometry !== undefined && host.runtimes.tools !== undefined,
      now
    });
    this.session.setValidationReport(report);
    if (!report.passed) {
      this.diagnostics.recordValidationFailure('Trim validation failed');
      this.clinicalSession.notifyUi();
      return clinicalFailure('validation', 'Trim validation failed');
    }
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public async submit() {
    const validated = this.validate();
    if (!validated.ok) {
      return validated;
    }
    const doc = this.clinicalSession.getPublicState().activeCase;
    const state = this.session.getState();
    if (doc === undefined || state.targetObjectId === undefined) {
      return clinicalFailure('not-found', 'Missing trim context');
    }
    this.session.markSubmitting();
    const host = this.clinicalSession.getHost();
    const started = this.operation.start({
      tools: host.runtimes.tools,
      document: doc,
      targetObjectId: state.targetObjectId as string,
      points: state.points,
      drawMode: state.drawMode
    });
    if (!started.ok) {
      this.diagnostics.recordValidationFailure(started.error.message);
      return started;
    }
    this.operation.setBoundaryPreview(state.points);
    this.kernelStartedAt = Date.now();
    this.session.markExecuting(undefined, started.value.id);
    const ran = await this.operation.runKernel();
    if (!ran.ok) {
      this.diagnostics.recordValidationFailure(ran.error.message);
      this.operation.cancel();
      host.runtimes.tools.clearActiveIfTerminal();
      this.clinicalSession.notifyUi();
      return ran;
    }
    const opSession = this.operation.getSession();
    const fingerprint = opSession?.snapshot().kernelResult?.fingerprint;
    this.session.markExecuting(fingerprint, opSession?.id ?? '');
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public async accept() {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Trim not active');
    }
    const submit = await this.submit();
    if (!submit.ok) {
      return submit;
    }
    const state = this.session.getState();
    if (state.targetObjectId === undefined) {
      return clinicalFailure('validation', 'No trim target');
    }
    const now = Date.now();
    this.session.markCommitting();
    const committed = this.operation.commit();
    if (!committed.ok) {
      this.diagnostics.recordValidationFailure(committed.error.message);
      return committed;
    }
    const host = this.clinicalSession.getHost();
    const kernelMs = now - this.kernelStartedAt;
    const applied = this.manager.applyTrimCommit({
      session: this.clinicalSession,
      objectId: state.targetObjectId,
      fingerprint: committed.value.commandIntent.kernelFingerprint ?? '',
      kernelPayload: committed.value.commandIntent.payload,
      now
    });
    if (!applied.ok) {
      return applied;
    }
    this.history.push({
      label: 'Trim mesh',
      objectId: state.targetObjectId as string,
      fingerprint: committed.value.commandIntent.kernelFingerprint ?? '',
      previous: applied.value.previous,
      next: applied.value.next,
      createdAt: now
    });
    const token = committed.value.tokenId;
    host.runtimes.tools.workflowGate.advance(
      asWorkflowStepId('ready-for-trim'),
      asCommitTokenId(token)
    );
    host.runtimes.tools.clearActiveIfTerminal();
    this.operation.dispose();
    const duration = now - (state.sessionStartedAt ?? now);
    this.diagnostics.recordCommit(duration, state.points.length, kernelMs);
    this.metrics.recordAccepted(duration, state.points.length, kernelMs);
    this.session.markCompleted();
    this.unbindInteraction();
    this.clinicalSession.getTools().deactivate();
    this.manager.republishDocument(host, this.sceneBuilder, applied.value.next, 'trim-commit');
    this.session.clear();
    this.clinicalSession.getHost().notifications.push('success', 'Trim', 'Trim committed');
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public cancel(): ClinicalResult<void> {
    if (this.session.getState().phase === 'idle') {
      return clinicalSuccess(undefined);
    }
    this.operation.cancel();
    this.clinicalSession.getHost().runtimes.tools.cancelActive();
    this.session.markCancelled();
    this.diagnostics.recordCancelled();
    this.metrics.recordCancelled();
    this.unbindInteraction();
    this.clinicalSession.getTools().deactivate();
    const doc = this.clinicalSession.getPublicState().activeCase;
    this.manager.republishDocument(
      this.clinicalSession.getHost(),
      this.sceneBuilder,
      doc,
      'trim-cancel'
    );
    this.session.clear();
    this.clinicalSession.getHost().notifications.push('info', 'Trim', 'Cancelled — document unchanged');
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public undo(): ClinicalResult<void> {
    const entry = this.history.undo();
    if (!entry.ok) {
      return entry;
    }
    const applied = this.clinicalSession.applyDocument(entry.value.previous, true);
    if (!applied.ok) {
      return applied;
    }
    this.manager.republishDocument(
      this.clinicalSession.getHost(),
      this.sceneBuilder,
      entry.value.previous,
      'trim-undo'
    );
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public redo(): ClinicalResult<void> {
    const entry = this.history.redo();
    if (!entry.ok) {
      return entry;
    }
    const applied = this.clinicalSession.applyDocument(entry.value.next, true);
    if (!applied.ok) {
      return applied;
    }
    this.manager.republishDocument(
      this.clinicalSession.getHost(),
      this.sceneBuilder,
      entry.value.next,
      'trim-redo'
    );
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public beginDraw(pointerId: number): void {
    if (!this.isDrawing()) {
      return;
    }
    this.drawingPointerId = pointerId;
    this.clinicalSession
      .getHost()
      .sessions.interactionSession?.capturePointer(pointerId, TRIM_POINTER_OWNER);
  }

  public endDraw(): void {
    if (this.drawingPointerId === undefined) {
      return;
    }
    this.clinicalSession
      .getHost()
      .sessions.interactionSession?.releasePointer(this.drawingPointerId, TRIM_POINTER_OWNER);
    this.drawingPointerId = undefined;
  }

  public isActive(): boolean {
    return this.session.getWorkflow().isActive();
  }

  public isDrawing(): boolean {
    const phase = this.session.getState().phase;
    return phase === 'drawing' || phase === 'preview-boundary' || phase === 'validating';
  }

  public dispose(): void {
    this.unbindInteraction();
    this.operation.dispose();
    this.session.clear();
  }

  private bindInteraction(): void {
    this.unbindInteraction();
    const interaction = this.clinicalSession.getHost().sessions.interactionSession;
    if (interaction === undefined) {
      return;
    }
    this.interactionUnsub = interaction.subscribe((event) => {
      if (!this.isDrawing() || event.kind !== 'pointer') {
        return;
      }
      if (this.drawingPointerId === undefined) {
        return;
      }
      if (event.pointerId !== this.drawingPointerId) {
        return;
      }
      if (event.phase === 'move' && this.session.getState().drawMode === 'freehand') {
        this.addPoint({ x: event.position.x, y: event.position.y });
      }
      if (event.phase === 'up' || event.phase === 'cancel') {
        this.endDraw();
      }
    });
  }

  private unbindInteraction(): void {
    this.interactionUnsub?.();
    this.interactionUnsub = undefined;
    this.endDraw();
  }
}
