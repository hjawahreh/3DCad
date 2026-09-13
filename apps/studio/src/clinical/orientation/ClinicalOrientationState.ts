/**
 * ClinicalOrientationState — immutable orientation session snapshot.
 */

import { IDENTITY_MAT4 } from '@cad-studio/scene';
import type { ClinicalObjectId, ClinicalTransform } from '../import/ClinicalMeshDescriptor.js';
import type { OrientationConfidence } from './ClinicalAutoOrientationEstimator.js';

export type OrientationPhase =
  | 'idle'
  | 'entering'
  | 'active'
  | 'previewing'
  | 'committing'
  | 'completed'
  | 'cancelled';

export type OrientationMode =
  | 'free'
  | 'axis-x'
  | 'axis-y'
  | 'axis-z'
  | 'incremental'
  | 'snap'
  | 'auto';

export type OrientationIncrement = 1 | 5 | 15;

export type OrientationAxis = 'x' | 'y' | 'z' | 'free';

export type OrientationHandle = 'x' | 'y' | 'z' | 'free' | 'pivot';

export type OrientationOrigin = 'auto' | 'manual' | 'none';

export interface ClinicalOrientationState {
  readonly phase: OrientationPhase;
  readonly mode: OrientationMode;
  readonly targetObjectId: ClinicalObjectId | undefined;
  readonly baseline: ClinicalTransform;
  readonly preview: ClinicalTransform;
  /** When true, preview transform applies to every case object (bite-preserving). */
  readonly caseLevel: boolean;
  readonly objectBaselines: Readonly<Record<string, ClinicalTransform>>;
  readonly orientationOrigin: OrientationOrigin;
  readonly confidence: OrientationConfidence | undefined;
  readonly autoMessage: string | undefined;
  readonly incrementDegrees: OrientationIncrement;
  readonly activeAxis: OrientationAxis;
  readonly hoveredHandle: OrientationHandle | undefined;
  readonly activeHandle: OrientationHandle | undefined;
  readonly snapPreview: boolean;
  readonly dirtyPreview: boolean;
  readonly statusMessage: string;
  readonly sessionStartedAt: number | undefined;
  readonly revision: number;
}

export const DEFAULT_ORIENTATION_STATE: ClinicalOrientationState = Object.freeze({
  phase: 'idle',
  mode: 'free',
  targetObjectId: undefined,
  baseline: IDENTITY_MAT4,
  preview: IDENTITY_MAT4,
  caseLevel: false,
  objectBaselines: Object.freeze({}),
  orientationOrigin: 'none',
  confidence: undefined,
  autoMessage: undefined,
  incrementDegrees: 5,
  activeAxis: 'free',
  hoveredHandle: undefined,
  activeHandle: undefined,
  snapPreview: false,
  dirtyPreview: false,
  statusMessage: 'Orientation idle',
  sessionStartedAt: undefined,
  revision: 0
});
