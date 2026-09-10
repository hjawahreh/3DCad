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
    readonly drawMode: TrimDrawMode;
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
      drawMode: input.drawMode,
      points: Object.freeze([]),
      closed: false,
      previewActive: true,
      sessionStartedAt: input.now,
      statusMessage: 'Draw trim boundary — click to add points'
    });
  }

  public setDrawMode(mode: TrimDrawMode): void {
    this.patch({ drawMode: mode, statusMessage: `Draw mode: ${mode}` });
  }

  public setPoints(points: readonly TrimBoundaryPoint[], closed?: boolean): void {
    const isClosed = closed ?? isClosedBoundary(points);
    if (this.state.phase === 'drawing') {
      this.workflow.transition('preview-boundary');
    }
    this.patch({
      phase: this.workflow.getPhase(),
      points: Object.freeze(clonePoints(points)),
      closed: isClosed,
      previewActive: true,
      statusMessage: isClosed ? 'Boundary closed — validate and accept' : 'Boundary preview'
    });
  }

  public addPoint(point: TrimBoundaryPoint): void {
    const next = Object.freeze([...this.state.points, Object.freeze({ x: point.x, y: point.y })]);
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
    this.workflow.transition('drawing');
    this.patch({
      phase: 'drawing',
      points: Object.freeze([]),
      closed: false,
      validationReport: undefined,
      statusMessage: 'Boundary cleared'
    });
  }

  public closePoints(): void {
    const closed = closeBoundary(this.state.points);
    this.setPoints(closed, true);
  }

  public setValidationReport(report: TrimValidationReport): void {
    this.workflow.transition('validating');
    this.patch({
      phase: 'validating',
      validationReport: report,
      statusMessage: report.passed ? 'Validation passed' : 'Validation failed'
    });
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
      statusMessage: 'Trim committed'
    });
  }

  public markCancelled(): void {
    this.workflow.cancel();
    this.lifecycle.transition('cancelled');
    this.patch({
      phase: 'cancelled',
      lifecycle: 'cancelled',
      previewActive: false,
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
