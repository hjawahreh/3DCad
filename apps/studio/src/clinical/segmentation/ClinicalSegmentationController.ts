/**
 * ClinicalSegmentationController — inference, review, accept/reject, history.
 */

import { asCommitTokenId, asWorkflowStepId } from '@cad-studio/tool-runtime';
import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import type { ClinicalSession } from '../runtime/session.js';
import {
  asClinicalToolId,
  clinicalFailure,
  clinicalSuccess,
  type ClinicalResult
} from '../runtime/types.js';
import { ClinicalSegmentationHistory } from './history/ClinicalSegmentationHistory.js';
import { ClinicalSegmentationManager } from './ClinicalSegmentationManager.js';
import { ClinicalSegmentationOperation } from './ClinicalSegmentationOperation.js';
import { ClinicalSegmentationSession } from './ClinicalSegmentationSession.js';
import type { SegmentationViewMode } from './ClinicalSegmentationSession.js';
import {
  ClinicalSegmentationDiagnostics,
  ClinicalSegmentationMetrics
} from './ClinicalSegmentationObservability.js';
import {
  createDefaultSegmentationRegistry,
  type SegmentationProviderRegistry
} from './provider/SegmentationProviderRegistry.js';
import { isSegmentationError } from './errors.js';
import type { FdiNumber } from './fdi/FdiNumbering.js';
import {
  mergeInstances,
  relabelInstanceFdi,
  splitInstance,
  markInstanceUnknown,
  markSemanticFaces
} from './review/ClinicalSegmentationReview.js';
import type { SemanticLabel } from './prediction/types.js';

export class ClinicalSegmentationController {
  public readonly session: ClinicalSegmentationSession;
  public readonly manager: ClinicalSegmentationManager;
  public readonly operation: ClinicalSegmentationOperation;
  public readonly history: ClinicalSegmentationHistory;
  public readonly diagnostics: ClinicalSegmentationDiagnostics;
  public readonly metrics: ClinicalSegmentationMetrics;
  public readonly registry: SegmentationProviderRegistry;

  public constructor(
    private readonly clinicalSession: ClinicalSession,
    private readonly preparation: ClinicalPreparationRuntime,
    private readonly sceneBuilder: ClinicalSceneBuilder,
    registry?: SegmentationProviderRegistry
  ) {
    this.session = new ClinicalSegmentationSession();
    this.manager = new ClinicalSegmentationManager();
    this.operation = new ClinicalSegmentationOperation();
    this.history = new ClinicalSegmentationHistory();
    this.diagnostics = new ClinicalSegmentationDiagnostics();
    this.metrics = new ClinicalSegmentationMetrics();
    this.registry = registry ?? createDefaultSegmentationRegistry();
  }

  public enter(preferredId?: ClinicalObjectId): ClinicalResult<void> {
    if (this.session.getWorkflow().isActive()) {
      return clinicalFailure('conflict', 'Segmentation already active');
    }
    if (!this.isPreparationReady()) {
      return clinicalFailure('validation', 'Advance preparation to Ready For Segmentation');
    }
    const target = this.manager.resolveTarget(this.clinicalSession, preferredId);
    if (!target.ok) {
      this.diagnostics.recordFailure(target.error.message);
      return target;
    }
    const activated = this.clinicalSession.activateTool(asClinicalToolId('segment'));
    if (!activated.ok) {
      return activated;
    }
    const provider = this.registry.getDefault();
    this.session.begin({
      objectId: target.value.objectId,
      providerId: provider.info.id,
      now: Date.now()
    });
    this.diagnostics.recordSessionStart(provider.info.id);
    this.metrics.recordStart(provider.info.id);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public setProvider(providerId: string): ClinicalResult<void> {
    if (!this.session.getWorkflow().isActive()) {
      return clinicalFailure('lifecycle', 'Segmentation not active');
    }
    try {
      const p = this.registry.get(providerId);
      if (!p.info.operational) {
        return clinicalFailure('unavailable', `${p.info.displayName} is not operational`);
      }
      this.session.setProvider(providerId);
      this.clinicalSession.notifyUi();
      return clinicalSuccess(undefined);
    } catch (err) {
      return clinicalFailure(
        'not-found',
        err instanceof Error ? err.message : 'Provider not found'
      );
    }
  }

  public setThreshold(value: number): ClinicalResult<void> {
    this.session.setThreshold(value);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public setViewMode(mode: SegmentationViewMode): ClinicalResult<void> {
    this.session.setViewMode(mode);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public selectInstance(id: string | undefined): ClinicalResult<void> {
    this.session.setSelectedInstance(id);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public async runInference(): Promise<ClinicalResult<void>> {
    const state = this.session.getState();
    if (state.targetObjectId === undefined) {
      return clinicalFailure('lifecycle', 'Segmentation not active');
    }
    const provider = this.registry.get(state.providerId);
    if (!provider.info.operational) {
      this.session.getWorkflow().transition('failed');
      this.session.setError('MODEL_UNAVAILABLE');
      return clinicalFailure('unavailable', 'Selected provider is not operational');
    }

    const host = this.clinicalSession.getHost();
    const objectId = state.targetObjectId as string;
    host.runtimes.kernel.registry.ensureSourceMesh(objectId);
    const mesh =
      host.runtimes.kernel.registry.getByObjectId(objectId, 'working') ??
      host.runtimes.kernel.registry.getByObjectId(objectId, 'source');
    if (mesh === undefined) {
      return clinicalFailure('not-found', 'No mesh available for segmentation');
    }

    const signal = this.session.getAbortController()?.signal ?? new AbortController().signal;
    try {
      this.session.getWorkflow().transition('preparing');
      this.session.setProgress({ completed: 0, total: 1, message: 'Preparing mesh…' });
      this.clinicalSession.notifyUi();
      await provider.initialize();
      const valid = provider.validateInput(mesh);
      if (!valid.ok) {
        throw new Error(valid.message ?? 'INVALID_INPUT');
      }
      const preprocess = await provider.preprocess(mesh, signal);
      this.session.getWorkflow().transition('inferencing');
      this.session.setProgress({ completed: 0, total: 1, message: 'Inferencing…' });
      this.clinicalSession.notifyUi();
      const prediction = await provider.infer({
        objectId,
        sourceRevision: mesh.revision,
        geometryFingerprint: mesh.fingerprint,
        mesh,
        preprocess,
        identificationThreshold: state.identificationThreshold,
        signal,
        report: (p) => {
          this.session.setProgress(p);
          this.clinicalSession.notifyUi();
        }
      });
      this.session.getWorkflow().transition('postprocessing');
      this.session.getWorkflow().transition('validating');
      this.session.getWorkflow().transition('ready-for-review');
      this.session.setPrediction(prediction);
      this.session.setError(undefined);
      this.metrics.recordInference(prediction.metrics.totalMs ?? 0, prediction.instances.length);
      this.diagnostics.recordInferenceOk(prediction.providerId, prediction.instances.length);
      this.clinicalSession.notifyUi();
      return clinicalSuccess(undefined);
    } catch (err) {
      const message = isSegmentationError(err)
        ? `${err.code}: ${err.message}`
        : err instanceof Error
          ? err.message
          : 'INFERENCE_FAILED';
      this.session.getWorkflow().transition('failed');
      this.session.setError(message);
      this.session.setPrediction(undefined);
      this.diagnostics.recordFailure(message);
      this.metrics.recordFailed();
      this.clinicalSession.notifyUi();
      return clinicalFailure('validation', message);
    }
  }

  public async accept(): Promise<ClinicalResult<void>> {
    const state = this.session.getState();
    if (state.phase !== 'ready-for-review' || state.prediction === undefined) {
      return clinicalFailure('lifecycle', 'No prediction ready for acceptance');
    }
    if (state.targetObjectId === undefined) {
      return clinicalFailure('validation', 'No segmentation target');
    }
    const doc = this.clinicalSession.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    this.session.getWorkflow().transition('committing');
    const host = this.clinicalSession.getHost();
    host.runtimes.tools.clearActiveIfTerminal();
    const started = this.operation.start({
      tools: host.runtimes.tools,
      document: doc,
      targetObjectId: state.targetObjectId as string,
      providerId: state.providerId,
      prediction: state.prediction
    });
    if (!started.ok) {
      this.session.getWorkflow().transition('failed');
      return started;
    }
    this.operation.setPreview(state.prediction);
    const ran = await this.operation.runKernel();
    if (!ran.ok) {
      this.operation.cancel();
      this.session.getWorkflow().transition('failed');
      return ran;
    }
    const committed = this.operation.commit();
    if (!committed.ok) {
      this.session.getWorkflow().transition('failed');
      return committed;
    }
    const now = Date.now();
    const applied = this.manager.applyAcceptCommit({
      session: this.clinicalSession,
      objectId: state.targetObjectId,
      prediction: state.prediction,
      now
    });
    if (!applied.ok) {
      this.session.getWorkflow().transition('failed');
      return applied;
    }
    this.history.push({
      label: 'Accept segmentation',
      prediction: state.prediction,
      reviewMeta: undefined,
      previousDocument: applied.value.previous,
      nextDocument: applied.value.next,
      createdAt: now
    });
    host.runtimes.tools.workflowGate.advance(
      asWorkflowStepId('ready-for-segmentation'),
      asCommitTokenId(committed.value.tokenId)
    );
    host.runtimes.tools.clearActiveIfTerminal();
    this.operation.dispose();
    this.session.getWorkflow().transition('complete');
    this.diagnostics.recordAccept(state.prediction.instances.length);
    this.metrics.recordAccepted();
    this.manager.republishDocument(host, this.sceneBuilder, applied.value.next, 'segmentation-accept');
    this.clinicalSession.getTools().deactivate();
    this.session.clear();
    host.notifications.push(
      'success',
      'Segmentation',
      'Accepted — decision support result stored (human-reviewed)'
    );
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public reject(): ClinicalResult<void> {
    this.operation.cancel();
    this.clinicalSession.getHost().runtimes.tools.cancelActive();
    this.session.getWorkflow().cancel();
    this.session.clear();
    this.clinicalSession.getTools().deactivate();
    this.diagnostics.recordRejected();
    this.clinicalSession.getHost().notifications.push(
      'info',
      'Segmentation',
      'Rejected — document unchanged'
    );
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public cancel(): ClinicalResult<void> {
    this.session.getAbortController()?.abort();
    this.registry.tryGet(this.session.getState().providerId)?.cancel();
    return this.reject();
  }

  public relabelFdi(instanceId: string, fdi: FdiNumber | undefined): ClinicalResult<void> {
    const pred = this.session.getState().prediction;
    if (pred === undefined) return clinicalFailure('lifecycle', 'No prediction');
    const result = relabelInstanceFdi(pred, instanceId, fdi);
    this.session.setPrediction(result.prediction);
    this.session.setReviewMeta(result.meta);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public merge(aId: string, bId: string): ClinicalResult<void> {
    const pred = this.session.getState().prediction;
    if (pred === undefined) return clinicalFailure('lifecycle', 'No prediction');
    const result = mergeInstances(pred, aId, bId);
    this.session.setPrediction(result.prediction);
    this.session.setReviewMeta(result.meta);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public split(instanceId: string, faceSetA: readonly number[]): ClinicalResult<void> {
    const pred = this.session.getState().prediction;
    if (pred === undefined) return clinicalFailure('lifecycle', 'No prediction');
    const result = splitInstance(pred, instanceId, faceSetA);
    this.session.setPrediction(result.prediction);
    this.session.setReviewMeta(result.meta);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public markUnknown(instanceId: string): ClinicalResult<void> {
    return this.relabelFdi(instanceId, undefined);
  }

  public markSemantic(faceIndices: readonly number[], label: SemanticLabel): ClinicalResult<void> {
    const pred = this.session.getState().prediction;
    if (pred === undefined) return clinicalFailure('lifecycle', 'No prediction');
    const result = markSemanticFaces(pred, faceIndices, label);
    this.session.setPrediction(result.prediction);
    this.session.setReviewMeta(result.meta);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public undo(): ClinicalResult<void> {
    const entry = this.history.undo();
    if (!entry.ok) return entry;
    const applied = this.clinicalSession.applyDocument(entry.value.previousDocument, true);
    if (!applied.ok) return applied;
    this.manager.republishDocument(
      this.clinicalSession.getHost(),
      this.sceneBuilder,
      entry.value.previousDocument,
      'segmentation-undo'
    );
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public redo(): ClinicalResult<void> {
    const entry = this.history.redo();
    if (!entry.ok) return entry;
    const applied = this.clinicalSession.applyDocument(entry.value.nextDocument, true);
    if (!applied.ok) return applied;
    this.manager.republishDocument(
      this.clinicalSession.getHost(),
      this.sceneBuilder,
      entry.value.nextDocument,
      'segmentation-redo'
    );
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public isActive(): boolean {
    return this.session.getWorkflow().isActive();
  }

  public dispose(): void {
    this.operation.dispose();
    this.session.clear();
  }

  private isPreparationReady(): boolean {
    const stage = this.preparation.session.getState().currentStage;
    return (
      stage === 'ready-for-segmentation' ||
      stage === 'ready-for-movement' ||
      stage === 'preparation-complete'
    );
  }
}

// silence unused import warning path for markInstanceUnknown re-export usage in tests
void markInstanceUnknown;
