/**
 * ClinicalCloseBaseState — immutable close-base session snapshot.
 */

import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import type { CloseBaseSessionLifecycle } from './ClinicalCloseBaseLifecycle.js';
import type { ClinicalCloseBaseParameters } from './ClinicalCloseBaseParameters.js';
import { DEFAULT_CLOSE_BASE_PARAMETERS } from './ClinicalCloseBaseParameters.js';
import type { CloseBaseValidationReport } from './ClinicalCloseBaseValidation.js';
import type { CloseBaseWorkflowPhase } from './ClinicalCloseBaseWorkflow.js';

export type CloseBaseToolStatus =
  | 'not-ready'
  | 'ready'
  | 'previewing'
  | 'validating'
  | 'processing'
  | 'committed'
  | 'cancelled'
  | 'failed';

export interface ClinicalCloseBaseState {
  readonly phase: CloseBaseWorkflowPhase;
  readonly lifecycle: CloseBaseSessionLifecycle;
  readonly toolStatus: CloseBaseToolStatus;
  readonly targetObjectId: ClinicalObjectId | undefined;
  readonly parameters: ClinicalCloseBaseParameters;
  readonly validationReport: CloseBaseValidationReport | undefined;
  readonly previewActive: boolean;
  readonly previewInvalidated: boolean;
  readonly kernelFingerprint: string | undefined;
  readonly operationId: string | undefined;
  readonly progressMessage: string | undefined;
  readonly progressCompleted: number;
  readonly progressTotal: number;
  readonly statusMessage: string;
  readonly sessionStartedAt: number | undefined;
  readonly previewStartedAt: number | undefined;
  readonly revision: number;
}

export const DEFAULT_CLOSE_BASE_STATE: ClinicalCloseBaseState = Object.freeze({
  phase: 'idle',
  lifecycle: 'none',
  toolStatus: 'not-ready',
  targetObjectId: undefined,
  parameters: DEFAULT_CLOSE_BASE_PARAMETERS,
  validationReport: undefined,
  previewActive: false,
  previewInvalidated: false,
  kernelFingerprint: undefined,
  operationId: undefined,
  progressMessage: undefined,
  progressCompleted: 0,
  progressTotal: 1,
  statusMessage: 'Close Base idle',
  sessionStartedAt: undefined,
  previewStartedAt: undefined,
  revision: 0
});
