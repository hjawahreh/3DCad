/**
 * Instance separation — connected components + arch-axis clustering.
 * Does not assume one component = one tooth (crowding-aware split).
 */

import type { TriangleMesh } from '../../../geometry-kernel/mesh/TriangleMesh.js';
import type {
  FaceSemanticPrediction,
  ToothInstancePrediction,
  ToothPresence
} from '../prediction/types.js';

export interface SeparationResult {
  readonly instances: readonly Omit<ToothInstancePrediction, 'identification'>[];
  readonly faceAdjacency: ReadonlyMap<number, readonly number[]>;
  readonly timingMs: number;
}

const edgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

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

  // Build adjacency among tooth faces sharing an edge.
  const edgeToFaces = new Map<string, number[]>();
  for (const f of toothFaces) {
    const i0 = input.mesh.indices[f * 3]!;
    const i1 = input.mesh.indices[f * 3 + 1]!;
    const i2 = input.mesh.indices[f * 3 + 2]!;
    for (const [a, b] of [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ] as const) {
      const key = edgeKey(a, b);
      const list = edgeToFaces.get(key) ?? [];
      list.push(f);
      edgeToFaces.set(key, list);
    }
  }
  const adj = new Map<number, number[]>();
  const addAdj = (a: number, b: number): void => {
    if (a === b) return;
    const la = adj.get(a) ?? [];
    if (!la.includes(b)) la.push(b);
    adj.set(a, la);
  };
  for (const faces of edgeToFaces.values()) {
    if (faces.length === 2) {
      addAdj(faces[0]!, faces[1]!);
      addAdj(faces[1]!, faces[0]!);
    }
  }

  // Connected components
  const visited = new Set<number>();
  const components: number[][] = [];
  for (const start of toothFaces) {
    if (visited.has(start)) continue;
    const stack = [start];
    const comp: number[] = [];
    visited.add(start);
    while (stack.length > 0) {
      const f = stack.pop()!;
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

  // Crowding: split large components along X into clusters by centroid gaps.
  const splitCrowding = (faces: number[]): number[][] => {
    if (faces.length < 24) return [faces];
    const sorted = [...faces].sort(
      (a, b) => input.faceCentroids[a * 3]! - input.faceCentroids[b * 3]!
    );
    const xs = sorted.map((f) => input.faceCentroids[f * 3]!);
    const gaps: { index: number; gap: number }[] = [];
    for (let i = 1; i < xs.length; i += 1) {
      gaps.push({ index: i, gap: xs[i]! - xs[i - 1]! });
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
    rawGroups.push(...splitCrowding(comp));
  }

  const instances: SeparationResult['instances'][number][] = [];
  let serial = 1;
  for (const faces of rawGroups) {
    if (faces.length === 0) continue;
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
    for (const f of faces) {
      const x = input.faceCentroids[f * 3]!;
      const y = input.faceCentroids[f * 3 + 1]!;
      const z = input.faceCentroids[f * 3 + 2]!;
      cx += x;
      cy += y;
      cz += z;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
      verts.add(input.mesh.indices[f * 3]!);
      verts.add(input.mesh.indices[f * 3 + 1]!);
      verts.add(input.mesh.indices[f * 3 + 2]!);
    }
    const n = faces.length;
    const conf =
      faces.reduce((s, f) => {
        const fl = input.faceLabels.find((l) => l.faceIndex === f);
        return s + (fl?.confidence ?? 0.5);
      }, 0) / n;
    const presence: ToothPresence = n < 6 ? 'UNCERTAIN' : 'PRESENT';
    instances.push(
      Object.freeze({
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
      })
    );
  }

  // Sort instances along arch (X)
  instances.sort((a, b) => a.centroid[0] - b.centroid[0]);

  return {
    instances: Object.freeze(instances),
    faceAdjacency: adj,
    timingMs: performance.now() - started
  };
};
