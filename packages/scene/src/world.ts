import type { DocumentRevisionView } from './document.js';
import type { SceneRevision } from './revision.js';
import type { SceneSnapshot } from './snapshot.js';
import { sceneFailure, sceneSuccess, type SceneResult } from './types.js';

/**
 * Transient scene world for one projection session / viewport binding.
 * Disposable; never authoritative relative to Domain.
 */
export class SceneWorld {
  private document: DocumentRevisionView | undefined;
  private revision: SceneRevision | undefined;
  private disposed = false;

  public getDocument(): DocumentRevisionView | undefined {
    return this.document;
  }

  public getRevision(): SceneRevision | undefined {
    return this.revision;
  }

  public getSnapshot(): SceneSnapshot | undefined {
    return this.revision?.snapshot;
  }

  public setProjected(
    document: DocumentRevisionView,
    revision: SceneRevision
  ): SceneResult<void> {
    if (this.disposed) {
      return sceneFailure('unavailable', 'SceneWorld disposed');
    }
    if (revision.documentRevision !== document.revision) {
      return sceneFailure(
        'revision-mismatch',
        'Scene revision does not match document revision'
      );
    }
    this.document = document;
    this.revision = revision;
    return sceneSuccess(undefined);
  }

  public clear(): void {
    this.document = undefined;
    this.revision = undefined;
  }

  public dispose(): void {
    this.clear();
    this.disposed = true;
  }

  public isDisposed(): boolean {
    return this.disposed;
  }
}
