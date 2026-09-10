import { failure, success, type Result, type RuntimeError, runtimeError } from './result.js';

export type LifecyclePhase =
  'starting' | 'running' | 'suspended' | 'stopping' | 'stopped' | 'failed';

export type LifecycleAction =
  | 'application-start'
  | 'application-stop'
  | 'application-suspend'
  | 'application-resume'
  | 'workspace-open'
  | 'workspace-close'
  | 'project-open'
  | 'project-close'
  | 'recovery'
  | 'restart'
  | 'emergency-stop';

export interface LifecycleEvent {
  readonly action: LifecycleAction;
  readonly phase: LifecyclePhase;
  readonly timestamp: number;
}

export interface LifecycleParticipant {
  readonly id: string;
  readonly priority: number;
  transition(event: LifecycleEvent, signal: AbortSignal): Promise<Result<void, RuntimeError>>;
}

export class LifecycleCoordinator {
  private phase: LifecyclePhase = 'stopped';
  private readonly participants: LifecycleParticipant[] = [];

  public constructor(private readonly now: () => number) {}

  public register(participant: LifecycleParticipant): void {
    if (this.phase !== 'stopped')
      throw new Error('Lifecycle participants register before startup only.');
    if (this.participants.some(({ id }) => id === participant.id))
      throw new Error('Duplicate lifecycle participant.');
    this.participants.push(participant);
  }

  public currentPhase(): LifecyclePhase {
    return this.phase;
  }

  public async transition(
    action: LifecycleAction,
    signal: AbortSignal
  ): Promise<Result<void, RuntimeError>> {
    const target = phaseFor(action);
    this.phase = target === 'failed' ? 'failed' : this.phase;
    const event: LifecycleEvent = Object.freeze({ action, phase: target, timestamp: this.now() });
    const ordered = [...this.participants].sort(
      (left, right) => right.priority - left.priority || left.id.localeCompare(right.id)
    );
    for (const participant of ordered) {
      if (signal.aborted)
        return failure(runtimeError('cancelled', 'Lifecycle transition cancelled.'));
      const result = await participant.transition(event, signal);
      if (!result.ok) {
        this.phase = 'failed';
        return result;
      }
    }
    this.phase = target;
    return success(undefined);
  }
}

const phaseFor = (action: LifecycleAction): LifecyclePhase => {
  switch (action) {
    case 'application-start':
    case 'application-resume':
      return 'running';
    case 'application-suspend':
      return 'suspended';
    case 'application-stop':
    case 'emergency-stop':
      return 'stopped';
    case 'workspace-open':
    case 'project-open':
    case 'recovery':
    case 'restart':
      return 'running';
    case 'workspace-close':
    case 'project-close':
      return 'running';
  }
};
