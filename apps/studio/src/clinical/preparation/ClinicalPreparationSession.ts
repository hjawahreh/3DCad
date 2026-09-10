/**
 * ClinicalPreparationSession — live preparation state (no geometry execution).
 */

import {
  DEFAULT_PREPARATION_STATE,
  type ClinicalPreparationState
} from './ClinicalPreparationState.js';
import { ClinicalPreparationLifecycle } from './ClinicalPreparationLifecycle.js';
import { ClinicalPreparationWorkflow } from './ClinicalPreparationWorkflow.js';
import type { ClinicalPreparationStage } from './ClinicalPreparationStage.js';
import type { PreparationOrchestrationToolId } from './ClinicalPreparationPipeline.js';
import type { ClinicalValidationReport } from './ClinicalPreparationValidator.js';
import type { PreparationWorkflowPhase } from './ClinicalPreparationWorkflow.js';
import type { PreparationSessionLifecycle } from './ClinicalPreparationLifecycle.js';

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

  public createSession(now: number): boolean {
    if (this.lifecycle.hasSession()) {
      return false;
    }
    this.lifecycle.transition('created');
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
    const wf = this.workflow;
    const path = ['validation', 'complete', 'ready-for-geometry'] as const;
    for (const target of path) {
      if (wf.getPhase() === 'ready-for-geometry') {
        break;
      }
      if (wf.canTransition(target)) {
        wf.transition(target);
      }
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
      statusMessage: 'Preparation complete — ready for geometry tools',
      nextStep: 'Launch geometry tools in CLN-006+'
    });
    return true;
  }

  public disposeSession(): void {
    this.lifecycle.transition('disposed');
    this.clear();
  }

  public setWorkflowPhase(phase: PreparationWorkflowPhase, statusMessage?: string): boolean {
    if (!this.workflow.transition(phase)) {
      return false;
    }
    this.patch({
      workflowPhase: phase,
      ...(statusMessage === undefined ? {} : { statusMessage })
    });
    return true;
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
