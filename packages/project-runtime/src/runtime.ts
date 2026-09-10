import type { ProjectConfiguration } from './configuration.js';
import { RecentProjectsRegistry } from './recent.js';
import { ProjectRegistry } from './registry.js';
import { ProjectSession, type ProjectSessionOptions } from './session.js';
import type { ProjectPreferences } from './settings.js';
import {
  asProjectRuntimeId,
  asProjectSessionId,
  createDefaultProjectClock,
  createDefaultProjectScheduler,
  type ProjectClock,
  type ProjectRuntimeId,
  type ProjectScheduler,
  type ProjectSessionId,
  projectFailure,
  projectSuccess,
  type ProjectResult
} from './types.js';

export interface ProjectRuntimeOptions {
  readonly id?: ProjectRuntimeId;
  readonly clock?: ProjectClock;
  readonly scheduler?: ProjectScheduler;
  readonly registry?: ProjectRegistry;
  readonly recent?: RecentProjectsRegistry;
  readonly defaultConfiguration?: Partial<ProjectConfiguration>;
  readonly defaultPreferences?: Partial<ProjectPreferences>;
}

let sessionSerial = 0;
let runtimeSerial = 0;

/**
 * Application-facing Project Runtime entry.
 * Authoritative coordinator for project lifecycle, dirty state, autosave contracts, recent projects.
 *
 * Ownership: caller owns the runtime; dispose releases all sessions.
 * Threading: single-owner; sessions must not be shared across threads.
 * Does not import/export, parse files, render, or run geometry.
 */
export class ProjectRuntime {
  public readonly id: ProjectRuntimeId;
  private readonly clock: ProjectClock;
  private readonly scheduler: ProjectScheduler;
  private readonly registry: ProjectRegistry;
  private readonly recent: RecentProjectsRegistry;
  private readonly defaultConfiguration: Partial<ProjectConfiguration>;
  private readonly defaultPreferences: Partial<ProjectPreferences>;
  private disposed = false;

  public constructor(options: ProjectRuntimeOptions = {}) {
    runtimeSerial += 1;
    this.id = options.id ?? asProjectRuntimeId(`project-runtime-${String(runtimeSerial)}`);
    this.clock = options.clock ?? createDefaultProjectClock();
    this.scheduler = options.scheduler ?? createDefaultProjectScheduler();
    this.registry = options.registry ?? new ProjectRegistry();
    this.defaultConfiguration = options.defaultConfiguration ?? {};
    this.defaultPreferences = options.defaultPreferences ?? {};
    this.recent =
      options.recent ??
      new RecentProjectsRegistry(this.defaultConfiguration.maxRecentProjects ?? 20);
  }

  public getRegistry(): ProjectRegistry {
    return this.registry;
  }

  public getRecentProjects(): RecentProjectsRegistry {
    return this.recent;
  }

  public createSessionId(prefix = 'project-session'): ProjectSessionId {
    sessionSerial += 1;
    return asProjectSessionId(`${prefix}-${String(sessionSerial)}`);
  }

  public createSession(
    options: {
      readonly sessionId?: ProjectSessionId;
      readonly configuration?: Partial<ProjectConfiguration>;
      readonly preferences?: Partial<ProjectPreferences>;
    } = {}
  ): ProjectResult<ProjectSession> {
    if (this.disposed) {
      return projectFailure('unavailable', 'ProjectRuntime disposed');
    }
    const active = this.registry.getActive();
    const allowMultiple =
      options.configuration?.allowMultipleOpen ??
      this.defaultConfiguration.allowMultipleOpen ??
      false;
    if (
      !allowMultiple &&
      active !== undefined &&
      active.getSnapshot() !== undefined &&
      active.getLifecyclePhase() !== 'closed' &&
      active.getLifecyclePhase() !== 'disposed'
    ) {
      return projectFailure(
        'conflict',
        'Only one active project is allowed; close the current project first'
      );
    }

    const sessionOptions: ProjectSessionOptions = {
      sessionId: options.sessionId ?? this.createSessionId(),
      configuration: {
        ...this.defaultConfiguration,
        ...(options.configuration ?? {})
      },
      preferences: {
        ...this.defaultPreferences,
        ...(options.preferences ?? {})
      },
      clock: this.clock,
      scheduler: this.scheduler,
      recent: this.recent
    };
    const session = new ProjectSession(sessionOptions);
    const registered = this.registry.register(session);
    if (!registered.ok) {
      session.dispose();
      return registered;
    }
    this.registry.setActive(session.sessionId);
    return projectSuccess(session);
  }

  public getSession(sessionId: ProjectSessionId): ProjectSession | undefined {
    return this.registry.get(sessionId);
  }

  public getActiveSession(): ProjectSession | undefined {
    return this.registry.getActive();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.registry.clear();
  }

  public isDisposed(): boolean {
    return this.disposed;
  }
}
