import type { SceneSnapshot } from './snapshot.js';
import type { DocumentRevisionId, SceneRevisionId } from './types.js';

export class SceneRevision {
  public constructor(
    public readonly id: SceneRevisionId,
    public readonly documentRevision: DocumentRevisionId,
    public readonly snapshot: SceneSnapshot
  ) {
    Object.freeze(this);
  }
}
