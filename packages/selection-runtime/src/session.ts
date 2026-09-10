import type { InteractionSessionId } from '@cad-studio/interaction-runtime';
import { SelectionClipboard } from './clipboard.js';
import type { SelectionConfiguration } from './configuration.js';
import { resolveSelectionConfiguration } from './configuration.js';
import type { SelectionContext } from './context.js';
import { SelectionDiagnostics } from './diagnostics.js';
import { SelectionEvents } from './events.js';
import { SelectionHistory, type SelectionHistoryEntry } from './history.js';
import { SelectionLifecycle } from './lifecycle.js';
import { SelectionManager } from './manager.js';
import { SelectionMetrics } from './metrics.js';
import { SelectionFilter, SelectionPolicy } from './policy.js';
import type {
  ImmutableSelectionSnapshot,
  SelectionPublicState
} from './state.js';
import {
  createDefaultSelectionClock,
  type SelectionClock,
  type SelectionMode,
  type SelectionSessionId,
  selectionFailure,
  selectionSuccess,
  type SelectionResult
} from './types.js';

export interface SelectionSessionOptions {
  readonly sessionId: SelectionSessionId;
  readonly interactionSessionId?: InteractionSessionId;
  readonly configuration?: Partial<SelectionConfiguration>;
  readonly clock?: SelectionClock;
}

/**
 * One selection session.
 * Consumes opaque target ids from the host; no hit testing or geometry queries.
 *
 * Ownership: runtime-owned until dispose.
 * Threading: single-owner; do not call concurrently.
 * History: contributes immutable entries; does not own global undo/redo.
 */
export class SelectionSession {
  public readonly sessionId: SelectionSessionId;
  public readonly interactionSessionId: InteractionSessionId | undefined;

  private readonly configuration: SelectionConfiguration;
  private readonly clock: SelectionClock;
  private readonly lifecycle = new SelectionLifecycle();
  private readonly events = new SelectionEvents();
  private readonly metrics = new SelectionMetrics();
  private readonly diagnostics = new SelectionDiagnostics();
  private readonly filter: SelectionFilter;
  private readonly policy: SelectionPolicy;
  private readonly manager: SelectionManager;
  private readonly history: SelectionHistory;
  private readonly clipboard: SelectionClipboard;
  private signal: AbortSignal | undefined;

  public constructor(options: SelectionSessionOptions) {
    this.sessionId = options.sessionId;
    this.interactionSessionId = options.interactionSessionId;
    this.configuration = resolveSelectionConfiguration(options.configuration);
    this.clock = options.clock ?? createDefaultSelectionClock();
    this.filter = new SelectionFilter(this.configuration);
    this.policy = new SelectionPolicy(this.configuration);
    this.manager = new SelectionManager(this.clock);
    this.history = new SelectionHistory(this.configuration.historyLimit);
    this.clipboard = new SelectionClipboard();
  }

  public getLifecyclePhase(): string {
    return this.lifecycle.getPhase();
  }

  public getEvents(): SelectionEvents {
    return this.events;
  }

  public getMetrics(): SelectionMetrics {
    return this.metrics;
  }

  public getDiagnostics(): SelectionDiagnostics {
    return this.diagnostics;
  }

  public getSnapshot(): ImmutableSelectionSnapshot {
    return this.manager.getSnapshot();
  }

  public getHistory(): SelectionHistory {
    return this.history;
  }

  public getClipboard(): SelectionClipboard {
    return this.clipboard;
  }

  public getContext(): SelectionContext {
    return {
      sessionId: this.sessionId,
      interactionSessionId: this.interactionSessionId,
      configuration: this.configuration,
      clock: this.clock,
      events: this.events,
      signal: this.signal
    };
  }

  public getPublicState(): SelectionPublicState {
    return Object.freeze({
      phase: this.lifecycle.getPhase(),
      snapshot: this.manager.getSnapshot(),
      pending: this.lifecycle.getPhase() === 'modifying'
    });
  }

  public begin(signal?: AbortSignal): SelectionResult<void> {
    this.signal = signal;
    if (!this.lifecycle.transition('beginning')) {
      return selectionFailure(
        'lifecycle',
        `Cannot begin from ${this.lifecycle.getPhase()}`
      );
    }
    this.emitLifecycle();
    if (!this.lifecycle.transition('ready')) {
      return selectionFailure('lifecycle', 'Failed to reach ready');
    }
    this.emitLifecycle();
    return selectionSuccess(undefined);
  }

  /**
   * Begin a selection modification (pending until commit).
   */
  public modify(
    mode: SelectionMode,
    rawIds: readonly string[],
    documentRevision?: number
  ): SelectionResult<ImmutableSelectionSnapshot> {
    void documentRevision;
    if (this.signal?.aborted === true) {
      return selectionFailure('cancelled', 'Selection session cancelled');
    }
    const phase = this.lifecycle.getPhase();
    if (phase !== 'ready' && phase !== 'committed' && phase !== 'modifying') {
      return selectionFailure('lifecycle', `Cannot modify from ${phase}`);
    }
    if (phase !== 'modifying') {
      this.lifecycle.force('modifying');
      this.emitLifecycle();
    }

    const filtered = this.filter.filter(rawIds);
    if (!filtered.ok) {
      return filtered;
    }
    this.diagnostics.recordInvalidIds(filtered.value.rejected.length, this.clock.now());
    this.diagnostics.recordDuplicates(filtered.value.duplicatesSuppressed, this.clock.now());

    const applied = this.policy.apply({
      current: this.manager.getSnapshot().ids,
      incoming: filtered.value.accepted,
      mode
    });
    if (!applied.ok) {
      this.events.emit({
        type: 'policy',
        code: applied.error.code,
        message: applied.error.message,
        at: this.clock.now()
      });
      this.lifecycle.force('ready');
      return applied;
    }

    for (const violation of applied.value.violations) {
      this.diagnostics.recordPolicyViolation(violation, this.clock.now());
      this.metrics.recordPolicyViolation();
      this.events.emit({
        type: 'policy',
        code: violation,
        message: `Policy applied: ${violation}`,
        at: this.clock.now()
      });
    }

    this.manager.beginModify(mode, applied.value.ids);
    const pending = this.manager.pendingSnapshot();
    this.events.emit({
      type: 'modify',
      mode,
      targets: applied.value.ids,
      pending,
      at: this.clock.now()
    });
    return selectionSuccess(pending);
  }

  public commit(documentRevision?: number): SelectionResult<ImmutableSelectionSnapshot> {
    if (this.lifecycle.getPhase() !== 'modifying') {
      return selectionFailure(
        'lifecycle',
        `Cannot commit from ${this.lifecycle.getPhase()}`
      );
    }
    if (!this.lifecycle.transition('committing')) {
      return selectionFailure('lifecycle', 'Failed to enter committing');
    }
    this.emitLifecycle();

    const previous = this.manager.getSnapshot();
    const pending = this.manager.getPending();
    if (pending.mode === undefined) {
      this.lifecycle.force('ready');
      return selectionFailure('invalid', 'No pending selection mode');
    }

    const next = this.manager.commitPending(
      pending.ids,
      pending.mode,
      documentRevision
    );

    if (next.revision === previous.revision && next.ids.length === previous.ids.length) {
      // still ok if content changed with same length — compare membership
      const same =
        next.ids.length === previous.ids.length &&
        next.ids.every((id, i) => id === previous.ids[i]);
      if (same) {
        this.diagnostics.recordSnapshotMismatch(
          'Commit produced identical snapshot',
          this.clock.now()
        );
      }
    }

    const entry = this.history.push(previous, next);
    this.metrics.recordHistory();
    this.metrics.recordCommit(next.count);
    this.events.emit({
      type: 'history',
      operation: 'push',
      snapshot: next,
      at: this.clock.now()
    });
    this.events.emit({
      type: 'commit',
      snapshot: next,
      previous,
      at: this.clock.now()
    });

    if (!this.lifecycle.transition('committed')) {
      this.lifecycle.force('committed');
    }
    this.emitLifecycle();
    // Return to ready for next modification cycle
    this.lifecycle.force('ready');
    void entry;
    return selectionSuccess(next);
  }

  /** Convenience: modify + commit in one call. */
  public select(
    mode: SelectionMode,
    rawIds: readonly string[],
    documentRevision?: number
  ): SelectionResult<ImmutableSelectionSnapshot> {
    const modified = this.modify(mode, rawIds, documentRevision);
    if (!modified.ok) {
      return modified;
    }
    return this.commit(documentRevision);
  }

  public clear(): SelectionResult<ImmutableSelectionSnapshot> {
    if (!this.lifecycle.isActive() && this.lifecycle.getPhase() !== 'ready') {
      return selectionFailure(
        'lifecycle',
        `Cannot clear from ${this.lifecycle.getPhase()}`
      );
    }
    this.lifecycle.force('clearing');
    this.emitLifecycle();
    const previous = this.manager.getSnapshot();
    const next = this.manager.clear();
    this.history.push(previous, next, 'selection-clear');
    this.metrics.recordHistory();
    this.metrics.recordCommit(0);
    this.events.emit({
      type: 'clear',
      previous,
      at: this.clock.now()
    });
    this.lifecycle.force('ready');
    this.emitLifecycle();
    return selectionSuccess(next);
  }

  public undo(): SelectionResult<ImmutableSelectionSnapshot> {
    const entry = this.history.undo();
    if (!entry.ok) {
      return entry;
    }
    const restored = this.manager.restore(entry.value.previous);
    this.events.emit({
      type: 'history',
      operation: 'undo',
      snapshot: restored,
      at: this.clock.now()
    });
    this.metrics.recordCommit(restored.count);
    return selectionSuccess(restored);
  }

  public redo(): SelectionResult<ImmutableSelectionSnapshot> {
    const entry = this.history.redo();
    if (!entry.ok) {
      return entry;
    }
    const restored = this.manager.restore(entry.value.next);
    this.events.emit({
      type: 'history',
      operation: 'redo',
      snapshot: restored,
      at: this.clock.now()
    });
    this.metrics.recordCommit(restored.count);
    return selectionSuccess(restored);
  }

  /** Expose last history entry for Platform Runtime history integration. */
  public lastHistoryEntry(): SelectionHistoryEntry | undefined {
    return this.history.peekUndo();
  }

  public copyToClipboard(): SelectionResult<ImmutableSelectionSnapshot> {
    if (!this.configuration.enableClipboard) {
      return selectionFailure('unavailable', 'Clipboard is disabled');
    }
    const result = this.clipboard.copy(this.manager.getSnapshot());
    if (!result.ok) {
      return result;
    }
    this.metrics.recordClipboard();
    this.events.emit({
      type: 'clipboard',
      operation: 'copy',
      count: result.value.count,
      at: this.clock.now()
    });
    return result;
  }

  public duplicateFromClipboard(): SelectionResult<ImmutableSelectionSnapshot> {
    if (!this.configuration.enableClipboard) {
      return selectionFailure('unavailable', 'Clipboard is disabled');
    }
    const result = this.clipboard.duplicate();
    if (!result.ok) {
      return result;
    }
    this.metrics.recordClipboard();
    this.events.emit({
      type: 'clipboard',
      operation: 'duplicate',
      count: result.value.count,
      at: this.clock.now()
    });
    return result;
  }

  public clearClipboard(): SelectionResult<void> {
    this.clipboard.clear();
    this.metrics.recordClipboard();
    this.events.emit({
      type: 'clipboard',
      operation: 'clear',
      count: 0,
      at: this.clock.now()
    });
    return selectionSuccess(undefined);
  }

  public dispose(): SelectionResult<void> {
    this.history.clear();
    this.clipboard.clear();
    this.events.clear();
    this.diagnostics.clear();
    this.lifecycle.force('disposed');
    this.emitLifecycle();
    return selectionSuccess(undefined);
  }

  private emitLifecycle(): void {
    this.events.emit({
      type: 'lifecycle',
      phase: this.lifecycle.getPhase(),
      at: this.clock.now()
    });
  }
}
