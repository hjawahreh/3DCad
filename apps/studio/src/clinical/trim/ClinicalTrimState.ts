/**
 * ClinicalTrimState — immutable trim session snapshot.
 */

import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import type { TrimBoundaryPoint } from './ClinicalTrimBoundaryMath.js';
import type { TrimValidationReport } from './ClinicalTrimValidation.js';
import type { TrimWorkflowPhase } from './ClinicalTrimWorkflow.js';
import type { TrimSessionLifecycle } from './ClinicalTrimLifecycle.js';

export type TrimDrawMode = 'freehand' | 'polyline';

export interface ClinicalTrimState {
  readonly phase: TrimWorkflowPhase;
  readonly lifecycle: TrimSessionLifecycle;
  readonly drawMode: TrimDrawMode;
  readonly targetObjectId: ClinicalObjectId | undefined;
  readonly points: readonly TrimBoundaryPoint[];
  readonly closed: boolean;
  readonly hoveredPointIndex: number | undefined;
  readonly activePointIndex: number | undefined;
  readonly validationReport: TrimValidationReport | undefined;
  readonly previewActive: boolean;
  readonly kernelFingerprint: string | undefined;
  readonly operationId: string | undefined;
  readonly statusMessage: string;
  readonly sessionStartedAt: number | undefined;
  readonly revision: number;
}

export const DEFAULT_TRIM_STATE: ClinicalTrimState = Object.freeze({
  phase: 'idle',
  lifecycle: 'none',
  drawMode: 'polyline',
  targetObjectId: undefined,
  points: Object.freeze([]),
  closed: false,
  hoveredPointIndex: undefined,
  activePointIndex: undefined,
  validationReport: undefined,
  previewActive: false,
  kernelFingerprint: undefined,
  operationId: undefined,
  statusMessage: 'Trim idle',
  sessionStartedAt: undefined,
  revision: 0
});
