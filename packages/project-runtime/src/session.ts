import { AutosaveCoordinator } from './autosave.js';
import type { ProjectConfiguration } from './configuration.js';
import { resolveProjectConfiguration } from './configuration.js';
import type { ProjectContext } from './context.js';
import { DirtyStateManager } from './dirty-state.js';
import { ProjectDiagnostics } from './diagnostics.js';
import { ProjectEvents } from './events.js';
import { ProjectHistoryCoordinator } from './history.js';
import { ProjectLifecycle } from './lifecycle.js';
import { ProjectManager } from './manager.js';
import { createProjectMetadata, type ProjectMetadata } from './metadata.js';
import { ProjectMetrics } from './metrics.js';
import type { RecentProjectsRegistry } from './recent.js';
import {
  DEFAULT_PROJECT_PREFERENCES,
  resolveProjectPreferences,
  resolveProjectSettings,
  type ProjectPreferences,
  type ProjectSettings
} from './settings.js';
import type { ImmutableProjectSnapshot, ProjectPublicState } from './state.js';
import {
  asProjectId,
  createDefaultProjectClock,
  createDefaultProjectScheduler,
  type ProjectClock,
  type ProjectId,
  type ProjectLocationRef,
  type ProjectScheduler,
  type ProjectSessionId,
  projectFailure,
  projectSuccess,
  type ProjectResult
} from './types.js';

export interface ProjectSessionOptions {
  readonly sessionId: ProjectSessionId;
  readonly configuration?: Partial<ProjectConfiguration>;
  readonly preferences?: Partial<ProjectPreferences>;
  readonly clock?: ProjectClock;
  readonly scheduler?: ProjectScheduler;
  readonly recent: RecentProjectsRegistry;
}

/**
 * One project session — lifecycle coordinator for a single project.
 * Does not parse files, run geometry, or execute commands.
 *
 * Ownership: runtime-owned until dispose.
 * Threading: single-owner.
 */
export class ProjectSession {
  public readonly sessionId: ProjectSessionId;

  private readonly configuration: ProjectConfiguration;
  private readonly preferences: ProjectPreferences;
  private readonly clock: ProjectClock;
  private readonly scheduler: ProjectScheduler;
  private readonly lifecycle = new ProjectLifecycle();
  private readonly events = new ProjectEvents();
  private readonly metrics = new ProjectMetrics();
  private readonly diagnostics = new ProjectDiagnostics();
  private readonly dirtyState = new DirtyStateManager();
  private readonly history = new ProjectHistoryCoordinator();
  private readonly recent: RecentProjectsRegistry;
  private readonly autosave: AutosaveCoordinator;
  private manager: ProjectManager | undefined;
  private signal: AbortSignal | undefined;

  public constructor(options: ProjectSessionOptions) {
    this.sessionId = options.sessionId;
    this.configuration = resolveProjectConfiguration(options.configuration);
    this.preferences = resolveProjectPreferences(
      options.preferences ?? DEFAULT_PROJECT_PREFERENCES
    );
    this.clock = options.clock ?? createDefaultProjectClock();
    this.scheduler = options.scheduler ?? createDefaultProjectScheduler();
    this.recent = options.recent;
    this.autosave = new AutosaveCoordinator(
      this.clock,
      this.scheduler,
      this.events,
      this.configuration.autosaveIntervalMs,
      this.configuration.autosaveEnabled
    );
    this.autosave.setHandler(() => this.performAutosave());
    this.metrics.beginSession(this.clock.now());
  }

  public getLifecyclePhase(): string {
    return this.lifecycle.getPhase();
  }

  public getEvents(): ProjectEvents {
    return this.events;
  }

  public getMetrics(): ProjectMetrics {
    return this.metrics;
  }

  public getDiagnostics(): ProjectDiagnostics {
    return this.diagnostics;
  }

  public getHistory(): ProjectHistoryCoordinator {
    return this.history;
  }

  public getAutosave(): AutosaveCoordinator {
    return this.autosave;
  }

  public getSnapshot(): ImmutableProjectSnapshot | undefined {
    return this.manager?.getSnapshot();
  }

  public getContext(): ProjectContext {
    return {
      sessionId: this.sessionId,
      configuration: this.configuration,
      preferences: this.preferences,
      clock: this.clock,
      events: this.events,
      signal: this.signal
    };
  }

  public getPublicState(): ProjectPublicState {
    return Object.freeze({
      phase: this.lifecycle.getPhase(),
      snapshot: this.manager?.refresh(this.lifecycle.getPhase(), this.dirtyState.isDirty()),
      dirty: this.dirtyState.isDirty(),
      readOnly: this.manager?.isReadOnly() ?? false
    });
  }

  /**
   * Create a new empty project and open it through the lifecycle.
   */
  public create(input: {
    readonly name: string;
    readonly projectId?: ProjectId;
    readonly location?: ProjectLocationRef;
    readonly settings?: Partial<ProjectSettings>;
    readonly readOnly?: boolean;
    readonly signal?: AbortSignal;
  }): ProjectResult<ImmutableProjectSnapshot> {
    this.signal = input.signal;
    const id = input.projectId ?? asProjectId(`project-${String(this.clock.now())}`);
    const meta = createProjectMetadata({
      id,
      name: input.name,
      createdAt: this.clock.now(),
      ...(input.location === undefined ? {} : { location: input.location })
    });
    return this.openInternal(meta, input.settings, input.readOnly === true);
  }

  /**
   * Open an existing project descriptor (host supplies metadata; no file parse here).
   */
  public open(input: {
    readonly metadata: ProjectMetadata;
    readonly settings?: Partial<ProjectSettings>;
    readonly readOnly?: boolean;
    readonly signal?: AbortSignal;
  }): ProjectResult<ImmutableProjectSnapshot> {
    this.signal = input.signal;
    return this.openInternal(
      input.metadata,
      input.settings,
      input.readOnly ?? this.configuration.defaultReadOnly
    );
  }

  public modify(): ProjectResult<ImmutableProjectSnapshot> {
    if (this.signal?.aborted === true) {
      return projectFailure('cancelled', 'Project session cancelled');
    }
    if (this.manager === undefined) {
      return projectFailure('unavailable', 'No project loaded');
    }
    if (this.manager.isReadOnly()) {
      return projectFailure('readonly', 'Project is read-only');
    }
    const from = this.lifecycle.getPhase();
    if (from !== 'modifying' && from !== 'dirty' && from !== 'active') {
      this.diagnostics.recordFailedTransition(
        `Cannot modify from ${from}`,
        this.clock.now()
      );
      return projectFailure('lifecycle', `Cannot modify from ${from}`);
    }
    this.lifecycle.force('modifying');
    this.manager.bumpDocumentRevision(this.lifecycle.getPhase());
    return this.markDirty();
  }

  public markDirty(): ProjectResult<ImmutableProjectSnapshot> {
    if (this.manager === undefined) {
      return projectFailure('unavailable', 'No project loaded');
    }
    if (this.manager.isReadOnly()) {
      return projectFailure('readonly', 'Cannot mark read-only project dirty');
    }
    const from = this.lifecycle.getPhase();
    this.dirtyState.markDirty(this.clock.now());
    if (from !== 'dirty' && from !== 'autosaving') {
      this.lifecycle.force('dirty');
      this.emitLifecycle(from);
    }
    const snapshot = this.manager.refresh('dirty', true);
    this.metrics.recordDirtyDuration(this.dirtyState.dirtyDurationMs(this.clock.now()));
    this.events.emit({
      type: 'dirty',
      dirty: true,
      snapshot,
      at: this.clock.now()
    });
    this.autosave.scheduleIfNeeded(true);
    this.recordHistory(from, 'dirty', snapshot);
    return projectSuccess(snapshot);
  }

  public save(): ProjectResult<ImmutableProjectSnapshot> {
    return this.saveInternal('manual');
  }

  public close(force = false): ProjectResult<void> {
    if (this.manager === undefined) {
      this.lifecycle.force('closed');
      return projectSuccess(undefined);
    }
    if (this.dirtyState.isDirty() && !force) {
      this.diagnostics.recordDirtyInconsistency(
        'Close requested while dirty; use force=true or save first',
        this.clock.now()
      );
      return projectFailure('dirty', 'Project has unsaved changes');
    }
    const from = this.lifecycle.getPhase();
    this.lifecycle.force('closing');
    this.emitLifecycle(from);
    this.autosave.cancelScheduled();
    const snapshot = this.manager.refresh('closing', this.dirtyState.isDirty());
    this.recordHistory(from, 'closing', snapshot);
    this.lifecycle.force('closed');
    this.emitLifecycle('closing');
    this.manager = undefined;
    this.dirtyState.clearDirty();
    return projectSuccess(undefined);
  }

  public updateMetadata(patch: {
    readonly name?: string;
    readonly location?: ProjectLocationRef;
  }): ProjectResult<ImmutableProjectSnapshot> {
    if (this.manager === undefined) {
      return projectFailure('unavailable', 'No project loaded');
    }
    const snapshot = this.manager.updateMetadata(this.lifecycle.getPhase(), patch);
    if (this.preferences.recentProjectsEnabled) {
      this.recent.updateMetadata(snapshot.metadata);
    }
    return projectSuccess(snapshot);
  }

  public updateSettings(partial: Partial<ProjectSettings>): ProjectResult<ImmutableProjectSnapshot> {
    if (this.manager === undefined) {
      return projectFailure('unavailable', 'No project loaded');
    }
    return projectSuccess(
      this.manager.updateSettings(this.lifecycle.getPhase(), partial)
    );
  }

  public setReadOnly(value: boolean): ProjectResult<ImmutableProjectSnapshot> {
    if (this.manager === undefined) {
      return projectFailure('unavailable', 'No project loaded');
    }
    return projectSuccess(this.manager.setReadOnly(value, this.lifecycle.getPhase()));
  }

  public suppressAutosave(): void {
    this.autosave.suppress();
  }

  public resumeAutosave(): void {
    this.autosave.resume();
    if (this.dirtyState.isDirty()) {
      this.autosave.scheduleIfNeeded(true);
    }
  }

  /** Deterministic autosave tick for tests / host pumps. */
  public runAutosaveNow(): ProjectResult<ImmutableProjectSnapshot> {
    const result = this.autosave.runNow(this.manager?.getDocumentRevision() ?? 0);
    if (!result.ok) {
      this.diagnostics.recordAutosaveFailure(result.error.message, this.clock.now());
      return result;
    }
    const snapshot = this.manager?.getSnapshot();
    if (snapshot === undefined) {
      return projectFailure('unavailable', 'No project loaded');
    }
    return projectSuccess(snapshot);
  }

  public dispose(): ProjectResult<void> {
    this.autosave.dispose();
    this.events.clear();
    this.diagnostics.clear();
    this.history.clear();
    this.manager = undefined;
    this.lifecycle.force('disposed');
    return projectSuccess(undefined);
  }

  private openInternal(
    metadata: ProjectMetadata,
    settings: Partial<ProjectSettings> | undefined,
    readOnly: boolean
  ): ProjectResult<ImmutableProjectSnapshot> {
    if (this.signal?.aborted === true) {
      return projectFailure('cancelled', 'Project open cancelled');
    }
    if (this.manager !== undefined && this.lifecycle.isOpen()) {
      return projectFailure('conflict', 'A project is already open in this session');
    }

    const from = this.lifecycle.getPhase();
    this.metrics.beginOpen(this.clock.now());

    if (!this.lifecycle.transition('opening') && from !== 'created' && from !== 'closed') {
      this.lifecycle.force('opening');
    } else if (from === 'closed' || from === 'created') {
      this.lifecycle.force('opening');
    }
    this.emitLifecycle(from);

    this.lifecycle.force('loading');
    this.emitLifecycle('opening');

    this.manager = new ProjectManager(
      metadata,
      resolveProjectSettings(settings),
      readOnly,
      this.clock,
      'loading'
    );

    this.lifecycle.force('activating');
    this.emitLifecycle('loading');
    this.manager.markOpened('activating');

    this.lifecycle.force('active');
    this.emitLifecycle('activating');
    this.dirtyState.clearDirty();
    const snapshot = this.manager.refresh('active', false);
    this.metrics.endOpen(this.clock.now());

    if (this.preferences.recentProjectsEnabled) {
      this.recent.register(snapshot.metadata, this.clock.now());
      this.events.emit({
        type: 'recent',
        operation: 'register',
        projectId: snapshot.id,
        at: this.clock.now()
      });
    }

    this.recordHistory(from, 'active', snapshot);
    return projectSuccess(snapshot);
  }

  private saveInternal(
    kind: 'manual' | 'autosave'
  ): ProjectResult<ImmutableProjectSnapshot> {
    if (this.manager === undefined) {
      return projectFailure('unavailable', 'No project loaded');
    }
    if (this.manager.isReadOnly() && kind === 'manual') {
      return projectFailure('readonly', 'Cannot save read-only project');
    }
    const from = this.lifecycle.getPhase();
    this.lifecycle.force(kind === 'autosave' ? 'autosaving' : 'saving');
    this.emitLifecycle(from);

    // Persistence is a host responsibility — runtime records the contract event only.
    const wasDirty = this.dirtyState.isDirty();
    this.dirtyState.clearDirty();
    if (!wasDirty && kind === 'manual') {
      this.diagnostics.recordDirtyInconsistency(
        'Save invoked while clean',
        this.clock.now()
      );
    }

    const snapshot = this.manager.refresh('active', false);
    this.lifecycle.force('active');
    this.emitLifecycle(kind === 'autosave' ? 'autosaving' : 'saving');

    if (kind === 'autosave') {
      this.metrics.recordAutosave();
    } else {
      this.metrics.recordSave();
    }
    this.events.emit({
      type: 'save',
      kind,
      snapshot,
      at: this.clock.now()
    });
    this.recordHistory(from, 'active', snapshot, kind);
    return projectSuccess(snapshot);
  }

  private performAutosave(): ProjectResult<void> {
    if (!this.dirtyState.isDirty()) {
      return projectSuccess(undefined);
    }
    const result = this.saveInternal('autosave');
    if (!result.ok) {
      return result;
    }
    return projectSuccess(undefined);
  }

  private emitLifecycle(fromPhase: string): void {
    void fromPhase;
    if (this.manager === undefined) {
      return;
    }
    this.events.emit({
      type: 'lifecycle',
      phase: this.lifecycle.getPhase(),
      projectId: this.manager.getId(),
      at: this.clock.now()
    });
  }

  private recordHistory(
    from: string,
    to: string,
    snapshot: ImmutableProjectSnapshot,
    label?: string
  ): void {
    this.history.record({
      fromPhase: from,
      toPhase: to,
      snapshot,
      ...(label === undefined ? {} : { label })
    });
    this.events.emit({
      type: 'history',
      operation: 'transition',
      snapshot,
      at: this.clock.now()
    });
  }
}
