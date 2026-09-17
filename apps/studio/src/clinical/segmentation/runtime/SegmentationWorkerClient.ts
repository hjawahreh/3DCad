/**
 * CLN-SEG-001 — browser/Node client for the isolated Python segmentation worker.
 * Clinical/React never imports PyTorch.
 */

import { SegmentationError } from '../errors.js';
import {
  validateWorkerInferRequest,
  validateWorkerInferResult,
  type ValidatedWorkerInferResult
} from './validateWorkerInferResult.js';

const DEFAULT_URL = 'http://127.0.0.1:8766';

const readCadEnv = (key: string): string | undefined => {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const value = proc?.env?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export interface SegmentationWorkerHealth {
  readonly ok: boolean;
  readonly configured: boolean;
  readonly operational: boolean;
  readonly device: 'CPU' | 'CUDA GPU' | 'unknown';
  readonly modelName: string;
  readonly modelVersion: string;
  readonly checkpointPresent: boolean;
  readonly message: string;
  readonly coldLoadMs: number | null;
  readonly warmReady: boolean;
}

export interface SegmentationWorkerInferRequest {
  readonly geometryFingerprint: string;
  readonly sourceRevision: number;
  readonly objectId: string;
  readonly archRole?: 'upper' | 'lower';
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly normals?: Float32Array;
  readonly sampleCount?: number;
}

export interface SegmentationWorkerToothInstance {
  readonly instanceId: string;
  readonly fdi: number | null;
  readonly arch: 'upper' | 'lower' | 'unknown';
  readonly faceMembership: readonly number[];
  readonly vertexMembership: readonly number[];
  readonly centroid: readonly [number, number, number];
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly surfaceArea: number;
  readonly confidence: number;
  readonly boundaryLength: number;
  readonly boundaryConfidence: number;
  readonly adjacentLabelConsistency: number;
  readonly neighborConsistency: number;
  readonly lowConfidence: boolean;
  readonly missingCandidate: boolean;
}

export interface SegmentationWorkerInferResult {
  readonly segmentationGeometryFingerprint: string;
  readonly vertexLabel: readonly number[];
  readonly instanceLabel: readonly number[];
  readonly FDILabel: readonly number[];
  readonly confidence: readonly number[];
  readonly gingivaLabel: number;
  readonly toothInstances: readonly SegmentationWorkerToothInstance[];
  readonly missingCandidates: readonly number[];
  readonly modelMetadata: Readonly<Record<string, string | number | boolean>>;
  readonly runtimeMs: number;
  readonly stages: Readonly<Record<string, number>>;
  readonly device: string;
  readonly sampleToSource: {
    readonly sampleCount: number;
    readonly vertexIndex: readonly number[];
    readonly faceIndex: readonly number[];
  };
  readonly preprocessing: {
    readonly inputVertexCount: number;
    readonly inputTriangleCount: number;
    readonly sampleCount: number;
    readonly normalization: string;
    readonly scaleUnit: string;
    readonly runtime: string;
  };
}

export class SegmentationWorkerClient {
  private readonly baseUrl: string;

  public constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl ?? readCadEnv('CAD_SEG_WORKER_URL') ?? DEFAULT_URL).replace(/\/$/, '');
  }

  public async health(signal?: AbortSignal): Promise<SegmentationWorkerHealth> {
    try {
      const init: RequestInit = { method: 'GET' };
      if (signal !== undefined) init.signal = signal;
      const res = await fetch(`${this.baseUrl}/health`, init);
      if (!res.ok) {
        return Object.freeze({
          ok: false,
          configured: false,
          operational: false,
          device: 'unknown',
          modelName: 'unset',
          modelVersion: 'none',
          checkpointPresent: false,
          message: `Segmentation worker HTTP ${String(res.status)}`,
          coldLoadMs: null,
          warmReady: false
        });
      }
      const body = (await res.json()) as Partial<SegmentationWorkerHealth>;
      return Object.freeze({
        ok: body.ok === true,
        configured: body.configured === true,
        operational: body.operational === true,
        device: body.device === 'CUDA GPU' || body.device === 'CPU' ? body.device : 'unknown',
        modelName: typeof body.modelName === 'string' ? body.modelName : 'unset',
        modelVersion: typeof body.modelVersion === 'string' ? body.modelVersion : 'none',
        checkpointPresent: body.checkpointPresent === true,
        message:
          typeof body.message === 'string' ? body.message : 'Production model not configured.',
        coldLoadMs: typeof body.coldLoadMs === 'number' ? body.coldLoadMs : null,
        warmReady: body.warmReady === true
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'worker unreachable';
      return Object.freeze({
        ok: false,
        configured: false,
        operational: false,
        device: 'unknown',
        modelName: 'unset',
        modelVersion: 'none',
        checkpointPresent: false,
        message: `Segmentation worker unavailable (${msg})`,
        coldLoadMs: null,
        warmReady: false
      });
    }
  }

  public async infer(
    request: SegmentationWorkerInferRequest,
    signal?: AbortSignal
  ): Promise<ValidatedWorkerInferResult> {
    validateWorkerInferRequest(request);
    const payload = {
      geometryFingerprint: request.geometryFingerprint,
      sourceRevision: request.sourceRevision,
      objectId: request.objectId,
      archRole: request.archRole ?? null,
      sampleCount: request.sampleCount ?? 10000,
      positions: Array.from(request.positions),
      indices: Array.from(request.indices),
      ...(request.normals !== undefined ? { normals: Array.from(request.normals) } : {})
    };

    let res: Response;
    try {
      const init: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      };
      if (signal !== undefined) init.signal = signal;
      res = await fetch(`${this.baseUrl}/infer`, init);
    } catch (err) {
      throw new SegmentationError(
        'MODEL_UNAVAILABLE',
        `Production segmentation worker unreachable: ${err instanceof Error ? err.message : 'error'}`
      );
    }

    if (res.status === 503) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new SegmentationError(
        'MODEL_UNAVAILABLE',
        body.message ?? 'Production model not configured.'
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new SegmentationError(
        'INFERENCE_FAILED',
        `Production inference failed (HTTP ${String(res.status)}): ${text.slice(0, 240)}`
      );
    }

    const faceCount = Math.floor(request.indices.length / 3);
    const json: unknown = await res.json();
    return validateWorkerInferResult({
      result: json,
      expectedFingerprint: request.geometryFingerprint,
      expectedRevision: request.sourceRevision,
      faceCount
    });
  }
}
