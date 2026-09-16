/**
 * ClinicalPreparationController — orchestrates preparation workflow (no geometry).
 */

import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalOrientationRuntime } from '../orientation/ClinicalOrientationRuntime.js';
import type { ClinicalViewportRuntime } from '../display/ClinicalViewportRuntime.js';
import {
  withPreparationMeta,
  type ClinicalDocumentSnapshot,
  type ClinicalPreparationMeta
} from '../document/ClinicalDocument.js';
import {
  clinicalFailure,
  clinicalSuccess,
  type ClinicalResult
} from '../runtime/types.js';
import { ClinicalPreparationSession } from './ClinicalPreparationSession.js';
import { ClinicalPreparationManager } from './ClinicalPreparationManager.js';
import {
  ClinicalPreparationDiagnostics,
  ClinicalPreparationMetrics
} from './ClinicalPreparationObservability.js';
import { ClinicalPreparationEvents } from './ClinicalPreparationEvents.js';
import {
  ClinicalPreparationPreferencesStore
} from './ClinicalPreparationPreferences.js';
import type { PreparationOrchestrationToolId } from './ClinicalPreparationPipeline.js';
import type { ClinicalPreparationStage } from './ClinicalPreparationStage.js';
import {
  runClinicalAutoPreparation,
  type ClinicalAutoPreparationReport,
  type PrepareArchInput
} from './ClinicalAutoPreparationRunner.js';
import { startClinicalGeometryWarmup } from '../geometry/ClinicalGeometryWarmup.js';

export class ClinicalPreparationController {
  public readonly session: ClinicalPreparationSession;
  public readonly manager: ClinicalPreparationManager;
  public readonly diagnostics: ClinicalPreparationDiagnostics;
  public readonly metrics: ClinicalPreparationMetrics;
  public readonly events: ClinicalPreparationEvents;
  public readonly preferences: ClinicalPreparationPreferencesStore;

  private activeSessionId: string | undefined;

  public constructor(
    private readonly clinicalSession: ClinicalSession,
    private readonly orientation: ClinicalOrientationRuntime,
    private readonly viewport: ClinicalViewportRuntime,
    private readonly archContext?: { getMode(): 'upper' | 'lower' | 'both' }
  ) {
    this.session = new ClinicalPreparationSession();
    this.manager = new ClinicalPreparationManager();
    this.diagnostics = new ClinicalPreparationDiagnostics();
    this.metrics = new ClinicalPreparationMetrics();
    this.events = new ClinicalPreparationEvents();
    this.preferences = new ClinicalPreparationPreferencesStore();
  }

  public start(): ClinicalResult<void> {
    // Idempotent: Orient Accept already starts preparation — do not error on repeat.
    if (this.hasActiveSession()) {
      this.clinicalSession.notifyUi();
      return clinicalSuccess(undefined);
    }
    if (this.isReadyForGeometry()) {
      this.clinicalSession.notifyUi();
      return clinicalSuccess(undefined);
    }

    const doc = this.clinicalSession.getPublicState().activeCase;
    const archMode = this.archContext?.getMode() ?? 'both';
    const fail = (stage: string, reason: string, code: 'validation' | 'conflict' | 'not-found' | 'lifecycle' = 'lifecycle') => {
      const userMessage =
        stage === 'SESSION_CREATE'
          ? 'Could not create preparation session'
          : reason;
      this.session.setFailure(
        Object.freeze({
          stage,
          reason,
          caseId: doc?.caseId as string | undefined,
          arch: archMode,
          geometryRevision: doc?.revision as number | undefined,
          at: Date.now()
        }),
        userMessage
      );
      this.diagnostics.recordValidationFailure(`${stage}: ${reason}`);
      this.clinicalSession.notifyUi();
      return clinicalFailure(code, userMessage);
    };

    const ready = this.manager.ensureCaseReady(this.clinicalSession);
    if (!ready.ok) {
      return fail('CASE_READY', ready.error.message, ready.error.code as 'not-found');
    }
    if (doc === undefined) {
      return fail('CASE_LOOKUP', 'No active case', 'not-found');
    }

    const now = Date.now();
    const fingerprint = this.geometryFingerprint();
    const sessionId = `prep-${String(doc.caseId)}-${String(now)}`;
    const binding = Object.freeze({
      sessionId,
      caseId: String(doc.caseId),
      geometryRevision: Number(doc.revision),
      geometryFingerprint: fingerprint,
      archMode
    });

    const wf = this.session.getWorkflow();
    if (wf.getPhase() === 'cancelled' || wf.getPhase() === 'ready-for-geometry') {
      wf.reset();
      this.session.forceWorkflowPhase('idle');
    } else if (wf.getPhase() === 'idle') {
      // ok
    }

    // Advance workflow from idle → preparation-ready (idempotent per phase).
    if (wf.getPhase() === 'idle') {
      wf.transition('case-ready');
    }
    if (wf.getPhase() === 'case-ready') {
      wf.transition('orientation-validation');
    }

    const context = this.buildContext(now);
    const report = this.manager.runValidation(context, { requireSavedCase: false });
    this.session.setValidationReport(report);
    this.events.emit({ type: 'validation', report, at: now });

    if (!report.passed) {
      this.metrics.recordValidationFailure();
      const failed = report.checks.find((c) => !c.passed);
      wf.transition('cancelled');
      this.session.setWorkflowPhase('cancelled', failed?.message ?? 'Validation failed');
      return fail(
        'VALIDATION',
        failed?.message ?? 'Preparation validation failed',
        'validation'
      );
    }

    this.metrics.recordValidationSuccess();
    if (wf.getPhase() === 'orientation-validation') {
      wf.transition('preparation-ready');
    }
    this.session.setWorkflowPhase(
      'preparation-ready',
      'Your scans are oriented and ready.'
    );
    this.session.setOrientationValidated(
      report.checks.find((c) => c.id === 'orientation-completed')?.passed === true
    );
    this.session.setStage('orientation-complete');
    this.metrics.recordStageCompletion('orientation-complete');

    if (!this.session.ensureSession(now, binding)) {
      return fail(
        'SESSION_CREATE',
        `Lifecycle blocked at ${this.session.getLifecycle().getPhase()}`,
        'conflict'
      );
    }
    this.activeSessionId = binding.sessionId;
    this.session.clearFailure();
    this.diagnostics.recordSessionStart();
    this.events.emit({ type: 'session', action: 'create', at: now });
    this.events.emit({ type: 'workflow', phase: 'preparation-ready', at: now });
    this.events.emit({ type: 'stage', stage: 'orientation-complete', at: now });
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  private geometryFingerprint(): string {
    const arches = this.collectArchInputs();
    if (arches.length === 0) {
      const doc = this.clinicalSession.getPublicState().activeCase;
      return `doc:${String(doc?.caseId ?? 'none')}:${String(doc?.revision ?? 0)}`;
    }
    return arches
      .map((a) => `${a.objectId}:${a.mesh.revision}:${a.mesh.fingerprint}`)
      .sort()
      .join('|');
  }

  /**
   * Truthful preparation gate: validate → mark ready for Trim.
   * No fake mesh repair. Idempotent when already ready for geometry.
   */
  public confirmReadyForTrim(): ClinicalResult<void> {
    if (this.isReadyForGeometry()) {
      this.clinicalSession.notifyUi();
      return clinicalSuccess(undefined);
    }
    const started = this.start();
    if (!started.ok) {
      return started;
    }
    // Activate so completeSession can transition lifecycle created → completed.
    if (this.session.getLifecycle().getPhase() === 'created') {
      this.activateSession();
    }
    const completed = this.complete({ quiet: true });
    if (!completed.ok) {
      return completed;
    }
    // Ensure stage allows trim validation.
    this.session.setStage('ready-for-trim');
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  /**
   * Automatic clinical preparation after orientation.
   * Runs safe diagnostics + derived caches, then marks ready for Trim.
   * Idempotent for the same geometry fingerprint.
   */
  public autoPrepare(): ClinicalResult<ClinicalAutoPreparationReport> {
    const host = this.clinicalSession.getHost();
    const doc = this.clinicalSession.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }

    const arches = this.collectArchInputs();
    const fingerprintPreview = arches
      .map((a) => `${a.objectId}:${a.mesh.revision}:${a.mesh.fingerprint}`)
      .sort()
      .join('|');

    // Idempotent: already prepared for this geometry.
    const existing = this.session.getState().autoReport;
    if (
      this.isReadyForGeometry() &&
      existing?.ok === true &&
      existing.sourceFingerprint === fingerprintPreview
    ) {
      this.clinicalSession.notifyUi();
      return clinicalSuccess(existing);
    }
    if (
      doc.preparationMeta?.sourceFingerprint === fingerprintPreview &&
      (doc.preparationMeta.uiState === 'ready' || doc.preparationMeta.uiState === 'warning') &&
      this.isReadyForGeometry()
    ) {
      this.clinicalSession.notifyUi();
      return clinicalSuccess(
        existing ??
          Object.freeze({
            ok: true,
            uiState: doc.preparationMeta.uiState,
            algorithmVersion: doc.preparationMeta.algorithmVersion,
            steps: Object.freeze([]),
            arches: Object.freeze([]),
            warnings: Object.freeze([]),
            message: doc.preparationMeta.message,
            timingMs: doc.preparationMeta.timingMs,
            preparedAt: doc.preparationMeta.preparedAt,
            sourceFingerprint: doc.preparationMeta.sourceFingerprint
          })
      );
    }

    this.session.setAutoPreparation({
      autoUiState: 'analyzing',
      statusMessage: 'Preparing your scans for trimming.',
      nextStep: 'Analyzing clinical geometry'
    });
    host.processFeedback.begin({
      kind: 'preparation',
      title: 'Preparation',
      stages: [
        { id: 'analyze', label: 'Analyzing clinical geometry' },
        { id: 'prepare', label: 'Preparing clinical geometry' },
        { id: 'confirm', label: 'Confirming ready for trim' }
      ],
      initialStageId: 'analyze'
    });
    host.notifications.push('progress', 'Preparation', 'Preparing case…');
    this.clinicalSession.notifyUi();

    const started = this.start();
    if (!started.ok) {
      host.processFeedback.fail(started.error.message);
      host.processFeedback.complete();
      const failure = this.session.getState().lastFailure;
      this.session.setAutoPreparation({
        autoUiState: 'failed',
        statusMessage: started.error.message,
        nextStep: 'Fix the case and retry preparation'
      });
      if (failure !== undefined && import.meta.env.DEV) {
        host.notifications.push(
          'warning',
          'Preparation',
          `${started.error.message} [${failure.stage}: ${failure.reason}]`
        );
      }
      return clinicalFailure(started.error.code, started.error.message);
    }

    host.processFeedback.setStage('prepare');
    this.session.setAutoPreparation({
      autoUiState: 'preparing',
      statusMessage: 'Preparing clinical geometry…'
    });

    let report: ClinicalAutoPreparationReport;
    if (arches.length === 0) {
      // Document objects exist but MeshRegistry is empty (e.g. descriptor-only tests).
      // Fall back to document readiness without claiming mesh caches were built.
      const confirmedEmpty = this.confirmReadyForTrim();
      if (!confirmedEmpty.ok) {
        this.session.setAutoPreparation({
          autoUiState: 'failed',
          statusMessage: confirmedEmpty.error.message,
          nextStep: 'Retry preparation'
        });
        return clinicalFailure(confirmedEmpty.error.code, confirmedEmpty.error.message);
      }
      report = Object.freeze({
        ok: true,
        uiState: 'warning',
        algorithmVersion: 'clinical-auto-prep-v1',
        steps: Object.freeze([
          Object.freeze({ id: 'validate', label: 'Mesh validation', done: true }),
          Object.freeze({ id: 'ready', label: 'Clinical readiness', done: true })
        ]),
        arches: Object.freeze([]),
        warnings: Object.freeze([
          'Mesh buffers were unavailable; readiness is based on document checks only.'
        ]),
        message: 'Ready with warnings. Some scan regions may require review.',
        timingMs: 0,
        preparedAt: Date.now(),
        sourceFingerprint: `doc:${doc.caseId as string}:${String(doc.revision)}`
      });
    } else {
      report = runClinicalAutoPreparation({
        arches,
        registry: host.runtimes.kernel.registry,
        cache: host.runtimes.kernel.cache,
        now: Date.now(),
        onProgress: (progress) => {
          this.session.setAutoPreparation({
            autoUiState: 'preparing',
            autoSteps: progress.steps,
            statusMessage: progress.message
          });
          this.clinicalSession.notifyUi();
        }
      });
    }
    this.session.setAutoPreparation({
      autoUiState: report.uiState,
      autoSteps: report.steps,
      autoReport: report,
      statusMessage: report.message,
      nextStep: report.ok ? 'Continue to Trim' : 'Review the scan and retry'
    });

    if (!report.ok) {
      this.diagnostics.recordValidationFailure(report.message);
      host.processFeedback.fail(report.message);
      host.processFeedback.complete();
      host.notifications.push('error', 'Preparation', report.message);
      this.clinicalSession.notifyUi();
      return clinicalSuccess(report);
    }

    host.processFeedback.setStage('confirm');
    const confirmed = this.confirmReadyForTrim();
    if (!confirmed.ok) {
      host.processFeedback.fail(confirmed.error.message);
      host.processFeedback.complete();
      this.session.setAutoPreparation({
        autoUiState: 'failed',
        statusMessage: confirmed.error.message,
        nextStep: 'Retry preparation'
      });
      return clinicalFailure(confirmed.error.code, confirmed.error.message);
    }

    const meta: ClinicalPreparationMeta = Object.freeze({
      algorithmVersion: report.algorithmVersion,
      uiState: report.uiState === 'warning' ? 'warning' : 'ready',
      sourceFingerprint: report.sourceFingerprint,
      warningCount: report.warnings.length,
      archCount: report.arches.length,
      preparedAt: report.preparedAt,
      timingMs: report.timingMs,
      message: report.message,
      lastMilestone: 'prepared'
    });
    const current = this.clinicalSession.getPublicState().activeCase;
    if (current !== undefined) {
      this.clinicalSession.applyDocument(withPreparationMeta(current, meta, Date.now()), true);
    }

    this.session.setStage('ready-for-trim');
    this.session.setAutoPreparation({
      autoUiState: report.uiState,
      autoSteps: report.steps,
      autoReport: report,
      statusMessage: report.message,
      nextStep: 'Continue to Trim'
    });

    host.processFeedback.complete();
    // GEO-003: kick geometry warmup immediately after Prepare (non-blocking).
    // Warmup progress replaces the transient prepare toast via the one-notification rule.
    if (arches.length > 0) {
      host.notifications.push('progress', 'Geometry', 'Preparing scan for editing…');
      const warmInputs = arches.map((a) => ({
        objectId: a.objectId,
        mesh: a.mesh,
        ...(a.archRole !== undefined ? { archRole: a.archRole } : {})
      }));
      void startClinicalGeometryWarmup(this.clinicalSession, warmInputs).then((statuses) => {
        const failed = statuses.find((s) => s.state === 'FAILED');
        if (failed !== undefined) {
          this.session.setAutoPreparation({
            statusMessage: 'Editing tools could not be prepared.',
            nextStep: 'Retry preparation'
          });
        } else if (statuses.every((s) => s.state === 'READY')) {
          this.session.setAutoPreparation({
            statusMessage: 'Editing ready',
            nextStep: 'Continue to Trim'
          });
        }
        this.clinicalSession.notifyUi();
      });
    } else {
      host.notifications.push(
        report.uiState === 'warning' ? 'warning' : 'success',
        'Preparation',
        report.message
      );
    }
    this.clinicalSession.notifyUi();
    return clinicalSuccess(report);
  }

  private collectArchInputs(): PrepareArchInput[] {
    const doc = this.clinicalSession.getPublicState().activeCase;
    if (doc === undefined) return [];
    const registry = this.clinicalSession.getHost().runtimes.kernel.registry;
    const mode = this.archContext?.getMode() ?? 'both';
    const arches: PrepareArchInput[] = [];
    for (const obj of doc.objects) {
      if (mode === 'upper' && obj.archRole !== 'upper') continue;
      if (mode === 'lower' && obj.archRole !== 'lower') continue;
      const mesh =
        registry.getByObjectId(obj.id as string, 'working') ??
        registry.getByObjectId(obj.id as string, 'source');
      if (mesh === undefined) continue;
      arches.push({
        objectId: obj.id as string,
        archRole: obj.archRole,
        displayName: obj.displayName,
        mesh
      });
    }
    return arches;
  }

  public validate(): ClinicalResult<void> {
    const now = Date.now();
    const context = this.buildContext(now);
    const selected = context.state.selectedTool;
    const report = this.manager.runValidation(context, {
      stage: context.state.currentStage,
      requireSavedCase: this.preferences.get().requireSavedCase,
      ...(selected === undefined ? {} : { tool: selected })
    });
    this.session.setValidationReport(report);
    this.events.emit({ type: 'validation', report, at: now });
    if (report.passed) {
      this.metrics.recordValidationSuccess();
      this.session.getWorkflow().transition('validation');
      this.session.setWorkflowPhase('validation', 'Validation passed');
    } else {
      this.metrics.recordValidationFailure();
      this.diagnostics.recordValidationFailure('Validation check failed');
      return clinicalFailure('validation', 'Validation failed');
    }
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public activateSession(): ClinicalResult<void> {
    const phase = this.session.getLifecycle().getPhase();
    if (phase === 'created') {
      if (!this.session.activateSession()) {
        return clinicalFailure('lifecycle', 'Cannot activate preparation session');
      }
    } else if (phase !== 'active' && phase !== 'suspended') {
      return clinicalFailure('lifecycle', 'Cannot activate preparation session');
    } else if (phase === 'suspended') {
      if (!this.session.resumeSession()) {
        return clinicalFailure('lifecycle', 'Cannot activate preparation session');
      }
    }
    const now = Date.now();
    const wf = this.session.getWorkflow();
    if (wf.getPhase() === 'preparation-ready') {
      wf.transition('preparation-session');
    } else if (wf.getPhase() === 'tool-selection') {
      wf.transition('preparation-session');
    }
    this.session.setWorkflowPhase(
      wf.getPhase() === 'preparation-session' ? 'preparation-session' : wf.getPhase(),
      'Preparation session active'
    );
    if (this.activeSessionId === undefined) {
      this.activeSessionId = this.session.getState().sessionId ?? `prep-${String(now)}`;
    }
    this.events.emit({ type: 'lifecycle', phase: 'active', at: now });
    this.events.emit({ type: 'session', action: 'create', at: now });
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public suspend(): ClinicalResult<void> {
    if (!this.session.suspendSession()) {
      return clinicalFailure('lifecycle', 'Cannot suspend preparation session');
    }
    this.events.emit({ type: 'session', action: 'suspend', at: Date.now() });
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public resume(): ClinicalResult<void> {
    if (!this.session.resumeSession()) {
      return clinicalFailure('lifecycle', 'Cannot resume preparation session');
    }
    this.events.emit({ type: 'session', action: 'resume', at: Date.now() });
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public selectTool(toolId: PreparationOrchestrationToolId): ClinicalResult<void> {
    if (!this.hasActiveSession()) {
      return clinicalFailure('lifecycle', 'No active preparation session');
    }
    const tool = this.manager.pipeline.get(toolId);
    if (tool === undefined) {
      return clinicalFailure('not-found', `Unknown tool ${toolId}`);
    }
    const wf = this.session.getWorkflow();
    if (wf.getPhase() === 'preparation-ready' || wf.getPhase() === 'preparation-session') {
      wf.transition('tool-selection');
    }
    this.session.selectTool(toolId);
    this.session.setWorkflowPhase('tool-selection', `Selected ${tool.title}`);
    this.events.emit({ type: 'tool', action: 'select', toolId, at: Date.now() });
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public activateTool(toolId?: PreparationOrchestrationToolId): ClinicalResult<void> {
    if (!this.hasActiveSession()) {
      return clinicalFailure('lifecycle', 'No active preparation session');
    }
    const id = toolId ?? this.session.getState().selectedTool;
    if (id === undefined) {
      return clinicalFailure('validation', 'No tool selected');
    }
    const now = Date.now();
    const context = this.buildContext(now);
    const resolved = this.manager.resolveToolActivation(id, context);
    if (!resolved.ok) {
      this.diagnostics.recordValidationFailure(resolved.error.message);
      this.metrics.recordValidationFailure();
      return resolved;
    }
    this.metrics.recordValidationSuccess();
    this.session.getWorkflow().transition('tool-activation');
    this.session.setWorkflowPhase('tool-activation', `Orchestrating ${id}`);
    this.session.activateTool(resolved.value);
    this.diagnostics.recordToolActivation(resolved.value);
    this.events.emit({ type: 'tool', action: 'activate', toolId: resolved.value, at: now });
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public advanceStage(): ClinicalResult<ClinicalPreparationStage> {
    if (!this.hasActiveSession()) {
      return clinicalFailure('lifecycle', 'No active preparation session');
    }
    const now = Date.now();
    const context = this.buildContext(now);
    const advanced = this.manager.advanceStage(this.session, context);
    if (!advanced.ok) {
      this.diagnostics.recordValidationFailure(advanced.error.message);
      return advanced;
    }
    this.diagnostics.recordStageTransition(advanced.value);
    this.metrics.recordStageCompletion(advanced.value);
    this.events.emit({ type: 'stage', stage: advanced.value, at: now });
    this.clinicalSession.notifyUi();
    return advanced;
  }

  public complete(options?: { readonly quiet?: boolean }): ClinicalResult<void> {
    if (!this.hasActiveSession()) {
      return clinicalFailure('lifecycle', 'No active preparation session');
    }
    const now = Date.now();
    const context = this.buildContext(now);
    const report = this.manager.runValidation(context, {
      requireSavedCase: this.preferences.get().requireSavedCase
    });
    this.session.setValidationReport(report);
    if (!report.passed) {
      this.metrics.recordValidationFailure();
      return clinicalFailure('validation', 'Cannot complete — validation failed');
    }
    this.metrics.recordValidationSuccess();
    const started = this.session.getState().sessionStartedAt ?? now;
    const duration = now - started;
    if (!this.session.completeSession(now)) {
      return clinicalFailure('lifecycle', 'Cannot complete preparation session');
    }
    this.diagnostics.recordWorkflowComplete(duration);
    this.metrics.recordPreparationComplete(duration);
    this.events.emit({ type: 'session', action: 'complete', at: now });
    this.events.emit({ type: 'workflow', phase: 'ready-for-geometry', at: now });
    // Keep session id bound for diagnostics; lifecycle is completed + ready gate.
    if (this.activeSessionId === undefined) {
      this.activeSessionId = this.session.getState().sessionId;
    }
    if (options?.quiet !== true) {
      this.clinicalSession.getHost().notifications.push(
        'success',
        'Preparation',
        'Preparation complete — ready for Trim'
      );
    }
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public cancel(): ClinicalResult<void> {
    if (!this.session.getLifecycle().hasSession() && this.session.getWorkflow().getPhase() === 'idle') {
      return clinicalSuccess(undefined);
    }
    this.session.cancelSession();
    this.diagnostics.recordCancelled();
    this.events.emit({ type: 'session', action: 'cancel', at: Date.now() });
    this.session.clear();
    this.activeSessionId = undefined;
    this.clinicalSession.notifyUi();
    // Inline status preferred — avoid toast spam for routine cancel.
    return clinicalSuccess(undefined);
  }

  public notifyOrientationComplete(): void {
    this.session.setOrientationValidated(true);
    this.clinicalSession.notifyUi();
  }

  public openPanel(): ClinicalResult<void> {
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public isActive(): boolean {
    return this.session.getLifecycle().isActive();
  }

  public isReadyForGeometry(): boolean {
    const state = this.session.getState();
    return (
      state.workflowPhase === 'ready-for-geometry' ||
      this.session.getWorkflow().getPhase() === 'ready-for-geometry'
    );
  }

  public hasActiveSession(): boolean {
    const phase = this.session.getLifecycle().getPhase();
    if (this.isReadyForGeometry() && (phase === 'completed' || phase === 'active')) {
      return true;
    }
    return this.activeSessionId !== undefined && this.session.getLifecycle().hasSession();
  }

  /** Bind a resumed/hydrated document into preparation UI without orphaning lifecycle. */
  public hydrateFromDocument(doc: ClinicalDocumentSnapshot): void {
    const now = Date.now();
    if (doc.orientationMeta?.acceptedAt !== undefined) {
      this.session.setOrientationValidated(true);
    }
    const readyMeta =
      doc.preparationMeta?.uiState === 'ready' || doc.preparationMeta?.uiState === 'warning';
    if (readyMeta) {
      this.session.forceWorkflowPhase(
        'ready-for-geometry',
        doc.preparationMeta?.uiState === 'warning'
          ? 'Ready with warnings'
          : 'Preparation complete — ready for geometry tools'
      );
      this.session.setStage('ready-for-trim');
      this.activeSessionId =
        this.activeSessionId ?? `prep-resume-${String(doc.caseId)}-${String(doc.revision)}`;
      const life = this.session.getLifecycle();
      if (life.getPhase() === 'none') {
        life.transition('created');
        life.transition('active');
        life.transition('completed');
        this.session.setLifecyclePhase('completed');
      }
      this.session.setAutoPreparation({
        autoUiState: doc.preparationMeta?.uiState === 'warning' ? 'warning' : 'ready',
        statusMessage: 'Preparation restored from saved case',
        nextStep: 'Continue to Trim'
      });
    } else if (doc.orientationMeta?.acceptedAt !== undefined) {
      this.session.setStage('orientation-complete');
      this.session.setAutoPreparation({
        autoUiState: 'not-started',
        statusMessage: 'Orientation accepted — prepare the case when ready',
        nextStep: 'Prepare Case'
      });
    }
    this.clinicalSession.notifyUi();
    void now;
  }

  public dispose(): void {
    this.session.disposeSession();
    this.events.clear();
    this.activeSessionId = undefined;
  }

  private buildContext(now: number) {
    return this.manager.buildContext({
      session: this.clinicalSession,
      orientation: this.orientation,
      viewport: this.viewport,
      preparationSession: this.session,
      now
    });
  }
}
