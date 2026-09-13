/**
 * ClinicalCloseBaseOperation — Operation Runtime session wrapper for close-base commits.
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
import type { ClinicalCloseBaseParameters } from './ClinicalCloseBaseParameters.js';
import { getCloseBaseStrategy } from './ClinicalCloseBaseStrategy.js';

export class ClinicalCloseBaseOperation {
  private session: OperationSession | undefined;

  public getSession(): OperationSession | undefined {
    return this.session;
  }

  public start(input: {
    readonly tools: OperationHost;
    readonly document: ClinicalDocumentSnapshot;
    readonly targetObjectId: string;
    readonly parameters: ClinicalCloseBaseParameters;
    /** When true, kernel writes preview/display only — working/source untouched. */
    readonly preview?: boolean;
  }): ClinicalResult<OperationSession> {
    if (this.session !== undefined) {
      return clinicalFailure('conflict', 'Close Base operation already active');
    }
    const strategy = getCloseBaseStrategy(input.parameters.strategy);
    if (strategy === undefined) {
      return clinicalFailure('validation', 'Unsupported Close Base strategy');
    }
    const started = input.tools.start({
      kind: 'close-base',
      baseRevision: asDocumentRevision(Number(input.document.revision)),
      workflowStepId: asWorkflowStepId('ready-for-close-base'),
      params: Object.freeze({
        targetObjectId: input.targetObjectId,
        strategy: input.parameters.strategy,
        height: input.parameters.height,
        thickness: input.parameters.thickness,
        orientation: input.parameters.orientation,
        margin: input.parameters.margin,
        smoothing: input.parameters.smoothing,
        preview: input.preview === true
      })
    });
    if (!started.ok) {
      return clinicalFailure('validation', started.error.message);
    }
    this.session = started.value;
    return clinicalSuccess(started.value);
  }

  public setPreview(parameters: ClinicalCloseBaseParameters): ClinicalResult<void> {
    if (this.session === undefined) {
      return clinicalSuccess(undefined);
    }
    const preview = createPreviewDescriptor({
      id: 'close-base-preview',
      kind: 'mesh-overlay',
      operationId: this.session.id,
      revision: this.session.baseRevision,
      payload: Object.freeze({
        strategy: parameters.strategy,
        height: parameters.height,
        thickness: parameters.thickness,
        orientation: parameters.orientation,
        margin: parameters.margin,
        smoothing: parameters.smoothing
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
      return clinicalFailure('lifecycle', 'No Close Base operation session');
    }
    const ran = await this.session.runKernel();
    if (!ran.ok) {
      return clinicalFailure('validation', ran.error.message);
    }
    if (this.session === undefined) {
      return clinicalFailure('lifecycle', 'Close Base operation session lost');
    }
    return clinicalSuccess(this.session);
  }

  public commit(): ClinicalResult<{
    readonly commandIntent: CommandIntent;
    readonly tokenId: CommitTokenId;
  }> {
    if (this.session === undefined) {
      return clinicalFailure('lifecycle', 'No Close Base operation session');
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
    const phase = this.session.snapshot().phase;
    // Committed / disposed / cancelled are already terminal — cancel() would fail.
    if (phase !== 'committed' && phase !== 'disposed' && phase !== 'cancelled') {
      this.session.cancel();
    }
    this.session.dispose();
    this.session = undefined;
  }

  public dispose(): void {
    if (this.session === undefined) {
      return;
    }
    this.session.dispose();
    this.session = undefined;
  }
}
