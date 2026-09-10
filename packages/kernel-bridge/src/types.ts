import { failure, success, type Result } from '@cad-studio/platform-runtime';

export type KernelErrorCode =
  | 'cancelled'
  | 'conflict'
  | 'invalid'
  | 'not-found'
  | 'unavailable'
  | 'unsupported'
  | 'validation'
  | 'abi'
  | 'unexpected';

export interface KernelError {
  readonly code: KernelErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export type KernelResult<T> = Result<T, KernelError>;

export const kernelSuccess = <T>(value: T): KernelResult<T> => success(value);

export const kernelFailure = (
  code: KernelErrorCode,
  message: string,
  cause?: unknown
): KernelResult<never> => failure({ code, message, cause });

export type Brand<T, B extends string> = T & { readonly __brand: B };

/** Opaque geometry handle — never dereference outside kernel-bridge adapters. */
export type OpaqueGeometryHandle = Brand<number, 'OpaqueGeometryHandle'>;
export type KernelSessionId = Brand<string, 'KernelSessionId'>;
export type KernelAbiVersion = Brand<string, 'KernelAbiVersion'>;

export const asOpaqueGeometryHandle = (value: number): OpaqueGeometryHandle =>
  value as OpaqueGeometryHandle;
export const asKernelSessionId = (value: string): KernelSessionId => value as KernelSessionId;
export const asKernelAbiVersion = (value: string): KernelAbiVersion =>
  value as KernelAbiVersion;

export const KERNEL_ABI_VERSION = asKernelAbiVersion('1.0.0');

export type KernelCapability =
  | 'boolean'
  | 'transform'
  | 'repair'
  | 'remesh'
  | 'offset'
  | 'collision'
  | 'measurement'
  | 'validation'
  | 'topology';

export const ALL_KERNEL_CAPABILITIES: readonly KernelCapability[] = [
  'boolean',
  'transform',
  'repair',
  'remesh',
  'offset',
  'collision',
  'measurement',
  'validation',
  'topology'
] as const;

export type HandleOwnership = 'borrowed' | 'transferred' | 'session-owned';

export interface HandleLifetime {
  readonly handle: OpaqueGeometryHandle;
  readonly ownership: HandleOwnership;
  readonly sessionId: KernelSessionId;
}

/**
 * Typed kernel operation result — aligns with Operation Runtime validation.
 * No production mesh payload; opaque handles only.
 */
export interface KernelOperationResult {
  readonly revision: number;
  readonly fingerprint: string;
  readonly diagnostics: readonly string[];
  readonly timingMs: number;
  readonly warnings: readonly string[];
  readonly geometryHandles: readonly OpaqueGeometryHandle[];
  readonly metrics: Readonly<Record<string, number>>;
  readonly validation: {
    readonly ok: boolean;
    readonly codes: readonly string[];
  };
}

export interface TolerancePolicy {
  readonly absolute: number;
  readonly relative: number;
  readonly version: string;
}

export const DEFAULT_TOLERANCE: TolerancePolicy = {
  absolute: 1e-6,
  relative: 1e-9,
  version: '1'
};
