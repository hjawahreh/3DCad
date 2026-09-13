/**
 * ClinicalSession — one clinical workspace session with optional single active case.
 */

import type { StudioCompositionRoot } from '../../application/composition-root.js';
import {
  bumpClinicalRevision,
  createEmptyClinicalDocument,
  withDisplaySettings,
  type ClinicalDocumentSnapshot,
  type DisplaySettings
} from '../document/ClinicalDocument.js';
import type { RecentCasesRegistry } from '../case/RecentCases.js';
import type { ClinicalToolRegistry } from '../tools/ClinicalToolRegistry.js';
import type { ClinicalContext } from './context.js';
import { ClinicalDiagnostics } from './diagnostics.js';
import { ClinicalEvents } from './events.js';
import { ClinicalLifecycle } from './lifecycle.js';
import { ClinicalMetrics } from './metrics.js';
import {
  freezeClinicalSnapshot,
  type ClinicalPublicState,
  type ImmutableClinicalSnapshot
} from './state.js';
import {
  clinicalFailure,
  clinicalSuccess,
  createDefaultClinicalClock,
  type ClinicalClock,
  type ClinicalResult,
  type ClinicalSessionId,
  type ClinicalToolId
} from './types.js';

export interface ClinicalSessionOptions {
  readonly sessionId: ClinicalSessionId;
  readonly host: StudioCompositionRoot;
  readonly tools: ClinicalToolRegistry;
  readonly recent: RecentCasesRegistry;
  readonly clock?: ClinicalClock;
}

export class ClinicalSession {
  public readonly sessionId: ClinicalSessionId;

  private readonly host: StudioCompositionRoot;
  private readonly tools: ClinicalToolRegistry;
  private readonly recent: RecentCasesRegistry;
  private readonly clock: ClinicalClock;
  private readonly lifecycle = new ClinicalLifecycle();
  private readonly events = new ClinicalEvents();
  private readonly metrics = new ClinicalMetrics();
  private readonly diagnostics = new ClinicalDiagnostics();
  private document: ClinicalDocumentSnapshot | undefined;
  private snapshotRevision = 0;
  private readonly createdAt: number;
  private disposed = false;
  private uiRevision = 0;
  private readonly uiListeners = new Set<() => void>();

  public constructor(options: ClinicalSessionOptions) {
    this.sessionId = options.sessionId;
    this.host = options.host;
    this.tools = options.tools;
    this.recent = options.recent;
    this.clock = options.clock ?? createDefaultClinicalClock();
    this.createdAt = this.clock.now();
    this.diagnostics.setToolStats(this.tools.list().length, this.tools.enabledCount());
  }

  public bootstrap(): ClinicalResult<void> {
    if (this.disposed) {
      return clinicalFailure('unavailable', 'Session disposed');
    }
    if (!this.lifecycle.transition('bootstrapping')) {
      return clinicalFailure('lifecycle', `Cannot bootstrap from ${this.lifecycle.getPhase()}`);
    }
    this.lifecycle.transition('ready');
    this.syncDiagnostics();
    this.events.emit({ type: 'lifecycle', phase: 'ready', at: this.clock.now() });
    this.diagnostics.record('info', 'Clinical session ready', 'clinical-session');
    this.notifyUi();
    return clinicalSuccess(undefined);
  }

  public getContext(): ClinicalContext {
    return Object.freeze({
      sessionId: this.sessionId,
      phase: this.lifecycle.getPhase(),
      document: this.document,
      activeToolId: this.tools.getActive()?.id,
      tools: this.tools,
      events: this.events,
      metrics: this.metrics,
      diagnostics: this.diagnostics,
      host: this.host
    });
  }

  public getPublicState(): ClinicalPublicState {
    return Object.freeze({
      phase: this.lifecycle.getPhase(),
      sessionId: this.sessionId,
      activeCase: this.document,
      activeToolId: this.tools.getActive()?.id,
      dirty: this.document?.dirty === true
    });
  }

  public getSnapshot(): ImmutableClinicalSnapshot {
    return freezeClinicalSnapshot({
      sessionId: this.sessionId,
      phase: this.lifecycle.getPhase(),
      document: this.document,
      activeToolId: this.tools.getActive()?.id,
      revision: this.snapshotRevision,
      createdAt: this.createdAt,
      updatedAt: this.clock.now()
    });
  }

  public newCase(input?: {
    readonly name?: string;
    readonly patientName?: string;
    readonly firstName?: string;
    readonly lastName?: string;
    readonly patientId?: string;
    readonly chartNumber?: string;
    readonly notes?: string;
  }): ClinicalResult<ClinicalDocumentSnapshot> {
    if (this.disposed) {
      return clinicalFailure('unavailable', 'Session disposed');
    }
    if (this.document?.dirty === true) {
      return clinicalFailure('dirty', 'Close or save the active case before creating a new one');
    }
    const now = this.clock.now();
    this.document = createEmptyClinicalDocument({
      now,
      ...(input?.name !== undefined ? { name: input.name } : {}),
      ...(input?.patientName !== undefined ? { patientName: input.patientName } : {}),
      ...(input?.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input?.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input?.patientId !== undefined ? { patientId: input.patientId } : {}),
      ...(input?.chartNumber !== undefined ? { chartNumber: input.chartNumber } : {}),
      ...(input?.notes !== undefined ? { notes: input.notes } : {})
    });
    this.lifecycle.force('case-active');
    this.recent.register(this.document, now);
    this.metrics.recordCaseCreate();
    this.bumpSnapshot();
    this.syncDiagnostics();
    this.events.emit({
      type: 'case',
      action: 'created',
      document: this.document,
      at: now
    });
    this.diagnostics.record('info', `Created case ${this.document.caseMeta.name}`, 'case');
    this.host.notifications.push('success', 'Case', `Created ${this.document.caseMeta.name}`);
    this.notifyUi();
    return clinicalSuccess(this.document);
  }

  /** Open a case from a host-supplied document snapshot (persistence loads meshes separately). */
  public openCase(document: ClinicalDocumentSnapshot): ClinicalResult<ClinicalDocumentSnapshot> {
    if (this.disposed) {
      return clinicalFailure('unavailable', 'Session disposed');
    }
    if (this.document?.dirty === true) {
      return clinicalFailure('dirty', 'Active case has unsaved changes');
    }
    const now = this.clock.now();
    this.document = Object.freeze({
      ...document,
      objects: Object.freeze([...document.objects]),
      dirty: false,
      updatedAt: now
    });
    this.lifecycle.force('case-active');
    this.recent.register(this.document, now);
    this.bumpSnapshot();
    this.syncDiagnostics();
    this.events.emit({
      type: 'case',
      action: 'opened',
      document: this.document,
      at: now
    });
    this.notifyUi();
    return clinicalSuccess(this.document);
  }

  public closeCase(force = false): ClinicalResult<void> {
    if (this.document === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    if (this.document.dirty && !force) {
      return clinicalFailure('dirty', 'Case has unsaved changes');
    }
    const now = this.clock.now();
    this.lifecycle.force('closing');
    this.tools.deactivate();
    this.document = undefined;
    this.lifecycle.force('ready');
    this.metrics.recordCaseClose();
    this.bumpSnapshot();
    this.syncDiagnostics();
    this.events.emit({ type: 'case', action: 'closed', document: undefined, at: now });
    this.host.notifications.push('info', 'Case', 'Case closed');
    this.notifyUi();
    return clinicalSuccess(undefined);
  }

  public markDirty(): ClinicalResult<ClinicalDocumentSnapshot> {
    if (this.document === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    const now = this.clock.now();
    this.document = bumpClinicalRevision(this.document, now, true);
    this.lifecycle.force('case-dirty');
    this.events.emit({ type: 'dirty', dirty: true, at: now });
    this.bumpSnapshot();
    this.syncDiagnostics();
    this.notifyUi();
    return clinicalSuccess(this.document);
  }

  public clearDirty(): ClinicalResult<ClinicalDocumentSnapshot> {
    if (this.document === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    const now = this.clock.now();
    this.document = Object.freeze({ ...this.document, dirty: false, updatedAt: now });
    this.lifecycle.force('case-active');
    this.events.emit({ type: 'dirty', dirty: false, at: now });
    this.bumpSnapshot();
    this.syncDiagnostics();
    this.notifyUi();
    return clinicalSuccess(this.document);
  }

  public updateDisplay(partial: Partial<DisplaySettings>): ClinicalResult<ClinicalDocumentSnapshot> {
    if (this.document === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    this.document = withDisplaySettings(this.document, partial, this.clock.now());
    this.lifecycle.force('case-dirty');
    this.bumpSnapshot();
    this.syncDiagnostics();
    this.notifyUi();
    return clinicalSuccess(this.document);
  }

  /**
   * Replace the active clinical document snapshot (e.g. after import).
   * Marks dirty when requested and transitions lifecycle accordingly.
   */
  public applyDocument(
    next: ClinicalDocumentSnapshot,
    markDirty: boolean
  ): ClinicalResult<ClinicalDocumentSnapshot> {
    if (this.disposed) {
      return clinicalFailure('unavailable', 'Session disposed');
    }
    this.document = markDirty
      ? Object.freeze({ ...next, dirty: true })
      : Object.freeze({ ...next, dirty: false });
    this.lifecycle.force(this.document.dirty ? 'case-dirty' : 'case-active');
    this.bumpSnapshot();
    this.syncDiagnostics();
    this.events.emit({
      type: 'case',
      action: 'updated',
      document: this.document,
      at: this.clock.now()
    });
    if (this.document.dirty) {
      this.events.emit({ type: 'dirty', dirty: true, at: this.clock.now() });
    }
    this.notifyUi();
    return clinicalSuccess(this.document);
  }

  public activateTool(id: ClinicalToolId): ClinicalResult<void> {
    const result = this.tools.activate(id);
    if (!result.ok) {
      this.diagnostics.record('warning', result.error.message, 'tools');
      this.host.notifications.push('warning', 'Tool', result.error.message);
      return clinicalFailure(result.error.code, result.error.message);
    }
    this.metrics.recordToolActivate();
    this.events.emit({
      type: 'tool',
      action: 'activated',
      toolId: id,
      at: this.clock.now()
    });
    this.notifyUi();
    return clinicalSuccess(undefined);
  }

  public getTools(): ClinicalToolRegistry {
    return this.tools;
  }

  public getEvents(): ClinicalEvents {
    return this.events;
  }

  public getMetrics(): ClinicalMetrics {
    return this.metrics;
  }

  public getDiagnostics(): ClinicalDiagnostics {
    return this.diagnostics;
  }

  public getRecentCases(): RecentCasesRegistry {
    return this.recent;
  }

  public getHost(): StudioCompositionRoot {
    return this.host;
  }

  public getUiRevision(): number {
    return this.uiRevision;
  }

  public subscribeUi(listener: () => void): () => void {
    this.uiListeners.add(listener);
    return () => {
      this.uiListeners.delete(listener);
    };
  }

  public notifyUi(): void {
    this.uiRevision += 1;
    for (const listener of this.uiListeners) {
      listener();
    }
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.tools.deactivate();
    this.document = undefined;
    this.lifecycle.force('disposed');
    this.uiListeners.clear();
  }

  private bumpSnapshot(): void {
    this.snapshotRevision += 1;
  }

  private syncDiagnostics(): void {
    this.diagnostics.setPhase(this.lifecycle.getPhase(), this.document !== undefined);
    this.diagnostics.setToolStats(this.tools.list().length, this.tools.enabledCount());
  }
}
