/**
 * GEO-002 — reusable boundary primitives (shared by Trim / Close Base).
 */

import type { TriangleMesh } from '../mesh/TriangleMesh.js';
import { extractBoundaryLoops } from '../engine/TopologyGraph.js';
import type { BoundaryLoopCandidate } from '../engine/types.js';
import { analyzeBoundaryLoop } from '../engine/ClinicalBaseConstruction.js';

export type { BoundaryLoopCandidate };

export const BoundaryOperations = {
  extractLoops(mesh: TriangleMesh): BoundaryLoopCandidate[] {
    return extractBoundaryLoops(mesh);
  },

  rankLoops(loops: readonly BoundaryLoopCandidate[]): BoundaryLoopCandidate[] {
    return [...loops].sort((a, b) => b.score - a.score || b.perimeter - a.perimeter);
  },

  validateLoop(mesh: TriangleMesh, loop: BoundaryLoopCandidate) {
    return analyzeBoundaryLoop(mesh, loop);
  },

  orientLoop(loop: BoundaryLoopCandidate): BoundaryLoopCandidate {
    // Preserve existing loop orientation — Close Base owns clinical orientation.
    return loop;
  },

  resampleLoop(loop: BoundaryLoopCandidate, maxSamples: number): BoundaryLoopCandidate {
    if (loop.vertexIndices.length <= maxSamples) return loop;
    const step = loop.vertexIndices.length / maxSamples;
    const vertexIndices: number[] = [];
    for (let i = 0; i < maxSamples; i += 1) {
      vertexIndices.push(
        loop.vertexIndices[Math.min(loop.vertexIndices.length - 1, Math.floor(i * step))]!
      );
    }
    return { ...loop, vertexIndices };
  },

  compareLoops(a: BoundaryLoopCandidate, b: BoundaryLoopCandidate): number {
    return Math.abs(a.perimeter - b.perimeter);
  }
} as const;
