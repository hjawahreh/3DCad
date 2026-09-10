import type { DocumentEntityView } from './document.js';
import type { SceneLayer } from './types.js';

export interface VisibilityDescriptor {
  readonly visible: boolean;
  readonly layer: SceneLayer;
  readonly culled: false;
}

export class VisibilityBuilder {
  public build(entity: DocumentEntityView): VisibilityDescriptor {
    return Object.freeze({
      visible: entity.visible,
      layer: entity.layer,
      culled: false as const
    });
  }
}
