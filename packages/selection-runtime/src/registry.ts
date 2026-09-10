import type { SelectionSession } from './session.js';
import type { SelectionSessionId } from './types.js';
import { selectionFailure, selectionSuccess, type SelectionResult } from './types.js';

/**
 * Registry of selection sessions.
 * No hidden globals.
 */
export class SelectionRegistry {
  private readonly sessions = new Map<string, SelectionSession>();

  public register(session: SelectionSession): SelectionResult<void> {
    const key = session.sessionId as string;
    if (this.sessions.has(key)) {
      return selectionFailure('conflict', `Session ${key} already registered`);
    }
    this.sessions.set(key, session);
    return selectionSuccess(undefined);
  }

  public get(sessionId: SelectionSessionId): SelectionSession | undefined {
    return this.sessions.get(sessionId as string);
  }

  public unregister(sessionId: SelectionSessionId): void {
    this.sessions.delete(sessionId as string);
  }

  public list(): readonly SelectionSession[] {
    return Object.freeze([...this.sessions.values()]);
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
