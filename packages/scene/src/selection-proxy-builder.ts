import type { DocumentEntityView } from './document.js';
import type { Aabb, DomainEntityId, PickingId, SceneEntityId, SceneLayer } from './types.js';

export interface SelectionProxy {
  readonly sceneEntityId: SceneEntityId;
  readonly domainEntityId: DomainEntityId;
  readonly pickingId: PickingId;
  readonly layer: SceneLayer;
  readonly bounds: Aabb;
  readonly selectable: boolean;
}

export class SelectionProxyBuilder {
  public build(input: {
    readonly entity: DocumentEntityView;
    readonly sceneEntityId: SceneEntityId;
    readonly pickingId: PickingId;
    readonly bounds: Aabb;
  }): SelectionProxy {
    return Object.freeze({
      sceneEntityId: input.sceneEntityId,
      domainEntityId: input.entity.id,
      pickingId: input.pickingId,
      layer: input.entity.layer,
      bounds: input.bounds,
      selectable: input.entity.layer === 'world' && input.entity.visible
    });
  }
}
