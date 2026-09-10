import type { ImmutableProjectSnapshot } from './state.js';
import type { ProjectId } from './types.js';

export type ProjectEventType =
  | 'lifecycle'
  | 'dirty'
  | 'save'
  | 'autosave'
  | 'recent'
  | 'history'
  | 'error'
  | 'warning';

export interface ProjectLifecycleEvent {
  readonly type: 'lifecycle';
  readonly phase: string;
  readonly projectId: ProjectId;
  readonly at: number;
}

export interface ProjectDirtyEvent {
  readonly type: 'dirty';
  readonly dirty: boolean;
  readonly snapshot: ImmutableProjectSnapshot;
  readonly at: number;
}

export interface ProjectSaveEvent {
  readonly type: 'save';
  readonly kind: 'manual' | 'autosave';
  readonly snapshot: ImmutableProjectSnapshot;
  readonly at: number;
}

export interface ProjectAutosaveEvent {
  readonly type: 'autosave';
  readonly phase: 'scheduled' | 'started' | 'completed' | 'suppressed' | 'failed';
  readonly message?: string;
  readonly at: number;
}

export interface ProjectRecentEvent {
  readonly type: 'recent';
  readonly operation: 'register' | 'remove' | 'clear';
  readonly projectId: ProjectId | undefined;
  readonly at: number;
}

export interface ProjectHistoryEvent {
  readonly type: 'history';
  readonly operation: 'transition';
  readonly snapshot: ImmutableProjectSnapshot;
  readonly at: number;
}

export interface ProjectErrorEvent {
  readonly type: 'error';
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export interface ProjectWarningEvent {
  readonly type: 'warning';
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export type ProjectEvent =
  | ProjectLifecycleEvent
  | ProjectDirtyEvent
  | ProjectSaveEvent
  | ProjectAutosaveEvent
  | ProjectRecentEvent
  | ProjectHistoryEvent
  | ProjectErrorEvent
  | ProjectWarningEvent;

export type ProjectEventListener = (event: ProjectEvent) => void;

export class ProjectEvents {
  private readonly listeners = new Set<ProjectEventListener>();

  public subscribe(listener: ProjectEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(event: ProjectEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}
