/**
 * Segmentation provider contract — model-independent.
 * Clinical layer never sees tensors / NN classes.
 */

import type { TriangleMesh } from '../../../geometry-kernel/mesh/TriangleMesh.js';
import type { SegmentationPrediction } from '../prediction/types.js';
import type { PreprocessResult } from '../preprocess/SegmentationPreprocess.js';

export type SegmentationProviderCapability =
  | 'semantic'
  | 'instance'
  | 'identification'
  | 'gpu'
  | 'cpu'
  | 'cancel';

export interface SegmentationProviderInfo {
  readonly id: string;
  readonly displayName: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly operational: boolean;
  readonly licenseNotes: string;
  readonly capabilities: readonly SegmentationProviderCapability[];
}

export interface SegmentationInferRequest {
  readonly objectId: string;
  readonly sourceRevision: number;
  readonly geometryFingerprint: string;
  readonly mesh: TriangleMesh;
  readonly preprocess: PreprocessResult;
  readonly identificationThreshold: number;
  readonly signal: AbortSignal;
  readonly report: (progress: {
    readonly completed: number;
    readonly total: number;
    readonly message: string;
  }) => void;
}

export interface SegmentationProvider {
  readonly info: SegmentationProviderInfo;
  initialize(): Promise<void>;
  capabilities(): readonly SegmentationProviderCapability[];
  validateInput(mesh: TriangleMesh): { readonly ok: boolean; readonly message?: string };
  preprocess(mesh: TriangleMesh, signal: AbortSignal): Promise<PreprocessResult>;
  infer(request: SegmentationInferRequest): Promise<SegmentationPrediction>;
  cancel(): void;
  dispose(): void;
}
