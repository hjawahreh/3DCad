/**
 * GEO-001 PHASE B — triangle adjacency / edge connectivity graph.
 * Cached by mesh fingerprint; invalidate when geometry changes.
 */

import type { TriangleMesh } from '../mesh/TriangleMesh.js';
import type { BoundaryLoopCandidate } from './types.js';

const undirectedEdgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

export interface TopologyEdge {
  readonly a: number;
  readonly b: number;
  readonly faceIds: readonly number[];
}

export interface TopologyGraph {
  readonly meshFingerprint: string;
  readonly faceCount: number;
  readonly vertexCount: number;
  readonly faceNeighbors: ReadonlyArray<readonly number[]>;
  readonly edgeToFaces: ReadonlyMap<string, readonly number[]>;
  readonly vertexToFaces: ReadonlyArray<readonly number[]>;
  readonly components: readonly number[]; // faceId → componentId
  readonly componentCount: number;
  readonly boundaryEdges: readonly TopologyEdge[];
  readonly nonManifoldEdges: readonly TopologyEdge[];
}

const topologyCache = new Map<string, TopologyGraph>();

export const invalidateTopologyCache = (fingerprint?: string): void => {
  if (fingerprint === undefined) topologyCache.clear();
  else topologyCache.delete(fingerprint);
};

export const buildTopology = (mesh: TriangleMesh): TopologyGraph => {
  const cached = topologyCache.get(mesh.fingerprint);
  if (cached !== undefined) return cached;

  const vertexCount = Math.floor(mesh.positions.length / 3);
  const faceCount = Math.floor(mesh.indices.length / 3);
  const faceNeighbors: number[][] = Array.from({ length: faceCount }, () => []);
  const edgeToFaces = new Map<string, number[]>();
  const vertexToFaces: number[][] = Array.from({ length: vertexCount }, () => []);

  for (let t = 0; t < faceCount; t += 1) {
    const i0 = mesh.indices[t * 3]!;
    const i1 = mesh.indices[t * 3 + 1]!;
    const i2 = mesh.indices[t * 3 + 2]!;
    for (const vi of [i0, i1, i2]) {
      if (vi >= 0 && vi < vertexCount) vertexToFaces[vi]!.push(t);
    }
    for (const [a, b] of [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ] as const) {
      const key = undirectedEdgeKey(a, b);
      const list = edgeToFaces.get(key);
      if (list === undefined) edgeToFaces.set(key, [t]);
      else list.push(t);
    }
  }

  const boundaryEdges: TopologyEdge[] = [];
  const nonManifoldEdges: TopologyEdge[] = [];
  for (const [key, faces] of edgeToFaces) {
    const [as, bs] = key.split(':');
    const a = Number(as);
    const b = Number(bs);
    const edge: TopologyEdge = { a, b, faceIds: faces };
    if (faces.length === 1) boundaryEdges.push(edge);
    else if (faces.length > 2) nonManifoldEdges.push(edge);
    else if (faces.length === 2) {
      const f0 = faces[0]!;
      const f1 = faces[1]!;
      faceNeighbors[f0]!.push(f1);
      faceNeighbors[f1]!.push(f0);
    }
  }

  const components = new Array<number>(faceCount).fill(-1);
  let componentCount = 0;
  for (let f = 0; f < faceCount; f += 1) {
    if (components[f] !== -1) continue;
    const id = componentCount++;
    const stack = [f];
    components[f] = id;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const n of faceNeighbors[cur] ?? []) {
        if (components[n] === -1) {
          components[n] = id;
          stack.push(n);
        }
      }
    }
  }

  const graph: TopologyGraph = {
    meshFingerprint: mesh.fingerprint,
    faceCount,
    vertexCount,
    faceNeighbors,
    edgeToFaces,
    vertexToFaces,
    components,
    componentCount,
    boundaryEdges,
    nonManifoldEdges
  };
  topologyCache.set(mesh.fingerprint, graph);
  return graph;
};

export const extractBoundaryLoops = (mesh: TriangleMesh): BoundaryLoopCandidate[] => {
  const topology = buildTopology(mesh);
  const adj = new Map<number, number[]>();
  for (const e of topology.boundaryEdges) {
    const la = adj.get(e.a) ?? [];
    la.push(e.b);
    adj.set(e.a, la);
    const lb = adj.get(e.b) ?? [];
    lb.push(e.a);
    adj.set(e.b, lb);
  }

  const visited = new Set<string>();
  const loops: number[][] = [];
  for (const [start, neighbors] of adj) {
    for (const n0 of neighbors) {
      const startKey = undirectedEdgeKey(start, n0);
      if (visited.has(startKey)) continue;
      const verts: number[] = [start];
      let prev = start;
      let cur = n0;
      visited.add(startKey);
      let guard = 0;
      while (cur !== start && guard < topology.boundaryEdges.length + 2) {
        verts.push(cur);
        const nexts = adj.get(cur) ?? [];
        let advanced = false;
        for (const nxt of nexts) {
          if (nxt === prev) continue;
          const k = undirectedEdgeKey(cur, nxt);
          if (visited.has(k) && nxt !== start) continue;
          visited.add(k);
          prev = cur;
          cur = nxt;
          advanced = true;
          break;
        }
        if (!advanced) break;
        guard += 1;
      }
      if (verts.length >= 3) loops.push(verts);
    }
  }

  const candidates: BoundaryLoopCandidate[] = loops.map((vertexIndices, id) => {
    let perimeter = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < vertexIndices.length; i += 1) {
      const a = vertexIndices[i]!;
      const b = vertexIndices[(i + 1) % vertexIndices.length]!;
      const ax = mesh.positions[a * 3]!;
      const ay = mesh.positions[a * 3 + 1]!;
      const az = mesh.positions[a * 3 + 2]!;
      const bx = mesh.positions[b * 3]!;
      const by = mesh.positions[b * 3 + 1]!;
      const bz = mesh.positions[b * 3 + 2]!;
      perimeter += Math.hypot(bx - ax, by - ay, bz - az);
      cx += ax;
      cy += ay;
      cz += az;
    }
    const n = vertexIndices.length;
    cx /= n;
    cy /= n;
    cz /= n;
    // Projected polygon area onto XY (diagnostic only — ranking uses size).
    let projectedArea = 0;
    for (let i = 0; i < n; i += 1) {
      const a = vertexIndices[i]!;
      const b = vertexIndices[(i + 1) % n]!;
      projectedArea +=
        mesh.positions[a * 3]! * mesh.positions[b * 3 + 1]! -
        mesh.positions[b * 3]! * mesh.positions[a * 3 + 1]!;
    }
    projectedArea = Math.abs(projectedArea) * 0.5;
    const reasons = [
      `perimeter=${perimeter.toFixed(3)}`,
      `projectedArea=${projectedArea.toFixed(3)}`,
      `verts=${String(n)}`
    ];
    const score = perimeter * 0.35 + projectedArea * 0.65;
    return {
      id,
      vertexIndices,
      perimeter,
      projectedArea,
      centroid: [cx, cy, cz],
      closed: true,
      score,
      reasons
    };
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
};

/** Face dual-graph Dijkstra for geodesic path reconstruction (face centers). */
export const shortestFacePath = (
  topology: TopologyGraph,
  mesh: TriangleMesh,
  startFace: number,
  endFace: number
): number[] | undefined => {
  if (startFace === endFace) return [startFace];
  if (
    startFace < 0 ||
    endFace < 0 ||
    startFace >= topology.faceCount ||
    endFace >= topology.faceCount
  ) {
    return undefined;
  }
  if (topology.components[startFace] !== topology.components[endFace]) {
    return undefined;
  }

  const dist = new Float64Array(topology.faceCount).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(topology.faceCount).fill(-1);
  dist[startFace] = 0;

  type HeapNode = { face: number; d: number };
  const heap: HeapNode[] = [{ face: startFace, d: 0 }];
  const less = (a: HeapNode, b: HeapNode): boolean =>
    a.d < b.d || (a.d === b.d && a.face < b.face);
  const siftUp = (i: number): void => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i]!, heap[p]!)) break;
      const tmp = heap[i]!;
      heap[i] = heap[p]!;
      heap[p] = tmp;
      i = p;
    }
  };
  const siftDown = (i: number): void => {
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let best = i;
      if (l < heap.length && less(heap[l]!, heap[best]!)) best = l;
      if (r < heap.length && less(heap[r]!, heap[best]!)) best = r;
      if (best === i) break;
      const tmp = heap[i]!;
      heap[i] = heap[best]!;
      heap[best] = tmp;
      i = best;
    }
  };
  const push = (node: HeapNode): void => {
    heap.push(node);
    siftUp(heap.length - 1);
  };
  const pop = (): HeapNode | undefined => {
    if (heap.length === 0) return undefined;
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      siftDown(0);
    }
    return top;
  };

  const centerOf = (face: number): [number, number, number] => {
    const i0 = mesh.indices[face * 3]!;
    const i1 = mesh.indices[face * 3 + 1]!;
    const i2 = mesh.indices[face * 3 + 2]!;
    return [
      (mesh.positions[i0 * 3]! + mesh.positions[i1 * 3]! + mesh.positions[i2 * 3]!) / 3,
      (mesh.positions[i0 * 3 + 1]! + mesh.positions[i1 * 3 + 1]! + mesh.positions[i2 * 3 + 1]!) / 3,
      (mesh.positions[i0 * 3 + 2]! + mesh.positions[i1 * 3 + 2]! + mesh.positions[i2 * 3 + 2]!) / 3
    ];
  };

  while (heap.length > 0) {
    const cur = pop()!;
    if (cur.d !== dist[cur.face]) continue;
    if (cur.face === endFace) break;
    const [ux, uy, uz] = centerOf(cur.face);
    for (const v of topology.faceNeighbors[cur.face] ?? []) {
      const [vx, vy, vz] = centerOf(v);
      const w = Math.hypot(vx - ux, vy - uy, vz - uz);
      const nd = cur.d + w;
      if (nd < dist[v]!) {
        dist[v] = nd;
        prev[v] = cur.face;
        push({ face: v, d: nd });
      }
    }
  }

  if (!Number.isFinite(dist[endFace]!)) return undefined;
  const path: number[] = [];
  let cur = endFace;
  while (cur !== -1) {
    path.push(cur);
    if (cur === startFace) break;
    cur = prev[cur]!;
  }
  path.reverse();
  return path[0] === startFace ? path : undefined;
};
