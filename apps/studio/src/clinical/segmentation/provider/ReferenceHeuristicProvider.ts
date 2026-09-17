/**
 * Deterministic REFERENCE HEURISTIC segmentation provider (development / engineering).
 *
 * Geometry-heuristic inference — NOT a research NN and NOT clinically accurate.
 * Available only as Reference / Development. Never present as Production Segmentation.
 *
 * See docs/architecture/segmentation-model-decision.md and CLN-SEG-001.
 */

import type { TriangleMesh } from '../../../geometry-kernel/mesh/TriangleMesh.js';
import { SegmentationError } from '../errors.js';
import {
  POSTPROCESSING_VERSION,
  IDENTIFICATION_VERSION,
  PREPROCESSING_VERSION,
  MAX_CLINICAL_TOOTH_INSTANCES,
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
import { planLargeMeshSampling } from '../preprocess/LargeMeshSampling.js';
import { refineBoundaries } from '../postprocess/BoundaryRefinement.js';
import { separateToothInstances } from '../postprocess/InstanceSeparation.js';
import { identifyToothInstances } from '../identify/ToothIdentification.js';
import type {
  SegmentationInferRequest,
  SegmentationProvider,
  SegmentationProviderCapability,
  SegmentationProviderInfo,
  SegmentationProviderRuntimeInfo
} from './SegmentationProvider.js';
import { detectInferenceRuntime } from './adapters/InferenceCapabilityDetector.js';

const yieldTick = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

export class ReferenceHeuristicProvider implements SegmentationProvider {
  public readonly info: SegmentationProviderInfo = Object.freeze({
    id: 'reference-heuristic',
    displayName: 'REFERENCE HEURISTIC (Development)',
    modelId: 'clinical-reference-seg',
    modelVersion: '1.1.0',
    operational: true,
    licenseNotes:
      'First-party reference / development geometry heuristic — NOT a production clinical model and NOT clinically accurate',
    capabilities: Object.freeze([
      'semantic',
      'instance',
      'identification',
      'cpu',
      'cancel'
    ] as SegmentationProviderCapability[])
  });

  private cancelled = false;
  private runtime: SegmentationProviderRuntimeInfo = Object.freeze({
    preferredExecutionProvider: 'cpu',
    availableExecutionProviders: Object.freeze(['cpu'] as const),
    message: 'Not initialized',
    gpuAvailable: false,
    cpuFallback: true
  });

  public async initialize(): Promise<void> {
    this.cancelled = false;
    const snap = await detectInferenceRuntime({ probeOnnx: false });
    this.runtime = Object.freeze({
      preferredExecutionProvider: 'cpu',
      availableExecutionProviders: snap.available,
      message: `Reference geometry inference · CPU · detected preferred EP ${snap.preferred}` +
        (snap.webgpu ? ' (GPU present but unused — provider is CPU-only)' : ' · CPU fallback'),
      gpuAvailable: snap.webgpu,
      cpuFallback: true
    });
  }

  public capabilities(): readonly SegmentationProviderCapability[] {
    return this.info.capabilities;
  }

  public modelInformation(): SegmentationProviderInfo {
    return this.info;
  }

  public runtimeInformation(): SegmentationProviderRuntimeInfo {
    return this.runtime;
  }

  public validateInput(mesh: TriangleMesh): { readonly ok: boolean; readonly message?: string } {
    const faces = Math.floor(mesh.indices.length / 3);
    if (faces === 0) {
      return { ok: false, message: 'Empty mesh' };
    }
    return { ok: true };
  }

  public async preprocess(mesh: TriangleMesh, signal: AbortSignal): Promise<PreprocessResult> {
    const result = await preprocessSegmentationMesh(mesh, { signal });
    // Large-mesh plan keeps Model Input → Source Face mapping ready without mutating source.
    void planLargeMeshSampling(result);
    return result;
  }

  public async postprocess(prediction: SegmentationPrediction): Promise<SegmentationPrediction> {
    return prediction;
  }

  public async infer(request: SegmentationInferRequest): Promise<SegmentationPrediction> {
    const started = performance.now();
    const throwIfCancelled = (): void => {
      if (request.signal.aborted || this.cancelled) {
        throw new SegmentationError('CANCELLED', 'Inference cancelled');
      }
    };

    throwIfCancelled();
    request.report({ completed: 0, total: 7, message: 'Preparing scan…' });
    await yieldTick();
    throwIfCancelled();

    request.report({ completed: 1, total: 7, message: 'Loading segmentation model…' });
    await yieldTick();
    // Geometry provider has no NN weights to load — stage retained for truthful UX parity.
    throwIfCancelled();

    const preprocess = request.preprocess;
    request.report({ completed: 2, total: 7, message: 'Analyzing dental surface…' });
    await yieldTick();
    throwIfCancelled();

    const faceCount = preprocess.faceCount;

    // Prefer superior axis with larger AABB span (clinical Y-up after orientation; Z-up fixtures).
    const aabb = preprocess.aabb;
    const ySpanAbs = Math.abs(aabb.max[1] - aabb.min[1]);
    const zSpanAbs = Math.abs(aabb.max[2] - aabb.min[2]);
    const heightAxis: 1 | 2 = ySpanAbs >= zSpanAbs ? 1 : 2;
    const arch =
      request.archRole === 'lower' || request.archRole === 'upper'
        ? request.archRole
        : 'upper';

    let hMin = Infinity;
    let hMax = -Infinity;
    for (let f = 0; f < faceCount; f += 1) {
      const h = preprocess.faceCentroids[f * 3 + heightAxis]!;
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
    const hSpan = Math.max(1e-6, hMax - hMin);

    const labelWithInvert = (invertHeight: boolean): FaceSemanticPrediction[] => {
      const labels: FaceSemanticPrediction[] = [];
      for (let f = 0; f < faceCount; f += 1) {
        const h = preprocess.faceCentroids[f * 3 + heightAxis]!;
        let hNorm = (h - hMin) / hSpan;
        if (invertHeight) hNorm = 1 - hNorm;
        const nh = preprocess.faceNormals[f * 3 + heightAxis]!;
        let label: FaceSemanticPrediction['label'] = 'TOOTH';
        let confidence = 0.72;
        if (hNorm < 0.32) {
          label = 'GINGIVA';
          confidence = 0.7 + Math.min(0.25, (0.32 - hNorm) * 0.6);
        } else if (hNorm > 0.96 && Math.abs(nh) < 0.12) {
          label = 'UNKNOWN';
          confidence = 0.35;
        } else {
          confidence = 0.65 + Math.min(0.3, (hNorm - 0.32) * 0.5);
        }
        labels.push({
          faceIndex: f,
          label,
          confidence: Math.max(0.05, Math.min(0.99, confidence))
        });
      }
      return labels;
    };

    const countTooth = (labels: readonly FaceSemanticPrediction[]): number => {
      let n = 0;
      for (const fl of labels) if (fl.label === 'TOOTH') n += 1;
      return n;
    };

    // Pick the superior-axis polarity that yields a clinically plausible tooth surface area.
    // Lower arches often need the opposite polarity after orientation bake.
    const preferredInvert = arch === 'lower';
    const primary = labelWithInvert(preferredInvert);
    const alternate = labelWithInvert(!preferredInvert);
    const primaryTooth = countTooth(primary);
    const alternateTooth = countTooth(alternate);
    // Always prefer the polarity with more TOOTH surface (lower arches often invert).
    let faceLabels = alternateTooth > primaryTooth ? alternate : primary;
    if (primaryTooth === 0 && alternateTooth === 0) {
      // Last resort: treat the upper half of the taller polarity as tooth.
      faceLabels = labelWithInvert(false).map((fl) => {
        const h = preprocess.faceCentroids[fl.faceIndex * 3 + heightAxis]!;
        const hNorm = (h - hMin) / hSpan;
        if (hNorm >= 0.4) {
          return { ...fl, label: 'TOOTH' as const, confidence: 0.7 };
        }
        return { ...fl, label: 'GINGIVA' as const, confidence: 0.7 };
      });
    }

    for (let f = 0; f < faceCount; f += 8192) {
      await yieldTick();
      throwIfCancelled();
    }

    request.report({ completed: 3, total: 7, message: 'Separating teeth…' });
    await yieldTick();
    throwIfCancelled();
    const separated = separateToothInstances({
      faceLabels,
      faceCentroids: preprocess.faceCentroids,
      mesh: request.mesh
    });

    request.report({ completed: 4, total: 7, message: 'Identifying teeth…' });
    await yieldTick();
    throwIfCancelled();

    request.report({ completed: 5, total: 7, message: 'Refining boundaries…' });
    await yieldTick();
    throwIfCancelled();
    const refinedFaces = refineBoundaries({
      faceLabels,
      faceNormals: preprocess.faceNormals,
      faceCentroids: preprocess.faceCentroids,
      adjacency: separated.allFaceAdjacency
    });

    const identified = identifyToothInstances({
      instances: separated.instances,
      faceLabels: refinedFaces,
      arch,
      threshold: request.identificationThreshold,
      expectedSlots: 14
    });

    request.report({ completed: 6, total: 7, message: 'Checking results…' });
    await yieldTick();
    throwIfCancelled();

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
    request.report({ completed: 7, total: 7, message: 'Ready for review' });

    const capWarnings = separated.capped
      ? [
          `Instance cap ${String(MAX_CLINICAL_TOOTH_INSTANCES)} applied (raw groups ${String(separated.rawGroupCount)}) — over-fragmentation collapsed; confidence reduced on merged residual`
        ]
      : [];

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
        'Reference geometry inference — decision support; not a licensed research NN; not clinical-grade tooth identity',
        `Runtime: CPU · arch=${arch} · heightAxis=${heightAxis === 1 ? 'Y' : 'Z'}`,
        ...capWarnings,
        ...identified.warnings
      ]),
      metrics: Object.freeze({
        faceCount,
        instanceCount: identified.instances.length,
        rawGroupCount: separated.rawGroupCount,
        instanceCapped: separated.capped ? 1 : 0,
        neighborLinked: identified.instances.filter((i) => i.neighbors !== undefined).length,
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
