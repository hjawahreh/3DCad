/**
 * ClinicalPreparationManager — context resolution and stage advancement helpers.
 */

import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalOrientationRuntime } from '../orientation/ClinicalOrientationRuntime.js';
import type { ClinicalViewportRuntime } from '../display/ClinicalViewportRuntime.js';
import { clinicalFailure, clinicalSuccess, type ClinicalResult } from '../runtime/types.js';
import { buildPreparationContext, type ClinicalPreparationContext } from './ClinicalPreparationContext.js';
import type { ClinicalPreparationSession } from './ClinicalPreparationSession.js';
import { ClinicalPreparationValidator } from './ClinicalPreparationValidator.js';
import {
  nextStage,
  type ClinicalPreparationStage
} from './ClinicalPreparationStage.js';
import type { PreparationOrchestrationToolId } from './ClinicalPreparationPipeline.js';
import { ClinicalPreparationPipeline } from './ClinicalPreparationPipeline.js';

export class ClinicalPreparationManager {
  private readonly validator = new ClinicalPreparationValidator();
  public readonly pipeline = new ClinicalPreparationPipeline();

  public buildContext(input: {
    readonly session: ClinicalSession;
    readonly orientation: ClinicalOrientationRuntime;
    readonly viewport: ClinicalViewportRuntime;
    readonly preparationSession: ClinicalPreparationSession;
    readonly now: number;
  }): ClinicalPreparationContext {
    return buildPreparationContext({
      session: input.session,
      orientation: input.orientation,
      viewport: input.viewport,
      state: input.preparationSession.getState(),
      now: input.now
    });
  }

  public runValidation(
    context: ClinicalPreparationContext,
    options?: {
      readonly stage?: ClinicalPreparationStage;
      readonly tool?: PreparationOrchestrationToolId;
      readonly requireSavedCase?: boolean;
    }
  ) {
    return this.validator.validate({
      session: context.session,
      orientation: context.orientation,
      viewport: context.viewport,
      orientationValidated: context.state.orientationValidated,
      now: context.now,
      ...(options?.stage === undefined ? {} : { stage: options.stage }),
      ...(options?.tool === undefined ? {} : { tool: options.tool }),
      ...(options?.requireSavedCase === undefined
        ? {}
        : { requireSavedCase: options.requireSavedCase })
    });
  }

  public advanceStage(
    preparationSession: ClinicalPreparationSession,
    context: ClinicalPreparationContext
  ): ClinicalResult<ClinicalPreparationStage> {
    const current = context.state.currentStage;
    const next = nextStage(current);
    if (next === undefined) {
      return clinicalFailure('lifecycle', 'Already at final preparation stage');
    }
    const report = this.runValidation(context, { stage: next, requireSavedCase: false });
    if (!report.passed) {
      return clinicalFailure('validation', 'Validation failed — cannot advance stage');
    }
    preparationSession.setStage(next);
    return clinicalSuccess(next);
  }

  public resolveToolActivation(
    toolId: PreparationOrchestrationToolId,
    context: ClinicalPreparationContext,
    options?: { readonly requireSavedCase?: boolean }
  ): ClinicalResult<PreparationOrchestrationToolId> {
    const tool = this.pipeline.get(toolId);
    if (tool === undefined) {
      return clinicalFailure('not-found', `Unknown preparation tool ${toolId}`);
    }
    if (!tool.enabled) {
      return clinicalFailure('unavailable', `${tool.title} is not available`);
    }
    if (!this.pipeline.isCompatible(context.state.currentStage, toolId)) {
      return clinicalFailure(
        'validation',
        `${tool.title} is not compatible with stage ${context.state.currentStage}`
      );
    }
    const report = this.runValidation(context, {
      tool: toolId,
      stage: context.state.currentStage,
      requireSavedCase: options?.requireSavedCase ?? false
    });
    if (!report.passed) {
      return clinicalFailure('validation', 'Validation failed — cannot activate tool');
    }
    return clinicalSuccess(toolId);
  }

  public ensureCaseReady(session: ClinicalSession): ClinicalResult<void> {
    const doc = session.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    if (doc.objects.length === 0) {
      return clinicalFailure('validation', 'Import a model before preparation');
    }
    return clinicalSuccess(undefined);
  }
}
