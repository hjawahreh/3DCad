import type { ImmutableImportSnapshot } from './state.js';
import type { ImportProgress } from './progress.js';
import type { ImportRequestId } from './types.js';

export type ImportEventType =
  | 'lifecycle'
  | 'progress'
  | 'plugin'
  | 'validation'
  | 'complete'
  | 'error'
  | 'warning';

export interface ImportLifecycleEvent {
  readonly type: 'lifecycle';
  readonly phase: string;
  readonly requestId: ImportRequestId;
  readonly at: number;
}

export interface ImportProgressEvent {
  readonly type: 'progress';
  readonly progress: ImportProgress;
  readonly at: number;
}

export interface ImportPluginEvent {
  readonly type: 'plugin';
  readonly operation: 'selected' | 'registered' | 'enabled' | 'disabled';
  readonly pluginId: string;
  readonly at: number;
}

export interface ImportValidationEvent {
  readonly type: 'validation';
  readonly ok: boolean;
  readonly message: string;
  readonly at: number;
}

export interface ImportCompleteEvent {
  readonly type: 'complete';
  readonly snapshot: ImmutableImportSnapshot;
  readonly at: number;
}

export interface ImportErrorEvent {
  readonly type: 'error';
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export interface ImportWarningEvent {
  readonly type: 'warning';
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

export type ImportEvent =
  | ImportLifecycleEvent
  | ImportProgressEvent
  | ImportPluginEvent
  | ImportValidationEvent
  | ImportCompleteEvent
  | ImportErrorEvent
  | ImportWarningEvent;

export type ImportEventListener = (event: ImportEvent) => void;

export class ImportEvents {
  private readonly listeners = new Set<ImportEventListener>();

  public subscribe(listener: ImportEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(event: ImportEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}
