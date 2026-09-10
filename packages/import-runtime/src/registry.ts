import type { ImportSession } from './session.js';
import type { ImportSessionId } from './types.js';
import { importFailure, importSuccess, type ImportResultType } from './types.js';

/**
 * Registry of concurrent import sessions.
 * No hidden globals.
 */
export class ImportRegistry {
  private readonly sessions = new Map<string, ImportSession>();

  public register(session: ImportSession): ImportResultType<void> {
    const key = session.sessionId as string;
    if (this.sessions.has(key)) {
      return importFailure('conflict', `Session ${key} already registered`);
    }
    this.sessions.set(key, session);
    return importSuccess(undefined);
  }

  public get(sessionId: ImportSessionId): ImportSession | undefined {
    return this.sessions.get(sessionId as string);
  }

  public unregister(sessionId: ImportSessionId): void {
    this.sessions.delete(sessionId as string);
  }

  public list(): readonly ImportSession[] {
    return Object.freeze([...this.sessions.values()]);
  }

  public activeCount(): number {
    return [...this.sessions.values()].filter((s) => s.getLifecyclePhase() !== 'disposed')
      .length;
  }

  public clear(): void {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();
  }

  public size(): number {
    return this.sessions.size;
  }
}
