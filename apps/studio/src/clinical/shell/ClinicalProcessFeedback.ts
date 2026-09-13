/**
 * ClinicalProcessFeedback — stage-based long-running operation UI (not toasts).
 * Exactly one active process at a time. Cleared automatically on resolve/fail.
 */

export type ClinicalProcessKind =
  | 'orientation'
  | 'preparation'
  | 'trim'
  | 'close-base'
  | 'import'
  | 'generic';

export interface ClinicalProcessStage {
  readonly id: string;
  readonly label: string;
}

export interface ClinicalProcessState {
  readonly active: boolean;
  readonly kind: ClinicalProcessKind;
  readonly title: string;
  readonly stageId: string;
  readonly stageLabel: string;
  readonly stages: readonly ClinicalProcessStage[];
  readonly startedAt: number;
  readonly error: string | undefined;
  readonly revision: number;
}

export type ClinicalProcessListener = (state: ClinicalProcessState) => void;

const IDLE: ClinicalProcessState = Object.freeze({
  active: false,
  kind: 'generic',
  title: '',
  stageId: '',
  stageLabel: '',
  stages: Object.freeze([]),
  startedAt: 0,
  error: undefined,
  revision: 0
});

export class ClinicalProcessFeedbackHost {
  private state: ClinicalProcessState = IDLE;
  private readonly listeners = new Set<ClinicalProcessListener>();

  public getState(): ClinicalProcessState {
    return this.state;
  }

  public subscribe(listener: ClinicalProcessListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public begin(input: {
    readonly kind: ClinicalProcessKind;
    readonly title: string;
    readonly stages: readonly ClinicalProcessStage[];
    readonly initialStageId?: string;
  }): void {
    const stages = Object.freeze([...input.stages]);
    const initial =
      stages.find((s) => s.id === input.initialStageId) ?? stages[0];
    this.state = Object.freeze({
      active: true,
      kind: input.kind,
      title: input.title,
      stageId: initial?.id ?? '',
      stageLabel: initial?.label ?? '',
      stages,
      startedAt: Date.now(),
      error: undefined,
      revision: this.state.revision + 1
    });
    this.emit();
  }

  public setStage(stageId: string, labelOverride?: string): void {
    if (!this.state.active) {
      return;
    }
    const stage = this.state.stages.find((s) => s.id === stageId);
    this.state = Object.freeze({
      ...this.state,
      stageId,
      stageLabel: labelOverride ?? stage?.label ?? stageId,
      error: undefined,
      revision: this.state.revision + 1
    });
    this.emit();
  }

  public fail(message: string): void {
    if (!this.state.active) {
      return;
    }
    this.state = Object.freeze({
      ...this.state,
      error: message,
      revision: this.state.revision + 1
    });
    this.emit();
  }

  public complete(): void {
    if (!this.state.active && this.state.error === undefined) {
      return;
    }
    this.state = Object.freeze({
      ...IDLE,
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
