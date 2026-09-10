import type { DocumentEntityView } from './document.js';
import type { Aabb, Mat4, Vec3 } from './types.js';
import { emptyAabb } from './types.js';

const transformPoint = (m: Mat4, p: Vec3): Vec3 => {
  const e = m.elements;
  const x = e[0]! * p.x + e[4]! * p.y + e[8]! * p.z + e[12]!;
  const y = e[1]! * p.x + e[5]! * p.y + e[9]! * p.z + e[13]!;
  const z = e[2]! * p.x + e[6]! * p.y + e[10]! * p.z + e[14]!;
  return Object.freeze({ x, y, z });
};

const DEFAULT_LOCAL: Aabb = Object.freeze({
  min: Object.freeze({ x: -0.5, y: -0.5, z: -0.5 }),
  max: Object.freeze({ x: 0.5, y: 0.5, z: 0.5 })
});

/**
 * Builds world-space AABB from local bounds + transform.
 * No geometry kernel — uses provided localBounds or a unit box.
 */
export class BoundsBuilder {
  public build(entity: DocumentEntityView): Aabb {
    const local = entity.localBounds ?? DEFAULT_LOCAL;
    const corners: Vec3[] = [
      { x: local.min.x, y: local.min.y, z: local.min.z },
      { x: local.max.x, y: local.min.y, z: local.min.z },
      { x: local.min.x, y: local.max.y, z: local.min.z },
      { x: local.max.x, y: local.max.y, z: local.min.z },
      { x: local.min.x, y: local.min.y, z: local.max.z },
      { x: local.max.x, y: local.min.y, z: local.max.z },
      { x: local.min.x, y: local.max.y, z: local.max.z },
      { x: local.max.x, y: local.max.y, z: local.max.z }
    ];
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const corner of corners) {
      const world = transformPoint(entity.transform, corner);
      minX = Math.min(minX, world.x);
      minY = Math.min(minY, world.y);
      minZ = Math.min(minZ, world.z);
      maxX = Math.max(maxX, world.x);
      maxY = Math.max(maxY, world.y);
      maxZ = Math.max(maxZ, world.z);
    }
    if (!Number.isFinite(minX)) {
      return emptyAabb();
    }
    return Object.freeze({
      min: Object.freeze({ x: minX, y: minY, z: minZ }),
      max: Object.freeze({ x: maxX, y: maxY, z: maxZ })
    });
  }

  public union(bounds: readonly Aabb[]): Aabb {
    if (bounds.length === 0) {
      return emptyAabb();
    }
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const box of bounds) {
      minX = Math.min(minX, box.min.x);
      minY = Math.min(minY, box.min.y);
      minZ = Math.min(minZ, box.min.z);
      maxX = Math.max(maxX, box.max.x);
      maxY = Math.max(maxY, box.max.y);
      maxZ = Math.max(maxZ, box.max.z);
    }
    return Object.freeze({
      min: Object.freeze({ x: minX, y: minY, z: minZ }),
      max: Object.freeze({ x: maxX, y: maxY, z: maxZ })
    });
  }
}
