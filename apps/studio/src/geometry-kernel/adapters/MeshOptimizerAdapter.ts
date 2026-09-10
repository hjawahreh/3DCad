/**
 * Optional meshoptimizer adapter.
 *
 * meshoptimizer was evaluated for display-oriented vertex-cache / fetch
 * optimization. No npm dependency is required for CLN-008 — this adapter is a
 * no-op that falls back to prepareDisplayMesh when the package is absent.
 */

import { createMesh, fingerprintMesh, type TriangleMesh } from '../mesh/TriangleMesh.js';
import {
  prepareDisplayMesh,
  type DisplayMeshOptions,
  type DisplayMeshResult
} from '../ops/displayMesh.js';

export interface MeshOptimizerLike {
  optimizeVertexCache?: (indices: Uint32Array, vertexCount: number) => Uint32Array;
}

let cachedModule: MeshOptimizerLike | null | undefined;

const tryLoadMeshoptimizer = (): MeshOptimizerLike | null => {
  if (cachedModule !== undefined) {
    return cachedModule;
  }
  cachedModule = null;
  return cachedModule;
};

/** Test/injection hook — production leaves package unloaded. */
export const injectMeshoptimizerForTests = (mod: MeshOptimizerLike | null): void => {
  cachedModule = mod;
};

export const prepareWithMeshoptimizer = (
  input: TriangleMesh,
  options?: DisplayMeshOptions
): DisplayMeshResult => {
  const mod = tryLoadMeshoptimizer();
  const base = prepareDisplayMesh(input, { ...options, optimizeIndices: false });
  if (mod?.optimizeVertexCache === undefined) {
    return {
      mesh: base.mesh,
      mergedVertices: base.mergedVertices,
      warnings: [
        ...base.warnings,
        'meshoptimizer package not present — using reference display prep'
      ]
    };
  }
  const optimized = mod.optimizeVertexCache(
    base.mesh.indices,
    Math.floor(base.mesh.positions.length / 3)
  );
  return {
    mesh: createMesh({
      id: base.mesh.id,
      objectId: base.mesh.objectId,
      role: 'display',
      revision: base.mesh.revision,
      positions: base.mesh.positions,
      indices: optimized,
      fingerprint: fingerprintMesh(base.mesh.positions, optimized)
    }),
    mergedVertices: base.mergedVertices,
    warnings: [...base.warnings, 'meshoptimizer vertex-cache optimize applied (display only)']
  };
};

export class MeshOptimizerAdapter {
  public readonly name = 'meshoptimizer-optional';

  public prepareDisplay(mesh: TriangleMesh, options?: DisplayMeshOptions): DisplayMeshResult {
    return prepareWithMeshoptimizer(mesh, options);
  }
}
