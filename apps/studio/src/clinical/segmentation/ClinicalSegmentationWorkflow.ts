/**
 * Segmentation workflow phases / async inference states.
 */

export type SegmentationPhase =
  | 'idle'
  | 'activating'
  | 'preparing'
  | 'inferencing'
  | 'postprocessing'
  | 'validating'
  | 'ready-for-review'
  | 'committing'
  | 'complete'
  | 'failed'
  | 'cancelled';

const TRANSITIONS: Readonly<Record<SegmentationPhase, readonly SegmentationPhase[]>> =
  Object.freeze({
    idle: ['activating', 'idle'],
    activating: ['preparing', 'cancelled', 'failed', 'idle'],
    preparing: ['inferencing', 'cancelled', 'failed'],
    inferencing: ['postprocessing', 'cancelled', 'failed'],
    postprocessing: ['validating', 'cancelled', 'failed'],
    validating: ['ready-for-review', 'failed'],
    'ready-for-review': ['committing', 'preparing', 'cancelled', 'idle'],
    committing: ['complete', 'failed'],
    complete: ['idle'],
    failed: ['idle', 'preparing'],
    cancelled: ['idle']
  });

export class ClinicalSegmentationWorkflow {
  private phase: SegmentationPhase = 'idle';

  public getPhase(): SegmentationPhase {
    return this.phase;
  }

  public isActive(): boolean {
    return this.phase !== 'idle' && this.phase !== 'complete' && this.phase !== 'cancelled';
  }

  public transition(next: SegmentationPhase): boolean {
    const allowed = TRANSITIONS[this.phase];
    if (!allowed.includes(next)) {
      return false;
    }
    this.phase = next;
    return true;
  }

  public cancel(): boolean {
    if (this.phase === 'idle' || this.phase === 'complete') {
      return false;
    }
    this.phase = 'cancelled';
    return true;
  }

  public reset(): void {
    this.phase = 'idle';
  }
}
