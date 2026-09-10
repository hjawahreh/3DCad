/**
 * ClinicalPreparationState — immutable preparation workflow snapshot.
 */

import type { ClinicalPreparationStage } from './ClinicalPreparationStage.js';
import type { PreparationSessionLifecycle } from './ClinicalPreparationLifecycle.js';
import type { PreparationOrchestrationToolId } from './ClinicalPreparationPipeline.js';
import type { ClinicalValidationReport } from './ClinicalPreparationValidator.js';
import type { PreparationWorkflowPhase } from './ClinicalPreparationWorkflow.js';

export interface ClinicalPreparationState {
  readonly workflowPhase: PreparationWorkflowPhase;
  readonly sessionLifecycle: PreparationSessionLifecycle;
  readonly currentStage: ClinicalPreparationStage;
  readonly completedStages: readonly ClinicalPreparationStage[];
  readonly selectedTool: PreparationOrchestrationToolId | undefined;
  readonly activeTool: PreparationOrchestrationToolId | undefined;
  readonly validationReport: ClinicalValidationReport | undefined;
  readonly orientationValidated: boolean;
  readonly sessionStartedAt: number | undefined;
  readonly sessionCompletedAt: number | undefined;
  readonly statusMessage: string;
  readonly nextStep: string;
  readonly revision: number;
}

export const DEFAULT_PREPARATION_STATE: ClinicalPreparationState = Object.freeze({
  workflowPhase: 'idle',
  sessionLifecycle: 'none',
  currentStage: 'orientation-complete',
  completedStages: Object.freeze([]),
  selectedTool: undefined,
  activeTool: undefined,
  validationReport: undefined,
  orientationValidated: false,
  sessionStartedAt: undefined,
  sessionCompletedAt: undefined,
  statusMessage: 'Preparation idle',
  nextStep: 'Start preparation when case is ready',
  revision: 0
});
