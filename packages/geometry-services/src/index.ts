export {
  booleanService,
  collisionService,
  measurementService,
  offsetService,
  remeshService,
  repairService,
  topologyService,
  transformService,
  validationService
} from './families/index.js';
export { GeometryServices } from './registry.js';
export {
  createPortAdapter,
  createStubService,
  type GeometryService,
  type GeometryServiceRequest,
  type GeometryServiceResult
} from './service.js';
export type {
  Brand,
  GeometryError,
  GeometryErrorCode,
  GeometryHandleId,
  GeometryResult,
  GeometryServiceFamily,
  GeometryServiceId,
  GeometrySessionId
} from './types.js';
export {
  asGeometryHandleId,
  asGeometryServiceId,
  asGeometrySessionId,
  GEOMETRY_SERVICE_FAMILIES,
  geoFailure,
  geoSuccess
} from './types.js';

/** Re-exports for callers that previously used local session/bridge types. */
export {
  KernelSessionManager,
  ManagedKernelSession,
  MockKernelBridge,
  type KernelBridge,
  type KernelOperationResult
} from '@cad-studio/kernel-bridge';
