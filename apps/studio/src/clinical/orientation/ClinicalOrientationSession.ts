/**
 * ClinicalOrientationSession — live preview state (no document mutation until accept).
 */

import { IDENTITY_MAT4 } from '@cad-studio/scene';
import type { ClinicalObjectId, ClinicalTransform } from '../import/ClinicalMeshDescriptor.js';
import type { OrientationConfidence } from './ClinicalAutoOrientationEstimator.js';
import {
  DEFAULT_ORIENTATION_STATE,
  type ClinicalOrientationState,
  type OrientationAxis,
  type OrientationHandle,
  type OrientationIncrement,
  type OrientationMode,
  type OrientationOrigin,
  type OrientationPhase
} from './ClinicalOrientationState.js';
import { ClinicalOrientationWorkflow } from './ClinicalOrientationWorkflow.js';
import { cloneTransform } from './ClinicalTransformMath.js';

export class ClinicalOrientationSession {
  private readonly workflow = new ClinicalOrientationWorkflow();
  private state: ClinicalOrientationState = DEFAULT_ORIENTATION_STATE;
  private readonly listeners = new Set<() => void>();

  public getState(): ClinicalOrientationState {
    return this.state;
  }

  public getWorkflow(): ClinicalOrientationWorkflow {
    return this.workflow;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public begin(input: {
    readonly objectId: ClinicalObjectId;
    readonly baseline: ClinicalTransform;
    readonly now: number;
    readonly caseLevel?: boolean;
    readonly objectBaselines?: Readonly<Record<string, ClinicalTransform>>;
  }): void {
    this.workflow.reset();
    this.workflow.transition('entering');
    this.workflow.transition('active');
    const baselines = input.objectBaselines ?? {
      [input.objectId as string]: cloneTransform(input.baseline)
    };
    this.patch({
      phase: 'active',
      targetObjectId: input.objectId,
      baseline: cloneTransform(input.baseline),
      preview: cloneTransform(input.baseline),
      caseLevel: input.caseLevel === true,
      objectBaselines: Object.freeze({ ...baselines }),
      orientationOrigin: 'none',
      confidence: undefined,
      autoMessage: undefined,
      dirtyPreview: false,
      snapPreview: false,
      sessionStartedAt: input.now,
      statusMessage: 'Orientation active — rotate with gizmo or controls',
      mode: 'free',
      activeAxis: 'free',
      hoveredHandle: undefined,
      activeHandle: undefined
    });
  }

  public setPhase(phase: OrientationPhase, statusMessage?: string): boolean {
    if (!this.workflow.transition(phase)) {
      return false;
    }
    this.patch({
      phase,
      ...(statusMessage === undefined ? {} : { statusMessage })
    });
    return true;
  }

  public setMode(mode: OrientationMode): void {
    const axis: OrientationAxis =
      mode === 'axis-x' ? 'x' : mode === 'axis-y' ? 'y' : mode === 'axis-z' ? 'z' : 'free';
    this.patch({
      mode,
      activeAxis: axis,
      statusMessage: `Mode: ${mode}`
    });
  }

  public setIncrement(degrees: OrientationIncrement): void {
    this.patch({ incrementDegrees: degrees, mode: 'incremental' });
  }

  public setPreview(
    preview: ClinicalTransform,
    options?: {
      readonly snapPreview?: boolean;
      readonly origin?: OrientationOrigin;
      readonly confidence?: OrientationConfidence;
      readonly autoMessage?: string;
      readonly caseLevel?: boolean;
      readonly statusMessage?: string;
    }
  ): void {
    if (this.state.phase === 'active') {
      this.workflow.transition('previewing');
    }
    this.patch({
      phase: this.workflow.getPhase() === 'previewing' ? 'previewing' : this.state.phase,
      preview: cloneTransform(preview),
      dirtyPreview: true,
      snapPreview: options?.snapPreview === true,
      ...(options?.origin !== undefined ? { orientationOrigin: options.origin } : {}),
      ...(options?.confidence !== undefined ? { confidence: options.confidence } : {}),
      ...(options?.autoMessage !== undefined ? { autoMessage: options.autoMessage } : {}),
      ...(options?.caseLevel !== undefined ? { caseLevel: options.caseLevel } : {}),
      statusMessage:
        options?.statusMessage ??
        (options?.snapPreview === true
          ? 'Snap preview'
          : options?.origin === 'auto'
            ? 'Automatic orientation preview'
            : 'Live preview')
    });
  }

  public markManualOverride(): void {
    this.patch({
      orientationOrigin: 'manual',
      mode: this.state.mode === 'auto' ? 'free' : this.state.mode,
      statusMessage: 'Manual orientation adjustment'
    });
  }

  public setHover(handle: OrientationHandle | undefined): void {
    this.patch({ hoveredHandle: handle });
  }

  public setActiveHandle(handle: OrientationHandle | undefined): void {
    this.patch({ activeHandle: handle });
  }

  public resetPreviewToBaseline(): void {
    this.patch({
      preview: cloneTransform(this.state.baseline),
      dirtyPreview: false,
      snapPreview: false,
      orientationOrigin: 'none',
      confidence: undefined,
      autoMessage: undefined,
      statusMessage: 'Orientation reset to baseline'
    });
  }

  public markCommitted(): void {
    this.workflow.transition('committing');
    this.workflow.transition('completed');
    this.patch({
      phase: 'completed',
      dirtyPreview: false,
      statusMessage: 'Orientation committed',
      activeHandle: undefined
    });
  }

  public markCancelled(): void {
    this.workflow.cancel();
    this.patch({
      phase: 'cancelled',
      preview: cloneTransform(this.state.baseline),
      dirtyPreview: false,
      snapPreview: false,
      statusMessage: 'Orientation cancelled',
      activeHandle: undefined,
      hoveredHandle: undefined
    });
  }

  public clear(): void {
    this.workflow.reset();
    this.state = Object.freeze({
      ...DEFAULT_ORIENTATION_STATE,
      baseline: IDENTITY_MAT4,
      preview: IDENTITY_MAT4,
      objectBaselines: Object.freeze({}),
      revision: this.state.revision + 1
    });
    this.emit();
  }

  private patch(partial: Partial<ClinicalOrientationState>): void {
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
