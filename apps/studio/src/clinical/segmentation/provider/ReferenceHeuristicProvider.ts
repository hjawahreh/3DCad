/**
 * Deterministic reference segmentation provider (CLN-009).
 * Geometry-heuristic inference for tests/benchmarks — NOT a research NN model.
 * Does not claim clinical production accuracy.
 */

import type { TriangleMesh } from '../../../geometry-kernel/mesh/TriangleMesh.js';
import { SegmentationError } from '../errors.js';
import {
  POSTPROCESSING_VERSION,
  IDENTIFICATION_VERSION,
  PREPROCESSING_VERSION,
  confidenceBand,
  type FaceSemanticPrediction,
  type SegmentationPrediction,
  type ToothInstancePrediction
} from '../prediction/types.js';
import {
  expectedFdiForArchSlot,
  type FdiNumber
} from '../fdi/FdiNumbering.js';
import {
  preprocessSegmentationMesh,
  type PreprocessResult
} from '../preprocess/SegmentationPreprocess.js';
import { refineBoundaries } from '../postprocess/BoundaryRefinement.js';
import { separateToothInstances } from '../postprocess/InstanceSeparation.js';
import { identifyToothInstances } from '../identify/ToothIdentification.js';
import type {
  SegmentationInferRequest,
  SegmentationProvider,
  SegmentationProviderCapability,
  SegmentationProviderInfo
} from './SegmentationProvider.js';

export class ReferenceHeuristicProvider implements SegmentationProvider {
  public readonly info: SegmentationProviderInfo = Object.freeze({
    id: 'reference-heuristic',
    displayName: 'Reference Heuristic (deterministic)',
    modelId: 'clinical-reference-seg',
    modelVersion: '1.0.0',
    operational: true,
    licenseNotes: 'First-party CAD Studio clinical reference — not a research NN weight set',
    capabilities: Object.freeze([
      'semantic',
      'instance',
      'identification',
      'cpu',
      'cancel'
    ] as SegmentationProviderCapability[])
  });

  private cancelled = false;

  public async initialize(): Promise<void> {
    this.cancelled = false;
  }

  public capabilities(): readonly SegmentationProviderCapability[] {
    return this.info.capabilities;
  }

  public validateInput(mesh: TriangleMesh): { readonly ok: boolean; readonly message?: string } {
    const faces = Math.floor(mesh.indices.length / 3);
    if (faces === 0) {
      return { ok: false, message: 'Empty mesh' };
    }
    return { ok: true };
  }

  public async preprocess(mesh: TriangleMesh, signal: AbortSignal): Promise<PreprocessResult> {
    return preprocessSegmentationMesh(mesh, { signal });
  }

  public async infer(request: SegmentationInferRequest): Promise<SegmentationPrediction> {
    const started = performance.now();
    if (request.signal.aborted || this.cancelled) {
      throw new SegmentationError('CANCELLED', 'Inference cancelled');
    }
    request.report({ completed: 0, total: 5, message: 'Preparing mesh…' });
    const preprocess = request.preprocess;
    request.report({ completed: 1, total: 5, message: 'Semantic classification…' });

  const faceCount = preprocess.faceCount;
  const faceLabels: FaceSemanticPrediction[] = [];
  // Classify by relative height within mesh Z-range (not full AABB diagonal scale).
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let f = 0; f < faceCount; f += 1) {
    const i0 = request.mesh.indices[f * 3]!;
    const i1 = request.mesh.indices[f * 3 + 1]!;
    const i2 = request.mesh.indices[f * 3 + 2]!;
    const z =
      (request.mesh.positions[i0 * 3 + 2]! +
        request.mesh.positions[i1 * 3 + 2]! +
        request.mesh.positions[i2 * 3 + 2]!) /
      3;
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const zSpan = Math.max(1e-6, zMax - zMin);

  for (let f = 0; f < faceCount; f += 1) {
    if (request.signal.aborted || this.cancelled) {
      throw new SegmentationError('CANCELLED', 'Inference cancelled');
    }
    const i0 = request.mesh.indices[f * 3]!;
    const i1 = request.mesh.indices[f * 3 + 1]!;
    const i2 = request.mesh.indices[f * 3 + 2]!;
    const z =
      (request.mesh.positions[i0 * 3 + 2]! +
        request.mesh.positions[i1 * 3 + 2]! +
        request.mesh.positions[i2 * 3 + 2]!) /
      3;
    const zNorm = (z - zMin) / zSpan;
    const nz = preprocess.faceNormals[f * 3 + 2]!;
    let label: FaceSemanticPrediction['label'] = 'TOOTH';
    let confidence = 0.72;
    if (zNorm < 0.35) {
      label = 'GINGIVA';
      confidence = 0.7 + Math.min(0.25, (0.35 - zNorm) * 0.6);
    } else if (zNorm > 0.95 && Math.abs(nz) < 0.15) {
      label = 'UNKNOWN';
      confidence = 0.35;
    } else {
      confidence = 0.65 + Math.min(0.3, (zNorm - 0.35) * 0.5);
    }
    faceLabels.push(
      Object.freeze({
        faceIndex: f,
        label,
        confidence: Math.max(0.05, Math.min(0.99, confidence))
      })
    );
  }

    request.report({ completed: 2, total: 5, message: 'Instance separation…' });
    const separated = separateToothInstances({
      faceLabels,
      faceCentroids: preprocess.faceCentroids,
      mesh: request.mesh
    });

    request.report({ completed: 3, total: 5, message: 'Boundary refinement…' });
    const refinedFaces = refineBoundaries({
      faceLabels,
      faceNormals: preprocess.faceNormals,
      faceCentroids: preprocess.faceCentroids,
      adjacency: separated.faceAdjacency
    });

    request.report({ completed: 4, total: 5, message: 'Tooth identification…' });
    const identified = identifyToothInstances({
      instances: separated.instances,
      faceLabels: refinedFaces,
      arch: 'upper',
      threshold: request.identificationThreshold,
      expectedSlots: 14
    });

    const instanceMean =
      identified.instances.reduce((s, i) => s + i.confidence, 0) /
      Math.max(1, identified.instances.length);
    const faceMean =
      refinedFaces.reduce((s, f) => s + f.confidence, 0) / Math.max(1, refinedFaces.length);
    const idMean =
      identified.instances.reduce((s, i) => s + i.identification.confidence, 0) /
      Math.max(1, identified.instances.length);
    const needsReviewCount = identified.instances.filter(
      (i) =>
        i.identification.status === 'UNCERTAIN' ||
        i.identification.status === 'UNKNOWN' ||
        i.confidence < 0.5
    ).length;

    const timingMs = performance.now() - started;
    request.report({ completed: 5, total: 5, message: 'Ready for review' });

    return Object.freeze({
      predictionId: `pred-${request.objectId}-${String(request.sourceRevision)}-${String(Math.floor(started))}`,
      sourceObjectId: request.objectId,
      sourceRevision: request.sourceRevision,
      geometryFingerprint: request.geometryFingerprint,
      providerId: this.info.id,
      modelId: this.info.modelId,
      modelVersion: this.info.modelVersion,
      preprocessingVersion: PREPROCESSING_VERSION,
      postprocessingVersion: POSTPROCESSING_VERSION,
      identificationVersion: IDENTIFICATION_VERSION,
      createdAt: Date.now(),
      faceLabels: Object.freeze(refinedFaces),
      instances: Object.freeze(identified.instances) as readonly ToothInstancePrediction[],
      missingSlots: Object.freeze(identified.missingSlots),
      confidence: Object.freeze({
        faceMean,
        instanceMean,
        identificationMean: idMean,
        caseBand: confidenceBand((faceMean + instanceMean + idMean) / 3),
        needsReviewCount
      }),
      warnings: Object.freeze([
        ...preprocess.warnings,
        'Reference heuristic provider — decision support only; not clinically validated NN inference',
        ...identified.warnings
      ]),
      metrics: Object.freeze({
        faceCount,
        instanceCount: identified.instances.length,
        preprocessingMs: preprocess.timingMs,
        inferenceMs: timingMs,
        postprocessingMs: separated.timingMs,
        totalMs: preprocess.timingMs + timingMs
      })
    });
  }

  public cancel(): void {
    this.cancelled = true;
  }

  public dispose(): void {
    this.cancelled = true;
  }
}

/** Expose expected FDI helper for tests without importing identify module cycles. */
export const referenceExpectedFdi = (
  arch: 'upper' | 'lower',
  slot: number,
  count: number
): FdiNumber | undefined => expectedFdiForArchSlot(arch, slot, count);
