import {
  ALL_KERNEL_CAPABILITIES,
  KERNEL_ABI_VERSION,
  kernelFailure,
  kernelSuccess,
  type KernelAbiVersion,
  type KernelCapability,
  type KernelResult
} from './types.js';

export interface KernelCapabilities {
  readonly abiVersion: KernelAbiVersion;
  readonly implementation: 'mock' | 'native' | 'wasm' | 'unknown';
  readonly supported: readonly KernelCapability[];
  readonly deviceLabel: string;
}

export class CapabilityNegotiator {
  public constructor(private readonly capabilities: KernelCapabilities) {}

  public snapshot(): KernelCapabilities {
    return this.capabilities;
  }

  public supports(capability: KernelCapability): boolean {
    return this.capabilities.supported.includes(capability);
  }

  public require(capability: KernelCapability): KernelResult<void> {
    if (!this.supports(capability)) {
      return kernelFailure(
        'unsupported',
        `Kernel capability ${capability} is not available on ${this.capabilities.implementation}`
      );
    }
    return kernelSuccess(undefined);
  }

  public requireAll(capabilities: readonly KernelCapability[]): KernelResult<void> {
    for (const capability of capabilities) {
      const result = this.require(capability);
      if (!result.ok) {
        return result;
      }
    }
    return kernelSuccess(undefined);
  }

  public static mockFull(): CapabilityNegotiator {
    return new CapabilityNegotiator({
      abiVersion: KERNEL_ABI_VERSION,
      implementation: 'mock',
      supported: ALL_KERNEL_CAPABILITIES,
      deviceLabel: 'MockKernel'
    });
  }

  public static empty(implementation: KernelCapabilities['implementation'] = 'unknown'): CapabilityNegotiator {
    return new CapabilityNegotiator({
      abiVersion: KERNEL_ABI_VERSION,
      implementation,
      supported: [],
      deviceLabel: 'Unavailable'
    });
  }
}
