import type { InteractionSession } from './session.js';
import type { InteractionSessionId, ViewportId } from './types.js';
import { interactionFailure, interactionSuccess, type InteractionResult } from './types.js';

/**
 * Registry of interaction sessions (typically one per viewport).
 * No hidden globals — instantiate per application runtime.
 */
export class InteractionRegistry {
  private readonly bySession = new Map<string, InteractionSession>();
  private readonly byViewport = new Map<string, InteractionSessionId>();

  public register(session: InteractionSession): InteractionResult<void> {
    const key = session.sessionId as string;
    if (this.bySession.has(key)) {
      return interactionFailure('conflict', `Session ${key} already registered`);
    }
    if (session.viewportId !== undefined) {
      const existing = this.byViewport.get(session.viewportId as string);
      if (existing !== undefined) {
        return interactionFailure(
          'conflict',
          `Viewport ${session.viewportId} already has session ${existing}`
        );
      }
      this.byViewport.set(session.viewportId as string, session.sessionId);
    }
    this.bySession.set(key, session);
    return interactionSuccess(undefined);
  }

  public get(sessionId: InteractionSessionId): InteractionSession | undefined {
    return this.bySession.get(sessionId as string);
  }

  public getByViewport(viewportId: ViewportId): InteractionSession | undefined {
    const sessionId = this.byViewport.get(viewportId as string);
    if (sessionId === undefined) {
      return undefined;
    }
    return this.bySession.get(sessionId as string);
  }

  public unregister(sessionId: InteractionSessionId): void {
    const session = this.bySession.get(sessionId as string);
    if (session === undefined) {
      return;
    }
    this.bySession.delete(sessionId as string);
    if (session.viewportId !== undefined) {
      this.byViewport.delete(session.viewportId as string);
    }
  }

  public list(): readonly InteractionSession[] {
    return Object.freeze([...this.bySession.values()]);
  }

  public clear(): void {
    for (const session of this.bySession.values()) {
      session.dispose();
    }
    this.bySession.clear();
    this.byViewport.clear();
  }

  public size(): number {
    return this.bySession.size;
  }
}
