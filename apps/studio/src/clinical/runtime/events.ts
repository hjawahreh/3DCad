/**
 * Clinical events bus.
 */

import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import type { ClinicalLifecyclePhase } from './lifecycle.js';
import type { ClinicalToolId } from './types.js';

export type ClinicalEventType =
  | 'lifecycle'
  | 'case'
  | 'tool'
  | 'dirty'
  | 'warning'
  | 'error'
  | 'diagnostics';

export interface ClinicalEventBase {
  readonly type: ClinicalEventType;
  readonly at: number;
}

export interface ClinicalLifecycleEvent extends ClinicalEventBase {
  readonly type: 'lifecycle';
  readonly phase: ClinicalLifecyclePhase;
}

export interface ClinicalCaseEvent extends ClinicalEventBase {
  readonly type: 'case';
  readonly action: 'created' | 'opened' | 'closed' | 'updated';
  readonly document: ClinicalDocumentSnapshot | undefined;
}

export interface ClinicalToolEvent extends ClinicalEventBase {
  readonly type: 'tool';
  readonly toolId: ClinicalToolId | undefined;
  readonly action: 'activated' | 'deactivated' | 'registered';
}

export interface ClinicalDirtyEvent extends ClinicalEventBase {
  readonly type: 'dirty';
  readonly dirty: boolean;
}

export interface ClinicalWarningEvent extends ClinicalEventBase {
  readonly type: 'warning';
  readonly message: string;
}

export interface ClinicalErrorEvent extends ClinicalEventBase {
  readonly type: 'error';
  readonly message: string;
  readonly code: string;
}

export interface ClinicalDiagnosticsEvent extends ClinicalEventBase {
  readonly type: 'diagnostics';
  readonly message: string;
}

export type ClinicalEvent =
  | ClinicalLifecycleEvent
  | ClinicalCaseEvent
  | ClinicalToolEvent
  | ClinicalDirtyEvent
  | ClinicalWarningEvent
  | ClinicalErrorEvent
  | ClinicalDiagnosticsEvent;

export type ClinicalEventListener = (event: ClinicalEvent) => void;

export class ClinicalEvents {
  private readonly listeners = new Set<ClinicalEventListener>();

  public subscribe(listener: ClinicalEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(event: ClinicalEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
