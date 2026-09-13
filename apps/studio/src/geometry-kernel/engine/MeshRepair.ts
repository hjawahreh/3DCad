/**
 * GEO-001 — safe deterministic mesh cleanup (no aggressive remesh).
 */

import { createMesh, fingerprintMesh, type TriangleMesh } from '../mesh/TriangleMesh.js';

const quantKey = (x: number, y: number, z: number, scale = 1e5): string =>
  `${Math.round(x * scale)}:${Math.round(y * scale)}:${Math.round(z * scale)}`;

export const repairMesh = (
  mesh: TriangleMesh,
  options?: { readonly mergeExactDuplicates?: boolean; readonly dropDegenerates?: boolean }
): TriangleMesh => {
  const merge = options?.mergeExactDuplicates !== false;
  const dropDegenerates = options?.dropDegenerates !== false;
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const map = new Int32Array(vertexCount).fill(-1);
  const positions: number[] = [];
  const keyToNew = new Map<string, number>();

  for (let v = 0; v < vertexCount; v += 1) {
    const x = mesh.positions[v * 3]!;
    const y = mesh.positions[v * 3 + 1]!;
    const z = mesh.positions[v * 3 + 2]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (!merge) {
      map[v] = positions.length / 3;
      positions.push(x, y, z);
      continue;
    }
    const key = quantKey(x, y, z);
    const existing = keyToNew.get(key);
    if (existing !== undefined) {
      map[v] = existing;
    } else {
      const ni = positions.length / 3;
      keyToNew.set(key, ni);
      map[v] = ni;
      positions.push(x, y, z);
    }
  }

  const indices: number[] = [];
  const triCount = Math.floor(mesh.indices.length / 3);
  for (let t = 0; t < triCount; t += 1) {
    const a = map[mesh.indices[t * 3]!]!;
    const b = map[mesh.indices[t * 3 + 1]!]!;
    const c = map[mesh.indices[t * 3 + 2]!]!;
    if (a < 0 || b < 0 || c < 0) continue;
    if (dropDegenerates && (a === b || b === c || a === c)) continue;
    const ax = positions[a * 3]!;
    const ay = positions[a * 3 + 1]!;
    const az = positions[a * 3 + 2]!;
    const bx = positions[b * 3]!;
    const by = positions[b * 3 + 1]!;
    const bz = positions[b * 3 + 2]!;
    const cx = positions[c * 3]!;
    const cy = positions[c * 3 + 1]!;
    const cz = positions[c * 3 + 2]!;
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (dropDegenerates && nx * nx + ny * ny + nz * nz < 1e-24) continue;
    indices.push(a, b, c);
  }

  const pos = new Float32Array(positions);
  const idx = new Uint32Array(indices);
  return createMesh({
    id: mesh.id,
    objectId: mesh.objectId,
    role: mesh.role,
    revision: mesh.revision,
    positions: pos,
    indices: idx,
    fingerprint: fingerprintMesh(pos, idx)
  });
};
