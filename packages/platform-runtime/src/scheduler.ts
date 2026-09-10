import type { Clock, ProgressReporter } from './contracts.js';
import { failure, success, type Result, type RuntimeError, runtimeError } from './result.js';

export type TaskPriority = 'background' | 'normal' | 'interactive' | 'critical';
export type TaskState = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed-out';

export interface TaskDefinition<T> {
  readonly id: string;
  readonly priority: TaskPriority;
  readonly dependencies?: readonly string[];
  readonly timeoutMs?: number;
  readonly retries?: number;
  readonly execute: (
    signal: AbortSignal,
    report: ProgressReporter
  ) => Promise<Result<T, RuntimeError>>;
}

export interface TaskSnapshot<T = unknown> {
  readonly id: string;
  readonly state: TaskState;
  readonly result?: Result<T, RuntimeError> | undefined;
}

interface TaskRecord<T> {
  readonly definition: TaskDefinition<T>;
  readonly controller: AbortController;
  state: TaskState;
  result?: Result<T, RuntimeError>;
  order: number;
}

const priorityScore: Record<TaskPriority, number> = {
  background: 0,
  normal: 1,
  interactive: 2,
  critical: 3
};

export class TaskScheduler {
  private readonly tasks = new Map<string, TaskRecord<unknown>>();
  private sequence = 0;

  public constructor(
    private readonly clock: Clock,
    private readonly maxConcurrent = 4
  ) {}

  public submit<T>(definition: TaskDefinition<T>): Result<void, RuntimeError> {
    if (this.tasks.has(definition.id))
      return failure(runtimeError('conflict', 'Duplicate task identifier.'));
    if ((definition.dependencies ?? []).includes(definition.id))
      return failure(runtimeError('invalid', 'Task cannot depend on itself.'));
    this.tasks.set(definition.id, {
      definition,
      controller: new AbortController(),
      state: 'pending',
      order: this.sequence++
    });
    return success(undefined);
  }

  public cancel(id: string): Result<void, RuntimeError> {
    const task = this.tasks.get(id);
    if (!task) return failure(runtimeError('not-found', 'Task was not found.'));
    task.controller.abort();
    if (task.state === 'pending') task.state = 'cancelled';
    return success(undefined);
  }

  public snapshot(id: string): TaskSnapshot | undefined {
    const task = this.tasks.get(id);
    return task && Object.freeze({ id, state: task.state, result: task.result });
  }

  public async drain(report: ProgressReporter = () => undefined): Promise<void> {
    const active = new Set<Promise<void>>();
    while (this.hasPending() || active.size > 0) {
      while (active.size < this.maxConcurrent) {
        const next = this.nextReady();
        if (!next) break;
        const execution = this.run(next, report);
        active.add(execution);
        void execution.finally(() => active.delete(execution));
      }
      if (active.size > 0) await Promise.race(active);
      else this.cancelBlocked();
    }
  }

  private hasPending(): boolean {
    return [...this.tasks.values()].some((task) => task.state === 'pending');
  }
  private nextReady(): TaskRecord<unknown> | undefined {
    return [...this.tasks.values()]
      .filter(
        (task) =>
          task.state === 'pending' &&
          (task.definition.dependencies ?? []).every(
            (id) => this.tasks.get(id)?.state === 'succeeded'
          )
      )
      .sort(
        (left, right) =>
          priorityScore[right.definition.priority] - priorityScore[left.definition.priority] ||
          left.order - right.order
      )[0];
  }
  private cancelBlocked(): void {
    for (const task of this.tasks.values())
      if (task.state === 'pending') {
        task.state = 'cancelled';
        task.result = failure(runtimeError('conflict', 'Task dependency did not succeed.'));
      }
  }
  private async run(task: TaskRecord<unknown>, report: ProgressReporter): Promise<void> {
    task.state = 'running';
    const timeout = task.definition.timeoutMs;
    const started = this.clock.now();
    let attempts = 0;
    do {
      attempts += 1;
      if (task.controller.signal.aborted) {
        task.state = 'cancelled';
        task.result = failure(runtimeError('cancelled', 'Task cancelled.'));
        return;
      }
      task.result = await task.definition.execute(task.controller.signal, report);
      if (isAborted(task.controller.signal)) {
        task.state = 'cancelled';
        return;
      }
      if (timeout !== undefined && this.clock.now() - started > timeout) {
        task.state = 'timed-out';
        task.result = failure(runtimeError('timeout', 'Task timed out.'));
        return;
      }
    } while (!task.result.ok && attempts <= (task.definition.retries ?? 0));
    task.state = task.result.ok ? 'succeeded' : 'failed';
  }
}

const isAborted = (signal: AbortSignal): boolean => signal.aborted;
