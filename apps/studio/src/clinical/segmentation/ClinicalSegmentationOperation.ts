/**
 * ClinicalSegmentationOperation — Operation Runtime wrapper for accept/commit.
 */

import {
  asDocumentRevision,
  asWorkflowStepId,
  createPreviewDescriptor,
  type CommandIntent,
  type CommitTokenId,
  type OperationHost,
  type OperationSession
} from '@cad-studio/tool-runtime';
import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import { clinicalFailure, clinicalSuccess, type ClinicalResult } from '../runtime/types.js';
import type { SegmentationPrediction } from './prediction/types.js';

export class ClinicalSegmentationOperation {
  private session: OperationSession | undefined;

  public getSession(): OperationSession | undefined {
    return this.session;
  }

  public start(input: {
    readonly tools: OperationHost;
    readonly document: ClinicalDocumentSnapshot;
    readonly targetObjectId: string;
    readonly providerId: string;
    readonly prediction: SegmentationPrediction;
  }): ClinicalResult<OperationSession> {
    if (this.session !== undefined) {
      return clinicalFailure('conflict', 'Segmentation operation already active');
    }
    const started = input.tools.start({
      kind: 'segmentation',
      baseRevision: asDocumentRevision(Number(input.document.revision)),
      workflowStepId: asWorkflowStepId('ready-for-segmentation'),
      params: Object.freeze({
        targetObjectId: input.targetObjectId,
        providerId: input.providerId,
        predictionId: input.prediction.predictionId,
        instanceCount: input.prediction.instances.length,
        fingerprint: input.prediction.geometryFingerprint
      })
    });
    if (!started.ok) {
      return clinicalFailure('validation', started.error.message);
    }
    this.session = started.value;
    return clinicalSuccess(started.value);
  }

  public setPreview(prediction: SegmentationPrediction): ClinicalResult<void> {
    if (this.session === undefined) {
      return clinicalSuccess(undefined);
    }
    const preview = createPreviewDescriptor({
      id: 'segmentation-preview',
      kind: 'mesh-overlay',
      operationId: this.session.id,
      revision: this.session.baseRevision,
      payload: Object.freeze({
        predictionId: prediction.predictionId,
        instanceCount: prediction.instances.length,
        caseBand: prediction.confidence.caseBand
      })
    });
    const set = this.session.setPreview(preview);
    if (!set.ok) {
      return clinicalFailure('validation', set.error.message);
    }
    return clinicalSuccess(undefined);
  }

  public async runKernel(): Promise<ClinicalResult<OperationSession>> {
    if (this.session === undefined) {
      return clinicalFailure('lifecycle', 'No segmentation operation session');
    }
    const ran = await this.session.runKernel();
    if (!ran.ok) {
      return clinicalFailure('validation', ran.error.message);
    }
    return clinicalSuccess(this.session);
  }

  public commit(): ClinicalResult<{
    readonly commandIntent: CommandIntent;
    readonly tokenId: CommitTokenId;
  }> {
    if (this.session === undefined) {
      return clinicalFailure('lifecycle', 'No segmentation operation session');
    }
    const committed = this.session.commit();
    if (!committed.ok) {
      return clinicalFailure('validation', committed.error.message);
    }
    return clinicalSuccess({
      commandIntent: committed.value.commandIntent,
      tokenId: committed.value.token.id
    });
  }

  public cancel(): void {
    if (this.session === undefined) return;
    this.session.cancel();
    this.session.dispose();
    this.session = undefined;
  }

  public dispose(): void {
    this.cancel();
  }
}
