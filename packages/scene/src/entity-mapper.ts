import {
  asSceneEntityId,
  sceneFailure,
  sceneSuccess,
  type DomainEntityId,
  type SceneEntityId,
  type SceneResult
} from './types.js';

/**
 * Stable Domain → Scene identity. Survives incremental updates; independent of render order.
 */
export class EntityMapper {
  private readonly domainToScene = new Map<DomainEntityId, SceneEntityId>();
  private readonly sceneToDomain = new Map<SceneEntityId, DomainEntityId>();

  public map(domainId: DomainEntityId): SceneEntityId {
    const existing = this.domainToScene.get(domainId);
    if (existing !== undefined) {
      return existing;
    }
    const sceneId = asSceneEntityId(`scene:${domainId}`);
    this.domainToScene.set(domainId, sceneId);
    this.sceneToDomain.set(sceneId, domainId);
    return sceneId;
  }

  public resolveDomain(sceneId: SceneEntityId): SceneResult<DomainEntityId> {
    const domainId = this.sceneToDomain.get(sceneId);
    if (domainId === undefined) {
      return sceneFailure('not-found', `Unknown scene entity ${sceneId}`);
    }
    return sceneSuccess(domainId);
  }

  public resolveScene(domainId: DomainEntityId): SceneResult<SceneEntityId> {
    const sceneId = this.domainToScene.get(domainId);
    if (sceneId === undefined) {
      return sceneFailure('not-found', `Unknown domain entity ${domainId}`);
    }
    return sceneSuccess(sceneId);
  }

  public forget(domainId: DomainEntityId): void {
    const sceneId = this.domainToScene.get(domainId);
    if (sceneId === undefined) {
      return;
    }
    this.domainToScene.delete(domainId);
    this.sceneToDomain.delete(sceneId);
  }

  public size(): number {
    return this.domainToScene.size;
  }

  public clear(): void {
    this.domainToScene.clear();
    this.sceneToDomain.clear();
  }
}
