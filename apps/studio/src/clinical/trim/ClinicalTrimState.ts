/**
 * ClinicalTrimState — immutable trim session snapshot.
 */

import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import type { TrimBoundaryPoint } from './ClinicalTrimBoundaryMath.js';
import type { TrimValidationReport } from './ClinicalTrimValidation.js';
import type { TrimWorkflowPhase } from './ClinicalTrimWorkflow.js';
import type { TrimSessionLifecycle } from './ClinicalTrimLifecycle.js';

/**
 * CLN-WORKSTATION-001 clinical draw modes.
 * freehand/polyline kept as aliases for older call sites (lasso/curve).
 */
export type TrimDrawMode =
  | 'idle'
  | 'lasso'
  | 'curve'
  | 'plane'
  | 'freehand'
  | 'polyline';

export const isStrokeTrimMode = (mode: TrimDrawMode): boolean =>
  mode === 'lasso' ||
  mode === 'curve' ||
  mode === 'freehand' ||
  mode === 'polyline';

export const isLassoLikeTrimMode = (mode: TrimDrawMode): boolean =>
  mode === 'lasso' || mode === 'curve' || mode === 'freehand';

export const normalizeTrimDrawMode = (mode: TrimDrawMode): TrimDrawMode => {
  if (mode === 'freehand') return 'lasso';
  if (mode === 'polyline') return 'curve';
  return mode;
};

export interface ClinicalTrimState {
  readonly phase: TrimWorkflowPhase;
  readonly lifecycle: TrimSessionLifecycle;
  readonly drawMode: TrimDrawMode;
  readonly targetObjectId: ClinicalObjectId | undefined;
  readonly points: readonly TrimBoundaryPoint[];
  readonly closed: boolean;
  readonly hoveredPointIndex: number | undefined;
  readonly activePointIndex: number | undefined;
  readonly previewCursor: TrimBoundaryPoint | undefined;
  readonly validationReport: TrimValidationReport | undefined;
  readonly previewActive: boolean;
  readonly pointerCaptured: boolean;
  readonly lastHitSummary: string | undefined;
  readonly kernelFingerprint: string | undefined;
  readonly operationId: string | undefined;
  readonly statusMessage: string;
  readonly sessionStartedAt: number | undefined;
  readonly revision: number;
}

export const DEFAULT_TRIM_STATE: ClinicalTrimState = Object.freeze({
  phase: 'idle',
  lifecycle: 'none',
  drawMode: 'idle',
  targetObjectId: undefined,
  points: Object.freeze([]),
  closed: false,
  hoveredPointIndex: undefined,
  activePointIndex: undefined,
  previewCursor: undefined,
  validationReport: undefined,
  previewActive: false,
  pointerCaptured: false,
  lastHitSummary: undefined,
  kernelFingerprint: undefined,
  operationId: undefined,
  statusMessage: 'Trim idle',
  sessionStartedAt: undefined,
  revision: 0
});
