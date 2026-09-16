/**
 * GEO-002 — reusable surface-operation primitives (backend types hidden).
 */

import type { TriangleMesh } from '../mesh/TriangleMesh.js';
import {
  appendSurfacePath,
  closeSurfacePath,
  createSurfacePath,
  measureSurfacePath,
  thinSurfacePath,
  validateSurfacePath,
  type SurfacePath,
  type SurfacePathReconstructMode
} from '../engine/SurfacePath.js';
import {
  buildClinicalSpatialIndex,
  nearestSurfacePoint,
  projectPointToSurface,
  rayIntersectMesh
} from '../engine/SpatialAcceleration.js';

export const SurfaceOperations = {
  hitTest(
    mesh: TriangleMesh,
    origin: readonly [number, number, number],
    direction: readonly [number, number, number]
  ) {
    const spatial = buildClinicalSpatialIndex(mesh);
    return rayIntersectMesh(mesh, origin, direction, spatial);
  },

  nearestPoint(mesh: TriangleMesh, point: readonly [number, number, number], maxDistMm = 12) {
    const spatial = buildClinicalSpatialIndex(mesh);
    return nearestSurfacePoint(mesh, point, spatial, maxDistMm);
  },

  projectPoint(mesh: TriangleMesh, point: readonly [number, number, number], maxDistMm = 12) {
    const spatial = buildClinicalSpatialIndex(mesh);
    return projectPointToSurface(mesh, point, spatial, maxDistMm);
  },

  buildPath(
    mesh: TriangleMesh,
    seeds: readonly {
      readonly point: readonly [number, number, number];
      readonly faceId?: number;
    }[],
    options?: {
      readonly closed?: boolean;
      readonly reconstruct?: SurfacePathReconstructMode;
      readonly maxTotalSamples?: number;
    }
  ) {
    return createSurfacePath(mesh, seeds, options);
  },

  appendPath(
    mesh: TriangleMesh,
    path: SurfacePath,
    seed: { readonly point: readonly [number, number, number]; readonly faceId?: number },
    options?: { readonly reconstruct?: SurfacePathReconstructMode; readonly maxTotalSamples?: number }
  ) {
    return appendSurfacePath(mesh, path, seed, options);
  },

  validatePath(mesh: TriangleMesh, path: SurfacePath) {
    return validateSurfacePath(mesh, path);
  },

  closePath(mesh: TriangleMesh, path: SurfacePath) {
    return closeSurfacePath(mesh, path);
  },

  thinPath(path: SurfacePath, minSpacingMm = 1, maxSamples = 128) {
    return thinSurfacePath(path, minSpacingMm, maxSamples);
  },

  measurePath(path: SurfacePath) {
    return measureSurfacePath(path);
  }
} as const;
