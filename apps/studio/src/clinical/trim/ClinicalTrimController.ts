/**
 * ClinicalTrimController — trim tool orchestration (drawing, preview, operation runtime, commit).
 */

import { asInteractionTargetId } from '@cad-studio/interaction-runtime';
import { asWorkflowStepId, asCommitTokenId } from '@cad-studio/tool-runtime';
import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { ClinicalObjectId, ClinicalArchRole } from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalMeshPicker } from '../display/ClinicalMeshPicker.js';
import type { ClinicalViewportRuntime } from '../display/ClinicalViewportRuntime.js';
import {
  asClinicalToolId,
  clinicalFailure,
  clinicalSuccess,
  type ClinicalResult
} from '../runtime/types.js';
import { ClinicalTrimSession } from './ClinicalTrimSession.js';
import { ClinicalTrimManager } from './ClinicalTrimManager.js';
import { ClinicalTrimOperation } from './ClinicalTrimOperation.js';
import { ClinicalTrimValidation } from './ClinicalTrimValidation.js';
import { ClinicalTrimHistory } from './ClinicalTrimHistory.js';
import {
  ClinicalTrimDiagnostics,
  ClinicalTrimMetrics
} from './ClinicalTrimObservability.js';
import { ClinicalTrimPreferencesStore } from './ClinicalTrimPreferences.js';
import {
  boundaryToStroke,
  shouldAddFreehandPoint,
  type TrimBoundaryPoint
} from './ClinicalTrimBoundaryMath.js';
import { buildClinicalTrimLoop3d } from './ClinicalTrimLoop3d.js';
import {
  boundaryPointsFromSurfacePath,
  buildAuthoritativeClosedSurfacePath,
  freehandMinSpacingMm,
  tryConnectPolylineAnchors
} from './ClinicalTrimSurfacePath.js';
import { thinSurfacePath } from '../../geometry-kernel/engine/index.js';
import {
  isLassoLikeTrimMode,
  isStrokeTrimMode,
  type TrimDrawMode
} from './ClinicalTrimState.js';
import { HybridGeometryBackend } from '../../geometry-kernel/adapters/HybridGeometryBackend.js';
import type { StudioCompositionRoot } from '../../application/composition-root.js';
import { computeAABB, cloneMesh } from '../../geometry-kernel/mesh/TriangleMesh.js';
import type { TriangleMesh } from '../../geometry-kernel/mesh/TriangleMesh.js';
import type {
  ClinicalArchContext,
  ClinicalArchVisibilityMode
} from '../shell/ClinicalArchContext.js';
import {
  getEditingReadinessMessage,
  isGeometryEditingReady,
  rewarmAfterGeometryMutation,
  startClinicalGeometryWarmup
} from '../geometry/ClinicalGeometryWarmup.js';
import { geometryWarmup } from '../../geometry-kernel/context/GeometryWarmup.js';
import { withPreparationMeta } from '../document/ClinicalDocument.js';

const TRIM_POINTER_OWNER = asInteractionTargetId('clinical-trim-draw');

const resolveLiveViewportSize = (
  host: StudioCompositionRoot
): { readonly width: number; readonly height: number } | undefined => {
  const cam = host.sessions.cameraSession?.getSnapshot();
  if (
    cam !== undefined &&
    cam.viewportSize.width > 1 &&
    cam.viewportSize.height > 1
  ) {
    return {
      width: cam.viewportSize.width,
      height: cam.viewportSize.height
    };
  }
  const el = document.querySelector('.clinical-document-host');
  if (el instanceof HTMLElement) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 1 && rect.height > 1) {
      return { width: rect.width, height: rect.height };
    }
  }
  return undefined;
};

export class ClinicalTrimController {
  public readonly session: ClinicalTrimSession;
  public readonly manager: ClinicalTrimManager;
  public readonly operation: ClinicalTrimOperation;
  public readonly validation: ClinicalTrimValidation;
  public readonly history: ClinicalTrimHistory;
  public readonly diagnostics: ClinicalTrimDiagnostics;
  public readonly metrics: ClinicalTrimMetrics;
  public readonly preferences: ClinicalTrimPreferencesStore;

  private interactionUnsub: (() => void) | undefined;
  private drawingPointerId: number | undefined;
  private kernelStartedAt = 0;
  /** True while Trim owns temporary arch isolation (restore on exit). */
  private trimIsolationActive = false;
  /** Preview mesh fingerprint before accept (non-destructive). */
  private previewReady = false;
  /** GEO-001F: worker-owned preview handle (no mesh re-upload on cancel/accept). */
  private workerPreviewId: string | undefined;
  private workerBaseFingerprint: string | undefined;
  /** Working mesh clone captured before kernel mutation (for undo). */
  private preKernelMesh: TriangleMesh | undefined;
  /** CLN-TRIM-002 — last real preview cut diagnostics (developer mode). */
  private previewDiagnostics: {
    readonly beforeFaces: number;
    readonly afterFaces: number;
    readonly removedFaces: number;
    readonly beforeFingerprint: string | null;
    readonly afterFingerprint: string | null;
    readonly meaningfulDelta: boolean;
    readonly qualityPassed: boolean;
  } | null = null;

  public constructor(
    private readonly clinicalSession: ClinicalSession,
    private readonly preparation: ClinicalPreparationRuntime,
    private readonly sceneBuilder: ClinicalSceneBuilder,
    private readonly meshPicker: ClinicalMeshPicker | undefined,
    private readonly viewport: ClinicalViewportRuntime | undefined,
    private readonly archContext?: ClinicalArchContext
  ) {
    this.session = new ClinicalTrimSession();
    this.manager = new ClinicalTrimManager();
    this.operation = new ClinicalTrimOperation();
    this.validation = new ClinicalTrimValidation();
    this.history = new ClinicalTrimHistory();
    this.diagnostics = new ClinicalTrimDiagnostics();
    this.metrics = new ClinicalTrimMetrics();
    this.preferences = new ClinicalTrimPreferencesStore();
  }

  public enter(preferredId?: ClinicalObjectId): ClinicalResult<void> {
    if (this.isActive()) {
      return clinicalFailure('conflict', 'Trim already active');
    }
    // Prefer shared arch context tool target when BOTH/UPPER/LOWER is set.
    let preferred = preferredId;
    if (preferred === undefined && this.archContext !== undefined) {
      const byArch = this.manager.resolveTargetByArch(
        this.clinicalSession,
        this.archContext.getToolTarget()
      );
      if (byArch.ok) {
        preferred = byArch.value.objectId;
      }
    }
    const target = this.manager.resolveTarget(this.clinicalSession, preferred);
    if (!target.ok) {
      this.diagnostics.recordValidationFailure(target.error.message);
      return target;
    }
    const activated = this.clinicalSession.activateTool(asClinicalToolId('trim'));
    if (!activated.ok) {
      return activated;
    }
    const now = Date.now();
    this.session.begin({ objectId: target.value.objectId, now });
    this.previewReady = false;
    this.diagnostics.recordSessionStart();
    this.metrics.recordTrimStart();
    this.applyArchPresentation(target.value.objectId, { fit: true });
    this.bindInteraction();
    // GEO-003: Trim may open while warming; drawing stays gated until READY.
    const mesh = this.resolveWorkingMesh(target.value.objectId as string);
    if (mesh !== undefined) {
      if (!isGeometryEditingReady(mesh.objectId, mesh.fingerprint)) {
        const msg =
          getEditingReadinessMessage(mesh.objectId, mesh.fingerprint) ??
          'Preparing editing tools…';
        this.session.patchStatus(msg);
        if (!geometryWarmup.isWarming(mesh.objectId, mesh.fingerprint)) {
          const doc = this.clinicalSession.getPublicState().activeCase;
          const archRole = doc?.objects.find((o) => o.id === target.value.objectId)?.archRole;
          void startClinicalGeometryWarmup(
            this.clinicalSession,
            [
              {
                objectId: mesh.objectId,
                archRole: archRole ?? 'upper',
                mesh
              }
            ]
          ).then(() => {
            if (this.isActive() && isGeometryEditingReady(mesh.objectId, mesh.fingerprint)) {
              this.session.patchStatus('Editing ready — draw on the scan, release to trim.');
              this.clinicalSession.notifyUi();
            }
          });
        }
      } else {
        this.session.patchStatus('Draw around the area to remove — release to trim.');
      }
    }
    this.preferences.update({ drawMode: 'lasso' });
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  /**
   * Switch active arch while Trim remains open.
   * Isolation is presentation-only; inactive arch stays in the case.
   * Does not reset camera (no fit) — operator may Fit explicitly.
   * Clears the active trim gesture so UPPER loops never run on LOWER.
   */
  public setActiveArch(arch: ClinicalArchRole): ClinicalResult<void> {
    return this.setArchVisibility(arch);
  }

  public setArchVisibility(mode: ClinicalArchVisibilityMode): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Trim not active');
    }
    this.archContext?.setMode(mode);
    const toolArch =
      mode === 'both'
        ? (this.archContext?.getToolTarget() ?? 'upper')
        : mode;
    if (mode !== 'both') {
      this.archContext?.setToolTarget(toolArch);
    }
    const target = this.manager.resolveTargetByArch(this.clinicalSession, toolArch);
    if (!target.ok) {
      return target;
    }
    const current = this.session.getState().targetObjectId;
    this.endDraw();
    this.operation.cancel();
    this.previewReady = false;
    this.clinicalSession.getHost().runtimes.tools.clearActiveIfTerminal();
    // Always clear gesture when switching arch — never reuse UPPER loop on LOWER.
    this.session.clearPoints();
    this.session.setLastHitSummary(undefined);
    if (current !== target.value.objectId) {
      this.session.retarget(target.value.objectId);
    }
    this.applyArchPresentation(target.value.objectId, { fit: true });
    // Framing follows visible arch — always fit when switching arches (CLN-WORKFLOW-002).
    this.viewport?.presentClinicalAnteriorView({ preferClinicalFrame: true });
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public setDrawMode(mode: TrimDrawMode): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Trim not active');
    }
    if (isStrokeTrimMode(mode) || mode === 'plane') {
      const gated = this.requireEditingReady();
      if (!gated.ok) {
        return gated;
      }
    }
    const previous = this.session.getState().drawMode;
    this.endDraw();
    // Tool switch: cancel old gesture so mode changes start clean.
    if (previous !== mode && previous !== 'idle') {
      this.operation.cancel();
      this.previewReady = false;
      this.previewDiagnostics = null;
      this.clinicalSession.getHost().runtimes.tools.clearActiveIfTerminal();
      if (
        this.session.getState().targetObjectId !== undefined &&
        this.preKernelMesh !== undefined
      ) {
        const objectId = this.session.getState().targetObjectId as string;
        const registry = this.clinicalSession.getHost().runtimes.kernel.registry;
        registry.commitWorking(objectId, this.preKernelMesh);
        registry.clearDisplay(objectId);
        registry.clearPreview(objectId);
        this.preKernelMesh = undefined;
        this.manager.republishDocument(
          this.clinicalSession.getHost(),
          this.sceneBuilder,
          this.clinicalSession.getPublicState().activeCase,
          'trim-tool-switch'
        );
      }
      this.session.clearPoints();
      this.session.setLastHitSummary(undefined);
      this.session.setPointerCaptured(false);
      this.drawingPointerId = undefined;
      this.workerPreviewId = undefined;
      this.workerBaseFingerprint = undefined;
    }
    this.session.resumeDrawingAfterPreview();
    this.session.setDrawMode(mode);
    if (mode !== 'idle' && (isStrokeTrimMode(mode) || mode === 'plane')) {
      this.preferences.update({ drawMode: mode });
    }
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public addPoint(point: TrimBoundaryPoint): ClinicalResult<void> {
    if (!this.isDrawing()) {
      return clinicalFailure('lifecycle', 'Trim not in drawing phase');
    }
    const gated = this.requireEditingReady();
    if (!gated.ok) {
      return gated;
    }
    const state = this.session.getState();
    if (state.drawMode === 'idle') {
      return clinicalFailure('validation', 'Choose Polyline or Freehand first');
    }
    // When BOTH arches are visible, ignore hits on the non-target arch.
    if (
      state.targetObjectId !== undefined &&
      point.objectId !== undefined &&
      point.objectId !== (state.targetObjectId as string)
    ) {
      return clinicalSuccess(undefined);
    }
    // Production contract: only surface hits become trim points.
    if (
      typeof point.localX !== 'number' ||
      typeof point.localY !== 'number' ||
      typeof point.localZ !== 'number' ||
      !Number.isFinite(point.localX) ||
      !Number.isFinite(point.localY) ||
      !Number.isFinite(point.localZ)
    ) {
      this.session.patchStatus('Move onto the scan to draw.');
      return clinicalSuccess(undefined);
    }
    const mesh = this.resolveWorkingMesh(state.targetObjectId as string | undefined);
    if (isLassoLikeTrimMode(state.drawMode)) {
      const last = state.points[state.points.length - 1];
      if (
        last !== undefined &&
        last.localX !== undefined &&
        point.localX !== undefined &&
        point.localY !== undefined &&
        point.localZ !== undefined
      ) {
        const dist = Math.hypot(
          point.localX - (last.localX ?? 0),
          point.localY - (last.localY ?? 0),
          point.localZ - (last.localZ ?? 0)
        );
        const minDist = freehandMinSpacingMm(mesh, last);
        if (dist < minDist) {
          return clinicalSuccess(undefined);
        }
      } else if (!shouldAddFreehandPoint(state.points, point)) {
        return clinicalSuccess(undefined);
      }
    }
    if (state.drawMode === 'polyline' && state.points.length >= 1 && mesh !== undefined) {
      const last = state.points[state.points.length - 1]!;
      const connect = tryConnectPolylineAnchors(mesh, last, point);
      if (!connect.ok) {
        this.session.patchStatus(connect.message);
        this.clinicalSession.notifyUi();
        return clinicalFailure('validation', connect.message);
      }
    }
    this.session.addPoint(point);
    this.previewReady = false;
    this.refreshLiveValidation();
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public setPreviewCursor(point: TrimBoundaryPoint | undefined): void {
    if (!this.isActive()) {
      return;
    }
    this.session.setPreviewCursor(point);
    this.clinicalSession.notifyUi();
  }

  public undoPoint(): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Trim not active');
    }
    this.session.undoPoint();
    this.refreshLiveValidation();
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public clearBoundary(): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Trim not active');
    }
    const armedMode = this.session.getState().drawMode;
    const state = this.session.getState();
    // Full gesture + operation reset — first new click must create point #1.
    // Do NOT call tools.cancelActive() — that tears down mid-preview ops in a way
    // that can leave the clinical Trim tool inactive. Mirror cancelPreview.
    this.endDraw();
    this.operation.cancel();
    this.previewReady = false;
    this.previewDiagnostics = null;
    this.clinicalSession.getHost().runtimes.tools.clearActiveIfTerminal();
    if (state.targetObjectId !== undefined && this.preKernelMesh !== undefined) {
      const registry = this.clinicalSession.getHost().runtimes.kernel.registry;
      registry.commitWorking(state.targetObjectId as string, this.preKernelMesh);
      registry.clearDisplay(state.targetObjectId as string);
      registry.clearPreview(state.targetObjectId as string);
    }
    this.preKernelMesh = undefined;
    const doc = this.clinicalSession.getPublicState().activeCase;
    this.manager.republishDocument(
      this.clinicalSession.getHost(),
      this.sceneBuilder,
      doc,
      'trim-clear'
    );
    this.session.clearPoints();
    this.session.setLastHitSummary(undefined);
    this.session.setPointerCaptured(false);
    this.drawingPointerId = undefined;
    this.workerPreviewId = undefined;
    this.workerBaseFingerprint = undefined;
    this.session.resumeDrawingAfterPreview();
    // Keep the same tool armed so Clear → redraw needs no re-click / reload.
    if (isStrokeTrimMode(armedMode) || armedMode === 'plane') {
      this.session.setDrawMode(armedMode);
      this.session.patchStatus('Cleared — draw again, release to trim.');
    }
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public resetDrawing(): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Trim not active');
    }
    this.endDraw();
    this.session.resetDrawing();
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public closeBoundary(): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Trim not active');
    }
    const state = this.session.getState();
    if (state.points.length < 3) {
      this.clinicalSession.notifyUi();
      return clinicalFailure('validation', 'Add at least 3 points before closing.');
    }
    const mesh = this.resolveWorkingMesh(state.targetObjectId as string | undefined);
    if (mesh !== undefined) {
      const closed = buildAuthoritativeClosedSurfacePath(mesh, state.points, state.drawMode);
      if (!closed.ok) {
        this.session.patchStatus(closed.message);
        this.diagnostics.recordValidationFailure(closed.message);
        this.clinicalSession.notifyUi();
        return clinicalFailure('validation', closed.message);
      }
      // Cap stored samples for UI/VTK — keep surface association via thinning.
      const capped = thinSurfacePath(closed.path, 1.0, 128);
      const densified = boundaryPointsFromSurfacePath(capped, state.points);
      this.session.setPoints(densified, true);
      this.session.patchStatus('Trim boundary closed along the scan surface');
    } else {
      this.session.closePoints();
    }
    this.refreshLiveValidation();
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public validate(): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Trim not active');
    }
    const now = Date.now();
    const state = this.session.getState();
    const host = this.clinicalSession.getHost();
    const report = this.validation.validate({
      session: this.clinicalSession,
      preparation: this.preparation,
      points: state.points,
      closed: state.closed,
      targetObjectId: state.targetObjectId,
      kernelAvailable: host.runtimes.geometry !== undefined && host.runtimes.tools !== undefined,
      now
    });
    this.session.setValidationReport(report);
    if (!report.passed) {
      const firstFail = report.checks.find((c) => !c.passed);
      const message = firstFail?.message ?? 'Trim validation failed';
      this.diagnostics.recordValidationFailure(message);
      this.clinicalSession.notifyUi();
      return clinicalFailure('validation', message);
    }
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public resolvePickPoint(
    screen: { readonly x: number; readonly y: number },
    canvasSize: { readonly width: number; readonly height: number }
  ): TrimBoundaryPoint {
    const state = this.session.getState();
    const preferred = state.targetObjectId as string | undefined;
    const hit = this.meshPicker?.pick({
      screenX: screen.x,
      screenY: screen.y,
      canvasWidth: canvasSize.width,
      canvasHeight: canvasSize.height,
      ...(preferred === undefined ? {} : { preferredObjectId: preferred })
    });
    if (hit !== undefined) {
      this.session.setLastHitSummary(
        `${hit.objectId} · (${hit.worldX.toFixed(1)}, ${hit.worldY.toFixed(1)}, ${hit.worldZ.toFixed(1)})`
      );
      const mesh = this.resolveWorkingMesh(hit.objectId);
      return Object.freeze({
        x: screen.x,
        y: screen.y,
        meshX: hit.meshX,
        meshY: hit.meshY,
        worldX: hit.worldX,
        worldY: hit.worldY,
        worldZ: hit.worldZ,
        localX: hit.localX,
        localY: hit.localY,
        localZ: hit.localZ,
        ...(hit.faceIndex !== undefined ? { faceId: hit.faceIndex } : {}),
        ...(mesh !== undefined ? { geometryFingerprint: mesh.fingerprint } : {}),
        objectId: hit.objectId
      });
    }
    this.session.setLastHitSummary(undefined);
    return Object.freeze({ x: screen.x, y: screen.y });
  }

  public async submit() {
    return this.runTrimKernel({ commitReady: false });
  }

  /**
   * Explicit preview — runs VTK clip without mutating working mesh (GEO-001E).
   * Accept promotes the exact preview fingerprint — no second clip.
   * CLN-TRIM-002: Reject orange-loop-only / no-op previews.
   */
  public async preview() {
    const result = await this.runTrimKernel({ commitReady: true, preview: true });
    if (!result.ok) {
      this.previewReady = false;
      this.previewDiagnostics = null;
      return result;
    }
    const objectId = this.session.getState().targetObjectId as string | undefined;
    const registry = this.clinicalSession.getHost().runtimes.kernel.registry;
    const before = this.preKernelMesh;
    const after =
      objectId === undefined
        ? undefined
        : (registry.getByObjectId(objectId, 'preview') ??
          registry.getByObjectId(objectId, 'display') ??
          registry.getByObjectId(objectId, 'working'));
    const beforeFaces =
      before === undefined ? 0 : Math.floor(before.indices.length / 3);
    const afterFaces =
      after === undefined ? 0 : Math.floor(after.indices.length / 3);
    const beforeFp = before?.fingerprint ?? null;
    const afterFp = after?.fingerprint ?? null;
    const fingerprintChanged =
      beforeFp !== null && afterFp !== null && beforeFp !== afterFp;
    const removedFaces = Math.max(0, beforeFaces - afterFaces);
    const faceDelta = Math.abs(beforeFaces - afterFaces);
    // A valid local trim may remove only a few triangles, especially on a dense
    // scan or near an incisor. Fingerprint + real face-count change is enough;
    // quality validation below remains the safety gate for malformed output.
    const meaningfulDelta = fingerprintChanged && faceDelta > 0;
    let qualityPassed = false;
    if (after !== undefined) {
      try {
        qualityPassed = this.clinicalSession.getHost().runtimes.kernel.backend.validate(after).ok;
      } catch {
        qualityPassed = false;
      }
    }
    this.previewDiagnostics = Object.freeze({
      beforeFaces,
      afterFaces,
      removedFaces,
      beforeFingerprint: beforeFp,
      afterFingerprint: afterFp,
      meaningfulDelta,
      qualityPassed
    });
    if (!meaningfulDelta || !qualityPassed) {
      this.previewReady = false;
      const message = !meaningfulDelta
        ? 'Preview did not remove a meaningful region — redraw a larger boundary on excess scan material.'
        : 'Preview mesh failed quality validation.';
      this.session.patchStatus(message);
      this.diagnostics.recordValidationFailure(message);
      this.clinicalSession.notifyUi();
      return clinicalFailure('validation', message);
    }
    this.previewReady = true;
    this.session.patchStatus('Review the actual cut, then Accept Trim.');
    this.clinicalSession.notifyUi();
    return result;
  }

  public cancelPreview(): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Trim not active');
    }
    this.operation.cancel();
    this.previewReady = false;
    this.previewDiagnostics = null;
    const objectId = this.session.getState().targetObjectId as string | undefined;
    const hybrid = this.resolveHybridBackend();
    if (hybrid !== undefined && objectId !== undefined) {
      void hybrid.vtkBackend
        .cancelWorkerPreview({
          objectId,
          ...(this.workerPreviewId !== undefined ? { previewId: this.workerPreviewId } : {})
        })
        .catch(() => undefined);
    }
    this.workerPreviewId = undefined;
    this.workerBaseFingerprint = undefined;
    this.clinicalSession.getHost().runtimes.tools.clearActiveIfTerminal();
    const state = this.session.getState();
    if (state.targetObjectId !== undefined && this.preKernelMesh !== undefined) {
      const registry = this.clinicalSession.getHost().runtimes.kernel.registry;
      registry.commitWorking(state.targetObjectId as string, this.preKernelMesh);
      registry.clearDisplay(state.targetObjectId as string);
      registry.clearPreview(state.targetObjectId as string);
    }
    this.preKernelMesh = undefined;
    const doc = this.clinicalSession.getPublicState().activeCase;
    this.manager.republishDocument(
      this.clinicalSession.getHost(),
      this.sceneBuilder,
      doc,
      'trim-preview-cancel'
    );
    // Critical: leave executing/submitting so Clear/redraw can continue without reload.
    this.session.resumeDrawingAfterPreview();
    this.session.patchStatus('Preview cancelled — boundary retained');
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public isPreviewReady(): boolean {
    return this.previewReady && this.previewDiagnostics?.meaningfulDelta === true;
  }

  /** Accept only after real preview with fingerprint change + quality. */
  public canAcceptTrim(): boolean {
    const state = this.session.getState();
    const report = state.validationReport;
    return (
      this.isPreviewReady() &&
      state.closed &&
      report !== undefined &&
      report.passed &&
      this.previewDiagnostics?.qualityPassed === true &&
      this.previewDiagnostics.meaningfulDelta === true
    );
  }

  public getPreviewDiagnostics(): {
    readonly beforeFaces: number;
    readonly afterFaces: number;
    readonly removedFaces: number;
    readonly beforeFingerprint: string | null;
    readonly afterFingerprint: string | null;
  } | null {
    if (this.previewDiagnostics === null) return null;
    return Object.freeze({
      beforeFaces: this.previewDiagnostics.beforeFaces,
      afterFaces: this.previewDiagnostics.afterFaces,
      removedFaces: this.previewDiagnostics.removedFaces,
      beforeFingerprint: this.previewDiagnostics.beforeFingerprint,
      afterFingerprint: this.previewDiagnostics.afterFingerprint
    });
  }

  private async runTrimKernel(options: {
    readonly commitReady: boolean;
    readonly preview?: boolean;
  }) {
    const validated = this.validate();
    if (!validated.ok) {
      return validated;
    }
    const doc = this.clinicalSession.getPublicState().activeCase;
    const state = this.session.getState();
    if (doc === undefined || state.targetObjectId === undefined) {
      return clinicalFailure('not-found', 'Missing trim context');
    }
    const host = this.clinicalSession.getHost();
    const process = host.processFeedback;
    process.begin({
      kind: 'trim',
      title: 'TRIMMING…',
      stages: [
        { id: 'validate', label: 'Validating boundary' },
        { id: 'worker', label: 'Clipping mesh' },
        { id: 'preview', label: 'Updating model' }
      ],
      initialStageId: 'validate'
    });
    this.session.markSubmitting();
    const viewport = resolveLiveViewportSize(host);
    const aabb = this.resolveTargetAabb(state.targetObjectId as string);
    const stroke = boundaryToStroke(state.points, aabb);
    const hasAnyLocal = state.points.some(
      (p) =>
        typeof p.localX === 'number' &&
        typeof p.localY === 'number' &&
        typeof p.localZ === 'number'
    );
    const hasAllLocal = state.points.every(
      (p) =>
        typeof p.localX === 'number' &&
        typeof p.localY === 'number' &&
        typeof p.localZ === 'number'
    );
    let loop3d: readonly { readonly x: number; readonly y: number; readonly z: number }[] | undefined;
    let loopNormal: readonly [number, number, number] | undefined;
    let keepMode: 'KEEP_OUTSIDE' | 'KEEP_INSIDE' | undefined;
    let algorithm: string | undefined;
    if (hasAnyLocal) {
      if (!hasAllLocal) {
        process.fail('Trim requires mesh-local surface-picked 3D boundary points.');
        process.complete();
        this.diagnostics.recordValidationFailure(
          'Trim requires mesh-local surface-picked 3D boundary points (local X/Y/Z).'
        );
        this.clinicalSession.notifyUi();
        return clinicalFailure(
          'validation',
          'Trim requires mesh-local surface-picked 3D boundary points (local X/Y/Z).'
        );
      }
      const loopBuilt = buildClinicalTrimLoop3d(state.points, 'KEEP_OUTSIDE');
      if (!loopBuilt.ok) {
        process.fail(loopBuilt.message);
        process.complete();
        this.diagnostics.recordValidationFailure(loopBuilt.message);
        this.clinicalSession.notifyUi();
        return clinicalFailure('validation', loopBuilt.message);
      }
      loop3d = loopBuilt.value.points;
      loopNormal = loopBuilt.value.normal;
      keepMode = loopBuilt.value.keepMode;
      algorithm = 'vtk-select-polydata';

      // GEO-001C: SurfacePath is authoritative — densify/close/validate before kernel.
      const registryEarly = host.runtimes.kernel.registry;
      registryEarly.ensureSourceMesh(state.targetObjectId as string);
      const meshForPath =
        registryEarly.getByObjectId(state.targetObjectId as string, 'working') ??
        registryEarly.getByObjectId(state.targetObjectId as string, 'source');
      if (meshForPath !== undefined) {
        const pathBuildStart = performance.now();
        // GEO-001E: buildAuthoritativeClosedSurfacePath skips geodesic when points
        // are already densified SurfacePath samples (faceIds present, ≥12 samples).
        const closed = buildAuthoritativeClosedSurfacePath(
          meshForPath,
          state.points,
          state.drawMode
        );
        if (!closed.ok) {
          process.fail(closed.message);
          process.complete();
          this.diagnostics.recordValidationFailure(closed.message);
          this.clinicalSession.notifyUi();
          return clinicalFailure('validation', closed.message);
        }
        this.session.patchStatus(
          `SurfacePath build ${(performance.now() - pathBuildStart).toFixed(0)}ms`
        );
        const forKernel = thinSurfacePath(closed.path, 1.0, 128);
        const origN = closed.path.samples.length;
        const thinN = forKernel.samples.length;
        // Hausdorff-like sample deviation after thinning (engineering gate).
        // Subsample original path to keep gate O(≤256 × thinN) on dense dental paths.
        let maxDev = 0;
        const stride = Math.max(1, Math.floor(origN / 256));
        for (let i = 0; i < origN; i += stride) {
          const s = closed.path.samples[i]!;
          let best = Infinity;
          for (const t of forKernel.samples) {
            const d = Math.hypot(
              s.point[0] - t.point[0],
              s.point[1] - t.point[1],
              s.point[2] - t.point[2]
            );
            best = Math.min(best, d);
          }
          maxDev = Math.max(maxDev, best);
        }
        const meanEdge =
          closed.path.length / Math.max(1, closed.path.samples.length);
        const thinTol = Math.max(2.5, meanEdge * 3);
        if (maxDev > thinTol) {
          const message = `Boundary thinning changed clinical path too much (maxDeviation=${maxDev.toFixed(2)} mm > ${thinTol.toFixed(2)} mm)`;
          process.fail(message);
          process.complete();
          this.diagnostics.recordValidationFailure(message);
          this.clinicalSession.notifyUi();
          return clinicalFailure('validation', message);
        }
        this.session.patchStatus(
          `SurfacePath ${String(origN)}→${String(thinN)} samples · thinDev=${maxDev.toFixed(2)} mm`
        );
        loop3d = forKernel.samples.map((s) => ({
          x: s.point[0],
          y: s.point[1],
          z: s.point[2]
        }));
      }
    }
    process.setStage('worker');
    const registry = host.runtimes.kernel.registry;
    const objectId = state.targetObjectId as string;
    // Ensure a working buffer exists before capture (tests may seed descriptors only).
    registry.ensureSourceMesh(objectId);
    const currentWorking =
      registry.getByObjectId(objectId, 'working') ??
      registry.getByObjectId(objectId, 'source');
    this.preKernelMesh =
      currentWorking === undefined ? undefined : cloneMesh(currentWorking);
    const started = this.operation.start({
      tools: host.runtimes.tools,
      document: doc,
      targetObjectId: state.targetObjectId as string,
      points: state.points,
      stroke,
      drawMode: state.drawMode,
      preview: options.preview === true,
      ...(loop3d === undefined ? {} : { loop3d }),
      ...(loopNormal === undefined ? {} : { loopNormal }),
      ...(keepMode === undefined ? {} : { keepMode }),
      ...(algorithm === undefined ? {} : { algorithm }),
      ...(viewport === undefined ? {} : { viewport })
    });
    if (!started.ok) {
      process.fail(started.error.message);
      process.complete();
      this.diagnostics.recordValidationFailure(started.error.message);
      return started;
    }
    this.operation.setBoundaryPreview(state.points);
    this.kernelStartedAt = Date.now();
    this.session.markExecuting(undefined, started.value.id);
    const ran = await this.operation.runKernel();
    if (!ran.ok) {
      process.fail(ran.error.message);
      process.complete();
      this.diagnostics.recordValidationFailure(ran.error.message);
      this.operation.cancel();
      host.runtimes.tools.clearActiveIfTerminal();
      this.previewReady = false;
      this.clinicalSession.notifyUi();
      return ran;
    }
    process.setStage('preview');
    const opSession = this.operation.getSession();
    const fingerprint = opSession?.snapshot().kernelResult?.fingerprint;
    const previewId =
      this.readMeta(
        opSession?.snapshot().kernelResult?.payload as
          | { readonly diagnostics?: unknown; readonly warnings?: unknown }
          | undefined,
        'previewId'
      ) ?? undefined;
    this.workerPreviewId = previewId;
    this.workerBaseFingerprint = this.preKernelMesh?.fingerprint;
    this.session.markExecuting(fingerprint, opSession?.id ?? '');
    if (options.commitReady) {
      this.previewReady = true;
    }
    process.complete();
    host.notifications.clearProgress('Trim');
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  private resolveHybridBackend(): HybridGeometryBackend | undefined {
    const backend = this.clinicalSession.getHost().runtimes.kernel.backend;
    return backend instanceof HybridGeometryBackend ? backend : undefined;
  }

  /** GEO-003: drawing/ops require warmed clinical spatial + context. */
  private requireEditingReady(): ClinicalResult<void> {
    const objectId = this.session.getState().targetObjectId as string | undefined;
    const mesh = this.resolveWorkingMesh(objectId);
    if (mesh === undefined) {
      return clinicalFailure('not-found', 'No working geometry for trim target');
    }
    if (isGeometryEditingReady(mesh.objectId, mesh.fingerprint)) {
      return clinicalSuccess(undefined);
    }
    const status = geometryWarmup.getStatus(mesh.objectId);
    if (status?.state === 'FAILED' && status.geometryFingerprint === mesh.fingerprint) {
      const msg = 'Editing tools could not be prepared.';
      this.session.patchStatus(msg);
      this.clinicalSession.notifyUi();
      return clinicalFailure('unavailable', msg);
    }
    const msg =
      getEditingReadinessMessage(mesh.objectId, mesh.fingerprint) ??
      'Preparing editing tools…';
    this.session.patchStatus(msg);
    this.clinicalSession.notifyUi();
    return clinicalFailure('unavailable', msg);
  }

  private scheduleRewarm(mesh: TriangleMesh): void {
    const doc = this.clinicalSession.getPublicState().activeCase;
    const archRole = doc?.objects.find((o) => (o.id as string) === mesh.objectId)?.archRole;
    void rewarmAfterGeometryMutation(this.clinicalSession, mesh, archRole);
  }

  private readMeta(
    payload: { readonly diagnostics?: unknown; readonly warnings?: unknown } | undefined,
    key: string
  ): string | undefined {
    if (payload === undefined) return undefined;
    const prefix = `meta:${key}=`;
    for (const bag of [payload.diagnostics, payload.warnings]) {
      if (!Array.isArray(bag)) continue;
      for (const row of bag) {
        if (typeof row !== 'string' || !row.startsWith(prefix)) continue;
        const v = row.slice(prefix.length);
        if (v.length > 0) return v;
      }
    }
    return undefined;
  }

  public async accept() {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Trim not active');
    }
    // CLN-TRIM-002: Accept is impossible before a real preview — no silent auto-preview.
    if (!this.canAcceptTrim()) {
      return clinicalFailure(
        'validation',
        'Run Preview and confirm a real cut before Accept Trim.'
      );
    }
    const state = this.session.getState();
    if (state.targetObjectId === undefined) {
      return clinicalFailure('validation', 'No trim target');
    }
    const now = Date.now();
    this.session.markCommitting();
    // GEO-001E: promote exact preview mesh → working without a second clip.
    const host = this.clinicalSession.getHost();
    const registry = host.runtimes.kernel.registry;
    const objectId = state.targetObjectId as string;
    const previewMesh = registry.getByObjectId(objectId, 'preview');
    if (previewMesh !== undefined) {
      // GEO-001E Accept: full quality check on the exact preview mesh before promote.
      try {
        const acceptQuality = host.runtimes.kernel.backend.validate(previewMesh);
        if (!acceptQuality.ok) {
          this.previewReady = false;
          const message =
            acceptQuality.warnings[0] ??
            'Trim Accept rejected — preview mesh failed full quality validation.';
          this.diagnostics.recordValidationFailure(message);
          return clinicalFailure('validation', message);
        }
      } catch (err) {
        this.previewReady = false;
        const message = err instanceof Error ? err.message : 'Trim Accept quality check failed.';
        this.diagnostics.recordValidationFailure(message);
        return clinicalFailure('validation', message);
      }
      const promoted = registry.commitWorking(objectId, {
        ...previewMesh,
        role: 'working',
        revision: previewMesh.revision
      });
      registry.clearPreview(objectId);
      // GEO-001F: promote worker-resident preview → working without recomputing Trim.
      const hybrid = this.resolveHybridBackend();
      if (
        hybrid !== undefined &&
        this.workerPreviewId !== undefined &&
        this.workerBaseFingerprint !== undefined
      ) {
        void hybrid.vtkBackend
          .acceptWorkerPreview({
            objectId,
            previewId: this.workerPreviewId,
            expectedBaseFingerprint: this.workerBaseFingerprint,
            promotedFingerprint: promoted.fingerprint
          })
          .catch(() => undefined);
      }
      this.workerPreviewId = undefined;
      this.workerBaseFingerprint = undefined;
      try {
        const display = host.runtimes.kernel.backend.prepareDisplay(promoted);
        registry.setDisplay(objectId, { ...display.mesh, revision: promoted.revision });
      } catch {
        registry.clearDisplay(objectId);
      }
    }
    const committed = this.operation.commit();
    if (!committed.ok) {
      this.diagnostics.recordValidationFailure(committed.error.message);
      this.previewReady = false;
      return committed;
    }
    const kernelMs = now - this.kernelStartedAt;
    const previousMesh = this.preKernelMesh;
    const previewFp = committed.value.commandIntent.kernelFingerprint ?? '';
    const workingAfter =
      registry.getByObjectId(objectId, 'working') ??
      registry.getByObjectId(objectId, 'source');
    if (
      workingAfter !== undefined &&
      previewFp.length > 0 &&
      workingAfter.fingerprint !== previewFp &&
      `geo:${workingAfter.fingerprint}` !== previewFp &&
      workingAfter.fingerprint !== previewFp.replace(/^geo:/, '')
    ) {
      // Still apply document from kernel fingerprint — mesh role may already match.
    }
    const applied = this.manager.applyTrimCommit({
      session: this.clinicalSession,
      objectId: state.targetObjectId,
      fingerprint: previewFp,
      kernelPayload: committed.value.commandIntent.payload,
      now
    });
    if (!applied.ok) {
      this.previewReady = false;
      return applied;
    }
    const nextMesh =
      registry.getByObjectId(objectId, 'working') ??
      registry.getByObjectId(objectId, 'source');
    if (previousMesh === undefined || nextMesh === undefined) {
      this.previewReady = false;
      return clinicalFailure('unavailable', 'Trim history missing mesh buffers');
    }
    if (nextMesh.fingerprint === previousMesh.fingerprint) {
      this.previewReady = false;
      this.diagnostics.recordValidationFailure('Trim Accept committed no geometry change.');
      return clinicalFailure('validation', 'Trim Accept committed no geometry change.');
    }
    this.history.push({
      label: 'Trim mesh',
      objectId,
      fingerprint: committed.value.commandIntent.kernelFingerprint ?? '',
      previous: applied.value.previous,
      next: applied.value.next,
      previousMesh,
      nextMesh,
      createdAt: now
    });
    this.preKernelMesh = undefined;
    const token = committed.value.tokenId;
    host.runtimes.tools.workflowGate.advance(
      asWorkflowStepId('ready-for-trim'),
      asCommitTokenId(token)
    );
    // PROD-003: Trim Accept unlocks Close Base (not Segmentation).
    this.preparation.session.setStage('ready-for-close-base');
    const activeDoc = this.clinicalSession.getPublicState().activeCase;
    if (activeDoc?.preparationMeta !== undefined) {
      this.clinicalSession.applyDocument(
        withPreparationMeta(
          activeDoc,
          Object.freeze({
            ...activeDoc.preparationMeta,
            lastMilestone: 'trimmed'
          }),
          Date.now()
        ),
        true
      );
    }
    host.runtimes.tools.clearActiveIfTerminal();
    this.operation.dispose();
    const duration = now - (state.sessionStartedAt ?? now);
    this.diagnostics.recordCommit(duration, state.points.length, kernelMs);
    this.metrics.recordAccepted(duration, state.points.length, kernelMs);
    this.endDraw();
    this.previewReady = false;
    this.manager.republishDocument(host, this.sceneBuilder, applied.value.next, 'trim-commit');
    // Stay in Trim for additional cuts on the same arch (multi-trim). Isolation preserved.
    // Camera is not reset (republish uses fitCamera: false).
    this.session.continueAfterCommit({
      objectId: state.targetObjectId,
      now: Date.now()
    });
    // GEO-003: fingerprint changed — invalidate old context and rewarm async.
    this.scheduleRewarm(nextMesh);
    this.clinicalSession.getHost().notifications.push(
      'success',
      'Trim',
      'Trim accepted — continue or switch arch'
    );
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public cancel(): ClinicalResult<void> {
    if (this.session.getState().phase === 'idle') {
      return clinicalSuccess(undefined);
    }
    this.endDraw();
    this.operation.cancel();
    this.clinicalSession.getHost().runtimes.tools.cancelActive();
    this.session.markCancelled();
    this.diagnostics.recordCancelled();
    this.metrics.recordCancelled();
    this.unbindInteraction();
    this.clinicalSession.getTools().deactivate();
    const doc = this.clinicalSession.getPublicState().activeCase;
    this.manager.republishDocument(
      this.clinicalSession.getHost(),
      this.sceneBuilder,
      doc,
      'trim-cancel'
    );
    this.restoreTrimIsolation();
    this.session.clear();
    // Status bar / trim session message covers cancel — avoid toast spam.
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public undo(): ClinicalResult<void> {
    const entry = this.history.undo();
    if (!entry.ok) {
      return entry;
    }
    const applied = this.clinicalSession.applyDocument(entry.value.previous, true);
    if (!applied.ok) {
      return applied;
    }
    const registry = this.clinicalSession.getHost().runtimes.kernel.registry;
    registry.commitWorking(entry.value.objectId, entry.value.previousMesh);
    registry.clearDisplay(entry.value.objectId);
    this.manager.republishDocument(
      this.clinicalSession.getHost(),
      this.sceneBuilder,
      entry.value.previous,
      'trim-undo'
    );
    this.scheduleRewarm(entry.value.previousMesh);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public redo(): ClinicalResult<void> {
    const entry = this.history.redo();
    if (!entry.ok) {
      return entry;
    }
    const applied = this.clinicalSession.applyDocument(entry.value.next, true);
    if (!applied.ok) {
      return applied;
    }
    const registry = this.clinicalSession.getHost().runtimes.kernel.registry;
    registry.commitWorking(entry.value.objectId, entry.value.nextMesh);
    registry.clearDisplay(entry.value.objectId);
    this.manager.republishDocument(
      this.clinicalSession.getHost(),
      this.sceneBuilder,
      entry.value.next,
      'trim-redo'
    );
    this.scheduleRewarm(entry.value.nextMesh);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public beginDraw(pointerId: number): void {
    if (!this.isDrawing()) {
      return;
    }
    if (this.session.getState().drawMode === 'idle') {
      return;
    }
    this.drawingPointerId = pointerId;
    this.session.setPointerCaptured(true);
    this.clinicalSession
      .getHost()
      .sessions.interactionSession?.capturePointer(pointerId, TRIM_POINTER_OWNER);
  }

  public endDraw(): void {
    if (this.drawingPointerId === undefined) {
      this.session.setPointerCaptured(false);
      return;
    }
    this.clinicalSession
      .getHost()
      .sessions.interactionSession?.releasePointer(this.drawingPointerId, TRIM_POINTER_OWNER);
    this.drawingPointerId = undefined;
    this.session.setPointerCaptured(false);
  }

  /**
   * CLN-WORKSTATION-001 — pointer release completes the gesture:
   * close → real trim compute → auto-accept when valid (Undo remains).
   */
  public async completeGestureAndTrim() {
    if (!this.isActive()) {
      return clinicalFailure('lifecycle', 'Trim not active');
    }
    this.endDraw();
    const mode = this.session.getState().drawMode;
    if (!isLassoLikeTrimMode(mode) && mode !== 'plane') {
      return clinicalSuccess(undefined);
    }
    const points = this.session.getState().points;
    if (points.length < 3) {
      this.session.patchStatus('Draw a larger loop, then release.');
      this.clinicalSession.notifyUi();
      return clinicalFailure('validation', 'Need at least 3 surface points');
    }
    this.session.patchStatus('Trimming…');
    this.clinicalSession.notifyUi();
    let closed = this.closeBoundary();
    // Lasso freehand can self-cross on SurfacePath; thin to angular samples and retry once.
    if (
      !closed.ok &&
      isLassoLikeTrimMode(mode) &&
      /crosses itself|SELF_INTERSECT/i.test(closed.error?.message ?? '')
    ) {
      const raw = this.session.getState().points;
      if (raw.length >= 4) {
        const target = 5;
        const step = Math.max(1, Math.floor(raw.length / target));
        const thinned = raw.filter((_, i) => i % step === 0 || i === raw.length - 1).slice(0, target);
        if (thinned.length >= 3) {
          this.session.setPoints(thinned, false);
          closed = this.closeBoundary();
        }
      }
    }
    if (!closed.ok) {
      return closed;
    }
    const previewed = await this.preview();
    if (!previewed.ok) {
      return previewed;
    }
    if (!this.canAcceptTrim()) {
      this.session.patchStatus('Trim needs review — use Undo or Clear.');
      this.clinicalSession.notifyUi();
      return clinicalFailure('validation', 'Trim result needs review');
    }
    const accepted = await this.accept();
    if (accepted.ok) {
      this.clinicalSession.getHost().notifications.push('success', 'Trim', 'Trim complete');
      if (isStrokeTrimMode(mode) || mode === 'plane') {
        this.session.setDrawMode(mode);
        this.session.patchStatus('Trim complete — draw again or continue to Base.');
      }
      this.clinicalSession.notifyUi();
    }
    return accepted;
  }

  public isPointerCaptured(): boolean {
    return this.drawingPointerId !== undefined;
  }

  public isActive(): boolean {
    return this.session.getWorkflow().isActive();
  }

  public isDrawing(): boolean {
    const phase = this.session.getState().phase;
    return phase === 'drawing' || phase === 'preview-boundary' || phase === 'validating';
  }

  /** GEO-003: true when clinical spatial/context is READY for the target mesh. */
  public isEditingReady(): boolean {
    const objectId = this.session.getState().targetObjectId as string | undefined;
    const mesh = this.resolveWorkingMesh(objectId);
    if (mesh === undefined) return false;
    return isGeometryEditingReady(mesh.objectId, mesh.fingerprint);
  }

  public getEditingReadyMessage(): string | undefined {
    const objectId = this.session.getState().targetObjectId as string | undefined;
    const mesh = this.resolveWorkingMesh(objectId);
    if (mesh === undefined) return 'Preparing editing tools…';
    return getEditingReadinessMessage(mesh.objectId, mesh.fingerprint);
  }

  public dispose(): void {
    this.unbindInteraction();
    this.operation.dispose();
    this.restoreTrimIsolation();
    this.session.clear();
  }

  /**
   * Arch presentation: UPPER/LOWER isolate; BOTH shows all with explicit tool target.
   * Does not delete or unload inactive geometry — descriptor visibility only.
   * Fit only when explicitly requested (enter); never after validate/preview/accept/switch.
   */
  private applyArchPresentation(
    objectId: ClinicalObjectId,
    options?: { readonly fit?: boolean }
  ): void {
    if (this.viewport === undefined) {
      return;
    }
    // CLN-WORKFLOW-002: Trim never shows BOTH — isolate the active arch only.
    const isolated = this.viewport.isolate(objectId);
    if (!isolated.ok) {
      return;
    }
    this.trimIsolationActive = true;
    if (options?.fit === true) {
      this.viewport.fitAll();
    }
  }

  /** @deprecated Use applyArchPresentation — kept for clarity in call sites. */
  // Isolation helpers live on applyArchPresentation only.

  private restoreTrimIsolation(): void {
    if (!this.trimIsolationActive || this.viewport === undefined) {
      this.trimIsolationActive = false;
      return;
    }
    this.trimIsolationActive = false;
    this.viewport.showAll();
  }

  /** Lightweight live checks while drawing — no toast flood. */
  private refreshLiveValidation(): void {
    const state = this.session.getState();
    if (state.points.length === 0) {
      return;
    }
    const now = Date.now();
    const report = this.validation.validateLive({
      session: this.clinicalSession,
      points: state.points,
      closed: state.closed,
      targetObjectId: state.targetObjectId,
      now
    });
    this.session.setLiveValidationReport(report);
  }

  private resolveWorkingMesh(objectId: string | undefined): TriangleMesh | undefined {
    if (objectId === undefined) {
      return undefined;
    }
    const registry = this.clinicalSession.getHost().runtimes.kernel.registry;
    return (
      registry.getByObjectId(objectId, 'working') ??
      registry.getByObjectId(objectId, 'source')
    );
  }

  private resolveTargetAabb(objectId: string):
    | {
        readonly minX: number;
        readonly minY: number;
        readonly spanX: number;
        readonly spanY: number;
      }
    | undefined {
    const registry = this.clinicalSession.getHost().runtimes.kernel.registry;
    const mesh =
      registry.getByObjectId(objectId, 'display') ??
      registry.getByObjectId(objectId, 'working') ??
      registry.getByObjectId(objectId, 'source');
    if (mesh === undefined) {
      return undefined;
    }
    const aabb = computeAABB(mesh.positions);
    return {
      minX: aabb.min[0],
      minY: aabb.min[1],
      spanX: Math.max(1e-9, aabb.max[0] - aabb.min[0]),
      spanY: Math.max(1e-9, aabb.max[1] - aabb.min[1])
    };
  }

  private bindInteraction(): void {
    this.unbindInteraction();
    const interaction = this.clinicalSession.getHost().sessions.interactionSession;
    if (interaction === undefined) {
      return;
    }
    this.interactionUnsub = interaction.subscribe((event) => {
      if (!this.isDrawing() || event.kind !== 'pointer') {
        return;
      }
      if (this.drawingPointerId === undefined) {
        return;
      }
      if (event.pointerId !== this.drawingPointerId) {
        return;
      }
      if (event.phase === 'move' && isLassoLikeTrimMode(this.session.getState().drawMode)) {
        return;
      }
      if (event.phase === 'up' || event.phase === 'cancel') {
        this.endDraw();
      }
    });
  }

  private unbindInteraction(): void {
    this.interactionUnsub?.();
    this.interactionUnsub = undefined;
    this.endDraw();
  }
}
