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
  | 'finite-values'
  | 'boundary-area'
  | 'target-surface'
  | 'target-arch'
  | 'model-available'
  | 'preparation-stage'
  | 'kernel-available'
  | 'projection-validity';

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

const polygonScreenArea = (points: readonly TrimBoundaryPoint[]): number => {
  if (points.length < 3) {
    return 0;
  }
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += (points[j]!.x + points[i]!.x) * (points[j]!.y - points[i]!.y);
  }
  return Math.abs(area * 0.5);
};

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
      this.checkTargetArch(input),
      this.checkPreparationStage(input),
      this.checkFiniteValues(input),
      this.checkMinimumPoints(input),
      this.checkClosedBoundary(input),
      this.checkSelfIntersection(input),
      this.checkBoundaryArea(input),
      this.checkTargetSurface(input),
      this.checkProjectionValidity(input),
      this.checkKernelAvailable(input)
    ];
    return Object.freeze({
      passed: checks.every((c) => c.passed),
      checks: Object.freeze(checks),
      validatedAt: input.now
    });
  }

  /**
   * Live checks while drawing — only obvious failures (no kernel / prep spam).
   */
  public validateLive(input: {
    readonly session: ClinicalSession;
    readonly points: readonly TrimBoundaryPoint[];
    readonly closed: boolean;
    readonly targetObjectId: ClinicalObjectId | undefined;
    readonly now: number;
  }): TrimValidationReport {
    const checks: TrimValidationCheckResult[] = [
      this.checkFiniteValues(input),
      this.checkSelfIntersection(input)
    ];
    if (input.closed || input.points.length >= MIN_BOUNDARY_POINTS) {
      checks.push(this.checkMinimumPoints(input));
      checks.push(this.checkClosedBoundary(input));
      checks.push(this.checkBoundaryArea(input));
      checks.push(this.checkTargetSurface(input));
      checks.push(this.checkProjectionValidity(input));
      checks.push(this.checkTargetArch(input));
    }
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

  private checkTargetArch(input: {
    readonly session: ClinicalSession;
    readonly targetObjectId: ClinicalObjectId | undefined;
  }): TrimValidationCheckResult {
    const doc = input.session.getPublicState().activeCase;
    const obj = doc?.objects.find((o) => o.id === input.targetObjectId);
    const passed = obj !== undefined;
    const role = obj?.archRole;
    return freezeCheck({
      id: 'target-arch',
      label: 'Target arch',
      passed,
      message: !passed
        ? 'Select an arch to trim'
        : role === 'upper' || role === 'lower'
          ? `Active ${role} arch`
          : 'Target object selected'
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
        ? 'Preparation confirmed for Trim'
        : 'Preparation is not ready for Trim.'
    });
  }

  private checkFiniteValues(input: {
    readonly points: readonly TrimBoundaryPoint[];
  }): TrimValidationCheckResult {
    const passed = input.points.every(
      (p) =>
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        (p.meshX === undefined || Number.isFinite(p.meshX)) &&
        (p.meshY === undefined || Number.isFinite(p.meshY))
    );
    return freezeCheck({
      id: 'finite-values',
      label: 'Finite coordinates',
      passed,
      message: passed ? 'Coordinates are finite' : 'Boundary contains invalid coordinates'
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
      message: passed ? `${String(input.points.length)} points` : 'Add at least 3 points.'
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
      message: passed ? 'Closed' : 'Close the boundary.'
    });
  }

  private checkSelfIntersection(input: {
    readonly points: readonly TrimBoundaryPoint[];
  }): TrimValidationCheckResult {
    // GEO-001C: screen-space self-intersection is not authoritative for curved
    // mesh-local SurfacePath loops. When local 3D samples exist, defer to Close/Preview
    // SurfacePath validation (still reject obvious screen crossings for screen-only strokes).
    const localCount = input.points.filter(
      (p) =>
        typeof p.localX === 'number' &&
        typeof p.localY === 'number' &&
        typeof p.localZ === 'number' &&
        Number.isFinite(p.localX) &&
        Number.isFinite(p.localY) &&
        Number.isFinite(p.localZ)
    ).length;
    // CLN-WORKSTATION-001: majority mesh-local samples → defer (densified SurfacePath
    // remaps screen x/y and can falsely trip screen-space crossing checks).
    const hasLocal3d = localCount > 0 && localCount >= Math.ceil(input.points.length * 0.75);
    const passed = hasLocal3d ? true : !hasSelfIntersection(input.points);
    return freezeCheck({
      id: 'self-intersection',
      label: 'Boundary self-intersection',
      passed,
      message: passed
        ? hasLocal3d
          ? 'Surface path self-intersection deferred to SurfacePath gate'
          : 'Boundary is valid.'
        : 'Trim boundary crosses itself. Adjust the drawing.'
    });
  }

  private checkBoundaryArea(input: {
    readonly points: readonly TrimBoundaryPoint[];
  }): TrimValidationCheckResult {
    if (input.points.length < MIN_BOUNDARY_POINTS) {
      return freezeCheck({
        id: 'boundary-area',
        label: 'Boundary area',
        passed: true,
        message: 'Area deferred'
      });
    }
    const area = polygonScreenArea(input.points);
    const passed = area >= 4;
    return freezeCheck({
      id: 'boundary-area',
      label: 'Boundary area',
      passed,
      message: passed ? 'Area OK' : 'Boundary area is too small.'
    });
  }

  private checkTargetSurface(input: {
    readonly points: readonly TrimBoundaryPoint[];
    readonly targetObjectId: ClinicalObjectId | undefined;
  }): TrimValidationCheckResult {
    if (input.points.length === 0) {
      return freezeCheck({
        id: 'target-surface',
        label: 'Target surface',
        passed: true,
        message: 'No points yet'
      });
    }
    const withSurface = input.points.filter(
      (p) => p.meshX !== undefined && p.meshY !== undefined
    );
    // Allow screen-space strokes (viewport projection) when surface picks are absent.
    if (withSurface.length === 0) {
      return freezeCheck({
        id: 'target-surface',
        label: 'Target surface',
        passed: true,
        message: 'Screen projection (no surface pick)'
      });
    }
    const onTarget =
      input.targetObjectId === undefined ||
      withSurface.every(
        (p) => p.objectId === undefined || p.objectId === (input.targetObjectId as string)
      );
    const ratio = withSurface.length / input.points.length;
    const passed = onTarget && ratio >= 0.5;
    return freezeCheck({
      id: 'target-surface',
      label: 'Target surface',
      passed,
      message: passed
        ? 'Boundary on active scan'
        : 'Boundary is outside the active scan.'
    });
  }

  private checkProjectionValidity(input: {
    readonly points: readonly TrimBoundaryPoint[];
  }): TrimValidationCheckResult {
    const passed = input.points.every((p) => {
      if (p.meshX !== undefined && p.meshY !== undefined) {
        return Number.isFinite(p.meshX) && Number.isFinite(p.meshY);
      }
      return Number.isFinite(p.x) && Number.isFinite(p.y);
    });
    return freezeCheck({
      id: 'projection-validity',
      label: 'Projection validity',
      passed,
      message: passed ? 'Projection valid' : 'Boundary projection is invalid'
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
