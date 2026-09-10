import type { ProgressReporter } from '@cad-studio/platform-runtime';
import type { CapabilityNegotiator } from './capabilities.js';
import {
  asKernelSessionId,
  asOpaqueGeometryHandle,
  DEFAULT_TOLERANCE,
  kernelFailure,
  kernelSuccess,
  type KernelCapability,
  type KernelOperationResult,
  type KernelResult,
  type KernelSessionId,
  type OpaqueGeometryHandle,
  type TolerancePolicy
} from './types.js';

export interface KernelInvokeRequest {
  readonly capability: KernelCapability;
  readonly operation: string;
  readonly inputRevision: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly sessionId: KernelSessionId;
}

/** Low-level bridge — mock today; native/WASM later behind the same contract. */
export interface KernelBridge {
  readonly capabilities: CapabilityNegotiator;
  invoke(
    request: KernelInvokeRequest,
    signal: AbortSignal,
    report: ProgressReporter
  ): Promise<KernelResult<KernelOperationResult>>;
}

export interface KernelSessionState {
  readonly id: KernelSessionId;
  readonly tolerance: TolerancePolicy;
  readonly resourceCount: number;
  readonly topologyCount: number;
  readonly disposed: boolean;
}

/**
 * Session-scoped operation context: caches, tolerance, cancel, diagnostics.
 */
export class ManagedKernelSession {
  readonly id: KernelSessionId;
  private readonly resources = new Map<string, OpaqueGeometryHandle>();
  private readonly topology = new Map<string, Readonly<Record<string, unknown>>>();
  private readonly diagnostics: string[] = [];
  private disposed = false;
  private handleSerial = 1;

  public constructor(
    private readonly bridge: KernelBridge,
    public readonly tolerance: TolerancePolicy = DEFAULT_TOLERANCE,
    now: () => number = () => Date.now()
  ) {
    this.id = asKernelSessionId(`ks-${String(now())}-${String(Math.random()).slice(2, 8)}`);
  }

  public state(): KernelSessionState {
    return {
      id: this.id,
      tolerance: this.tolerance,
      resourceCount: this.resources.size,
      topologyCount: this.topology.size,
      disposed: this.disposed
    };
  }

  public cacheHandle(key: string, handle?: OpaqueGeometryHandle): KernelResult<OpaqueGeometryHandle> {
    if (this.disposed) {
      return kernelFailure('unavailable', 'Kernel session disposed');
    }
    const existing = this.resources.get(key);
    if (existing !== undefined) {
      return kernelSuccess(existing);
    }
    const next = handle ?? asOpaqueGeometryHandle(this.handleSerial++);
    this.resources.set(key, next);
    return kernelSuccess(next);
  }

  public putTopology(key: string, data: Readonly<Record<string, unknown>>): KernelResult<void> {
    if (this.disposed) {
      return kernelFailure('unavailable', 'Kernel session disposed');
    }
    this.topology.set(key, Object.freeze({ ...data }));
    return kernelSuccess(undefined);
  }

  public getTopology(key: string): KernelResult<Readonly<Record<string, unknown>>> {
    const data = this.topology.get(key);
    if (data === undefined) {
      return kernelFailure('not-found', `Unknown topology key ${key}`);
    }
    return kernelSuccess(data);
  }

  public note(diagnostic: string): void {
    this.diagnostics.push(diagnostic);
  }

  public readDiagnostics(): readonly string[] {
    return [...this.diagnostics];
  }

  public async invoke(
    request: Omit<KernelInvokeRequest, 'sessionId'>,
    signal: AbortSignal,
    report: ProgressReporter = () => undefined
  ): Promise<KernelResult<KernelOperationResult>> {
    if (this.disposed) {
      return kernelFailure('unavailable', 'Kernel session disposed');
    }
    const capability = this.bridge.capabilities.require(request.capability);
    if (!capability.ok) {
      return capability;
    }
    if (signal.aborted) {
      return kernelFailure('cancelled', 'Kernel session invoke cancelled');
    }
    const result = await this.bridge.invoke(
      { ...request, sessionId: this.id },
      signal,
      report
    );
    if (result.ok) {
      this.diagnostics.push(...result.value.diagnostics);
    }
    return result;
  }

  public dispose(): void {
    this.resources.clear();
    this.topology.clear();
    this.disposed = true;
  }
}

export class KernelSessionManager {
  private active: ManagedKernelSession | undefined;

  public constructor(private readonly bridge: KernelBridge) {}

  public open(tolerance?: TolerancePolicy): ManagedKernelSession {
    this.active?.dispose();
    this.active = new ManagedKernelSession(this.bridge, tolerance ?? DEFAULT_TOLERANCE);
    return this.active;
  }

  public current(): KernelResult<ManagedKernelSession> {
    if (this.active === undefined || this.active.state().disposed) {
      return kernelFailure('unavailable', 'No active kernel session');
    }
    return kernelSuccess(this.active);
  }

  public close(): void {
    this.active?.dispose();
    this.active = undefined;
  }
}
