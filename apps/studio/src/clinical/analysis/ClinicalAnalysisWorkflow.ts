/**
 * Analysis workflow phases.
 */

export type AnalysisPhase =
  | 'idle'
  | 'active'
  | 'measuring-distance'
  | 'measuring-angle'
  | 'reviewing'
  | 'cancelled';

const ALLOWED: Readonly<Record<AnalysisPhase, readonly AnalysisPhase[]>> = Object.freeze({
  idle: ['active', 'idle'],
  active: [
    'measuring-distance',
    'measuring-angle',
    'reviewing',
    'cancelled',
    'idle'
  ],
  'measuring-distance': ['active', 'reviewing', 'cancelled', 'idle'],
  'measuring-angle': ['active', 'reviewing', 'cancelled', 'idle'],
  reviewing: ['active', 'cancelled', 'idle'],
  cancelled: ['idle']
});

export class ClinicalAnalysisWorkflow {
  private phase: AnalysisPhase = 'idle';

  public getPhase(): AnalysisPhase {
    return this.phase;
  }

  public isActive(): boolean {
    return this.phase !== 'idle' && this.phase !== 'cancelled';
  }

  public transition(next: AnalysisPhase): boolean {
    if (!ALLOWED[this.phase].includes(next)) {
      return false;
    }
    this.phase = next;
    return true;
  }

  public reset(): void {
    this.phase = 'idle';
  }
}
