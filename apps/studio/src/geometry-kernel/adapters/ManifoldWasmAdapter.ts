/**
 * Manifold WASM adapter (PROD-001R).
 *
 * Solid-manifold operations only. Open / non-manifold dental scans are rejected
 * without silent repair. Clinical layer must not import manifold-3d types.
 */

import { GeometryKernelError } from '../errors.js';
import type { GeometryBackend } from './GeometryBackend.js';
import type { TriangleMesh } from '../mesh/TriangleMesh.js';
import {
  runGeometryQualityPipeline,
  type GeometryQualityReport
} from '../quality/GeometryQualityPipeline.js';
import { buildSpatialIndex, type SpatialIndex } from '../spatial/SpatialIndex.js';
import type { TrimMeshOptions, TrimMeshResult } from '../ops/trimMesh.js';
import type { CloseBaseOptions, CloseBaseResult } from '../ops/closeBaseMesh.js';
import type { DisplayMeshOptions, DisplayMeshResult } from '../ops/displayMesh.js';
import { prepareDisplayMesh } from '../ops/displayMesh.js';

export type ManifoldModule = {
  setup: () => Promise<void> | void;
  Manifold: {
    new (mesh: unknown): {
      status: () => { value?: number; name?: string } | number | string;
      isEmpty: () => boolean;
      numTri: () => number;
      numVert: () => number;
      trimByPlane: (normal: readonly [number, number, number], offset: number) => unknown;
      toMesh: () => {
        vertProperties: Float32Array;
        triVerts: Uint32Array;
      };
    };
  };
  Mesh: new (args: {
    numProp?: number;
    vertProperties: Float32Array;
    triVerts: Uint32Array;
  }) => unknown;
};

let manifoldModule: ManifoldModule | null = null;

/** Test / composition injection — never called from React. */
export const injectManifoldModuleForTests = (mod: ManifoldModule | null): void => {
  manifoldModule = mod;
};

export const getManifoldModule = (): ManifoldModule | null => manifoldModule;

const statusOk = (status: unknown): boolean => {
  if (status === 0 || status === 'NoError') return true;
  if (status && typeof status === 'object') {
    const s = status as { value?: number; name?: string };
    if (s.value === 0) return true;
    if (typeof s.name === 'string' && /noerror/i.test(s.name)) return true;
  }
  if (typeof status === 'string' && /noerror/i.test(status)) return true;
  return false;
};

/**
 * Attempt to construct a Manifold solid from a TriangleMesh.
 * Returns null + reason when the mesh is not a suitable manifold solid.
 */
export const tryCreateManifoldSolid = (
  mesh: TriangleMesh
): { readonly ok: true; readonly solid: unknown } | { readonly ok: false; readonly reason: string } => {
  const mod = manifoldModule;
  if (!mod) {
    return { ok: false, reason: 'manifold-3d module not loaded' };
  }
  try {
    const numProp = 3;
    const manifoldMesh = new mod.Mesh({
      numProp,
      vertProperties: mesh.positions,
      triVerts: mesh.indices
    });
    const solid = new mod.Manifold(manifoldMesh);
    const st = typeof (solid as { status?: () => unknown }).status === 'function'
      ? (solid as { status: () => unknown }).status()
      : 'unknown';
    if (!statusOk(st) || (solid as { isEmpty: () => boolean }).isEmpty()) {
      return {
        ok: false,
        reason: `Manifold rejected mesh (status=${String(st)}, empty=${String(
          (solid as { isEmpty: () => boolean }).isEmpty()
        )}). Open dental scans require explicit solidification before Manifold ops.`
      };
    }
    return { ok: true, solid };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err)
    };
  }
};

/**
 * Adapter implementing GeometryBackend. Trim/closeBase on open scans throw
 * UNSUPPORTED_OPERATION — callers must not silently fall back inside this class.
 */
export class ManifoldWasmAdapter implements GeometryBackend {
  public readonly name = 'manifold-3d-wasm';

  public validate(mesh: TriangleMesh): GeometryQualityReport {
    return runGeometryQualityPipeline(mesh);
  }

  public buildSpatialIndex(mesh: TriangleMesh): SpatialIndex {
    return buildSpatialIndex(mesh);
  }

  public trim(_mesh: TriangleMesh, _options: TrimMeshOptions): TrimMeshResult {
    const probe = tryCreateManifoldSolid(_mesh);
    if (!probe.ok) {
      throw new GeometryKernelError(
        'UNSUPPORTED_OPERATION',
        `Manifold trim unavailable: ${probe.reason}`
      );
    }
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'Manifold TrimByPlane is plane-based; clinical polygon-boundary trim is not mapped. Use clinical-reference-v1 or VTK specialized clipping.'
    );
  }

  public closeBase(_mesh: TriangleMesh, _options: CloseBaseOptions): CloseBaseResult {
    const probe = tryCreateManifoldSolid(_mesh);
    if (!probe.ok) {
      throw new GeometryKernelError(
        'UNSUPPORTED_OPERATION',
        `Manifold close-base unavailable: ${probe.reason}`
      );
    }
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'Manifold has no clinical close-base strategy mapping yet (extrude/cap).'
    );
  }

  public prepareDisplay(mesh: TriangleMesh, options?: DisplayMeshOptions): DisplayMeshResult {
    return prepareDisplayMesh(mesh, options);
  }
}
