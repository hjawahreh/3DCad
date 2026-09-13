/**
 * Inference runtime capability detection for segmentation adapters.
 * Detects WebGPU / WASM / CPU without importing ONNX into clinical UI modules.
 *
 * onnxruntime-web is an optional peer — never hard-required. Probe stays false
 * until license-cleared weights + dependency are explicitly enabled
 * (see docs/architecture/segmentation-model-decision.md).
 */

export type InferenceExecutionProvider = 'webgpu' | 'wasm' | 'cpu';

export interface InferenceRuntimeSnapshot {
  readonly preferred: InferenceExecutionProvider;
  readonly available: readonly InferenceExecutionProvider[];
  readonly webgpu: boolean;
  readonly wasm: boolean;
  readonly cpu: boolean;
  readonly onnxRuntimeModuleAvailable: boolean;
  readonly message: string;
}

const hasWebGpu = (): boolean => {
  try {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  } catch {
    return false;
  }
};

const hasWasm = (): boolean => {
  try {
    return typeof WebAssembly !== 'undefined';
  } catch {
    return false;
  }
};

/**
 * Optional ONNX Runtime module probe.
 * Does not import optional packages (keeps Vite/build free of unresolved deps).
 * Returns true only when an explicit enable flag is set AND a global injector
 * has registered a runtime (tests / future licensed enablement).
 */
export const probeOnnxRuntimeModule = async (): Promise<boolean> => {
  try {
    const g = globalThis as { __CAD_ONNX_RUNTIME__?: unknown };
    return g.__CAD_ONNX_RUNTIME__ !== undefined;
  } catch {
    return false;
  }
};

export const detectInferenceRuntime = async (options?: {
  readonly probeOnnx?: boolean;
}): Promise<InferenceRuntimeSnapshot> => {
  const webgpu = hasWebGpu();
  const wasm = hasWasm();
  const cpu = true;
  const available: InferenceExecutionProvider[] = [];
  if (webgpu) available.push('webgpu');
  if (wasm) available.push('wasm');
  available.push('cpu');

  const preferred: InferenceExecutionProvider = webgpu ? 'webgpu' : wasm ? 'wasm' : 'cpu';
  const onnxRuntimeModuleAvailable =
    options?.probeOnnx === true ? await probeOnnxRuntimeModule() : false;

  const message = onnxRuntimeModuleAvailable
    ? `ONNX Runtime injected · preferred EP: ${preferred}`
    : `ONNX Runtime not enabled · CPU geometry providers available · preferred EP: ${preferred}` +
      (webgpu ? '' : ' · WebGPU unavailable (CPU/WASM fallback path)');

  return Object.freeze({
    preferred,
    available: Object.freeze(available),
    webgpu,
    wasm,
    cpu,
    onnxRuntimeModuleAvailable,
    message
  });
};
