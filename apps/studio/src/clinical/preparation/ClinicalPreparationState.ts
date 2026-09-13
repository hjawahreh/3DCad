/**
 * ClinicalPreparationState — immutable preparation workflow snapshot.
 */

import type { ClinicalPreparationStage } from './ClinicalPreparationStage.js';
import type { PreparationSessionLifecycle } from './ClinicalPreparationLifecycle.js';
import type { PreparationOrchestrationToolId } from './ClinicalPreparationPipeline.js';
import type { ClinicalValidationReport } from './ClinicalPreparationValidator.js';
import type { PreparationWorkflowPhase } from './ClinicalPreparationWorkflow.js';
import type {
  AutoPreparationUiState,
  AutoPreparationStep,
  ClinicalAutoPreparationReport
} from './ClinicalAutoPreparationRunner.js';

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
  /** Auto-preparation UI state (clinical wording). */
  readonly autoUiState: AutoPreparationUiState;
  readonly autoSteps: readonly AutoPreparationStep[];
  readonly autoReport: ClinicalAutoPreparationReport | undefined;
  /** Bound preparation session identity (no mesh payloads). */
  readonly sessionId: string | undefined;
  readonly caseId: string | undefined;
  readonly geometryRevision: number | undefined;
  readonly geometryFingerprint: string | undefined;
  readonly archMode: 'upper' | 'lower' | 'both' | undefined;
  /** Dev/test structured failure (user-facing message stays in statusMessage). */
  readonly lastFailure: ClinicalPreparationFailure | undefined;
}

export interface ClinicalPreparationFailure {
  readonly stage: string;
  readonly reason: string;
  readonly caseId: string | undefined;
  readonly arch: string | undefined;
  readonly geometryRevision: number | undefined;
  readonly at: number;
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
  revision: 0,
  autoUiState: 'not-started',
  autoSteps: Object.freeze([]),
  autoReport: undefined,
  sessionId: undefined,
  caseId: undefined,
  geometryRevision: undefined,
  geometryFingerprint: undefined,
  archMode: undefined,
  lastFailure: undefined
});
