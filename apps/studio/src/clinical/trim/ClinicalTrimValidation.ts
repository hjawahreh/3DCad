/**
 * ClinicalTrimValidation — immutable boundary validation reports.
 */

import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import {
  MIN_BOUNDARY_POINTS,
  hasSelfIntersection,
  isClosedBoundary,
  type TrimBoundaryPoint
} from './ClinicalTrimBoundaryMath.js';

export type TrimValidationCheckId =
  | 'closed-boundary'
  | 'minimum-points'
  | 'self-intersection'
  | 'model-available'
  | 'preparation-stage'
  | 'kernel-available';

export interface TrimValidationCheckResult {
  readonly id: TrimValidationCheckId;
  readonly label: string;
  readonly passed: boolean;
  readonly message: string;
}

export interface TrimValidationReport {
  readonly passed: boolean;
  readonly checks: readonly TrimValidationCheckResult[];
  readonly validatedAt: number;
}

const freezeCheck = (check: TrimValidationCheckResult): TrimValidationCheckResult =>
  Object.freeze(check);

export class ClinicalTrimValidation {
  public validate(input: {
    readonly session: ClinicalSession;
    readonly preparation: ClinicalPreparationRuntime;
    readonly points: readonly TrimBoundaryPoint[];
    readonly closed: boolean;
    readonly targetObjectId: ClinicalObjectId | undefined;
    readonly kernelAvailable: boolean;
    readonly now: number;
  }): TrimValidationReport {
    const checks: TrimValidationCheckResult[] = [
      this.checkModelAvailable(input),
      this.checkPreparationStage(input),
      this.checkMinimumPoints(input),
      this.checkClosedBoundary(input),
      this.checkSelfIntersection(input),
      this.checkKernelAvailable(input)
    ];
    return Object.freeze({
      passed: checks.every((c) => c.passed),
      checks: Object.freeze(checks),
      validatedAt: input.now
    });
  }

  private checkModelAvailable(input: {
    readonly session: ClinicalSession;
    readonly targetObjectId: ClinicalObjectId | undefined;
  }): TrimValidationCheckResult {
    const doc = input.session.getPublicState().activeCase;
    const passed =
      doc !== undefined &&
      doc.objects.length > 0 &&
      input.targetObjectId !== undefined &&
      doc.objects.some((o) => o.id === input.targetObjectId);
    return freezeCheck({
      id: 'model-available',
      label: 'Model availability',
      passed,
      message: passed ? 'Target model available' : 'Select a valid target model'
    });
  }

  private checkPreparationStage(input: {
    readonly preparation: ClinicalPreparationRuntime;
  }): TrimValidationCheckResult {
    const stage = input.preparation.session.getState().currentStage;
    const passed =
      input.preparation.isReadyForGeometry() ||
      stage === 'ready-for-trim' ||
      stage === 'preparation-complete';
    return freezeCheck({
      id: 'preparation-stage',
      label: 'Active preparation stage',
      passed,
      message: passed
        ? `Stage ${stage} allows trim`
        : "Preparation can't continue yet. Complete orientation and preparation first."
    });
  }

  private checkMinimumPoints(input: {
    readonly points: readonly TrimBoundaryPoint[];
  }): TrimValidationCheckResult {
    const passed = input.points.length >= MIN_BOUNDARY_POINTS;
    return freezeCheck({
      id: 'minimum-points',
      label: 'Minimum point count',
      passed,
      message: passed
        ? `${String(input.points.length)} points`
        : `Add at least ${String(MIN_BOUNDARY_POINTS)} points.`
    });
  }

  private checkClosedBoundary(input: {
    readonly points: readonly TrimBoundaryPoint[];
    readonly closed: boolean;
  }): TrimValidationCheckResult {
    const passed = input.closed || isClosedBoundary(input.points);
    return freezeCheck({
      id: 'closed-boundary',
      label: 'Closed boundary',
      passed,
      message: passed
        ? 'Boundary is closed'
        : 'Close the trim boundary around the area you want to keep.'
    });
  }

  private checkSelfIntersection(input: {
    readonly points: readonly TrimBoundaryPoint[];
  }): TrimValidationCheckResult {
    const passed = !hasSelfIntersection(input.points);
    return freezeCheck({
      id: 'self-intersection',
      label: 'Boundary self-intersection',
      passed,
      message: passed ? 'No self-intersection' : 'Boundary intersects itself.'
    });
  }

  private checkKernelAvailable(input: {
    readonly kernelAvailable: boolean;
  }): TrimValidationCheckResult {
    return freezeCheck({
      id: 'kernel-available',
      label: 'Kernel availability',
      passed: input.kernelAvailable,
      message: input.kernelAvailable
        ? 'Geometry pipeline available'
        : 'Kernel pipeline unavailable'
    });
  }
}
