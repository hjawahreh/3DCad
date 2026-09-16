/**
 * ClinicalTrimSession — live trim state (no document mutation until commit).
 */

import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import {
  DEFAULT_TRIM_STATE,
  type ClinicalTrimState,
  type TrimDrawMode
} from './ClinicalTrimState.js';
import { ClinicalTrimWorkflow } from './ClinicalTrimWorkflow.js';
import { ClinicalTrimLifecycle } from './ClinicalTrimLifecycle.js';
import type { TrimValidationReport } from './ClinicalTrimValidation.js';
import {
  clonePoint,
  clonePoints,
  closeBoundary,
  isClosedBoundary,
  type TrimBoundaryPoint
} from './ClinicalTrimBoundaryMath.js';
import type { TrimWorkflowPhase } from './ClinicalTrimWorkflow.js';

export class ClinicalTrimSession {
  private readonly workflow = new ClinicalTrimWorkflow();
  private readonly lifecycle = new ClinicalTrimLifecycle();
  private state: ClinicalTrimState = DEFAULT_TRIM_STATE;
  private readonly listeners = new Set<() => void>();

  public getState(): ClinicalTrimState {
    return this.state;
  }

  public getWorkflow(): ClinicalTrimWorkflow {
    return this.workflow;
  }

  public getLifecycle(): ClinicalTrimLifecycle {
    return this.lifecycle;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public begin(input: {
    readonly objectId: ClinicalObjectId;
    readonly now: number;
  }): void {
    this.workflow.reset();
    this.lifecycle.reset();
    this.lifecycle.transition('created');
    this.lifecycle.transition('active');
    this.workflow.transition('activating');
    this.workflow.transition('acquiring-pointer');
    this.workflow.transition('drawing');
    this.patch({
      phase: 'drawing',
      lifecycle: 'active',
      targetObjectId: input.objectId,
      drawMode: 'lasso',
      points: Object.freeze([]),
      closed: false,
      previewActive: true,
      previewCursor: undefined,
      pointerCaptured: false,
      lastHitSummary: undefined,
      validationReport: undefined,
      sessionStartedAt: input.now,
      statusMessage: 'Draw around the area to remove — release to trim.'
    });
  }

  public setDrawMode(mode: TrimDrawMode): void {
    const message =
      mode === 'idle'
        ? 'Choose Lasso or Curve, then draw on the scan.'
        : mode === 'lasso' || mode === 'freehand'
          ? 'Draw around the area to remove — release to trim.'
          : mode === 'curve' || mode === 'polyline'
            ? 'Draw a smooth curve — release to trim.'
            : mode === 'plane'
              ? 'Adjust the cutting plane, then Done.'
              : 'Draw on the scan.';
    this.patch({
      drawMode: mode,
      previewCursor: undefined,
      statusMessage: message
    });
  }

  public setPoints(points: readonly TrimBoundaryPoint[], closed?: boolean): void {
    const isClosed = closed ?? isClosedBoundary(points);
    if (this.state.phase === 'drawing') {
      if (!this.workflow.transition('preview-boundary')) {
        // Keep session phase coherent even if workflow was mid-execute (should be rare after resume).
        this.workflow.reset();
        this.workflow.transition('activating');
        this.workflow.transition('acquiring-pointer');
        this.workflow.transition('drawing');
        this.workflow.transition('preview-boundary');
      }
    }
    this.patch({
      phase: this.workflow.getPhase() === 'idle' ? 'drawing' : this.workflow.getPhase(),
      points: Object.freeze(clonePoints(points)),
      closed: isClosed,
      previewActive: true,
      validationReport: undefined,
      statusMessage: isClosed
        ? `Boundary closed — ${String(points.length)} points. Validate and accept.`
        : `Boundary: ${String(points.length)} point${points.length === 1 ? '' : 's'}`
    });
  }

  public addPoint(point: TrimBoundaryPoint): void {
    const next = Object.freeze([...this.state.points, clonePoint(point)]);
    this.setPoints(next);
  }

  public undoPoint(): void {
    if (this.state.points.length === 0) {
      return;
    }
    this.setPoints(this.state.points.slice(0, -1), false);
    this.patch({ statusMessage: 'Removed last point' });
  }

  public clearPoints(): void {
    // After preview/execute, workflow may be submitting/executing — force back to drawing.
    if (!this.workflow.canTransition('drawing')) {
      this.workflow.reset();
      this.workflow.transition('activating');
      this.workflow.transition('acquiring-pointer');
      this.workflow.transition('drawing');
    } else {
      this.workflow.transition('drawing');
    }
    this.lifecycle.reset();
    this.lifecycle.transition('created');
    this.lifecycle.transition('active');
    this.patch({
      phase: 'drawing',
      lifecycle: 'active',
      points: Object.freeze([]),
      closed: false,
      validationReport: undefined,
      previewCursor: undefined,
      previewActive: true,
      pointerCaptured: false,
      lastHitSummary: undefined,
      kernelFingerprint: undefined,
      operationId: undefined,
      statusMessage: 'Boundary cleared — click to start a new loop'
    });
  }

  public patchStatus(message: string): void {
    this.patch({ statusMessage: message });
  }

  /** Return to editable drawing after preview cancel / failed execute. */
  public resumeDrawingAfterPreview(): void {
    if (!this.workflow.canTransition('drawing')) {
      this.workflow.reset();
      this.workflow.transition('activating');
      this.workflow.transition('acquiring-pointer');
      this.workflow.transition('drawing');
    } else {
      this.workflow.transition('drawing');
    }
    this.lifecycle.reset();
    this.lifecycle.transition('created');
    this.lifecycle.transition('active');
    this.patch({
      phase: 'drawing',
      lifecycle: 'active',
      previewActive: true,
      pointerCaptured: false,
      kernelFingerprint: undefined,
      operationId: undefined,
      validationReport: undefined
    });
  }

  /** Reset drawing state while remaining inside Trim (idle mode). */
  public resetDrawing(): void {
    this.workflow.transition('drawing');
    this.patch({
      phase: 'drawing',
      drawMode: 'idle',
      points: Object.freeze([]),
      closed: false,
      validationReport: undefined,
      previewCursor: undefined,
      pointerCaptured: false,
      lastHitSummary: undefined,
      statusMessage: 'Choose Polyline or Freehand, then draw on the scan'
    });
  }

  public closePoints(): void {
    const closed = closeBoundary(this.state.points);
    this.setPoints(closed, true);
  }

  public setValidationReport(report: TrimValidationReport): void {
    this.workflow.transition('validating');
    const fail = report.checks.find((c) => !c.passed);
    this.patch({
      phase: 'validating',
      validationReport: report,
      statusMessage: report.passed
        ? 'Boundary is valid.'
        : fail?.message ?? 'Validation failed'
    });
  }

  /** Live validation — update report without leaving the drawing loop noisily. */
  public setLiveValidationReport(report: TrimValidationReport): void {
    const fail = report.checks.find((c) => !c.passed);
    const severe =
      fail !== undefined &&
      (fail.id === 'self-intersection' ||
        fail.id === 'target-surface' ||
        fail.id === 'finite-values' ||
        fail.id === 'boundary-area');
    this.patch({
      validationReport: report,
      ...(severe
        ? { statusMessage: fail.message }
        : report.passed && this.state.closed
          ? { statusMessage: 'Boundary is valid.' }
          : {})
    });
  }

  public setPreviewCursor(point: TrimBoundaryPoint | undefined): void {
    this.patch({ previewCursor: point === undefined ? undefined : clonePoint(point) });
  }

  public setPointerCaptured(captured: boolean): void {
    this.patch({ pointerCaptured: captured });
  }

  public setLastHitSummary(summary: string | undefined): void {
    this.patch({ lastHitSummary: summary });
  }

  public markSubmitting(): void {
    this.workflow.transition('submitting');
    this.lifecycle.transition('previewing');
    this.patch({ phase: 'submitting', lifecycle: 'previewing', statusMessage: 'Submitting trim operation' });
  }

  public markExecuting(fingerprint: string | undefined, operationId: string): void {
    this.workflow.transition('executing');
    this.patch({
      phase: 'executing',
      kernelFingerprint: fingerprint,
      operationId,
      statusMessage: 'Executing trim via Operation Runtime'
    });
  }

  public markCommitting(): void {
    this.workflow.transition('committing');
    this.lifecycle.transition('committing');
    this.patch({ phase: 'committing', lifecycle: 'committing', statusMessage: 'Committing trim' });
  }

  public markCompleted(): void {
    this.workflow.transition('completed');
    this.lifecycle.transition('completed');
    this.patch({
      phase: 'completed',
      lifecycle: 'completed',
      previewActive: false,
      pointerCaptured: false,
      statusMessage: 'Trim committed'
    });
  }

  /**
   * After an accepted trim, stay in the tool for another cut on the same arch.
   * Document undo/redo is separate from drawing undo.
   */
  public continueAfterCommit(input: {
    readonly objectId: ClinicalObjectId;
    readonly now: number;
  }): void {
    this.workflow.reset();
    this.lifecycle.reset();
    this.lifecycle.transition('created');
    this.lifecycle.transition('active');
    this.workflow.transition('activating');
    this.workflow.transition('acquiring-pointer');
    this.workflow.transition('drawing');
    this.patch({
      phase: 'drawing',
      lifecycle: 'active',
      targetObjectId: input.objectId,
      drawMode: 'idle',
      points: Object.freeze([]),
      closed: false,
      previewActive: true,
      previewCursor: undefined,
      pointerCaptured: false,
      lastHitSummary: undefined,
      validationReport: undefined,
      kernelFingerprint: undefined,
      operationId: undefined,
      sessionStartedAt: input.now,
      statusMessage: 'Trim accepted — choose Freehand or Polyline to draw again'
    });
  }

  public retarget(objectId: ClinicalObjectId): void {
    this.workflow.transition('drawing');
    this.patch({
      phase: 'drawing',
      targetObjectId: objectId,
      drawMode: 'idle',
      points: Object.freeze([]),
      closed: false,
      previewCursor: undefined,
      pointerCaptured: false,
      lastHitSummary: undefined,
      validationReport: undefined,
      kernelFingerprint: undefined,
      operationId: undefined,
      statusMessage: 'Arch switched — choose Freehand or Polyline'
    });
  }

  public markCancelled(): void {
    this.workflow.cancel();
    this.lifecycle.transition('cancelled');
    this.patch({
      phase: 'cancelled',
      lifecycle: 'cancelled',
      previewActive: false,
      pointerCaptured: false,
      statusMessage: 'Trim cancelled'
    });
  }

  public setHover(index: number | undefined): void {
    this.patch({ hoveredPointIndex: index });
  }

  public setActivePoint(index: number | undefined): void {
    this.patch({ activePointIndex: index });
  }

  public setPhase(phase: TrimWorkflowPhase, statusMessage?: string): void {
    this.workflow.transition(phase);
    this.patch({
      phase,
      ...(statusMessage === undefined ? {} : { statusMessage })
    });
  }

  public clear(): void {
    this.workflow.reset();
    this.lifecycle.reset();
    this.state = Object.freeze({
      ...DEFAULT_TRIM_STATE,
      revision: this.state.revision + 1
    });
    this.emit();
  }

  private patch(partial: Partial<ClinicalTrimState>): void {
    this.state = Object.freeze({
      ...this.state,
      ...partial,
      revision: this.state.revision + 1
    });
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
