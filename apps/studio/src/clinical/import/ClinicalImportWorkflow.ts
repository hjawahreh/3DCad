/**
 * ClinicalImportWorkflow — deterministic import lifecycle transitions.
 */

import type { ClinicalImportPhase } from './ClinicalImportObservability.js';

const ORDER: readonly ClinicalImportPhase[] = Object.freeze([
  'idle',
  'selecting',
  'validating',
  'resolving',
  'importing',
  'building-document',
  'populating-scene',
  'refreshing-viewport',
  'completed'
]);

const TERMINAL: ReadonlySet<ClinicalImportPhase> = new Set(['completed', 'cancelled', 'failed']);

export class ClinicalImportWorkflow {
  private phase: ClinicalImportPhase = 'idle';

  public getPhase(): ClinicalImportPhase {
    return this.phase;
  }

  public reset(): void {
    this.phase = 'idle';
  }

  public advance(to: ClinicalImportPhase): boolean {
    if (TERMINAL.has(this.phase) && to !== 'idle') {
      return false;
    }
    if (to === 'cancelled' || to === 'failed' || to === 'idle') {
      this.phase = to;
      return true;
    }
    const fromIndex = ORDER.indexOf(this.phase === 'failed' || this.phase === 'cancelled' ? 'idle' : this.phase);
    const toIndex = ORDER.indexOf(to);
    if (toIndex < 0 || fromIndex < 0 || toIndex < fromIndex) {
      return false;
    }
    this.phase = to;
    return true;
  }

  public fail(): void {
    this.phase = 'failed';
  }

  public cancel(): void {
    this.phase = 'cancelled';
  }
}
