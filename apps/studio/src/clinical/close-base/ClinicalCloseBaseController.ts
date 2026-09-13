/**
 * ClinicalCloseBaseController — Close Base orchestration (preview, operation runtime, commit).
 */

import { asCommitTokenId, asWorkflowStepId } from '@cad-studio/tool-runtime';
import type {
  ClinicalArchRole,
  ClinicalObjectId
} from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalViewportRuntime } from '../display/ClinicalViewportRuntime.js';
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
import { estimateAutoCloseBase } from './ClinicalAutoCloseBaseEstimator.js';
import { extractBoundaryLoops } from '../../geometry-kernel/engine/index.js';

const yieldUi = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

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
  private isolationActive = false;
  /** Fit active arch once after a successful geometry preview this session. */
  private fittedAfterPreview = false;

  public constructor(
    private readonly clinicalSession: ClinicalSession,
    private readonly preparation: ClinicalPreparationRuntime,
    private readonly sceneBuilder: ClinicalSceneBuilder,
    private readonly viewport: ClinicalViewportRuntime | undefined
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
    this.fittedAfterPreview = false;
    this.applyIsolation(target.value.objectId, { fit: true });
    this.diagnostics.recordSessionStart(parameters.strategy);
    this.metrics.recordStart(parameters.strategy);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public setActiveArch(arch: ClinicalArchRole): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Close Base not active');
    }
    const target = this.manager.resolveTargetByArch(this.clinicalSession, arch);
    if (!target.ok) {
      return target;
    }
    const current = this.session.getState().targetObjectId;
    this.operation.cancel();
    this.clinicalSession.getHost().runtimes.tools.cancelActive();
    this.clearKernelPreview(current);
    if (current !== target.value.objectId) {
      this.session.retarget(target.value.objectId);
    }
    this.applyIsolation(target.value.objectId, { fit: false });
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public setStrategy(strategy: CloseBaseStrategyId): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Close Base not active');
    }
    this.operation.cancel();
    this.clearKernelPreview(this.session.getState().targetObjectId);
    const next = sanitizeCloseBaseParameters({ strategy }, this.session.getState().parameters);
    this.session.setParameters(next);
    this.preferences.update({ defaultStrategy: strategy });
    this.metrics.recordParameterChange(strategy);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public setParameters(partial: Partial<ClinicalCloseBaseParameters> & { readonly offset?: number }): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Close Base not active');
    }
    this.operation.cancel();
    this.clearKernelPreview(this.session.getState().targetObjectId);
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

  public bumpOffset(delta: number): ClinicalResult<void> {
    return this.bumpMargin(delta);
  }

  public cycleOrientation(): ClinicalResult<void> {
    const order: readonly CloseBaseOrientation[] = ['xz', 'xy', 'yz'];
    const current = this.session.getState().parameters.orientation;
    const index = order.indexOf(current);
    const next = order[(index + 1) % order.length] ?? 'xz';
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
    this.clearKernelPreview(this.session.getState().targetObjectId);
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
    const quality = this.readTargetQuality(state.targetObjectId as string | undefined);
    const report = this.validation.validate({
      session: this.clinicalSession,
      preparation: this.preparation,
      parameters: state.parameters,
      targetObjectId: state.targetObjectId,
      kernelAvailable: host.runtimes.geometry !== undefined && host.runtimes.kernel !== undefined,
      operationAvailable: host.runtimes.tools !== undefined,
      kernelFingerprint: state.kernelFingerprint,
      requireCommitEligibility,
      now,
      ...(quality === undefined ? {} : { quality })
    });
    this.session.setValidationReport(report, !report.passed);
    if (!report.passed) {
      const first = report.checks.find((c) => !c.passed);
      this.diagnostics.recordValidationFailure(first?.message ?? 'Close Base validation failed');
      this.clinicalSession.notifyUi();
      return clinicalFailure('validation', first?.message ?? 'Close Base validation failed');
    }
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  /**
   * Generate the proposed base as a real preview mesh (working/source unchanged).
   * Fits the active arch once after the first successful preview.
   */
  public async preview(): Promise<ClinicalResult<void>> {
    return this.runGeometry({ preview: true });
  }

  /**
   * Auto Close Base — analyze mesh, estimate parameters, generate preview only.
   * Never silently commits. On failure: no model mutation; offers manual Close Base.
   */
  public async autoCloseBase(): Promise<ClinicalResult<void>> {
    const revisionBefore = this.clinicalSession.getPublicState().activeCase?.revision;
    if (!this.isActive()) {
      const entered = this.enter();
      if (!entered.ok) {
        return entered;
      }
    }
    this.session.setInteractionMode('auto');
    this.session.setProgress({
      message: 'Analyzing model…',
      completed: 1,
      total: 4
    });
    this.clinicalSession.notifyUi();
    await yieldUi();

    const state = this.session.getState();
    const objectId = state.targetObjectId as string | undefined;
    if (objectId === undefined) {
      return clinicalFailure('not-found', 'No Close Base target');
    }
    const registry = this.clinicalSession.getHost().runtimes.kernel.registry;
    let mesh =
      registry.getByObjectId(objectId, 'working') ??
      registry.getByObjectId(objectId, 'source');
    if (mesh === undefined) {
      // Seed only when the case has no hydrated geometry yet.
      registry.ensureSourceMesh(objectId);
      mesh =
        registry.getByObjectId(objectId, 'working') ??
        registry.getByObjectId(objectId, 'source');
    }
    if (mesh === undefined) {
      this.session.setInteractionMode('manual');
      this.session.setAutoEstimate(undefined);
      this.session.setStatusMessage(
        'Automatic base generation needs review. Use Adjust Manually.'
      );
      this.diagnostics.record(
        'warning',
        'Auto Close Base: working mesh unavailable — manual Close Base required'
      );
      this.clinicalSession.notifyUi();
      return clinicalFailure('validation', 'Automatic base generation needs review.');
    }

    const estimate = estimateAutoCloseBase(mesh);
    this.session.setAutoEstimate(estimate);
    this.diagnostics.record(
      estimate.ok ? 'info' : 'warning',
      `Auto Close Base ${estimate.algorithmVersion}: ${estimate.message} (${estimate.reasons.join('; ')})`
    );
    this.clinicalSession.notifyUi();
    await yieldUi();

    if (!estimate.ok) {
      this.session.setInteractionMode('manual');
      this.session.setStatusMessage(
        'Automatic base generation needs review. Use Adjust Manually.'
      );
      this.session.setToolStatus('previewing');
      this.diagnostics.recordValidationFailure(
        `Auto Close Base needs review: ${estimate.reasons.join('; ')}`
      );
      this.metrics.recordFailed();
      const revisionAfter = this.clinicalSession.getPublicState().activeCase?.revision;
      if (revisionBefore !== revisionAfter) {
        this.diagnostics.record(
          'error',
          'Invariant violation: document changed after failed Auto Close Base'
        );
      }
      this.clinicalSession.notifyUi();
      return clinicalFailure('validation', 'Automatic base generation needs review.');
    }

    this.session.setProgress({
      message: 'Creating base…',
      completed: 2,
      total: 4
    });
    this.clinicalSession.notifyUi();
    await yieldUi();

    // Apply estimated params without cancelling the upcoming preview op twice.
    this.operation.cancel();
    this.session.setParameters(estimate.parameters);
    this.session.setInteractionMode('auto');

    this.session.setProgress({
      message: 'Creating base…',
      completed: 3,
      total: 4
    });
    this.clinicalSession.notifyUi();

    const previewed = await this.runGeometry({ preview: true });
    if (!previewed.ok) {
      this.session.setInteractionMode('manual');
      this.clearKernelPreview(state.targetObjectId);
      this.session.setStatusMessage(
        'Automatic base generation needs review. Use Adjust Manually.'
      );
      this.session.setToolStatus('previewing');
      this.diagnostics.record(
        'warning',
        `Auto Close Base preview failed: ${previewed.error.message}`
      );
      this.metrics.recordFailed();
      const revisionAfter = this.clinicalSession.getPublicState().activeCase?.revision;
      if (revisionBefore !== revisionAfter) {
        this.diagnostics.record(
          'error',
          'Invariant violation: document changed after failed Auto Close Base preview'
        );
      }
      this.clinicalSession.notifyUi();
      return clinicalFailure('validation', 'Automatic base generation needs review.');
    }

    this.session.setProgress({
      message: 'Checking result…',
      completed: 4,
      total: 4
    });
    this.clinicalSession.notifyUi();
    await yieldUi();

    const quality = this.readTargetQuality(objectId);
    if (
      quality !== undefined &&
      quality.codes.includes('INPUT_INVALID')
    ) {
      this.clearKernelPreview(state.targetObjectId);
      this.session.setInteractionMode('manual');
      this.session.setStatusMessage(
        'Automatic base generation needs review. Use Adjust Manually.'
      );
      this.session.setToolStatus('previewing');
      this.diagnostics.record('warning', 'Auto Close Base quality check failed after preview');
      this.metrics.recordFailed();
      this.clinicalSession.notifyUi();
      return clinicalFailure('validation', 'Automatic base generation needs review.');
    }

    this.session.markPreviewReady(
      this.session.getState().kernelFingerprint,
      this.session.getState().operationId ?? ''
    );
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  /** Switch to manual Close Base parameter editing (fallback / Adjust). */
  public enterManualMode(): ClinicalResult<void> {
    if (!this.isActive()) {
      const entered = this.enter();
      if (!entered.ok) {
        return entered;
      }
    }
    this.session.setInteractionMode('manual');
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public async submit() {
    return this.runGeometry({ preview: true });
  }

  public async accept() {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Close Base not active');
    }
    const revisionBefore = this.clinicalSession.getPublicState().activeCase?.revision;
    // Commit path: write working mesh (not preview-only).
    const ran = await this.runGeometry({ preview: false });
    if (!ran.ok) {
      const revisionAfter = this.clinicalSession.getPublicState().activeCase?.revision;
      if (revisionBefore !== revisionAfter) {
        this.diagnostics.record('error', 'Invariant violation: document changed after failed submit');
      }
      return ran;
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
    // Unlock Segment after a committed base (prep stage may still be ready-for-trim).
    const prepStage = this.preparation.session.getState().currentStage;
    if (
      prepStage === 'orientation-complete' ||
      prepStage === 'ready-for-trim' ||
      prepStage === 'ready-for-close-base'
    ) {
      this.preparation.session.setStage('ready-for-segmentation');
    }
    const duration = now - (state.sessionStartedAt ?? now);
    const previewMs = now - (state.previewStartedAt ?? now);
    this.diagnostics.recordCommit({
      durationMs: duration,
      kernelMs,
      previewMs,
      strategy: state.parameters.strategy
    });
    this.metrics.recordSuccess(duration, kernelMs, previewMs);
    this.manager.republishDocument(host, this.sceneBuilder, applied.value.next, 'close-base-commit');
    // Stay active for repeated editing / other arch.
    this.session.continueAfterCommit({
      objectId: state.targetObjectId,
      parameters: state.parameters,
      now: Date.now()
    });
    this.fittedAfterPreview = false;
    host.notifications.push('success', 'Close Base', 'Base accepted — continue or switch arch');
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public cancel(): ClinicalResult<void> {
    if (this.session.getState().phase === 'idle') {
      return clinicalSuccess(undefined);
    }
    const targetId = this.session.getState().targetObjectId;
    this.operation.cancel();
    this.clinicalSession.getHost().runtimes.tools.cancelActive();
    this.clearKernelPreview(targetId);
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
    this.restoreIsolation();
    this.session.clear();
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
      stage === 'preparation-complete' ||
      stage === 'ready-for-trim'
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
    this.restoreIsolation();
    this.session.clear();
  }

  private async runGeometry(options: { readonly preview: boolean }): Promise<ClinicalResult<void>> {
    const validated = this.validate(false);
    if (!validated.ok) {
      return validated;
    }
    const doc = this.clinicalSession.getPublicState().activeCase;
    const state = this.session.getState();
    if (doc === undefined || state.targetObjectId === undefined) {
      return clinicalFailure('not-found', 'Missing Close Base context');
    }
    this.operation.cancel();
    this.session.markSubmitting();
    const host = this.clinicalSession.getHost();
    host.runtimes.tools.clearActiveIfTerminal();

    // GEO-001: require an extractable open dental border before base generation.
    const registry = host.runtimes.kernel.registry;
    registry.ensureSourceMesh(state.targetObjectId as string);
    const mesh =
      registry.getByObjectId(state.targetObjectId as string, 'working') ??
      registry.getByObjectId(state.targetObjectId as string, 'source');
    if (mesh !== undefined) {
      const boundaries = extractBoundaryLoops(mesh);
      if (boundaries.length === 0) {
        const message = 'No open boundary loops found for base generation';
        this.diagnostics.recordValidationFailure(message);
        this.session.markFailed(message);
        this.metrics.recordFailed();
        this.clinicalSession.notifyUi();
        return clinicalFailure('validation', message);
      }
      this.session.setStatusMessage(
        `Border candidates: ${String(boundaries.length)} — primary perimeter ${boundaries[0]!.perimeter.toFixed(1)} mm`
      );
    }

    const started = this.operation.start({
      tools: host.runtimes.tools,
      document: doc,
      targetObjectId: state.targetObjectId as string,
      parameters: state.parameters,
      preview: options.preview
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
    if (options.preview) {
      this.session.markPreviewReady(fingerprint, opSession?.id ?? '');
      this.manager.republishDocument(host, this.sceneBuilder, doc, 'close-base-preview');
      if (!this.fittedAfterPreview && this.viewport !== undefined) {
        this.viewport.fitAll();
        this.fittedAfterPreview = true;
      }
    } else {
      this.session.markExecuting(fingerprint, opSession?.id ?? '');
    }
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

  private applyIsolation(
    objectId: ClinicalObjectId,
    options?: { readonly fit?: boolean }
  ): void {
    if (this.viewport === undefined) {
      return;
    }
    const isolated = this.viewport.isolate(objectId);
    if (!isolated.ok) {
      return;
    }
    this.isolationActive = true;
    if (options?.fit === true) {
      this.viewport.fitAll();
    }
  }

  private restoreIsolation(): void {
    if (!this.isolationActive || this.viewport === undefined) {
      this.isolationActive = false;
      return;
    }
    this.isolationActive = false;
    this.viewport.showAll();
  }

  private clearKernelPreview(objectId: ClinicalObjectId | undefined): void {
    if (objectId === undefined) {
      return;
    }
    const registry = this.clinicalSession.getHost().runtimes.kernel.registry;
    registry.clearPreview(objectId as string);
    const working =
      registry.getByObjectId(objectId as string, 'working') ??
      registry.getByObjectId(objectId as string, 'source');
    if (working !== undefined) {
      try {
        const display = this.clinicalSession.getHost().runtimes.kernel.backend.prepareDisplay(working);
        registry.setDisplay(objectId as string, display.mesh);
      } catch {
        // Non-fatal — next republish / commit refreshes display.
      }
    }
  }

  private readTargetQuality(objectId: string | undefined):
    | {
        readonly ok: boolean;
        readonly codes: readonly string[];
        readonly warnings: readonly string[];
        readonly boundaryEdges: number;
        readonly degenerateCount: number;
      }
    | undefined {
    if (objectId === undefined) {
      return undefined;
    }
    const registry = this.clinicalSession.getHost().runtimes.kernel.registry;
    const mesh =
      registry.getByObjectId(objectId, 'preview') ??
      registry.getByObjectId(objectId, 'working') ??
      registry.getByObjectId(objectId, 'source');
    if (mesh === undefined) {
      return undefined;
    }
    try {
      const report = this.clinicalSession.getHost().runtimes.kernel.backend.validate(mesh);
      return {
        ok: report.ok,
        codes: report.codes,
        warnings: report.warnings,
        boundaryEdges: report.stats.boundaryEdges,
        degenerateCount: report.stats.degenerateCount
      };
    } catch {
      return undefined;
    }
  }
}
