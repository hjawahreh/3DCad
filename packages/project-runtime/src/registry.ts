import type { ProjectSession } from './session.js';
import type { ProjectId, ProjectSessionId } from './types.js';
import { projectFailure, projectSuccess, type ProjectResult } from './types.js';

/**
 * Registry of project sessions. Supports single-active or multi-open policies.
 * No hidden globals.
 */
export class ProjectRegistry {
  private readonly sessions = new Map<string, ProjectSession>();
  private activeSessionId: ProjectSessionId | undefined;

  public register(session: ProjectSession): ProjectResult<void> {
    const key = session.sessionId as string;
    if (this.sessions.has(key)) {
      return projectFailure('conflict', `Session ${key} already registered`);
    }
    this.sessions.set(key, session);
    return projectSuccess(undefined);
  }

  public setActive(sessionId: ProjectSessionId): void {
    this.activeSessionId = sessionId;
  }

  public getActive(): ProjectSession | undefined {
    if (this.activeSessionId === undefined) {
      return undefined;
    }
    return this.sessions.get(this.activeSessionId as string);
  }

  public get(sessionId: ProjectSessionId): ProjectSession | undefined {
    return this.sessions.get(sessionId as string);
  }

  public findByProjectId(projectId: ProjectId): ProjectSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.getSnapshot()?.id === projectId) {
        return session;
      }
    }
    return undefined;
  }

  public unregister(sessionId: ProjectSessionId): void {
    this.sessions.delete(sessionId as string);
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = undefined;
    }
  }

  public list(): readonly ProjectSession[] {
    return Object.freeze([...this.sessions.values()]);
  }

  public clear(): void {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();
    this.activeSessionId = undefined;
  }

  public size(): number {
    return this.sessions.size;
  }
}
