/**
 * ClinicalPreparationEvents — preparation workflow event bus.
 */

import type { ClinicalPreparationStage } from './ClinicalPreparationStage.js';
import type { PreparationOrchestrationToolId } from './ClinicalPreparationPipeline.js';
import type { PreparationSessionLifecycle } from './ClinicalPreparationLifecycle.js';
import type { PreparationWorkflowPhase } from './ClinicalPreparationWorkflow.js';
import type { ClinicalValidationReport } from './ClinicalPreparationValidator.js';

export type ClinicalPreparationEvent =
  | { readonly type: 'workflow'; readonly phase: PreparationWorkflowPhase; readonly at: number }
  | { readonly type: 'lifecycle'; readonly phase: PreparationSessionLifecycle; readonly at: number }
  | { readonly type: 'stage'; readonly stage: ClinicalPreparationStage; readonly at: number }
  | { readonly type: 'validation'; readonly report: ClinicalValidationReport; readonly at: number }
  | {
      readonly type: 'tool';
      readonly action: 'select' | 'activate' | 'deactivate';
      readonly toolId: PreparationOrchestrationToolId;
      readonly at: number;
    }
  | { readonly type: 'session'; readonly action: 'create' | 'suspend' | 'resume' | 'cancel' | 'complete'; readonly at: number };

export class ClinicalPreparationEvents {
  private readonly listeners = new Set<(event: ClinicalPreparationEvent) => void>();

  public subscribe(listener: (event: ClinicalPreparationEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(event: ClinicalPreparationEvent): void {
    const frozen = Object.freeze(event);
    for (const listener of this.listeners) {
      listener(frozen);
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}
