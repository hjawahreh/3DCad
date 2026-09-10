/**
 * Display-mesh preparation — never replaces authoritative clinical geometry.
 */

import {
  createMesh,
  fingerprintMesh,
  type TriangleMesh
} from '../mesh/TriangleMesh.js';

export interface DisplayMeshOptions {
  readonly quantizeScale?: number;
  readonly optimizeIndices?: boolean;
}

export interface DisplayMeshResult {
  readonly mesh: TriangleMesh;
  readonly warnings: readonly string[];
  readonly mergedVertices: number;
}

const quantizeKey = (x: number, y: number, z: number, scale: number): string =>
  `${Math.round(x * scale)}:${Math.round(y * scale)}:${Math.round(z * scale)}`;

export const prepareDisplayMesh = (
  clinical: TriangleMesh,
  options?: DisplayMeshOptions
): DisplayMeshResult => {
  const scale = options?.quantizeScale ?? 1e4;
  const map = new Map<string, number>();
  const positions: number[] = [];
  const remap = (oldIndex: number): number => {
    const x = clinical.positions[oldIndex * 3]!;
    const y = clinical.positions[oldIndex * 3 + 1]!;
    const z = clinical.positions[oldIndex * 3 + 2]!;
    const key = quantizeKey(x, y, z, scale);
    const existing = map.get(key);
    if (existing !== undefined) return existing;
    const next = map.size;
    map.set(key, next);
    positions.push(x, y, z);
    return next;
  };
  const triCount = Math.floor(clinical.indices.length / 3);
  const indices: number[] = [];
  for (let t = 0; t < triCount; t += 1) {
    const a = remap(clinical.indices[t * 3]!);
    const b = remap(clinical.indices[t * 3 + 1]!);
    const c = remap(clinical.indices[t * 3 + 2]!);
    if (a === b || b === c || a === c) continue;
    indices.push(a, b, c);
  }

  let finalIndices = indices;
  if (options?.optimizeIndices !== false && indices.length >= 6) {
    const order = Array.from({ length: Math.floor(indices.length / 3) }, (_, i) => i);
    order.sort((ta, tb) => indices[ta * 3]! - indices[tb * 3]!);
    const reordered: number[] = [];
    for (const t of order) {
      reordered.push(indices[t * 3]!, indices[t * 3 + 1]!, indices[t * 3 + 2]!);
    }
    finalIndices = reordered;
  }

  const pos = new Float32Array(positions);
  const idx = new Uint32Array(finalIndices);
  const originalVerts = Math.floor(clinical.positions.length / 3);
  const mesh = createMesh({
    id: clinical.id,
    objectId: clinical.objectId,
    role: 'display',
    revision: clinical.revision,
    positions: pos,
    indices: idx,
    fingerprint: fingerprintMesh(pos, idx, 'display:')
  });
  return {
    mesh,
    warnings: Object.freeze([
      'Display mesh is non-authoritative; clinical fidelity mesh unchanged'
    ]),
    mergedVertices: Math.max(0, originalVerts - Math.floor(pos.length / 3))
  };
};
