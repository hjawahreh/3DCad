/**
 * ClinicalPreparationDiagnostics + ClinicalPreparationMetrics.
 */

import type { ClinicalPreparationStage } from './ClinicalPreparationStage.js';
import type { PreparationOrchestrationToolId } from './ClinicalPreparationPipeline.js';

export class ClinicalPreparationDiagnostics {
  private readonly logs: Array<{
    readonly id: string;
    readonly severity: 'info' | 'warning' | 'error';
    readonly message: string;
    readonly at: number;
  }> = [];
  private serial = 0;
  private sessions = 0;
  private stageTransitions = 0;
  private validationFailures = 0;
  private cancelledSessions = 0;
  private toolActivations = 0;
  private totalWorkflowMs = 0;
  private workflowSamples = 0;

  public record(severity: 'info' | 'warning' | 'error', message: string, at = Date.now()): void {
    this.serial += 1;
    this.logs.push(Object.freeze({ id: `prep-${String(this.serial)}`, severity, message, at }));
    if (this.logs.length > 200) {
      this.logs.shift();
    }
  }

  public recordSessionStart(): void {
    this.sessions += 1;
    this.record('info', 'Preparation session started');
  }

  public recordStageTransition(stage: ClinicalPreparationStage): void {
    this.stageTransitions += 1;
    this.record('info', `Stage transition → ${stage}`);
  }

  public recordValidationFailure(message: string): void {
    this.validationFailures += 1;
    this.record('warning', message);
  }

  public recordCancelled(): void {
    this.cancelledSessions += 1;
    this.record('info', 'Preparation session cancelled');
  }

  public recordToolActivation(toolId: PreparationOrchestrationToolId): void {
    this.toolActivations += 1;
    this.record('info', `Tool activation orchestrated: ${toolId}`);
  }

  public recordWorkflowComplete(durationMs: number): void {
    this.totalWorkflowMs += durationMs;
    this.workflowSamples += 1;
    this.record('info', `Preparation workflow complete (${durationMs.toFixed(0)}ms)`);
  }

  public snapshot() {
    return Object.freeze({
      logs: Object.freeze([...this.logs]),
      sessions: this.sessions,
      stageTransitions: this.stageTransitions,
      validationFailures: this.validationFailures,
      cancelledSessions: this.cancelledSessions,
      toolActivations: this.toolActivations,
      averageWorkflowDurationMs:
        this.workflowSamples === 0 ? 0 : this.totalWorkflowMs / this.workflowSamples
    });
  }
}

export class ClinicalPreparationMetrics {
  private preparationCount = 0;
  private totalDurationMs = 0;
  private durationSamples = 0;
  private validationSuccess = 0;
  private validationFailure = 0;
  private stageCompletions = new Map<string, number>();

  public recordPreparationComplete(durationMs: number): void {
    this.preparationCount += 1;
    this.totalDurationMs += durationMs;
    this.durationSamples += 1;
  }

  public recordValidationSuccess(): void {
    this.validationSuccess += 1;
  }

  public recordValidationFailure(): void {
    this.validationFailure += 1;
  }

  public recordStageCompletion(stage: ClinicalPreparationStage): void {
    this.stageCompletions.set(stage, (this.stageCompletions.get(stage) ?? 0) + 1);
  }

  public snapshot() {
    return Object.freeze({
      preparationCount: this.preparationCount,
      averageDurationMs:
        this.durationSamples === 0 ? 0 : this.totalDurationMs / this.durationSamples,
      validationSuccess: this.validationSuccess,
      validationFailure: this.validationFailure,
      stageCompletions: Object.freeze(Object.fromEntries(this.stageCompletions))
    });
  }
}
