/**
 * Instance separation — connected components + arch-axis clustering.
 * Does not assume one component = one tooth (crowding-aware split).
 */

import type { TriangleMesh } from '../../../geometry-kernel/mesh/TriangleMesh.js';
import {
  MAX_CLINICAL_TOOTH_INSTANCES,
  type FaceSemanticPrediction,
  type ToothInstancePrediction,
  type ToothPresence
} from '../prediction/types.js';

export { MAX_CLINICAL_TOOTH_INSTANCES };

export interface SeparationResult {
  readonly instances: readonly Omit<ToothInstancePrediction, 'identification' | 'neighbors'>[];
  /** Tooth-face adjacency (for diagnostics). */
  readonly faceAdjacency: ReadonlyMap<number, readonly number[]>;
  /** All-face edge adjacency (for boundary refine including gingiva↔tooth). */
  readonly allFaceAdjacency: ReadonlyMap<number, readonly number[]>;
  readonly rawGroupCount: number;
  readonly capped: boolean;
  readonly timingMs: number;
}

const edgeKey = (a: number, b: number): number => {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return lo * 0x4000000 + hi;
};

/** Build edge-shared face adjacency for every mesh face. */
export const buildFaceEdgeAdjacency = (
  mesh: TriangleMesh
): Map<number, number[]> => {
  const faceCount = Math.floor(mesh.indices.length / 3);
  const edgeToFaces = new Map<number, number[]>();
  for (let f = 0; f < faceCount; f += 1) {
    const i0 = mesh.indices[f * 3] ?? 0;
    const i1 = mesh.indices[f * 3 + 1] ?? 0;
    const i2 = mesh.indices[f * 3 + 2] ?? 0;
    for (const [a, b] of [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ] as const) {
      const key = edgeKey(a, b);
      const list = edgeToFaces.get(key);
      if (list === undefined) {
        edgeToFaces.set(key, [f]);
      } else {
        list.push(f);
      }
    }
  }
  const adj = new Map<number, number[]>();
  const addAdj = (a: number, b: number): void => {
    if (a === b) return;
    const la = adj.get(a);
    if (la === undefined) {
      adj.set(a, [b]);
      return;
    }
    if (!la.includes(b)) la.push(b);
  };
  for (const faces of edgeToFaces.values()) {
    if (faces.length === 2) {
      const a = faces[0];
      const b = faces[1];
      if (a === undefined || b === undefined) continue;
      addAdj(a, b);
      addAdj(b, a);
    }
  }
  return adj;
};

export const separateToothInstances = (input: {
  readonly faceLabels: readonly FaceSemanticPrediction[];
  readonly faceCentroids: Float32Array;
  readonly mesh: TriangleMesh;
}): SeparationResult => {
  const started = performance.now();
  const toothFaces: number[] = [];
  for (const fl of input.faceLabels) {
    if (fl.label === 'TOOTH') toothFaces.push(fl.faceIndex);
  }

  const allFaceAdjacency = buildFaceEdgeAdjacency(input.mesh);

  // Tooth-only adjacency = filter of all-face adj.
  const adj = new Map<number, number[]>();
  const toothSet = new Set(toothFaces);
  for (const f of toothFaces) {
    const neighbors = allFaceAdjacency.get(f) ?? [];
    const toothNeighbors: number[] = [];
    for (const n of neighbors) {
      if (toothSet.has(n)) toothNeighbors.push(n);
    }
    if (toothNeighbors.length > 0) adj.set(f, toothNeighbors);
  }

  const visited = new Set<number>();
  const components: number[][] = [];
  for (const start of toothFaces) {
    if (visited.has(start)) continue;
    const stack = [start];
    const comp: number[] = [];
    visited.add(start);
    while (stack.length > 0) {
      const f = stack.pop();
      if (f === undefined) break;
      comp.push(f);
      for (const n of adj.get(f) ?? []) {
        if (!visited.has(n)) {
          visited.add(n);
          stack.push(n);
        }
      }
    }
    components.push(comp);
  }

  const splitCrowding = (faces: number[]): number[][] => {
    if (faces.length < 24) return [faces];
    const sorted = [...faces].sort(
      (a, b) =>
        (input.faceCentroids[a * 3] ?? 0) - (input.faceCentroids[b * 3] ?? 0)
    );
    const xs = sorted.map((f) => input.faceCentroids[f * 3] ?? 0);
    const gaps: { index: number; gap: number }[] = [];
    for (let i = 1; i < xs.length; i += 1) {
      gaps.push({ index: i, gap: (xs[i] ?? 0) - (xs[i - 1] ?? 0) });
    }
    gaps.sort((a, b) => b.gap - a.gap);
    const cutCount = Math.min(6, Math.max(0, Math.floor(faces.length / 40) - 1));
    if (cutCount <= 0 || gaps.length === 0) return [faces];
    const cuts = gaps
      .slice(0, cutCount)
      .map((g) => g.index)
      .sort((a, b) => a - b);
    const parts: number[][] = [];
    let start = 0;
    for (const cut of cuts) {
      if (cut - start >= 4) {
        parts.push(sorted.slice(start, cut));
        start = cut;
      }
    }
    if (sorted.length - start >= 4) parts.push(sorted.slice(start));
    return parts.length > 0 ? parts : [faces];
  };

  const rawGroups: number[][] = [];
  for (const comp of components) {
    if (comp.length < 1) continue;
    rawGroups.push(...splitCrowding(comp));
  }

  const rawGroupCount = rawGroups.length;
  let capped = false;
  if (rawGroups.length > MAX_CLINICAL_TOOTH_INSTANCES) {
    capped = true;
    rawGroups.sort((a, b) => b.length - a.length);
    const kept = rawGroups.slice(0, MAX_CLINICAL_TOOTH_INSTANCES - 1);
    const merged = rawGroups.slice(MAX_CLINICAL_TOOTH_INSTANCES - 1).flat();
    if (merged.length > 0) kept.push(merged);
    rawGroups.length = 0;
    rawGroups.push(...kept);
  }

  const instances: SeparationResult['instances'][number][] = [];
  let serial = 1;
  for (let g = 0; g < rawGroups.length; g += 1) {
    const faces = rawGroups[g];
    if (faces === undefined || faces.length === 0) continue;
    const isMergedTail = capped && g === rawGroups.length - 1;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    const verts = new Set<number>();
    let confSum = 0;
    for (const f of faces) {
      const x = input.faceCentroids[f * 3] ?? 0;
      const y = input.faceCentroids[f * 3 + 1] ?? 0;
      const z = input.faceCentroids[f * 3 + 2] ?? 0;
      cx += x;
      cy += y;
      cz += z;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
      verts.add(meshIndex(input.mesh, f, 0));
      verts.add(meshIndex(input.mesh, f, 1));
      verts.add(meshIndex(input.mesh, f, 2));
      confSum += input.faceLabels[f]?.confidence ?? 0.5;
    }
    const n = faces.length;
    let conf = confSum / n;
    if (isMergedTail) {
      conf = Math.min(conf, 0.35);
    }
    const presence: ToothPresence =
      n < 6 || isMergedTail ? 'UNCERTAIN' : 'PRESENT';
    instances.push({
      instanceId: `inst-${String(serial++).padStart(3, '0')}`,
      faceIndices: Object.freeze([...faces].sort((a, b) => a - b)),
      vertexIndices: Object.freeze([...verts].sort((a, b) => a - b)),
      confidence: Math.max(0.05, Math.min(0.99, conf)),
      centroid: Object.freeze([cx / n, cy / n, cz / n] as const),
      bounds: Object.freeze({
        min: Object.freeze([minX, minY, minZ] as const),
        max: Object.freeze([maxX, maxY, maxZ] as const)
      }),
      faceCount: n,
      presence
    });
  }

  // Sort along arch (X), then reassign stable position-ordered IDs.
  instances.sort((a, b) => a.centroid[0] - b.centroid[0]);
  for (let i = 0; i < instances.length; i += 1) {
    const inst = instances[i];
    if (inst === undefined) continue;
    instances[i] = {
      ...inst,
      instanceId: `inst-${String(i + 1).padStart(3, '0')}`
    };
  }

  return {
    instances: Object.freeze(instances),
    faceAdjacency: adj,
    allFaceAdjacency,
    rawGroupCount,
    capped,
    timingMs: performance.now() - started
  };
};

const meshIndex = (mesh: TriangleMesh, face: number, corner: 0 | 1 | 2): number =>
  mesh.indices[face * 3 + corner] ?? 0;
