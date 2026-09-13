/**
 * ClinicalArchContext — shared UPPER / BOTH / LOWER arch visibility + tool target.
 * Single source of truth for Orientation, Preparation, Trim, Close Base.
 */

import type { ClinicalArchRole } from '../import/ClinicalMeshDescriptor.js';

export type ClinicalArchVisibilityMode = 'upper' | 'lower' | 'both';

export interface ClinicalArchContextState {
  readonly mode: ClinicalArchVisibilityMode;
  /** Explicit tool target when mode is BOTH (trim/close-base must pick one). */
  readonly toolTarget: ClinicalArchRole;
  readonly revision: number;
}

export type ClinicalArchContextListener = (state: ClinicalArchContextState) => void;

const DEFAULT: ClinicalArchContextState = Object.freeze({
  mode: 'both',
  toolTarget: 'upper',
  revision: 0
});

export class ClinicalArchContext {
  private state: ClinicalArchContextState = DEFAULT;
  private readonly listeners = new Set<ClinicalArchContextListener>();

  public getState(): ClinicalArchContextState {
    return this.state;
  }

  public getMode(): ClinicalArchVisibilityMode {
    return this.state.mode;
  }

  /** Arch that tools should operate on (never BOTH). */
  public getToolTarget(): ClinicalArchRole {
    if (this.state.mode === 'both') {
      return this.state.toolTarget;
    }
    return this.state.mode;
  }

  public subscribe(listener: ClinicalArchContextListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setMode(mode: ClinicalArchVisibilityMode): void {
    if (this.state.mode === mode) {
      return;
    }
    const toolTarget: ClinicalArchRole =
      mode === 'both' ? this.state.toolTarget : mode;
    this.state = Object.freeze({
      mode,
      toolTarget,
      revision: this.state.revision + 1
    });
    this.emit();
  }

  public setToolTarget(arch: ClinicalArchRole): void {
    if (this.state.toolTarget === arch && this.state.mode === 'both') {
      return;
    }
    this.state = Object.freeze({
      mode: this.state.mode === 'both' ? 'both' : arch,
      toolTarget: arch,
      revision: this.state.revision + 1
    });
    this.emit();
  }

  /** Convenience: set UPPER or LOWER (and switch mode away from BOTH). */
  public setExclusive(arch: ClinicalArchRole): void {
    this.state = Object.freeze({
      mode: arch,
      toolTarget: arch,
      revision: this.state.revision + 1
    });
    this.emit();
  }

  public reset(): void {
    this.state = Object.freeze({
      ...DEFAULT,
      revision: this.state.revision + 1
    });
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
