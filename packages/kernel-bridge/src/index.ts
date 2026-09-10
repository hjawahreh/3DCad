export { CapabilityNegotiator, type KernelCapabilities } from './capabilities.js';
export { MockKernelBridge } from './mock-bridge.js';
export {
  createBooleanPort,
  createCollisionPort,
  createKernelPortSet,
  createMeasurementPort,
  createOffsetPort,
  createRemeshPort,
  createRepairPort,
  createTopologyPort,
  createTransformPort,
  createValidationPort,
  type KernelFamilyPort,
  type KernelPortSet
} from './ports.js';
export {
  KernelSessionManager,
  ManagedKernelSession,
  type KernelBridge,
  type KernelInvokeRequest,
  type KernelSessionState
} from './session.js';
export {
  GeometryTransactionReserve,
  reservedTransactionSessionId,
  type GeometryTransaction,
  type GeometryTransactionPhase
} from './transaction.js';
export type {
  Brand,
  HandleLifetime,
  HandleOwnership,
  KernelAbiVersion,
  KernelCapability,
  KernelError,
  KernelErrorCode,
  KernelOperationResult,
  KernelResult,
  KernelSessionId,
  OpaqueGeometryHandle,
  TolerancePolicy
} from './types.js';
export {
  ALL_KERNEL_CAPABILITIES,
  asKernelAbiVersion,
  asKernelSessionId,
  asOpaqueGeometryHandle,
  DEFAULT_TOLERANCE,
  KERNEL_ABI_VERSION,
  kernelFailure,
  kernelSuccess
} from './types.js';
