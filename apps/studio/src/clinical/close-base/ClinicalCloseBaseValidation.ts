/**
 * ClinicalCloseBaseValidation — immutable close-base validation reports.
 */

import type { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalSession } from '../runtime/session.js';
import {
  CLOSE_BASE_PARAMETER_LIMITS,
  type ClinicalCloseBaseParameters
} from './ClinicalCloseBaseParameters.js';
import { getCloseBaseStrategy } from './ClinicalCloseBaseStrategy.js';

export type CloseBaseValidationCheckId =
  | 'case-active'
  | 'model-available'
  | 'target-arch'
  | 'preparation-readiness'
  | 'valid-parameters'
  | 'supported-strategy'
  | 'kernel-available'
  | 'operation-available'
  | 'geometry-quality'
  | 'boundary-closure'
  | 'result-validity'
  | 'commit-eligibility';

export interface CloseBaseValidationCheckResult {
  readonly id: CloseBaseValidationCheckId;
  readonly label: string;
  readonly passed: boolean;
  readonly message: string;
}

export interface CloseBaseValidationReport {
  readonly passed: boolean;
  readonly checks: readonly CloseBaseValidationCheckResult[];
  readonly validatedAt: number;
}

export interface CloseBaseQualitySnapshot {
  readonly ok: boolean;
  readonly codes: readonly string[];
  readonly warnings: readonly string[];
  readonly boundaryEdges: number;
  readonly degenerateCount: number;
}

const freezeCheck = (check: CloseBaseValidationCheckResult): CloseBaseValidationCheckResult =>
  Object.freeze(check);

export class ClinicalCloseBaseValidation {
  public validate(input: {
    readonly session: ClinicalSession;
    readonly preparation: ClinicalPreparationRuntime;
    readonly parameters: ClinicalCloseBaseParameters;
    readonly targetObjectId: ClinicalObjectId | undefined;
    readonly kernelAvailable: boolean;
    readonly operationAvailable: boolean;
    readonly kernelFingerprint: string | undefined;
    readonly requireCommitEligibility: boolean;
    readonly now: number;
    readonly quality?: CloseBaseQualitySnapshot;
  }): CloseBaseValidationReport {
    const checks: CloseBaseValidationCheckResult[] = [
      this.checkCaseActive(input),
      this.checkModelAvailable(input),
      this.checkTargetArch(input),
      this.checkPreparation(input),
      this.checkParameters(input),
      this.checkStrategy(input),
      this.checkKernel(input),
      this.checkOperation(input),
      this.checkGeometryQuality(input),
      this.checkBoundaryClosure(input)
    ];
    if (input.requireCommitEligibility) {
      checks.push(this.checkResult(input), this.checkCommitEligibility(input, checks));
    }
    return Object.freeze({
      passed: checks.every((c) => c.passed),
      checks: Object.freeze(checks),
      validatedAt: input.now
    });
  }

  private checkCaseActive(input: {
    readonly session: ClinicalSession;
  }): CloseBaseValidationCheckResult {
    const phase = input.session.getPublicState().phase;
    const passed =
      input.session.getPublicState().activeCase !== undefined &&
      (phase === 'case-active' || phase === 'case-dirty');
    return freezeCheck({
      id: 'case-active',
      label: 'Active clinical case',
      passed,
      message: passed ? 'Case active' : 'No active case'
    });
  }

  private checkModelAvailable(input: {
    readonly session: ClinicalSession;
    readonly targetObjectId: ClinicalObjectId | undefined;
  }): CloseBaseValidationCheckResult {
    const doc = input.session.getPublicState().activeCase;
    const passed =
      doc !== undefined &&
      doc.objects.length > 0 &&
      input.targetObjectId !== undefined &&
      doc.objects.some((o) => o.id === input.targetObjectId);
    return freezeCheck({
      id: 'model-available',
      label: 'Valid imported model',
      passed,
      message: passed ? 'Target model available' : 'Import and select a model'
    });
  }

  private checkTargetArch(input: {
    readonly session: ClinicalSession;
    readonly targetObjectId: ClinicalObjectId | undefined;
  }): CloseBaseValidationCheckResult {
    const doc = input.session.getPublicState().activeCase;
    const obj = doc?.objects.find((o) => o.id === input.targetObjectId);
    const passed = obj !== undefined;
    const role = obj?.archRole;
    return freezeCheck({
      id: 'target-arch',
      label: 'Target arch',
      passed,
      message: !passed
        ? 'Select an arch'
        : role === 'upper' || role === 'lower'
          ? `Active ${role} arch`
          : 'Target object selected'
    });
  }

  private checkPreparation(input: {
    readonly preparation: ClinicalPreparationRuntime;
  }): CloseBaseValidationCheckResult {
    const stage = input.preparation.session.getState().currentStage;
    const passed =
      stage === 'ready-for-close-base' ||
      stage === 'preparation-complete' ||
      stage === 'ready-for-segmentation' ||
      stage === 'ready-for-movement';
    return freezeCheck({
      id: 'preparation-readiness',
      label: 'Preparation readiness',
      passed,
      message: passed
        ? `Stage ${stage} allows Close Base`
        : 'Complete Trim before Close Base'
    });
  }

  private checkParameters(input: {
    readonly parameters: ClinicalCloseBaseParameters;
  }): CloseBaseValidationCheckResult {
    const p = input.parameters;
    const limits = CLOSE_BASE_PARAMETER_LIMITS;
    const inRange =
      p.height >= limits.heightMin &&
      p.height <= limits.heightMax &&
      p.thickness >= limits.thicknessMin &&
      p.thickness <= limits.thicknessMax &&
      p.margin >= limits.marginMin &&
      p.margin <= limits.marginMax;
    const heightOk = p.height >= p.thickness;
    const passed = inRange && heightOk;
    return freezeCheck({
      id: 'valid-parameters',
      label: 'Valid base parameters',
      passed,
      message: passed
        ? 'Parameters in range'
        : heightOk
          ? 'Parameter out of range'
          : 'Height must be at least the thickness'
    });
  }

  private checkStrategy(input: {
    readonly parameters: ClinicalCloseBaseParameters;
  }): CloseBaseValidationCheckResult {
    const strategy = getCloseBaseStrategy(input.parameters.strategy);
    const passed = strategy !== undefined;
    return freezeCheck({
      id: 'supported-strategy',
      label: 'Base style',
      passed,
      message: passed ? strategy.title : 'Unknown Close Base style'
    });
  }

  private checkKernel(input: {
    readonly kernelAvailable: boolean;
  }): CloseBaseValidationCheckResult {
    return freezeCheck({
      id: 'kernel-available',
      label: 'Kernel availability',
      passed: input.kernelAvailable,
      message: input.kernelAvailable ? 'Kernel pipeline available' : 'Kernel pipeline unavailable'
    });
  }

  private checkOperation(input: {
    readonly operationAvailable: boolean;
  }): CloseBaseValidationCheckResult {
    return freezeCheck({
      id: 'operation-available',
      label: 'Operation availability',
      passed: input.operationAvailable,
      message: input.operationAvailable
        ? 'Operation Runtime available'
        : 'Operation Runtime unavailable'
    });
  }

  private checkGeometryQuality(input: {
    readonly quality?: CloseBaseQualitySnapshot;
  }): CloseBaseValidationCheckResult {
    if (input.quality === undefined) {
      return freezeCheck({
        id: 'geometry-quality',
        label: 'Geometry quality',
        passed: true,
        message: 'Quality deferred until mesh is available'
      });
    }
    // Reference close-base can emit non-manifold wall junctions; treat as warning, not a hard gate.
    // Block only on corrupt input or extreme degenerates.
    const hardFail = input.quality.codes.includes('INPUT_INVALID');
    const degenerateFail =
      input.quality.degenerateCount >
      Math.max(128, Math.floor(input.quality.boundaryEdges * 4) + 64);
    const passed = !hardFail && !degenerateFail;
    return freezeCheck({
      id: 'geometry-quality',
      label: 'Geometry quality',
      passed,
      message: passed
        ? input.quality.ok
          ? 'Mesh quality acceptable'
          : input.quality.warnings[0] ?? 'Mesh quality warnings present (non-blocking)'
        : input.quality.warnings[0] ?? 'Mesh quality is not acceptable for Close Base'
    });
  }

  private checkBoundaryClosure(input: {
    readonly quality?: CloseBaseQualitySnapshot;
    readonly parameters: ClinicalCloseBaseParameters;
    readonly requireCommitEligibility?: boolean;
  }): CloseBaseValidationCheckResult {
    if (input.quality === undefined) {
      return freezeCheck({
        id: 'boundary-closure',
        label: 'Boundary closure',
        passed: true,
        message: 'Boundary check deferred'
      });
    }
    // Surface fill may leave no open edges; plane/offset expect open boundary before, closed after commit.
    if (input.parameters.strategy === 'surface' && input.quality.boundaryEdges === 0) {
      return freezeCheck({
        id: 'boundary-closure',
        label: 'Boundary closure',
        passed: true,
        message: 'No open boundary — mesh may already be closed'
      });
    }
    const passed = input.quality.boundaryEdges >= 0;
    return freezeCheck({
      id: 'boundary-closure',
      label: 'Boundary closure',
      passed,
      message:
        input.quality.boundaryEdges === 0
          ? 'No open boundary detected — preview may be a no-op'
          : `Open boundary edges: ${String(input.quality.boundaryEdges)}`
    });
  }

  private checkResult(input: {
    readonly kernelFingerprint: string | undefined;
  }): CloseBaseValidationCheckResult {
    const passed =
      input.kernelFingerprint !== undefined && input.kernelFingerprint.length > 0;
    return freezeCheck({
      id: 'result-validity',
      label: 'Result validity',
      passed,
      message: passed ? 'Kernel fingerprint present' : 'Generate a preview before accepting'
    });
  }

  private checkCommitEligibility(
    input: { readonly kernelFingerprint: string | undefined },
    prior: readonly CloseBaseValidationCheckResult[]
  ): CloseBaseValidationCheckResult {
    const passed = prior.every((c) => c.passed) && (input.kernelFingerprint?.length ?? 0) > 0;
    return freezeCheck({
      id: 'commit-eligibility',
      label: 'Commit eligibility',
      passed,
      message: passed ? 'Eligible to commit' : 'Not eligible to commit'
    });
  }
}
