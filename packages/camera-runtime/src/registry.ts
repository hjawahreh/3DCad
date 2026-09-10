import type { CameraSession } from './session.js';
import type { CameraSessionId, ViewportId } from './types.js';
import { cameraFailure, cameraSuccess, type CameraResult } from './types.js';

/**
 * Registry of camera sessions (typically one per viewport).
 * No hidden globals.
 */
export class CameraRegistry {
  private readonly bySession = new Map<string, CameraSession>();
  private readonly byViewport = new Map<string, CameraSessionId>();

  public register(session: CameraSession): CameraResult<void> {
    const key = session.sessionId as string;
    if (this.bySession.has(key)) {
      return cameraFailure('conflict', `Session ${key} already registered`);
    }
    if (session.viewportId !== undefined) {
      const existing = this.byViewport.get(session.viewportId as string);
      if (existing !== undefined) {
        return cameraFailure(
          'conflict',
          `Viewport ${session.viewportId} already has camera session ${existing}`
        );
      }
      this.byViewport.set(session.viewportId as string, session.sessionId);
    }
    this.bySession.set(key, session);
    return cameraSuccess(undefined);
  }

  public get(sessionId: CameraSessionId): CameraSession | undefined {
    return this.bySession.get(sessionId as string);
  }

  public getByViewport(viewportId: ViewportId): CameraSession | undefined {
    const id = this.byViewport.get(viewportId as string);
    return id === undefined ? undefined : this.bySession.get(id as string);
  }

  public unregister(sessionId: CameraSessionId): void {
    const session = this.bySession.get(sessionId as string);
    if (session === undefined) {
      return;
    }
    this.bySession.delete(sessionId as string);
    if (session.viewportId !== undefined) {
      this.byViewport.delete(session.viewportId as string);
    }
  }

  public list(): readonly CameraSession[] {
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
