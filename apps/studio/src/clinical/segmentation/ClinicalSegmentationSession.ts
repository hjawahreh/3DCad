/**
 * Live segmentation session state (non-destructive until accept).
 */

import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import type { SegmentationPrediction } from './prediction/types.js';
import type { ReviewActionMeta } from './review/ClinicalSegmentationReview.js';
import { ClinicalSegmentationWorkflow, type SegmentationPhase } from './ClinicalSegmentationWorkflow.js';
import type { SegmentationPresentationStatus } from './display/ClinicalSegmentationPresentation.js';
import type { ClinicalSegmentationValidationReport } from './ClinicalSegmentationValidation.js';

export type SegmentationViewMode =
  | 'semantic'
  | 'instance'
  | 'fdi'
  | 'confidence'
  | 'review'
  | 'boundary';

export interface SegmentationSessionState {
  readonly phase: SegmentationPhase;
  readonly targetObjectId: ClinicalObjectId | undefined;
  readonly providerId: string;
  readonly identificationThreshold: number;
  readonly prediction: SegmentationPrediction | undefined;
  readonly selectedInstanceId: string | undefined;
  readonly viewMode: SegmentationViewMode;
  readonly presentation: SegmentationPresentationStatus;
  readonly reviewAcknowledged: boolean;
  readonly validationReport: ClinicalSegmentationValidationReport | undefined;
  readonly progress?: { readonly completed: number; readonly total: number; readonly message?: string };
  readonly runtimeMessage: string | undefined;
  readonly errorMessage: string | undefined;
  readonly lastReviewMeta: ReviewActionMeta | undefined;
  readonly sessionStartedAt: number | undefined;
}

export class ClinicalSegmentationSession {
  private readonly workflow = new ClinicalSegmentationWorkflow();
  private targetObjectId: ClinicalObjectId | undefined;
  private providerId = 'reference-heuristic';
  private identificationThreshold = 0.65;
  private prediction: SegmentationPrediction | undefined;
  private selectedInstanceId: string | undefined;
  private viewMode: SegmentationViewMode = 'instance';
  private presentation: SegmentationPresentationStatus = 'idle';
  private reviewAcknowledged = false;
  private validationReport: ClinicalSegmentationValidationReport | undefined;
  private progress: SegmentationSessionState['progress'];
  private runtimeMessage: string | undefined;
  private errorMessage: string | undefined;
  private lastReviewMeta: ReviewActionMeta | undefined;
  private sessionStartedAt: number | undefined;
  private abort: AbortController | undefined;

  public getWorkflow(): ClinicalSegmentationWorkflow {
    return this.workflow;
  }

  public getAbortController(): AbortController | undefined {
    return this.abort;
  }

  public begin(input: {
    readonly objectId: ClinicalObjectId;
    readonly providerId: string;
    readonly now: number;
  }): void {
    this.clear();
    this.targetObjectId = input.objectId;
    this.providerId = input.providerId;
    this.sessionStartedAt = input.now;
    this.abort = new AbortController();
    this.presentation = 'idle';
    this.viewMode = 'instance';
    this.workflow.transition('activating');
  }

  public retarget(objectId: ClinicalObjectId): void {
    this.targetObjectId = objectId;
    this.prediction = undefined;
    this.selectedInstanceId = undefined;
    this.progress = undefined;
    this.errorMessage = undefined;
    this.presentation = 'idle';
    this.abort?.abort();
    this.abort = new AbortController();
    this.workflow.reset();
    this.workflow.transition('activating');
  }

  public setProvider(providerId: string): void {
    this.providerId = providerId;
  }

  public setThreshold(value: number): void {
    this.identificationThreshold = Math.max(0.05, Math.min(0.95, value));
  }

  public setPrediction(prediction: SegmentationPrediction | undefined): void {
    this.prediction = prediction;
  }

  public setSelectedInstance(id: string | undefined): void {
    this.selectedInstanceId = id;
  }

  public setViewMode(mode: SegmentationViewMode): void {
    this.viewMode = mode;
  }

  public setPresentation(status: SegmentationPresentationStatus): void {
    this.presentation = status;
  }

  public setReviewAcknowledged(value: boolean): void {
    this.reviewAcknowledged = value;
  }

  public setValidationReport(report: ClinicalSegmentationValidationReport | undefined): void {
    this.validationReport = report;
  }

  public setProgress(progress: SegmentationSessionState['progress']): void {
    this.progress = progress;
  }

  public setRuntimeMessage(message: string | undefined): void {
    this.runtimeMessage = message;
  }

  public setError(message: string | undefined): void {
    this.errorMessage = message;
  }

  public setReviewMeta(meta: ReviewActionMeta | undefined): void {
    this.lastReviewMeta = meta;
  }

  public getState(): SegmentationSessionState {
    return Object.freeze({
      phase: this.workflow.getPhase(),
      targetObjectId: this.targetObjectId,
      providerId: this.providerId,
      identificationThreshold: this.identificationThreshold,
      prediction: this.prediction,
      selectedInstanceId: this.selectedInstanceId,
      viewMode: this.viewMode,
      presentation: this.presentation,
      reviewAcknowledged: this.reviewAcknowledged,
      validationReport: this.validationReport,
      ...(this.progress !== undefined ? { progress: this.progress } : {}),
      runtimeMessage: this.runtimeMessage,
      errorMessage: this.errorMessage,
      lastReviewMeta: this.lastReviewMeta,
      sessionStartedAt: this.sessionStartedAt
    });
  }

  public clear(): void {
    this.abort?.abort();
    this.abort = undefined;
    this.targetObjectId = undefined;
    this.prediction = undefined;
    this.selectedInstanceId = undefined;
    this.progress = undefined;
    this.runtimeMessage = undefined;
    this.errorMessage = undefined;
    this.lastReviewMeta = undefined;
    this.sessionStartedAt = undefined;
    this.validationReport = undefined;
    this.presentation = 'idle';
    this.reviewAcknowledged = false;
    this.viewMode = 'instance';
    this.workflow.reset();
  }
}
