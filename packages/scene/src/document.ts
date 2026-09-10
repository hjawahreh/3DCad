import type {
  Aabb,
  DocumentRevisionId,
  DomainEntityId,
  Mat4,
  SceneLayer,
  Vec3
} from './types.js';
import { IDENTITY_MAT4 } from './types.js';

/**
 * Scene-facing read model of a domain entity.
 * Domain packages project into this shape; Scene never imports Domain.
 */
export interface DocumentEntityView {
  readonly id: DomainEntityId;
  readonly kind: string;
  readonly layer: SceneLayer;
  readonly visible: boolean;
  readonly transform: Mat4;
  readonly geometryRef?: string;
  readonly materialRef?: string;
  readonly display?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly localBounds?: Aabb;
}

/**
 * Immutable document revision consumed by projection.
 * Ownership: caller retains the document; Scene only reads.
 */
export interface DocumentRevisionView {
  readonly revision: DocumentRevisionId;
  readonly entities: ReadonlyMap<DomainEntityId, DocumentEntityView>;
  readonly replaced?: boolean;
}

export const createDocumentEntity = (input: {
  readonly id: DomainEntityId;
  readonly kind: string;
  readonly layer?: SceneLayer;
  readonly visible?: boolean;
  readonly transform?: Mat4;
  readonly geometryRef?: string;
  readonly materialRef?: string;
  readonly display?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly localBounds?: Aabb;
}): DocumentEntityView =>
  Object.freeze({
    id: input.id,
    kind: input.kind,
    layer: input.layer ?? 'world',
    visible: input.visible ?? true,
    transform: input.transform ?? IDENTITY_MAT4,
    ...(input.geometryRef === undefined ? {} : { geometryRef: input.geometryRef }),
    ...(input.materialRef === undefined ? {} : { materialRef: input.materialRef }),
    ...(input.display === undefined ? {} : { display: Object.freeze({ ...input.display }) }),
    ...(input.metadata === undefined ? {} : { metadata: Object.freeze({ ...input.metadata }) }),
    ...(input.localBounds === undefined ? {} : { localBounds: input.localBounds })
  });

export const createDocumentRevision = (
  revision: DocumentRevisionId,
  entities: readonly DocumentEntityView[],
  replaced = false
): DocumentRevisionView => {
  const map = new Map<DomainEntityId, DocumentEntityView>();
  for (const entity of entities) {
    map.set(entity.id, entity);
  }
  return Object.freeze({
    revision,
    entities: map,
    ...(replaced ? { replaced: true as const } : {})
  });
};

export const translate = (x: number, y: number, z: number): Mat4 =>
  Object.freeze({
    elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1] as const
  });

export const vec3 = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });

export const aabb = (min: Vec3, max: Vec3): Aabb => Object.freeze({ min, max });
