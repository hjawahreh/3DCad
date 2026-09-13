/**
 * Face sampling / chunking for large meshes — preserves Model Input → Source Face mapping.
 * Never mutates the authoritative clinical mesh.
 */

import type { PreprocessResult } from './SegmentationPreprocess.js';

export interface SampledFaceChunk {
  readonly chunkIndex: number;
  /** Indices into preprocess face arrays (source face indices). */
  readonly sourceFaceIndices: readonly number[];
  readonly centroids: Float32Array;
  readonly normals: Float32Array;
}

export interface LargeMeshSamplePlan {
  readonly faceCount: number;
  readonly maxFacesPerChunk: number;
  readonly sampleStride: number;
  readonly sampledFaceIndices: readonly number[];
  readonly chunks: readonly SampledFaceChunk[];
  readonly mappingPreserved: true;
}

/**
 * Build a deterministic subsample + spatial chunk plan for NN-sized inputs.
 * Stride sampling keeps spatial coverage; chunks group contiguous sampled faces.
 */
export const planLargeMeshSampling = (
  preprocess: PreprocessResult,
  options?: {
    readonly maxSampleFaces?: number;
    readonly maxFacesPerChunk?: number;
  }
): LargeMeshSamplePlan => {
  const faceCount = preprocess.faceCount;
  const maxSample = Math.max(1, options?.maxSampleFaces ?? 16_000);
  const maxPerChunk = Math.max(1, options?.maxFacesPerChunk ?? 4_096);
  const sampleStride = Math.max(1, Math.ceil(faceCount / maxSample));
  const sampledFaceIndices: number[] = [];
  for (let f = 0; f < faceCount; f += sampleStride) {
    sampledFaceIndices.push(f);
  }
  const chunks: SampledFaceChunk[] = [];
  for (let start = 0; start < sampledFaceIndices.length; start += maxPerChunk) {
    const slice = sampledFaceIndices.slice(start, start + maxPerChunk);
    const centroids = new Float32Array(slice.length * 3);
    const normals = new Float32Array(slice.length * 3);
    for (let i = 0; i < slice.length; i += 1) {
      const f = slice[i]!;
      centroids[i * 3] = preprocess.faceCentroids[f * 3]!;
      centroids[i * 3 + 1] = preprocess.faceCentroids[f * 3 + 1]!;
      centroids[i * 3 + 2] = preprocess.faceCentroids[f * 3 + 2]!;
      normals[i * 3] = preprocess.faceNormals[f * 3]!;
      normals[i * 3 + 1] = preprocess.faceNormals[f * 3 + 1]!;
      normals[i * 3 + 2] = preprocess.faceNormals[f * 3 + 2]!;
    }
    chunks.push(
      Object.freeze({
        chunkIndex: chunks.length,
        sourceFaceIndices: Object.freeze(slice),
        centroids,
        normals
      })
    );
  }
  return Object.freeze({
    faceCount,
    maxFacesPerChunk: maxPerChunk,
    sampleStride,
    sampledFaceIndices: Object.freeze(sampledFaceIndices),
    chunks: Object.freeze(chunks),
    mappingPreserved: true as const
  });
};
