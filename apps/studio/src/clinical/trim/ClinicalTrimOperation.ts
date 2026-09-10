/**
 * ClinicalTrimOperation — Operation Runtime session wrapper for trim commits.
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
import { boundaryToStroke, type TrimBoundaryPoint } from './ClinicalTrimBoundaryMath.js';

export class ClinicalTrimOperation {
  private session: OperationSession | undefined;

  public getSession(): OperationSession | undefined {
    return this.session;
  }

  public start(input: {
    readonly tools: OperationHost;
    readonly document: ClinicalDocumentSnapshot;
    readonly targetObjectId: string;
    readonly points: readonly TrimBoundaryPoint[];
    readonly drawMode: string;
  }): ClinicalResult<OperationSession> {
    if (this.session !== undefined) {
      return clinicalFailure('conflict', 'Trim operation already active');
    }
    const stroke = boundaryToStroke(input.points);
    const started = input.tools.start({
      kind: 'trim',
      baseRevision: asDocumentRevision(Number(input.document.revision)),
      workflowStepId: asWorkflowStepId('ready-for-trim'),
      params: Object.freeze({
        targetObjectId: input.targetObjectId,
        stroke,
        drawMode: input.drawMode
      })
    });
    if (!started.ok) {
      return clinicalFailure('validation', started.error.message);
    }
    this.session = started.value;
    return clinicalSuccess(started.value);
  }

  public setBoundaryPreview(points: readonly TrimBoundaryPoint[]): ClinicalResult<void> {
    if (this.session === undefined) {
      return clinicalSuccess(undefined);
    }
    const preview = createPreviewDescriptor({
      id: 'trim-boundary-preview',
      kind: 'boundary',
      operationId: this.session.id,
      revision: this.session.baseRevision,
      payload: Object.freeze({
        stroke: boundaryToStroke(points),
        pointCount: points.length
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
      return clinicalFailure('lifecycle', 'No trim operation session');
    }
    const ran = await this.session.runKernel();
    if (!ran.ok) {
      return clinicalFailure('validation', ran.error.message);
    }
    if (this.session === undefined) {
      return clinicalFailure('lifecycle', 'Trim operation session lost');
    }
    return clinicalSuccess(this.session);
  }

  public commit(): ClinicalResult<{
    readonly commandIntent: CommandIntent;
    readonly tokenId: CommitTokenId;
  }> {
    if (this.session === undefined) {
      return clinicalFailure('lifecycle', 'No trim operation session');
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
    if (this.session === undefined) {
      return;
    }
    this.session.cancel();
    this.session.dispose();
    this.session = undefined;
  }

  public dispose(): void {
    this.cancel();
  }
}
