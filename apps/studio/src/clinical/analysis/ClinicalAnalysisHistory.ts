/**
 * Lightweight analysis history for temporary vs saved results.
 */

import type { ClinicalAnalysisResult } from './types.js';

export class ClinicalAnalysisHistory {
  private readonly stack: ClinicalAnalysisResult[] = [];
  private index = -1;

  public push(result: ClinicalAnalysisResult): void {
    this.stack.splice(this.index + 1);
    this.stack.push(result);
    this.index = this.stack.length - 1;
  }

  public undo(): ClinicalAnalysisResult | undefined {
    if (this.index < 0) return undefined;
    this.index -= 1;
    return this.index >= 0 ? this.stack[this.index] : undefined;
  }

  public redo(): ClinicalAnalysisResult | undefined {
    if (this.index + 1 >= this.stack.length) return undefined;
    this.index += 1;
    return this.stack[this.index];
  }

  public canUndo(): boolean {
    return this.index >= 0;
  }

  public canRedo(): boolean {
    return this.index + 1 < this.stack.length;
  }
}
