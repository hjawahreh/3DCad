import {
  type Disposable,
  type Priority,
  type RenderResult,
  renderFailure,
  renderSuccess
} from '../types.js';

export type GpuTaskKind =
  | 'resource-load'
  | 'shader-compile'
  | 'texture-stream'
  | 'mesh-upload'
  | 'generic';

export interface GpuTaskProgress {
  readonly completed: number;
  readonly total: number;
  readonly message?: string;
}

export interface GpuTask<T = void> {
  readonly id: string;
  readonly kind: GpuTaskKind;
  readonly priority: Priority;
  readonly execute: (
    signal: AbortSignal,
    report: (progress: GpuTaskProgress) => void
  ) => Promise<RenderResult<T>>;
}

export interface GpuTaskHandle {
  readonly id: string;
  readonly cancel: () => void;
}

interface QueuedTask {
  readonly task: GpuTask<unknown>;
  readonly controller: AbortController;
  readonly order: number;
  state: 'pending' | 'running' | 'done';
}

const priorityRank: Record<Priority, number> = {
  critical: 5,
  high: 4,
  normal: 3,
  low: 2,
  idle: 1
};

export class GpuTaskScheduler implements Disposable {
  private readonly queue: QueuedTask[] = [];
  private readonly byId = new Map<string, QueuedTask>();
  private sequence = 0;
  private disposed = false;
  private draining: Promise<void> | undefined;

  public submit<T>(task: GpuTask<T>): RenderResult<GpuTaskHandle> {
    if (this.disposed) {
      return renderFailure('unavailable', 'Scheduler is disposed.');
    }
    if (this.byId.has(task.id)) {
      return renderFailure('conflict', `Task ${task.id} already submitted.`);
    }
    const controller = new AbortController();
    const queued: QueuedTask = {
      task: task as GpuTask<unknown>,
      controller,
      order: this.sequence++,
      state: 'pending'
    };
    this.queue.push(queued);
    this.byId.set(task.id, queued);
    this.sortQueue();
    return renderSuccess({
      id: task.id,
      cancel: () => {
        void this.cancel(task.id);
      }
    });
  }

  public cancel(id: string): RenderResult<void> {
    const queued = this.byId.get(id);
    if (queued === undefined) {
      return renderFailure('not-found', `Task ${id} not found.`);
    }
    queued.controller.abort();
    if (queued.state === 'pending') {
      queued.state = 'done';
      this.removeFromQueue(id);
    }
    return renderSuccess(undefined);
  }

  public async drain(): Promise<void> {
    if (this.draining !== undefined) {
      await this.draining;
      return;
    }
    this.draining = this.runDrain();
    try {
      await this.draining;
    } finally {
      this.draining = undefined;
    }
  }

  public pendingCount(): number {
    return this.queue.filter((task) => task.state === 'pending').length;
  }

  public dispose(): void {
    this.disposed = true;
    for (const queued of this.byId.values()) {
      queued.controller.abort();
      queued.state = 'done';
    }
    this.queue.length = 0;
    this.byId.clear();
  }

  private async runDrain(): Promise<void> {
    while (!this.disposed) {
      const next = this.queue.find((task) => task.state === 'pending');
      if (next === undefined) break;
      next.state = 'running';
      try {
        if (!next.controller.signal.aborted) {
          await next.task.execute(next.controller.signal, () => undefined);
        }
      } finally {
        next.state = 'done';
        this.removeFromQueue(next.task.id);
      }
    }
  }

  private sortQueue(): void {
    this.queue.sort(
      (a, b) =>
        priorityRank[b.task.priority] - priorityRank[a.task.priority] ||
        a.order - b.order
    );
  }

  private removeFromQueue(id: string): void {
    const index = this.queue.findIndex((task) => task.task.id === id);
    if (index >= 0) this.queue.splice(index, 1);
    this.byId.delete(id);
  }
}
