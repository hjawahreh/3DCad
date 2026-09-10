/**
 * ClinicalPreparationValidator — immutable validation results for preparation gates.
 */

import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalOrientationRuntime } from '../orientation/ClinicalOrientationRuntime.js';
import type { ClinicalViewportRuntime } from '../display/ClinicalViewportRuntime.js';
import type { PreparationOrchestrationToolId } from './ClinicalPreparationPipeline.js';
import type { ClinicalPreparationStage } from './ClinicalPreparationStage.js';

export type ValidationCheckId =
  | 'orientation-completed'
  | 'valid-document'
  | 'import-completed'
  | 'case-active'
  | 'viewport-active'
  | 'project-saved'
  | 'tool-compatibility'
  | 'preparation-readiness';

export interface ValidationCheckResult {
  readonly id: ValidationCheckId;
  readonly label: string;
  readonly passed: boolean;
  readonly message: string;
}

export interface ClinicalValidationReport {
  readonly passed: boolean;
  readonly checks: readonly ValidationCheckResult[];
  readonly validatedAt: number;
}

export interface ClinicalPreparationValidationInput {
  readonly session: ClinicalSession;
  readonly orientation: ClinicalOrientationRuntime;
  readonly viewport: ClinicalViewportRuntime;
  readonly orientationValidated: boolean;
  readonly stage?: ClinicalPreparationStage;
  readonly tool?: PreparationOrchestrationToolId;
  readonly requireSavedCase?: boolean;
  readonly now: number;
}

const freezeCheck = (check: ValidationCheckResult): ValidationCheckResult => Object.freeze(check);

export class ClinicalPreparationValidator {
  public validate(input: ClinicalPreparationValidationInput): ClinicalValidationReport {
    const checks: ValidationCheckResult[] = [
      this.checkCaseActive(input),
      this.checkValidDocument(input),
      this.checkImportCompleted(input),
      this.checkViewportActive(input),
      this.checkProjectSaved(input),
      this.checkOrientationCompleted(input),
      this.checkPreparationReadiness(input),
      ...(input.tool === undefined ? [] : [this.checkToolCompatibility(input)])
    ];
    const passed = checks.every((c) => c.passed);
    return Object.freeze({
      passed,
      checks: Object.freeze(checks),
      validatedAt: input.now
    });
  }

  private checkCaseActive(input: ClinicalPreparationValidationInput): ValidationCheckResult {
    const doc = input.session.getPublicState().activeCase;
    const phase = input.session.getPublicState().phase;
    const passed =
      doc !== undefined && (phase === 'case-active' || phase === 'case-dirty');
    return freezeCheck({
      id: 'case-active',
      label: 'Case active',
      passed,
      message: passed ? 'Active case loaded' : 'No active case'
    });
  }

  private checkValidDocument(input: ClinicalPreparationValidationInput): ValidationCheckResult {
    const doc = input.session.getPublicState().activeCase;
    const passed =
      doc !== undefined &&
      doc.caseMeta.name.length > 0 &&
      doc.patient.displayName.length > 0 &&
      doc.revision !== undefined;
    return freezeCheck({
      id: 'valid-document',
      label: 'Valid document',
      passed,
      message: passed ? 'Document structure valid' : 'Document missing required metadata'
    });
  }

  private checkImportCompleted(input: ClinicalPreparationValidationInput): ValidationCheckResult {
    const doc = input.session.getPublicState().activeCase;
    const passed = doc !== undefined && doc.objects.length > 0;
    return freezeCheck({
      id: 'import-completed',
      label: 'Import completed',
      passed,
      message: passed ? `${String(doc?.objects.length ?? 0)} model(s) imported` : 'Import a model first'
    });
  }

  private checkViewportActive(input: ClinicalPreparationValidationInput): ValidationCheckResult {
    const host = input.session.getHost();
    const viewportAttached = host.sessions.viewportSession !== undefined;
    const passed = viewportAttached && input.viewport.isReady();
    return freezeCheck({
      id: 'viewport-active',
      label: 'Viewport active',
      passed,
      message: passed ? 'Viewport session ready' : 'Viewport not attached'
    });
  }

  private checkProjectSaved(input: ClinicalPreparationValidationInput): ValidationCheckResult {
    if (input.requireSavedCase === false) {
      return freezeCheck({
        id: 'project-saved',
        label: 'Project saved state',
        passed: true,
        message: 'Save check deferred'
      });
    }
    const dirty = input.session.getPublicState().dirty === true;
    const passed = !dirty;
    return freezeCheck({
      id: 'project-saved',
      label: 'Project saved state',
      passed,
      message: passed ? 'Case is clean' : 'Save case before geometry tools'
    });
  }

  private checkOrientationCompleted(input: ClinicalPreparationValidationInput): ValidationCheckResult {
    const historyCount = input.orientation.history.snapshot().pushCount;
    const passed = input.orientationValidated || historyCount > 0;
    return freezeCheck({
      id: 'orientation-completed',
      label: 'Orientation completed',
      passed,
      message: passed
        ? 'Orientation validated'
        : 'Complete orientation before preparation'
    });
  }

  private checkPreparationReadiness(input: ClinicalPreparationValidationInput): ValidationCheckResult {
    const doc = input.session.getPublicState().activeCase;
    const passed =
      doc !== undefined &&
      doc.objects.length > 0 &&
      !input.orientation.isActive();
    return freezeCheck({
      id: 'preparation-readiness',
      label: 'Preparation readiness',
      passed,
      message: passed ? 'Ready for preparation workflow' : 'Finish orientation tool before preparation'
    });
  }

  private checkToolCompatibility(input: ClinicalPreparationValidationInput): ValidationCheckResult {
    const tool = input.tool!;
    const stage = input.stage;
    const passed =
      stage !== undefined &&
      (stage === 'preparation-complete' ||
        (stage === 'ready-for-trim' && tool === 'trim') ||
        (stage === 'ready-for-close-base' && tool === 'close-base') ||
        (stage === 'ready-for-segmentation' && tool === 'segment') ||
        (stage === 'ready-for-movement' && tool === 'move') ||
        tool === 'analyze' ||
        tool === 'measure' ||
        tool === 'manufacturing');
    return freezeCheck({
      id: 'tool-compatibility',
      label: 'Tool compatibility',
      passed,
      message: passed
        ? `${tool} compatible with ${stage ?? 'current stage'}`
        : `${tool} not compatible with current stage`
    });
  }
}
