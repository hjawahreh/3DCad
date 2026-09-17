/**
 * CLN-SEG-001 — ProductionModelProvider.
 *
 * Performs REAL inference via the isolated Python segmentation worker when a
 * checkpoint is configured. Otherwise remains explicitly unavailable.
 *
 * FORBIDDEN: fake NN output, heuristic substitution labeled as Production,
 * random / height-band / X-sort / hardcoded-32 teeth.
 */

import type { TriangleMesh } from '../../../geometry-kernel/mesh/TriangleMesh.js';
import { SegmentationError } from '../../segmentation/errors.js';
import {
  PREPROCESSING_VERSION,
  type SegmentationPrediction
} from '../../segmentation/prediction/types.js';
import {
  preprocessSegmentationMesh,
  type PreprocessResult
} from '../../segmentation/preprocess/SegmentationPreprocess.js';
import type {
  SegmentationInferRequest,
  SegmentationProvider,
  SegmentationProviderCapability,
  SegmentationProviderInfo,
  SegmentationProviderRuntimeInfo
} from '../../segmentation/provider/SegmentationProvider.js';
import {
  PRODUCTION_MODEL_NOT_CONFIGURED,
  resolveProductionModelGate,
  type ProductionModelReproducibilityRecord
} from '../../segmentation/runtime/ProductionModelGate.js';
import { SegmentationWorkerClient } from '../../segmentation/runtime/SegmentationWorkerClient.js';
import { mapWorkerResultToPrediction } from '../../segmentation/runtime/mapWorkerResultToPrediction.js';

export type ClinicalSegmentationProvider = SegmentationProvider;

export interface ProductionModelProviderOptions {
  readonly worker?: SegmentationWorkerClient;
  readonly gate?: ProductionModelReproducibilityRecord;
}

const baseInfo = (operational: boolean, modelId: string, modelVersion: string, notes: string) =>
  Object.freeze({
    id: 'production-clinical-model',
    displayName: 'Production Clinical Segmentation Model',
    modelId,
    modelVersion,
    operational,
    licenseNotes: notes,
    capabilities: Object.freeze([
      'semantic',
      'instance',
      'identification',
      'cpu',
      'gpu',
      'cancel'
    ] as SegmentationProviderCapability[])
  }) satisfies SegmentationProviderInfo;

/** Static scaffold metadata (tests / governance). Live provider may update after health. */
export const ProductionModelProviderInfo = baseInfo(
  false,
  'unset',
  'none',
  'No production checkpoint registered. Do not emit synthetic or heuristic teeth as clinical output.'
);

class ProductionModelProviderImpl implements SegmentationProvider {
  private readonly worker: SegmentationWorkerClient;
  private gate: ProductionModelReproducibilityRecord;
  private cancelled = false;
  private healthOperational = false;
  private modelId = 'unset';
  private modelVersion = 'none';
  private runtime: SegmentationProviderRuntimeInfo = Object.freeze({
    preferredExecutionProvider: 'cpu',
    availableExecutionProviders: Object.freeze(['cpu'] as const),
    message: PRODUCTION_MODEL_NOT_CONFIGURED,
    gpuAvailable: false,
    cpuFallback: true
  });

  public constructor(options?: ProductionModelProviderOptions) {
    this.worker = options?.worker ?? new SegmentationWorkerClient();
    this.gate = options?.gate ?? resolveProductionModelGate();
  }

  public get info(): SegmentationProviderInfo {
    return baseInfo(
      this.healthOperational,
      this.modelId,
      this.modelVersion,
      this.gate.unavailableReason || this.gate.license
    );
  }

  public async initialize(): Promise<void> {
    this.cancelled = false;
    this.gate = resolveProductionModelGate();
    const health = await this.worker.health();
    this.modelId = health.modelName !== 'unset' ? health.modelName : 'tsegformer';
    this.modelVersion = health.modelVersion;
    this.healthOperational =
      health.ok && health.operational && health.configured && health.checkpointPresent;

    const gpu = health.device === 'CUDA GPU';
    this.runtime = Object.freeze({
      preferredExecutionProvider: gpu ? 'webgpu' : 'cpu',
      availableExecutionProviders: Object.freeze(['cpu'] as const),
      message: this.healthOperational
        ? `Production model ready · device ${health.device}`
        : health.message || PRODUCTION_MODEL_NOT_CONFIGURED,
      gpuAvailable: gpu,
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

  public getReproducibility(): ProductionModelReproducibilityRecord {
    return this.gate;
  }

  public validateInput(mesh: TriangleMesh): { readonly ok: boolean; readonly message?: string } {
    if (!this.healthOperational) {
      return { ok: false, message: PRODUCTION_MODEL_NOT_CONFIGURED };
    }
    if (mesh.positions.length < 9 || mesh.indices.length < 3) {
      return { ok: false, message: 'Mesh too small for production segmentation' };
    }
    return { ok: true };
  }

  public async preprocess(mesh: TriangleMesh, signal: AbortSignal): Promise<PreprocessResult> {
    if (!this.healthOperational) {
      throw new SegmentationError('MODEL_UNAVAILABLE', PRODUCTION_MODEL_NOT_CONFIGURED);
    }
    if (signal.aborted || this.cancelled) {
      throw new SegmentationError('CANCELLED', 'Preprocess cancelled');
    }
    // Shared clinical preprocess (normals / bounds). Model-specific sampling is in the worker.
    const result = await preprocessSegmentationMesh(mesh, { signal });
    return Object.freeze({
      ...result,
      version: PREPROCESSING_VERSION,
      warnings: Object.freeze([
        ...result.warnings,
        'Production adapter: ClinicalMesh → worker sample (TSegFormer 7–8ch features)'
      ])
    });
  }

  public async infer(request: SegmentationInferRequest): Promise<SegmentationPrediction> {
    if (!this.healthOperational) {
      throw new SegmentationError('MODEL_UNAVAILABLE', PRODUCTION_MODEL_NOT_CONFIGURED);
    }
    if (request.signal.aborted || this.cancelled) {
      throw new SegmentationError('CANCELLED', 'Inference cancelled');
    }

    // Hard gate: only FINAL prepared geometry fingerprint.
    if (request.geometryFingerprint !== request.mesh.fingerprint) {
      throw new SegmentationError(
        'INVALID_INPUT',
        'geometryFingerprint does not match working mesh — refusing inference on stale/source mesh'
      );
    }

    request.report({ completed: 1, total: 5, message: 'Preparing model' });
    request.report({ completed: 2, total: 5, message: 'Detecting teeth' });

    const result = await this.worker.infer(
      {
        geometryFingerprint: request.geometryFingerprint,
        sourceRevision: request.sourceRevision,
        objectId: request.objectId,
        ...(request.archRole !== undefined ? { archRole: request.archRole } : {}),
        positions: request.mesh.positions,
        indices: request.mesh.indices,
        sampleCount: 10000
      },
      request.signal
    );

    if (request.signal.aborted || this.cancelled) {
      throw new SegmentationError('CANCELLED', 'Inference cancelled');
    }

    request.report({ completed: 3, total: 5, message: 'Separating gingiva' });
    request.report({ completed: 4, total: 5, message: 'Identifying teeth' });
    request.report({ completed: 5, total: 5, message: 'Rebuilding tooth regions' });

    const faceCount = Math.floor(request.mesh.indices.length / 3);
    return mapWorkerResultToPrediction({
      result,
      objectId: request.objectId,
      sourceRevision: request.sourceRevision,
      geometryFingerprint: request.geometryFingerprint,
      providerId: this.info.id,
      modelId: this.modelId,
      modelVersion: this.modelVersion,
      faceCount
    });
  }

  public cancel(): void {
    this.cancelled = true;
  }

  public dispose(): void {
    this.cancelled = true;
    this.healthOperational = false;
  }
}

export const createProductionModelProvider = (
  options?: ProductionModelProviderOptions
): SegmentationProvider => new ProductionModelProviderImpl(options);
