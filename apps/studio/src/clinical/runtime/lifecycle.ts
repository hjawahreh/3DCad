/**
 * Clinical lifecycle — deterministic case/session phases.
 */

export type ClinicalLifecyclePhase =
  | 'created'
  | 'bootstrapping'
  | 'ready'
  | 'case-active'
  | 'case-dirty'
  | 'closing'
  | 'disposed';

const ALLOWED: Readonly<Record<ClinicalLifecyclePhase, readonly ClinicalLifecyclePhase[]>> =
  Object.freeze({
    created: Object.freeze(['bootstrapping', 'disposed'] as const),
    bootstrapping: Object.freeze(['ready', 'disposed'] as const),
    ready: Object.freeze(['case-active', 'disposed'] as const),
    'case-active': Object.freeze(['case-dirty', 'closing', 'ready', 'disposed'] as const),
    'case-dirty': Object.freeze(['case-active', 'closing', 'disposed'] as const),
    closing: Object.freeze(['ready', 'disposed'] as const),
    disposed: Object.freeze([] as const)
  });

export class ClinicalLifecycle {
  private phase: ClinicalLifecyclePhase = 'created';

  public getPhase(): ClinicalLifecyclePhase {
    return this.phase;
  }

  public canTransition(to: ClinicalLifecyclePhase): boolean {
    return ALLOWED[this.phase].includes(to);
  }

  public transition(to: ClinicalLifecyclePhase): boolean {
    if (!this.canTransition(to)) {
      return false;
    }
    this.phase = to;
    return true;
  }

  public force(to: ClinicalLifecyclePhase): void {
    this.phase = to;
  }
}
