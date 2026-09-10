/**
 * Reserved selection contracts (COD-011: contracts only).
 */

/** Reserved: lasso selection algorithms. */
export interface LassoSelectionContract {
  readonly readonly: true;
  readonly path: readonly { readonly x: number; readonly y: number }[];
}

/** Reserved: paint / brush selection. */
export interface PaintSelectionContract {
  readonly readonly: true;
  readonly brushRadius: number;
}

/** Reserved: smart / topology-aware selection. */
export interface SmartSelectionContract {
  readonly readonly: true;
  readonly strategy: string;
}

/** Reserved: AI-assisted selection. */
export interface AiAssistedSelectionContract {
  readonly readonly: true;
  readonly modelId: string;
  readonly prompt?: string;
}

/** Reserved: GPU picking integration (ID buffer). */
export interface GpuPickingIntegrationContract {
  readonly readonly: true;
  readonly pickingId: number;
}

export const RESERVED_SELECTION_CHANNELS = Object.freeze([
  'lasso',
  'paint',
  'smart',
  'ai-assisted',
  'gpu-picking'
] as const);
