import {
  detectGpuCapabilities,
  selectBackend,
  type BackendKind,
  type GpuCapabilities
} from '@cad-studio/viewport';
import type { ViewportCanvasElement } from './types.js';
import { viewportFailure, viewportSuccess, type ViewportResult } from './types.js';

export interface DeviceCapabilityRecord {
  readonly capabilities: GpuCapabilities;
  readonly probedAt: number;
}

/**
 * Registry of probed GPU capability records (no hidden globals).
 * Ownership: runtime/session-owned.
 */
export class DeviceCapabilityRegistry {
  private record: DeviceCapabilityRecord | undefined;

  public probe(input: {
    readonly canvas?: ViewportCanvasElement;
    readonly forceMock?: boolean;
    readonly now: number;
  }): DeviceCapabilityRecord {
    const canvas =
      input.canvas !== undefined && 'getContext' in input.canvas
        ? (input.canvas as HTMLCanvasElement)
        : undefined;
    const capabilities = detectGpuCapabilities({
      ...(canvas !== undefined ? { canvas } : {}),
      ...(input.forceMock === true ? { forceMock: true } : {})
    });
    this.record = Object.freeze({
      capabilities,
      probedAt: input.now
    });
    return this.record;
  }

  public current(): DeviceCapabilityRecord | undefined {
    return this.record;
  }

  public clear(): void {
    this.record = undefined;
  }
}

export interface BackendSelectionResult {
  readonly selected: BackendKind;
  readonly available: readonly BackendKind[];
  readonly capabilities: GpuCapabilities;
  readonly failed: boolean;
}

/**
 * Deterministic backend selection: WebGPU → WebGL2 → Failure (or mock if allowed).
 * Switching contracts: produce a new selection; session must recreate renderer to switch.
 */
export class BackendSelection {
  public select(input: {
    readonly capabilities: GpuCapabilities;
    readonly preferred: BackendKind;
    readonly allowFallback: boolean;
    readonly allowMock: boolean;
  }): ViewportResult<BackendSelectionResult> {
    const selected = selectBackend(
      input.capabilities,
      input.preferred,
      input.allowFallback
    );
    const available = input.capabilities.availableBackends;
    const isReal =
      selected === 'webgpu' ||
      selected === 'webgl2' ||
      (selected === 'mock' && input.allowMock);

    if (!isReal) {
      return viewportFailure(
        'backend',
        `No acceptable GPU backend (preferred=${input.preferred}, available=${available.join(',')})`
      );
    }

    if (selected === 'mock' && !input.allowMock) {
      return viewportFailure('backend', 'Mock backend is disabled and no GPU backend is available');
    }

    const failed = selected !== 'webgpu' && selected !== 'webgl2' && selected !== 'mock';
    return viewportSuccess(
      Object.freeze({
        selected,
        available,
        capabilities: input.capabilities,
        failed
      })
    );
  }
}
