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
  | 'preparation-readiness'
  | 'valid-parameters'
  | 'supported-strategy'
  | 'kernel-available'
  | 'operation-available'
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
  }): CloseBaseValidationReport {
    const checks: CloseBaseValidationCheckResult[] = [
      this.checkCaseActive(input),
      this.checkModelAvailable(input),
      this.checkPreparation(input),
      this.checkParameters(input),
      this.checkStrategy(input),
      this.checkKernel(input),
      this.checkOperation(input)
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

  private checkPreparation(input: {
    readonly preparation: ClinicalPreparationRuntime;
  }): CloseBaseValidationCheckResult {
    const stage = input.preparation.session.getState().currentStage;
    const passed =
      input.preparation.isReadyForGeometry() ||
      stage === 'ready-for-close-base' ||
      stage === 'preparation-complete';
    return freezeCheck({
      id: 'preparation-readiness',
      label: 'Preparation readiness',
      passed,
      message: passed
        ? `Stage ${stage} allows Close Base`
        : 'Advance preparation to Ready For Close Base'
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
          : 'Height must be greater than or equal to thickness'
    });
  }

  private checkStrategy(input: {
    readonly parameters: ClinicalCloseBaseParameters;
  }): CloseBaseValidationCheckResult {
    const strategy = getCloseBaseStrategy(input.parameters.strategy);
    const passed = strategy !== undefined;
    return freezeCheck({
      id: 'supported-strategy',
      label: 'Supported strategy',
      passed,
      message: passed
        ? `${strategy.title} → ${strategy.family}.${strategy.geometryOperation}`
        : 'Unknown Close Base strategy'
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

  private checkResult(input: {
    readonly kernelFingerprint: string | undefined;
  }): CloseBaseValidationCheckResult {
    const passed =
      input.kernelFingerprint !== undefined && input.kernelFingerprint.length > 0;
    return freezeCheck({
      id: 'result-validity',
      label: 'Result validity',
      passed,
      message: passed ? 'Kernel fingerprint present' : 'No validated kernel result'
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
