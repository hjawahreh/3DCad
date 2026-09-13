/**
 * Async-capable geometry backend (PROD-001T).
 * Heavy VTK work must not run on the UI thread — prefer trimAsync/closeBaseAsync.
 */

import type { GeometryBackend } from './GeometryBackend.js';
import type { TriangleMesh } from '../mesh/TriangleMesh.js';
import type { TrimMeshOptions, TrimMeshResult } from '../ops/trimMesh.js';
import type { CloseBaseOptions, CloseBaseResult } from '../ops/closeBaseMesh.js';

export interface AsyncGeometryBackend extends GeometryBackend {
  trimAsync?(
    mesh: TriangleMesh,
    options: TrimMeshOptions,
    signal?: AbortSignal
  ): Promise<TrimMeshResult>;
  closeBaseAsync?(
    mesh: TriangleMesh,
    options: CloseBaseOptions,
    signal?: AbortSignal
  ): Promise<CloseBaseResult>;
}

export const runTrim = async (
  backend: GeometryBackend,
  mesh: TriangleMesh,
  options: TrimMeshOptions,
  signal?: AbortSignal
): Promise<TrimMeshResult> => {
  const asyncBackend = backend as AsyncGeometryBackend;
  if (typeof asyncBackend.trimAsync === 'function') {
    return asyncBackend.trimAsync(mesh, options, signal);
  }
  return backend.trim(mesh, options);
};

export const runCloseBase = async (
  backend: GeometryBackend,
  mesh: TriangleMesh,
  options: CloseBaseOptions,
  signal?: AbortSignal
): Promise<CloseBaseResult> => {
  const asyncBackend = backend as AsyncGeometryBackend;
  if (typeof asyncBackend.closeBaseAsync === 'function') {
    return asyncBackend.closeBaseAsync(mesh, options, signal);
  }
  return backend.closeBase(mesh, options);
};
