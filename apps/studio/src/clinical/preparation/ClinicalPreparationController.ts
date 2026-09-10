/**
 * ClinicalPreparationController — orchestrates preparation workflow (no geometry).
 */

import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalOrientationRuntime } from '../orientation/ClinicalOrientationRuntime.js';
import type { ClinicalViewportRuntime } from '../display/ClinicalViewportRuntime.js';
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
    private readonly viewport: ClinicalViewportRuntime
  ) {
    this.session = new ClinicalPreparationSession();
    this.manager = new ClinicalPreparationManager();
    this.diagnostics = new ClinicalPreparationDiagnostics();
    this.metrics = new ClinicalPreparationMetrics();
    this.events = new ClinicalPreparationEvents();
    this.preferences = new ClinicalPreparationPreferencesStore();
  }

  public start(): ClinicalResult<void> {
    if (this.hasActiveSession()) {
      return clinicalFailure('conflict', 'Preparation session already active');
    }
    const ready = this.manager.ensureCaseReady(this.clinicalSession);
    if (!ready.ok) {
      this.diagnostics.recordValidationFailure(ready.error.message);
      return ready;
    }
    const now = Date.now();
    const wf = this.session.getWorkflow();
    wf.reset();
    wf.transition('case-ready');
    wf.transition('orientation-validation');

    const context = this.buildContext(now);
    const report = this.manager.runValidation(context, { requireSavedCase: false });
    this.session.setValidationReport(report);
    this.events.emit({ type: 'validation', report, at: now });

    if (!report.passed) {
      this.metrics.recordValidationFailure();
      this.diagnostics.recordValidationFailure('Initial validation failed');
      wf.transition('cancelled');
      this.session.setWorkflowPhase('cancelled', 'Validation failed');
      return clinicalFailure('validation', 'Preparation validation failed');
    }

    this.metrics.recordValidationSuccess();
    wf.transition('preparation-ready');
    this.session.setWorkflowPhase('preparation-ready', 'Preparation ready');
    this.session.setOrientationValidated(
      report.checks.find((c) => c.id === 'orientation-completed')?.passed === true
    );
    this.session.setStage('orientation-complete');
    this.metrics.recordStageCompletion('orientation-complete');

    if (!this.session.createSession(now)) {
      return clinicalFailure('conflict', 'Could not create preparation session');
    }
    this.activeSessionId = `prep-${String(now)}`;
    this.diagnostics.recordSessionStart();
    this.events.emit({ type: 'session', action: 'create', at: now });
    this.events.emit({ type: 'workflow', phase: 'preparation-ready', at: now });
    this.events.emit({ type: 'stage', stage: 'orientation-complete', at: now });
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
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
    if (!this.session.activateSession()) {
      return clinicalFailure('lifecycle', 'Cannot activate preparation session');
    }
    const now = Date.now();
    this.session.getWorkflow().transition('preparation-session');
    this.session.setWorkflowPhase('preparation-session', 'Preparation session active');
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

  public complete(): ClinicalResult<void> {
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
    this.activeSessionId = undefined;
    this.clinicalSession.getHost().notifications.push(
      'success',
      'Preparation',
      'Preparation complete — ready for geometry tools'
    );
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
    this.clinicalSession.getHost().notifications.push(
      'info',
      'Preparation',
      'Preparation cancelled'
    );
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
    return this.activeSessionId !== undefined && this.session.getLifecycle().hasSession();
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
