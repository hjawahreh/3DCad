/**
 * ClinicalCloseBaseController — Close Base orchestration (preview, operation runtime, commit).
 */

import { asCommitTokenId, asWorkflowStepId } from '@cad-studio/tool-runtime';
import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import type { ClinicalSession } from '../runtime/session.js';
import {
  asClinicalToolId,
  clinicalFailure,
  clinicalSuccess,
  type ClinicalResult
} from '../runtime/types.js';
import { ClinicalCloseBaseHistory } from './ClinicalCloseBaseHistory.js';
import { ClinicalCloseBaseManager } from './ClinicalCloseBaseManager.js';
import {
  ClinicalCloseBaseDiagnostics,
  ClinicalCloseBaseMetrics
} from './ClinicalCloseBaseObservability.js';
import { ClinicalCloseBaseOperation } from './ClinicalCloseBaseOperation.js';
import {
  DEFAULT_CLOSE_BASE_PARAMETERS,
  sanitizeCloseBaseParameters,
  type ClinicalCloseBaseParameters
} from './ClinicalCloseBaseParameters.js';
import { ClinicalCloseBasePreferencesStore } from './ClinicalCloseBasePreferences.js';
import { ClinicalCloseBaseSession } from './ClinicalCloseBaseSession.js';
import type { CloseBaseToolStatus } from './ClinicalCloseBaseState.js';
import type { CloseBaseOrientation, CloseBaseStrategyId } from './ClinicalCloseBaseStrategy.js';
import { ClinicalCloseBaseValidation } from './ClinicalCloseBaseValidation.js';

export class ClinicalCloseBaseController {
  public readonly session: ClinicalCloseBaseSession;
  public readonly manager: ClinicalCloseBaseManager;
  public readonly operation: ClinicalCloseBaseOperation;
  public readonly validation: ClinicalCloseBaseValidation;
  public readonly history: ClinicalCloseBaseHistory;
  public readonly diagnostics: ClinicalCloseBaseDiagnostics;
  public readonly metrics: ClinicalCloseBaseMetrics;
  public readonly preferences: ClinicalCloseBasePreferencesStore;

  private kernelStartedAt = 0;

  public constructor(
    private readonly clinicalSession: ClinicalSession,
    private readonly preparation: ClinicalPreparationRuntime,
    private readonly sceneBuilder: ClinicalSceneBuilder
  ) {
    this.session = new ClinicalCloseBaseSession();
    this.manager = new ClinicalCloseBaseManager();
    this.operation = new ClinicalCloseBaseOperation();
    this.validation = new ClinicalCloseBaseValidation();
    this.history = new ClinicalCloseBaseHistory();
    this.diagnostics = new ClinicalCloseBaseDiagnostics();
    this.metrics = new ClinicalCloseBaseMetrics();
    this.preferences = new ClinicalCloseBasePreferencesStore();
  }

  public enter(preferredId?: ClinicalObjectId): ClinicalResult<void> {
    if (this.isActive()) {
      return clinicalFailure('conflict', 'Close Base already active');
    }
    if (!this.isPreparationReady()) {
      this.session.setToolStatus('not-ready');
      this.diagnostics.recordValidationFailure('Preparation is not ready for Close Base');
      return clinicalFailure('validation', 'Advance preparation to Ready For Close Base');
    }
    const host = this.clinicalSession.getHost();
    const activeOp = host.runtimes.tools.getActive();
    if (activeOp !== undefined) {
      const phase = activeOp.snapshot().phase;
      if (phase !== 'committed' && phase !== 'failed' && phase !== 'cancelled' && phase !== 'disposed') {
        return clinicalFailure('conflict', 'Another geometry operation is still active');
      }
      host.runtimes.tools.clearActiveIfTerminal();
    }
    const target = this.manager.resolveTarget(this.clinicalSession, preferredId);
    if (!target.ok) {
      this.diagnostics.recordValidationFailure(target.error.message);
      return target;
    }
    const activated = this.clinicalSession.activateTool(asClinicalToolId('close-base'));
    if (!activated.ok) {
      return activated;
    }
    const now = Date.now();
    const parameters = sanitizeCloseBaseParameters({
      strategy: this.preferences.get().defaultStrategy
    });
    this.session.begin({ objectId: target.value.objectId, parameters, now });
    this.diagnostics.recordSessionStart(parameters.strategy);
    this.metrics.recordStart(parameters.strategy);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public setStrategy(strategy: CloseBaseStrategyId): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Close Base not active');
    }
    this.operation.cancel();
    const next = sanitizeCloseBaseParameters({ strategy }, this.session.getState().parameters);
    this.session.setParameters(next);
    this.preferences.update({ defaultStrategy: strategy });
    this.metrics.recordParameterChange(strategy);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public setParameters(partial: Partial<ClinicalCloseBaseParameters>): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Close Base not active');
    }
    this.operation.cancel();
    const next = sanitizeCloseBaseParameters(partial, this.session.getState().parameters);
    this.session.setParameters(next);
    this.metrics.recordParameterChange(next.strategy);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public bumpHeight(delta: number): ClinicalResult<void> {
    return this.setParameters({ height: this.session.getState().parameters.height + delta });
  }

  public bumpThickness(delta: number): ClinicalResult<void> {
    return this.setParameters({
      thickness: this.session.getState().parameters.thickness + delta
    });
  }

  public bumpMargin(delta: number): ClinicalResult<void> {
    return this.setParameters({ margin: this.session.getState().parameters.margin + delta });
  }

  public cycleOrientation(): ClinicalResult<void> {
    const order: readonly CloseBaseOrientation[] = ['xy', 'xz', 'yz'];
    const current = this.session.getState().parameters.orientation;
    const index = order.indexOf(current);
    const next = order[(index + 1) % order.length] ?? 'xy';
    return this.setParameters({ orientation: next });
  }

  public toggleSmoothing(): ClinicalResult<void> {
    return this.setParameters({ smoothing: !this.session.getState().parameters.smoothing });
  }

  public reset(): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Close Base not active');
    }
    this.operation.cancel();
    this.session.setParameters(sanitizeCloseBaseParameters({}, DEFAULT_CLOSE_BASE_PARAMETERS));
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public validate(requireCommitEligibility = false): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Close Base not active');
    }
    const now = Date.now();
    const state = this.session.getState();
    const host = this.clinicalSession.getHost();
    const report = this.validation.validate({
      session: this.clinicalSession,
      preparation: this.preparation,
      parameters: state.parameters,
      targetObjectId: state.targetObjectId,
      kernelAvailable: host.runtimes.geometry !== undefined && host.runtimes.kernel !== undefined,
      operationAvailable: host.runtimes.tools !== undefined,
      kernelFingerprint: state.kernelFingerprint,
      requireCommitEligibility,
      now
    });
    this.session.setValidationReport(report, !report.passed);
    if (!report.passed) {
      this.diagnostics.recordValidationFailure('Close Base validation failed');
      this.clinicalSession.notifyUi();
      return clinicalFailure('validation', 'Close Base validation failed');
    }
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public async submit() {
    const validated = this.validate(false);
    if (!validated.ok) {
      return validated;
    }
    const doc = this.clinicalSession.getPublicState().activeCase;
    const state = this.session.getState();
    if (doc === undefined || state.targetObjectId === undefined) {
      return clinicalFailure('not-found', 'Missing Close Base context');
    }
    this.session.markSubmitting();
    const host = this.clinicalSession.getHost();
    host.runtimes.tools.clearActiveIfTerminal();
    const started = this.operation.start({
      tools: host.runtimes.tools,
      document: doc,
      targetObjectId: state.targetObjectId as string,
      parameters: state.parameters
    });
    if (!started.ok) {
      this.diagnostics.recordValidationFailure(started.error.message);
      this.session.markFailed(started.error.message);
      this.metrics.recordFailed();
      this.clinicalSession.notifyUi();
      return started;
    }
    this.operation.setPreview(state.parameters);
    this.kernelStartedAt = Date.now();
    this.session.markExecuting(undefined, started.value.id);
    const ran = await this.operation.runKernel();
    if (!ran.ok) {
      this.diagnostics.recordCommitFailure(ran.error.message);
      this.metrics.recordFailed();
      this.operation.cancel();
      host.runtimes.tools.clearActiveIfTerminal();
      this.session.markFailed(ran.error.message);
      this.clinicalSession.notifyUi();
      return ran;
    }
    const opSession = this.operation.getSession();
    const fingerprint = opSession?.snapshot().kernelResult?.fingerprint;
    const progress = opSession?.snapshot().progress;
    this.session.markExecuting(fingerprint, opSession?.id ?? '');
    if (progress !== undefined) {
      this.session.markProgress({
        completed: progress.completed,
        total: progress.total ?? 1,
        message: progress.message
      });
    }
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public async accept() {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Close Base not active');
    }
    const revisionBefore = this.clinicalSession.getPublicState().activeCase?.revision;
    const submit = await this.submit();
    if (!submit.ok) {
      const revisionAfter = this.clinicalSession.getPublicState().activeCase?.revision;
      if (revisionBefore !== revisionAfter) {
        this.diagnostics.record('error', 'Invariant violation: document changed after failed submit');
      }
      return submit;
    }
    const state = this.session.getState();
    if (state.targetObjectId === undefined) {
      return clinicalFailure('validation', 'No Close Base target');
    }
    const commitGate = this.validate(true);
    if (!commitGate.ok) {
      return commitGate;
    }
    const now = Date.now();
    this.session.markCommitting();
    const committed = this.operation.commit();
    if (!committed.ok) {
      this.diagnostics.recordCommitFailure(committed.error.message);
      this.metrics.recordFailed();
      this.session.markFailed(committed.error.message);
      this.clinicalSession.notifyUi();
      return committed;
    }
    const host = this.clinicalSession.getHost();
    const kernelMs = now - this.kernelStartedAt;
    const applied = this.manager.applyCloseBaseCommit({
      session: this.clinicalSession,
      objectId: state.targetObjectId,
      fingerprint: committed.value.commandIntent.kernelFingerprint ?? '',
      kernelPayload: committed.value.commandIntent.payload,
      now
    });
    if (!applied.ok) {
      this.diagnostics.recordCommitFailure(applied.error.message);
      this.metrics.recordFailed();
      return applied;
    }
    this.history.push({
      label: `Close Base (${state.parameters.strategy})`,
      objectId: state.targetObjectId as string,
      fingerprint: committed.value.commandIntent.kernelFingerprint ?? '',
      strategy: state.parameters.strategy,
      previous: applied.value.previous,
      next: applied.value.next,
      createdAt: now
    });
    host.runtimes.tools.workflowGate.advance(
      asWorkflowStepId('ready-for-close-base'),
      asCommitTokenId(committed.value.tokenId)
    );
    host.runtimes.tools.clearActiveIfTerminal();
    this.operation.dispose();
    const duration = now - (state.sessionStartedAt ?? now);
    const previewMs = now - (state.previewStartedAt ?? now);
    this.diagnostics.recordCommit({
      durationMs: duration,
      kernelMs,
      previewMs,
      strategy: state.parameters.strategy
    });
    this.metrics.recordSuccess(duration, kernelMs, previewMs);
    this.session.markCompleted();
    this.clinicalSession.getTools().deactivate();
    this.manager.republishDocument(host, this.sceneBuilder, applied.value.next, 'close-base-commit');
    this.session.clear();
    host.notifications.push('success', 'Close Base', 'Close Base committed');
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
    this.clinicalSession.getTools().deactivate();
    const doc = this.clinicalSession.getPublicState().activeCase;
    this.manager.republishDocument(
      this.clinicalSession.getHost(),
      this.sceneBuilder,
      doc,
      'close-base-cancel'
    );
    this.session.clear();
    this.clinicalSession.getHost().notifications.push(
      'info',
      'Close Base',
      'Cancelled — document unchanged'
    );
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
      'close-base-undo'
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
      'close-base-redo'
    );
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public isActive(): boolean {
    return this.session.getWorkflow().isActive();
  }

  public isPreparationReady(): boolean {
    const stage = this.preparation.session.getState().currentStage;
    return (
      this.preparation.isReadyForGeometry() ||
      stage === 'ready-for-close-base' ||
      stage === 'preparation-complete'
    );
  }

  public getToolStatus(): CloseBaseToolStatus {
    const phase = this.session.getState().phase;
    if (phase === 'failed') {
      return 'failed';
    }
    if (phase === 'cancelled') {
      return 'cancelled';
    }
    if (phase === 'completed') {
      return 'committed';
    }
    if (phase === 'validating') {
      return 'validating';
    }
    if (phase === 'submitting' || phase === 'executing' || phase === 'committing') {
      return 'processing';
    }
    if (this.isActive()) {
      return 'previewing';
    }
    return this.isPreparationReady() ? 'ready' : 'not-ready';
  }

  public dispose(): void {
    this.operation.dispose();
    this.session.clear();
  }
}
