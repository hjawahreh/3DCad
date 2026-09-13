/**
 * ClinicalPreparationSession — live preparation state (no geometry execution).
 */

import {
  DEFAULT_PREPARATION_STATE,
  type ClinicalPreparationFailure,
  type ClinicalPreparationState
} from './ClinicalPreparationState.js';
import { ClinicalPreparationLifecycle } from './ClinicalPreparationLifecycle.js';
import { ClinicalPreparationWorkflow } from './ClinicalPreparationWorkflow.js';
import type { ClinicalPreparationStage } from './ClinicalPreparationStage.js';
import type { PreparationOrchestrationToolId } from './ClinicalPreparationPipeline.js';
import type { ClinicalValidationReport } from './ClinicalPreparationValidator.js';
import type { PreparationWorkflowPhase } from './ClinicalPreparationWorkflow.js';
import type { PreparationSessionLifecycle } from './ClinicalPreparationLifecycle.js';

export interface PreparationSessionBinding {
  readonly sessionId: string;
  readonly caseId: string;
  readonly geometryRevision: number;
  readonly geometryFingerprint: string;
  readonly archMode: 'upper' | 'lower' | 'both';
}

export class ClinicalPreparationSession {
  private readonly workflow = new ClinicalPreparationWorkflow();
  private readonly lifecycle = new ClinicalPreparationLifecycle();
  private state: ClinicalPreparationState = DEFAULT_PREPARATION_STATE;
  private readonly listeners = new Set<() => void>();

  public getState(): ClinicalPreparationState {
    return this.state;
  }

  public getWorkflow(): ClinicalPreparationWorkflow {
    return this.workflow;
  }

  public getLifecycle(): ClinicalPreparationLifecycle {
    return this.lifecycle;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Ensure a usable preparation lifecycle session.
   * Reuses created/active/suspended; resets completed/cancelled so retry works.
   */
  public ensureSession(now: number, binding: PreparationSessionBinding): boolean {
    const phase = this.lifecycle.getPhase();
    if (phase === 'created' || phase === 'active' || phase === 'suspended') {
      this.patch({
        sessionLifecycle: phase,
        sessionStartedAt: this.state.sessionStartedAt ?? now,
        sessionId: binding.sessionId,
        caseId: binding.caseId,
        geometryRevision: binding.geometryRevision,
        geometryFingerprint: binding.geometryFingerprint,
        archMode: binding.archMode,
        lastFailure: undefined,
        statusMessage: 'Preparation session ready',
        nextStep: phase === 'created' ? 'Activate preparation session' : 'Continue preparation'
      });
      return true;
    }
    if (phase === 'completed' || phase === 'cancelled') {
      if (this.lifecycle.getPhase() !== 'none') {
        this.lifecycle.transition('none');
      }
      if (this.lifecycle.getPhase() !== 'none') {
        this.lifecycle.reset();
      }
      this.workflow.reset();
    }
    if (this.lifecycle.getPhase() === 'disposed') {
      return false;
    }
    if (!this.lifecycle.transition('created')) {
      return false;
    }
    this.patch({
      sessionLifecycle: 'created',
      sessionStartedAt: now,
      sessionCompletedAt: undefined,
      sessionId: binding.sessionId,
      caseId: binding.caseId,
      geometryRevision: binding.geometryRevision,
      geometryFingerprint: binding.geometryFingerprint,
      archMode: binding.archMode,
      lastFailure: undefined,
      statusMessage: 'Preparation session created',
      nextStep: 'Activate preparation session'
    });
    return true;
  }

  /** Direct create — reuses live sessions; resets terminal sessions for retry. */
  public createSession(now: number): boolean {
    const phase = this.lifecycle.getPhase();
    if (phase === 'created' || phase === 'active' || phase === 'suspended') {
      this.patch({
        sessionLifecycle: phase,
        sessionStartedAt: this.state.sessionStartedAt ?? now,
        statusMessage: 'Preparation session ready',
        nextStep: phase === 'created' ? 'Activate preparation session' : 'Continue preparation'
      });
      return true;
    }
    if (phase === 'completed' || phase === 'cancelled') {
      this.lifecycle.transition('none');
      if (this.lifecycle.getPhase() !== 'none') {
        this.lifecycle.reset();
      }
      this.workflow.reset();
    }
    if (!this.lifecycle.transition('created')) {
      return false;
    }
    this.patch({
      sessionLifecycle: 'created',
      sessionStartedAt: now,
      statusMessage: 'Preparation session created',
      nextStep: 'Activate preparation session'
    });
    return true;
  }

  public activateSession(): boolean {
    if (!this.lifecycle.transition('active')) {
      return false;
    }
    this.patch({
      sessionLifecycle: 'active',
      statusMessage: 'Preparation session active',
      nextStep: 'Validate and select a tool'
    });
    return true;
  }

  public suspendSession(): boolean {
    if (!this.lifecycle.transition('suspended')) {
      return false;
    }
    this.patch({
      sessionLifecycle: 'suspended',
      statusMessage: 'Preparation session suspended',
      nextStep: 'Resume preparation session'
    });
    return true;
  }

  public resumeSession(): boolean {
    if (!this.lifecycle.transition('active')) {
      return false;
    }
    this.patch({
      sessionLifecycle: 'active',
      statusMessage: 'Preparation session resumed',
      nextStep: 'Continue tool orchestration'
    });
    return true;
  }

  public cancelSession(): boolean {
    this.workflow.cancel();
    if (this.lifecycle.getPhase() !== 'none') {
      this.lifecycle.transition('cancelled');
    }
    this.patch({
      workflowPhase: 'cancelled',
      sessionLifecycle: this.lifecycle.getPhase(),
      selectedTool: undefined,
      activeTool: undefined,
      statusMessage: 'Preparation cancelled',
      nextStep: 'Restart preparation when ready'
    });
    return true;
  }

  public completeSession(now: number): boolean {
    if (!this.lifecycle.transition('completed')) {
      return false;
    }
    const path = ['validation', 'complete', 'ready-for-geometry'] as const;
    for (const target of path) {
      if (this.workflow.getPhase() === 'ready-for-geometry') {
        break;
      }
      this.workflow.transition(target);
    }
    if (this.workflow.getPhase() !== 'ready-for-geometry') {
      this.workflow.forcePhase('ready-for-geometry');
    }
    this.patch({
      workflowPhase: 'ready-for-geometry',
      sessionLifecycle: 'completed',
      sessionCompletedAt: now,
      currentStage: 'preparation-complete',
      completedStages: Object.freeze([
        ...this.state.completedStages.filter((s) => s !== 'preparation-complete'),
        'preparation-complete'
      ]),
      lastFailure: undefined,
      statusMessage: 'Preparation complete — ready for geometry tools',
      nextStep: 'Continue to Trim'
    });
    return true;
  }

  public disposeSession(): void {
    this.lifecycle.transition('disposed');
    this.clear();
  }

  public setWorkflowPhase(phase: PreparationWorkflowPhase, statusMessage?: string): boolean {
    if (this.workflow.getPhase() === phase) {
      this.patch({
        workflowPhase: phase,
        ...(statusMessage === undefined ? {} : { statusMessage })
      });
      return true;
    }
    if (!this.workflow.transition(phase)) {
      return false;
    }
    this.patch({
      workflowPhase: phase,
      ...(statusMessage === undefined ? {} : { statusMessage })
    });
    return true;
  }

  public forceWorkflowPhase(phase: PreparationWorkflowPhase, statusMessage?: string): void {
    this.workflow.forcePhase(phase);
    this.patch({
      workflowPhase: phase,
      ...(statusMessage === undefined ? {} : { statusMessage })
    });
  }

  public setStage(stage: ClinicalPreparationStage): void {
    const completed = this.state.completedStages.includes(stage)
      ? this.state.completedStages
      : Object.freeze([...this.state.completedStages, stage]);
    this.patch({
      currentStage: stage,
      completedStages: completed,
      statusMessage: `Stage: ${stage}`,
      nextStep: stage === 'preparation-complete' ? 'Complete preparation' : 'Advance or select tool'
    });
  }

  public setValidationReport(report: ClinicalValidationReport): void {
    this.patch({ validationReport: report });
  }

  public setOrientationValidated(validated: boolean): void {
    this.patch({
      orientationValidated: validated,
      ...(validated ? { statusMessage: 'Orientation validated' } : {})
    });
  }

  public setAutoPreparation(partial: {
    readonly autoUiState?: ClinicalPreparationState['autoUiState'];
    readonly autoSteps?: ClinicalPreparationState['autoSteps'];
    readonly autoReport?: ClinicalPreparationState['autoReport'];
    readonly statusMessage?: string;
    readonly nextStep?: string;
  }): void {
    this.patch(partial);
  }

  public setFailure(failure: ClinicalPreparationFailure, userMessage: string): void {
    this.patch({
      lastFailure: Object.freeze(failure),
      autoUiState: 'failed',
      statusMessage: userMessage,
      nextStep: 'Fix the case and retry preparation'
    });
  }

  public clearFailure(): void {
    if (this.state.lastFailure === undefined) return;
    this.patch({ lastFailure: undefined });
  }

  public selectTool(tool: PreparationOrchestrationToolId | undefined): void {
    this.patch({
      selectedTool: tool,
      statusMessage: tool === undefined ? 'No tool selected' : `Selected: ${tool}`,
      nextStep: tool === undefined ? 'Select a preparation tool' : 'Activate selected tool'
    });
  }

  public activateTool(tool: PreparationOrchestrationToolId | undefined): void {
    this.patch({
      activeTool: tool,
      statusMessage: tool === undefined ? 'No active tool' : `Active: ${tool}`,
      nextStep: tool === undefined ? 'Select a tool' : 'Validate and complete stage'
    });
  }

  public setLifecyclePhase(phase: PreparationSessionLifecycle): void {
    this.patch({ sessionLifecycle: phase });
  }

  public clear(): void {
    this.workflow.reset();
    this.lifecycle.reset();
    this.state = Object.freeze({
      ...DEFAULT_PREPARATION_STATE,
      revision: this.state.revision + 1
    });
    this.emit();
  }

  private patch(partial: Partial<ClinicalPreparationState>): void {
    this.state = Object.freeze({
      ...this.state,
      ...partial,
      revision: this.state.revision + 1
    });
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
