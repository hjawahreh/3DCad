/**
 * ClinicalCloseBaseSession — live close-base state (no document mutation until commit).
 */

import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import type { CloseBaseSessionLifecycle } from './ClinicalCloseBaseLifecycle.js';
import { ClinicalCloseBaseLifecycle } from './ClinicalCloseBaseLifecycle.js';
import {
  DEFAULT_CLOSE_BASE_PARAMETERS,
  sanitizeCloseBaseParameters,
  type ClinicalCloseBaseParameters
} from './ClinicalCloseBaseParameters.js';
import type { ClinicalAutoCloseBaseEstimate } from './ClinicalAutoCloseBaseEstimator.js';
import type {
  ClinicalCloseBaseState,
  CloseBaseInteractionMode,
  CloseBaseToolStatus
} from './ClinicalCloseBaseState.js';
import {
  DEFAULT_CLOSE_BASE_STATE
} from './ClinicalCloseBaseState.js';
import type { CloseBaseValidationReport } from './ClinicalCloseBaseValidation.js';
import { ClinicalCloseBaseWorkflow } from './ClinicalCloseBaseWorkflow.js';
import type { CloseBaseWorkflowPhase } from './ClinicalCloseBaseWorkflow.js';

export class ClinicalCloseBaseSession {
  private readonly workflow = new ClinicalCloseBaseWorkflow();
  private readonly lifecycle = new ClinicalCloseBaseLifecycle();
  private state: ClinicalCloseBaseState = DEFAULT_CLOSE_BASE_STATE;
  private readonly listeners = new Set<() => void>();

  public getState(): ClinicalCloseBaseState {
    return this.state;
  }

  public getWorkflow(): ClinicalCloseBaseWorkflow {
    return this.workflow;
  }

  public getLifecycle(): ClinicalCloseBaseLifecycle {
    return this.lifecycle;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public begin(input: {
    readonly objectId: ClinicalObjectId;
    readonly parameters: ClinicalCloseBaseParameters;
    readonly now: number;
  }): void {
    this.workflow.reset();
    this.lifecycle.reset();
    this.lifecycle.transition('created');
    this.lifecycle.transition('active');
    this.lifecycle.transition('previewing');
    this.workflow.transition('activating');
    this.workflow.transition('validating-case');
    this.workflow.transition('selecting-strategy');
    this.workflow.transition('configuring');
    this.workflow.transition('previewing');
    this.patch({
      phase: 'previewing',
      lifecycle: 'previewing',
      toolStatus: 'previewing',
      targetObjectId: input.objectId,
      parameters: input.parameters,
      previewActive: true,
      previewInvalidated: false,
      validationReport: undefined,
      kernelFingerprint: undefined,
      operationId: undefined,
      sessionStartedAt: input.now,
      previewStartedAt: input.now,
      interactionMode: 'auto',
      autoEstimate: undefined,
      statusMessage: 'Your trimmed model is ready — Auto Create Base or Adjust Manually'
    });
  }

  public setParameters(parameters: ClinicalCloseBaseParameters): void {
    this.workflow.transition('configuring');
    this.workflow.transition('previewing');
    this.patch({
      phase: 'previewing',
      parameters,
      previewActive: true,
      previewInvalidated: true,
      kernelFingerprint: undefined,
      operationId: undefined,
      toolStatus: 'previewing',
      statusMessage: 'Preview updated — document unchanged'
    });
  }

  public setValidationReport(report: CloseBaseValidationReport, failed: boolean): void {
    this.workflow.transition('validating');
    this.patch({
      phase: failed ? this.workflow.getPhase() : 'validating',
      validationReport: report,
      toolStatus: failed ? 'validating' : 'validating',
      statusMessage: report.passed ? 'Validation passed' : 'Validation failed'
    });
  }

  public markSubmitting(): void {
    this.workflow.transition('submitting');
    this.lifecycle.transition('processing');
    this.patch({
      phase: 'submitting',
      lifecycle: 'processing',
      toolStatus: 'processing',
      statusMessage: 'Starting Close Base operation'
    });
  }

  public markExecuting(fingerprint: string | undefined, operationId: string): void {
    this.workflow.transition('executing');
    this.patch({
      phase: 'executing',
      kernelFingerprint: fingerprint,
      operationId,
      toolStatus: 'processing',
      previewInvalidated: false,
      statusMessage: 'Executing Close Base via Operation Runtime'
    });
  }

  public markProgress(input: {
    readonly completed: number;
    readonly total: number;
    readonly message: string | undefined;
  }): void {
    this.patch({
      progressCompleted: input.completed,
      progressTotal: input.total,
      progressMessage: input.message
    });
  }

  public markCommitting(): void {
    this.workflow.transition('committing');
    this.lifecycle.transition('committing');
    this.patch({
      phase: 'committing',
      lifecycle: 'committing',
      toolStatus: 'processing',
      statusMessage: 'Committing Close Base'
    });
  }

  public markCompleted(): void {
    this.workflow.transition('completed');
    this.lifecycle.transition('completed');
    this.patch({
      phase: 'completed',
      lifecycle: 'completed',
      toolStatus: 'committed',
      previewActive: false,
      previewInvalidated: false,
      statusMessage: 'Close Base committed'
    });
  }

  /**
   * After accept, stay in Close Base for another arch / parameter edit.
   */
  public continueAfterCommit(input: {
    readonly objectId: ClinicalObjectId;
    readonly parameters: ClinicalCloseBaseParameters;
    readonly now: number;
  }): void {
    this.workflow.reset();
    this.lifecycle.reset();
    this.lifecycle.transition('created');
    this.lifecycle.transition('active');
    this.lifecycle.transition('previewing');
    this.workflow.transition('activating');
    this.workflow.transition('validating-case');
    this.workflow.transition('selecting-strategy');
    this.workflow.transition('configuring');
    this.workflow.transition('previewing');
    this.patch({
      phase: 'previewing',
      lifecycle: 'previewing',
      toolStatus: 'previewing',
      targetObjectId: input.objectId,
      parameters: input.parameters,
      previewActive: true,
      previewInvalidated: true,
      validationReport: undefined,
      kernelFingerprint: undefined,
      operationId: undefined,
      sessionStartedAt: input.now,
      previewStartedAt: input.now,
      interactionMode: 'manual',
      autoEstimate: undefined,
      statusMessage: 'Base accepted — adjust parameters or switch arch'
    });
  }

  public retarget(objectId: ClinicalObjectId): void {
    this.workflow.transition('previewing');
    this.patch({
      phase: 'previewing',
      targetObjectId: objectId,
      previewActive: true,
      previewInvalidated: true,
      kernelFingerprint: undefined,
      operationId: undefined,
      validationReport: undefined,
      toolStatus: 'previewing',
      statusMessage: 'Arch switched — preview the base'
    });
  }

  public setStatusMessage(message: string): void {
    this.patch({ statusMessage: message, progressMessage: undefined });
  }

  public setInteractionMode(mode: CloseBaseInteractionMode): void {
    this.patch({
      interactionMode: mode,
      statusMessage:
        mode === 'manual'
          ? 'Manual Close Base — adjust parameters, then Preview'
          : 'Auto Close Base — one-click create'
    });
  }

  public setAutoEstimate(estimate: ClinicalAutoCloseBaseEstimate | undefined): void {
    this.patch({
      autoEstimate: estimate,
      ...(estimate === undefined
        ? {}
        : {
            statusMessage: estimate.message,
            parameters: estimate.parameters
          })
    });
  }

  public setProgress(input: {
    readonly message: string;
    readonly completed: number;
    readonly total: number;
  }): void {
    this.patch({
      progressMessage: input.message,
      progressCompleted: input.completed,
      progressTotal: input.total,
      toolStatus: 'processing',
      statusMessage: input.message
    });
  }

  public markPreviewReady(fingerprint: string | undefined, operationId: string): void {
    this.workflow.transition('previewing');
    this.lifecycle.transition('previewing');
    this.patch({
      phase: 'previewing',
      lifecycle: 'previewing',
      kernelFingerprint: fingerprint,
      operationId,
      previewActive: true,
      previewInvalidated: false,
      toolStatus: 'previewing',
      progressMessage: undefined,
      statusMessage:
        this.state.interactionMode === 'auto'
          ? 'Auto Base Preview — Accept, Adjust, or Cancel'
          : 'Preview ready — Accept to commit'
    });
  }

  public markCancelled(): void {
    this.workflow.cancel();
    this.lifecycle.transition('cancelled');
    this.patch({
      phase: 'cancelled',
      lifecycle: 'cancelled',
      toolStatus: 'cancelled',
      previewActive: false,
      statusMessage: 'Close Base cancelled'
    });
  }

  public markFailed(message: string): void {
    this.workflow.transition('failed');
    this.lifecycle.transition('failed');
    this.patch({
      phase: 'failed',
      lifecycle: 'failed',
      toolStatus: 'failed',
      previewActive: true,
      statusMessage: message
    });
  }

  public setToolStatus(status: CloseBaseToolStatus): void {
    this.patch({ toolStatus: status });
  }

  public setPhase(phase: CloseBaseWorkflowPhase, statusMessage?: string): void {
    this.workflow.transition(phase);
    this.patch({
      phase,
      ...(statusMessage === undefined ? {} : { statusMessage })
    });
  }

  public setLifecycle(phase: CloseBaseSessionLifecycle): void {
    this.lifecycle.transition(phase);
    this.patch({ lifecycle: this.lifecycle.getPhase() });
  }

  public resetParameters(): void {
    this.setParameters(sanitizeCloseBaseParameters({}, DEFAULT_CLOSE_BASE_PARAMETERS));
    this.patch({ statusMessage: 'Parameters reset — preview only' });
  }

  public clear(): void {
    this.workflow.reset();
    this.lifecycle.reset();
    this.state = Object.freeze({
      ...DEFAULT_CLOSE_BASE_STATE,
      revision: this.state.revision + 1
    });
    this.emit();
  }

  private patch(partial: Partial<ClinicalCloseBaseState>): void {
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
