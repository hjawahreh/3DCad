/**
 * ClinicalSegmentationController — inference, review, accept/reject, history.
 */

import { asCommitTokenId, asWorkflowStepId } from '@cad-studio/tool-runtime';
import type { ClinicalArchRole, ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalMeshPicker } from '../display/ClinicalMeshPicker.js';
import type { ClinicalViewportRuntime } from '../display/ClinicalViewportRuntime.js';
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
  markSemanticFaces,
  markInstanceMissing
} from './review/ClinicalSegmentationReview.js';
import type { SemanticLabel, SegmentationPrediction } from './prediction/types.js';
import {
  findInstanceByFace,
  summarizeReview,
  toUserFacingProgressMessage
} from './display/ClinicalSegmentationPresentation.js';
import {
  isCaseSegmentationComplete,
  summarizeCaseSegmentation
} from '../case/ClinicalPipelineStatus.js';
import {
  evaluateSegmentationIntegrity,
  isNonClinicalSegmentationProvider
} from './ClinicalSegmentationIntegrity.js';
import {
  PRODUCTION_INFERENCE_WATCHDOG_MS,
  resolveProductionLifecycleBootstrap
} from './runtime/ProductionSegmentationLifecycle.js';
import { resolveProductionModelGate } from './runtime/ProductionModelGate.js';
import {
  isSegmentationAcceptBlocked,
  validateSegmentationPrediction,
  type ClinicalSegmentationValidationReport
} from './ClinicalSegmentationValidation.js';
import { recordClinicalGeometryDevDiag } from '../diagnostics/ClinicalGeometryDevDiagnostics.js';
import type { ReviewActionMeta } from './review/ClinicalSegmentationReview.js';
import { withPreparationMeta } from '../document/ClinicalDocument.js';

const docObjectArchRole = (
  clinicalSession: ClinicalSession,
  objectId: string
): 'upper' | 'lower' | undefined => {
  const doc = clinicalSession.getPublicState().activeCase;
  const obj = doc?.objects.find((o) => o.id === objectId);
  return obj?.archRole === 'upper' || obj?.archRole === 'lower' ? obj.archRole : undefined;
};

const yieldFrame = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 16);
  });

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
    registry?: SegmentationProviderRegistry,
    private readonly meshPicker?: ClinicalMeshPicker,
    private readonly viewport?: ClinicalViewportRuntime
  ) {
    this.session = new ClinicalSegmentationSession();
    this.manager = new ClinicalSegmentationManager();
    this.operation = new ClinicalSegmentationOperation();
    this.history = new ClinicalSegmentationHistory();
    this.diagnostics = new ClinicalSegmentationDiagnostics();
    this.metrics = new ClinicalSegmentationMetrics();
    this.registry = registry ?? createDefaultSegmentationRegistry();
  }

  /** Resolve mesh face count for the current target (working preferred). */
  private resolveMeshFaceCount(objectId: string): number | undefined {
    const host = this.clinicalSession.getHost();
    const mesh =
      host.runtimes.kernel.registry.getByObjectId(objectId, 'working') ??
      host.runtimes.kernel.registry.getByObjectId(objectId, 'source');
    if (mesh === undefined) return undefined;
    return Math.floor(mesh.indices.length / 3);
  }

  /**
   * Always refresh validation from the live prediction.
   * Closes stale-cache holes after merge/split/relabel.
   */
  private revalidatePrediction(): ClinicalSegmentationValidationReport | undefined {
    const state = this.session.getState();
    if (state.prediction === undefined || state.targetObjectId === undefined) {
      this.session.setValidationReport(undefined);
      return undefined;
    }
    const objectId = state.targetObjectId as string;
    const archRole = docObjectArchRole(this.clinicalSession, objectId);
    const meshFaceCount = this.resolveMeshFaceCount(objectId);
    const report = validateSegmentationPrediction(state.prediction, {
      ...(meshFaceCount !== undefined ? { meshFaceCount } : {}),
      ...(archRole !== undefined ? { archRole } : {})
    });
    this.session.setValidationReport(report);
    return report;
  }

  private applyReviewPrediction(prediction: SegmentationPrediction, meta: ReviewActionMeta): void {
    this.session.setPrediction(prediction);
    this.session.setReviewMeta(meta);
    this.session.setReviewAcknowledged(false);
    this.revalidatePrediction();
    this.clinicalSession.notifyUi();
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
    const doc = this.clinicalSession.getPublicState().activeCase;
    const targetObj = doc?.objects.find((o) => o.id === target.value.objectId);
    const integrity =
      targetObj !== undefined ? evaluateSegmentationIntegrity(targetObj) : undefined;
    const gate = resolveProductionModelGate();
    const prodProvider = this.registry.tryGet('production-clinical-model');
    const bootstrap = resolveProductionLifecycleBootstrap({
      providerId: provider.info.id,
      productionConfigured: gate.availability !== 'unavailable',
      productionOperational: prodProvider?.info.operational === true,
      ...(integrity?.status !== undefined ? { documentStatus: integrity.status } : {}),
      isHeuristicProvider: isNonClinicalSegmentationProvider(provider.info.id)
    });
    this.session.begin({
      objectId: target.value.objectId,
      providerId: provider.info.id,
      now: Date.now(),
      productionLifecycle: bootstrap
    });
    // Isolation is explicit via ClinicalArchSwitcher (setActiveArch) — avoid
    // mutating document visibility (and revision) on every enter.
    this.diagnostics.recordSessionStart(provider.info.id);
    this.metrics.recordStart(provider.info.id);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  /** One-click auto segmentation: enter (if needed) then infer. */
  public async segmentTeeth(preferredId?: ClinicalObjectId): Promise<ClinicalResult<void>> {
    if (!this.isActive()) {
      const entered = this.enter(preferredId);
      if (!entered.ok) return entered;
    }
    return this.runInference();
  }

  public setActiveArch(arch: ClinicalArchRole): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Segmentation not active');
    }
    const target = this.manager.resolveTargetByArch(this.clinicalSession, arch);
    if (!target.ok) return target;
    const current = this.session.getState().targetObjectId;
    if (current === target.value.objectId) {
      this.applyArchIsolation(target.value.objectId);
      this.clinicalSession.notifyUi();
      return clinicalSuccess(undefined);
    }
    this.operation.cancel();
    this.clinicalSession.getHost().runtimes.tools.cancelActive();
    this.session.retarget(target.value.objectId);
    const activated = this.clinicalSession.activateTool(asClinicalToolId('segment'));
    if (!activated.ok) return activated;
    this.applyArchIsolation(target.value.objectId);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public pickToothAt(screen: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Segmentation not active');
    }
    const state = this.session.getState();
    const preferred = state.targetObjectId as string | undefined;
    const hit = this.meshPicker?.pick({
      screenX: screen.x,
      screenY: screen.y,
      canvasWidth: screen.width,
      canvasHeight: screen.height,
      ...(preferred === undefined ? {} : { preferredObjectId: preferred })
    });

    // CLN-WORKFLOW-002 — Mark Teeth: place surface markers before auto segmentation.
    if (state.guideStep === 'mark-teeth') {
      if (
        hit?.faceIndex === undefined ||
        !Number.isFinite(hit.worldX) ||
        !Number.isFinite(hit.worldY) ||
        !Number.isFinite(hit.worldZ)
      ) {
        return clinicalSuccess(undefined);
      }
      const doc = this.clinicalSession.getPublicState().activeCase;
      const obj = doc?.objects.find((o) => o.id === hit.objectId);
      const arch =
        obj?.archRole === 'upper' || obj?.archRole === 'lower' ? obj.archRole : 'unknown';
      const fingerprint = obj?.geometryFingerprint ?? '';
      this.session.addToothMarker(
        Object.freeze({
          id: `mk-${Date.now().toString(36)}-${String(state.toothMarkers.length)}`,
          arch,
          position: Object.freeze([hit.worldX, hit.worldY, hit.worldZ] as const),
          faceIndex: hit.faceIndex,
          objectId: String(hit.objectId),
          geometryFingerprint: fingerprint,
          createdAt: Date.now()
        })
      );
      this.clinicalSession.notifyUi();
      return clinicalSuccess(undefined);
    }

    if (state.prediction === undefined || state.phase !== 'ready-for-review') {
      return clinicalFailure('lifecycle', 'No prediction to select');
    }
    if (hit?.faceIndex === undefined) {
      this.session.setSelectedInstance(undefined);
      this.clinicalSession.notifyUi();
      return clinicalSuccess(undefined);
    }
    const inst = findInstanceByFace(state.prediction, hit.faceIndex);
    this.session.setSelectedInstance(inst?.instanceId);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public setGuideStep(
    step: import('./guide/SegmentationGuideSteps.js').SegmentationGuideStepId
  ): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Segmentation not active');
    }
    this.session.setGuideStep(step);
    if (step === 'adjust-boundaries' || step === 'verify-teeth') {
      this.session.setViewMode('review');
    }
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

  public acknowledgeReview(): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Segmentation not active');
    }
    this.session.setReviewAcknowledged(true);
    this.clinicalSession
      .getHost()
      .notifications.push(
        'info',
        'Segmentation',
        'Review required acknowledged — uncertain teeth remain flagged'
      );
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public async runInference(): Promise<ClinicalResult<void>> {
    const state = this.session.getState();
    if (state.targetObjectId === undefined) {
      return clinicalFailure('lifecycle', 'Segmentation not active');
    }
    const lifecycle = this.session.getProductionLifecycle();
    // Sync STALE from document before allowing a new run.
    const doc = this.clinicalSession.getPublicState().activeCase;
    const targetObj = doc?.objects.find((o) => o.id === state.targetObjectId);
    if (targetObj !== undefined) {
      const integrity = evaluateSegmentationIntegrity(targetObj);
      if (integrity.status === 'STALE') {
        lifecycle.force('STALE', integrity.reason);
      }
    }

    const provider = this.registry.get(state.providerId);
    const isProduction = provider.info.id === 'production-clinical-model';
    const isHeuristic = isNonClinicalSegmentationProvider(provider.info.id);

    if (!provider.info.operational) {
      if (isProduction) {
        lifecycle.force('NOT_CONFIGURED', 'Production model not configured.');
      } else {
        lifecycle.force('FAILED', 'Selected provider is not operational');
      }
      this.session.getWorkflow().transition('failed');
      this.session.setPresentation('failed');
      this.session.setError(
        isProduction ? 'Production model not configured.' : 'MODEL_UNAVAILABLE'
      );
      this.clinicalSession.notifyUi();
      return clinicalFailure(
        'unavailable',
        isProduction ? 'Production model not configured.' : 'Selected provider is not operational'
      );
    }

    const host = this.clinicalSession.getHost();
    const objectId = state.targetObjectId as string;
    host.runtimes.kernel.registry.ensureSourceMesh(objectId);
    const mesh =
      host.runtimes.kernel.registry.getByObjectId(objectId, 'working') ??
      host.runtimes.kernel.registry.getByObjectId(objectId, 'source');
    if (mesh === undefined) {
      lifecycle.force('FAILED', 'No mesh available for segmentation');
      this.session.getWorkflow().transition('failed');
      this.session.setPresentation('failed');
      this.session.setError('No mesh available for segmentation');
      this.clinicalSession.notifyUi();
      return clinicalFailure('not-found', 'No mesh available for segmentation');
    }

    const signal = this.session.getAbortController()?.signal ?? new AbortController().signal;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    try {
      this.session.setPresentation('segmenting');
      this.session.setError(undefined);
      this.session.getWorkflow().transition('preparing');
      this.session.setProgress({
        completed: 0,
        total: 6,
        message: 'Preparing dental surface'
      });
      if (isProduction) {
        lifecycle.force('INITIALIZING');
      }
      this.clinicalSession.notifyUi();
      await provider.initialize();
      // Re-check operational after initialize (production health).
      if (isProduction && !provider.info.operational) {
        lifecycle.force('NOT_CONFIGURED', 'Production model not configured.');
        throw new Error('Production model not configured.');
      }
      if (isProduction) {
        lifecycle.transition('READY') || lifecycle.force('READY');
        lifecycle.transition('INFERENCING') || lifecycle.force('INFERENCING');
      }
      // Reference never enters production COMPLETED/ACCEPTED.
      if (isHeuristic) {
        lifecycle.force('NOT_CONFIGURED', 'Reference heuristic — not a production result');
      }

      this.session.setRuntimeMessage(provider.runtimeInformation().message);
      const valid = provider.validateInput(mesh);
      if (!valid.ok) {
        throw new Error(valid.message ?? 'INVALID_INPUT');
      }
      const preprocess = await provider.preprocess(mesh, signal);
      this.session.getWorkflow().transition('inferencing');

      watchdog = setTimeout(() => {
        if (lifecycle.checkWatchdog()) {
          this.session.getAbortController()?.abort();
          provider.cancel();
          this.session.getWorkflow().transition('failed');
          this.session.setPresentation('failed');
          this.session.setError(lifecycle.getDetail() ?? 'Inference watchdog exceeded');
          this.session.setPrediction(undefined);
          this.clinicalSession.notifyUi();
        }
      }, PRODUCTION_INFERENCE_WATCHDOG_MS);

      const archRole = docObjectArchRole(this.clinicalSession, objectId);
      const prediction = await provider.infer({
        objectId,
        sourceRevision: mesh.revision,
        geometryFingerprint: mesh.fingerprint,
        mesh,
        preprocess,
        identificationThreshold: state.identificationThreshold,
        ...(archRole !== undefined ? { archRole } : {}),
        signal,
        report: (p) => {
          if (lifecycle.checkWatchdog()) {
            throw new Error(lifecycle.getDetail() ?? 'Inference watchdog exceeded');
          }
          this.session.setProgress({
            completed: p.completed,
            total: p.total,
            message: toUserFacingProgressMessage(p.message)
          });
          this.clinicalSession.notifyUi();
        }
      });
      // Hard bind: refuse result that does not match the mesh we sent.
      if (
        prediction.geometryFingerprint !== mesh.fingerprint ||
        prediction.sourceRevision !== mesh.revision
      ) {
        throw new Error(
          'Segmentation result geometry fingerprint/revision mismatch — refusing stale bind'
        );
      }
      // Never promote heuristic to production COMPLETED.
      if (isProduction && !isNonClinicalSegmentationProvider(prediction.providerId)) {
        lifecycle.transition('COMPLETED') || lifecycle.force('COMPLETED');
      } else if (isHeuristic) {
        lifecycle.force('NOT_CONFIGURED', 'Reference heuristic result — not production');
      }

      const finalized =
        provider.postprocess !== undefined ? await provider.postprocess(prediction) : prediction;
      this.session.getWorkflow().transition('postprocessing');
      this.session.setPresentation('rebuilding');
      this.session.setProgress({
        completed: 6,
        total: 6,
        message: 'Reconstructing clinical model'
      });
      this.session.setViewMode('review');
      this.session.setPrediction(finalized);
      this.session.setGuideStep('adjust-boundaries');
      const meshFaceCount = Math.floor(mesh.indices.length / 3);
      const validation = validateSegmentationPrediction(finalized, {
        meshFaceCount,
        ...(archRole !== undefined ? { archRole } : {})
      });
      this.session.setValidationReport(validation);
      recordClinicalGeometryDevDiag({
        operation: 'segmentation-validation',
        objectId,
        fingerprint: finalized.geometryFingerprint,
        backend: finalized.providerId,
        framePolicy: 'transform-only',
        segmentationValidationVerdict: validation.verdict,
        faces: finalized.instances.reduce((n, i) => n + i.faceCount, 0)
      });
      if (validation.verdict === 'FAIL') {
        this.session.setRuntimeMessage(
          `Segmentation validation FAIL — ${validation.checks.find((c) => c.verdict === 'FAIL')?.message ?? 'see review'}`
        );
      } else if (validation.verdict === 'WARNING') {
        this.session.setRuntimeMessage(
          `Segmentation validation WARNING — review uncertain teeth before accept`
        );
      } else {
        this.session.setRuntimeMessage(
          `Segmentation validation PASS — ${String(validation.toothCount)} teeth`
        );
      }
      this.clinicalSession.notifyUi();
      await yieldFrame();
      this.session.getWorkflow().transition('validating');
      this.session.getWorkflow().transition('ready-for-review');
      this.session.setPresentation('review');
      this.session.setError(undefined);
      this.metrics.recordInference(finalized.metrics.totalMs ?? 0, finalized.instances.length);
      this.diagnostics.recordInferenceOk(finalized.providerId, finalized.instances.length);
      this.clinicalSession.notifyUi();
      return clinicalSuccess(undefined);
    } catch (err) {
      const message = isSegmentationError(err)
        ? `${err.code}: ${err.message}`
        : err instanceof Error
          ? err.message
          : 'INFERENCE_FAILED';
      const notConfigured = /not configured|MODEL_UNAVAILABLE/i.test(message);
      if (isProduction && notConfigured) {
        lifecycle.force('NOT_CONFIGURED', message);
      } else {
        lifecycle.force('FAILED', message);
      }
      this.session.getWorkflow().transition('failed');
      this.session.setPresentation('failed');
      this.session.setError(message);
      this.session.setPrediction(undefined);
      this.diagnostics.recordFailure(message);
      this.metrics.recordFailed();
      this.clinicalSession.notifyUi();
      return clinicalFailure('validation', message);
    } finally {
      if (watchdog !== undefined) clearTimeout(watchdog);
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
    const review = summarizeReview(state.prediction);
    if (review.needsReviewCount > 0 && !state.reviewAcknowledged) {
      return clinicalFailure(
        'validation',
        'Review required — inspect uncertain teeth, or acknowledge remaining review items before accept'
      );
    }
    // Always revalidate live prediction (never trust a stale post-infer cache alone).
    const validation = this.revalidatePrediction();
    if (validation === undefined || isSegmentationAcceptBlocked(validation)) {
      const msg =
        validation?.checks.find((c) => c.verdict === 'FAIL')?.message ??
        'Segmentation validation FAIL — cannot accept';
      return clinicalFailure('validation', `Segmentation validation FAIL — ${msg}`);
    }
    const membershipFaces = state.prediction.instances.reduce(
      (n, i) => n + i.faceIndices.length,
      0
    );
    if (membershipFaces <= 0) {
      return clinicalFailure(
        'validation',
        'Segmentation acceptance requires face membership on every accepted instance'
      );
    }
    const doc = this.clinicalSession.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    const liveObject = doc.objects.find((o) => o.id === state.targetObjectId);
    const expectedArch = liveObject?.archRole ?? 'unknown';
    if (
      liveObject === undefined ||
      state.prediction.geometryFingerprint !== liveObject.geometryFingerprint ||
      state.prediction.sourceRevision !== liveObject.geometryRevision ||
      (!isNonClinicalSegmentationProvider(state.prediction.providerId) &&
        state.prediction.inferenceProvenance?.arch !== expectedArch)
    ) {
      this.session
        .getProductionLifecycle()
        .force(
          'STALE',
          'Segmentation result no longer matches the current clinical geometry or arch'
        );
      return clinicalFailure('validation', 'Stale segmentation result cannot be accepted');
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
      validationVerdict: validation.verdict,
      now
    });
    if (!applied.ok) {
      this.session.getWorkflow().transition('failed');
      return applied;
    }
    this.history.push({
      label: 'Segmentation Accepted',
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
    if (!isNonClinicalSegmentationProvider(state.prediction.providerId)) {
      this.session.getProductionLifecycle().force('ACCEPTED');
    } else {
      this.session
        .getProductionLifecycle()
        .force('NOT_CONFIGURED', 'Accepted reference result — not production ACCEPTED');
    }
    this.diagnostics.recordAccept(state.prediction.instances.length);
    this.metrics.recordAccepted();
    this.manager.republishDocument(
      host,
      this.sceneBuilder,
      applied.value.next,
      'segmentation-accept'
    );

    const caseComplete = isCaseSegmentationComplete(applied.value.next);
    // CLN-SEG-002 — never unlock biomechanics solely because a heuristic exists.
    const movementOk =
      caseComplete &&
      !isNonClinicalSegmentationProvider(state.prediction.providerId) &&
      applied.value.next.objects.every((o) => {
        if (o.segmentationMeta === undefined) return true;
        return !isNonClinicalSegmentationProvider(o.segmentationMeta.providerId);
      });
    if (movementOk) {
      this.preparation.session.setStage('ready-for-movement');
      const withMilestone =
        applied.value.next.preparationMeta !== undefined
          ? withPreparationMeta(
              applied.value.next,
              Object.freeze({
                ...applied.value.next.preparationMeta,
                lastMilestone: 'segmented'
              }),
              Date.now()
            )
          : applied.value.next;
      if (withMilestone !== applied.value.next) {
        this.clinicalSession.applyDocument(withMilestone, true);
      }
      this.clinicalSession.getTools().deactivate();
      this.session.clear();
      const summary = summarizeCaseSegmentation(withMilestone);
      host.notifications.push(
        'success',
        'Segmentation Complete',
        `${String(summary.totalTeeth)} teeth · Needs review ${String(summary.totalNeedsReview)}`
      );
    } else if (caseComplete) {
      // Heuristic / non-production accept — case arches segmented but biomechanics stays locked.
      this.clinicalSession.getTools().deactivate();
      this.session.clear();
      const summary = summarizeCaseSegmentation(applied.value.next);
      host.notifications.push(
        'info',
        'Segmentation Accepted (Reference)',
        `${String(summary.totalTeeth)} teeth · Biomechanics remains locked (non-production provider)`
      );
    } else {
      const summary = summarizeCaseSegmentation(applied.value.next);
      const pending = summary.pendingArches[0];
      this.session.setPrediction(undefined);
      this.session.setSelectedInstance(undefined);
      this.session.setReviewAcknowledged(false);
      this.session.setPresentation('idle');
      this.session.getWorkflow().reset();
      this.session.getWorkflow().transition('activating');
      if (pending !== undefined) {
        this.setActiveArch(pending);
      }
      host.notifications.push(
        'success',
        'Segmentation',
        `Arch accepted — continue with ${summary.pendingArches.join(' / ') || 'remaining arches'}`
      );
    }
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public reject(): ClinicalResult<void> {
    this.operation.cancel();
    this.clinicalSession.getHost().runtimes.tools.cancelActive();
    this.session.getProductionLifecycle().force('REJECTED');
    this.session.getWorkflow().cancel();
    this.session.clear();
    // clear() resets lifecycle to NOT_CONFIGURED — restore REJECTED for honesty until next enter
    this.session.getProductionLifecycle().force('REJECTED');
    this.clinicalSession.getTools().deactivate();
    this.diagnostics.recordRejected();
    this.clinicalSession
      .getHost()
      .notifications.push('info', 'Segmentation', 'Rejected — document unchanged');
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
    this.applyReviewPrediction(result.prediction, result.meta);
    return clinicalSuccess(undefined);
  }

  public merge(aId: string, bId: string): ClinicalResult<void> {
    const pred = this.session.getState().prediction;
    if (pred === undefined) return clinicalFailure('lifecycle', 'No prediction');
    const result = mergeInstances(pred, aId, bId);
    this.applyReviewPrediction(result.prediction, result.meta);
    return clinicalSuccess(undefined);
  }

  public split(instanceId: string, faceSetA: readonly number[]): ClinicalResult<void> {
    const pred = this.session.getState().prediction;
    if (pred === undefined) return clinicalFailure('lifecycle', 'No prediction');
    const result = splitInstance(pred, instanceId, faceSetA);
    this.applyReviewPrediction(result.prediction, result.meta);
    return clinicalSuccess(undefined);
  }

  public markUnknown(instanceId: string): ClinicalResult<void> {
    return this.relabelFdi(instanceId, undefined);
  }

  public markMissing(instanceId: string): ClinicalResult<void> {
    const pred = this.session.getState().prediction;
    if (pred === undefined) return clinicalFailure('lifecycle', 'No prediction');
    const result = markInstanceMissing(pred, instanceId);
    this.applyReviewPrediction(result.prediction, result.meta);
    return clinicalSuccess(undefined);
  }

  public markSemantic(faceIndices: readonly number[], label: SemanticLabel): ClinicalResult<void> {
    const pred = this.session.getState().prediction;
    if (pred === undefined) return clinicalFailure('lifecycle', 'No prediction');
    const result = markSemanticFaces(pred, faceIndices, label);
    this.applyReviewPrediction(result.prediction, result.meta);
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

  private applyArchIsolation(objectId: ClinicalObjectId): void {
    if (this.viewport === undefined) return;
    this.viewport.isolate(objectId);
  }
}
