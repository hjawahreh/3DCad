/**
 * Clinical geometry kernel — studio-owned KernelBridge + mesh ops (CLN-008).
 */

export {
  GeometryKernelError,
  isGeometryKernelError,
  type GeometryKernelErrorCode
} from './errors.js';

export {
  cloneMesh,
  computeAABB,
  createMesh,
  emptyMesh,
  fingerprintMesh,
  meshStats,
  type AABB,
  type CreateMeshInput,
  type MeshRole,
  type MeshStats,
  type TriangleMesh
} from './mesh/TriangleMesh.js';

export {
  MeshRegistry,
  buildSyntheticDentalSurface,
  type EnsureSourceOptions
} from './mesh/MeshRegistry.js';

export {
  runGeometryQualityPipeline,
  type GeometryQualityReport,
  type GeometryQualityStats,
  type GeometryQualityLevel,
  type QualityReport,
  type QualityStats
} from './quality/GeometryQualityPipeline.js';

export {
  clinicalGeometryContexts,
  ClinicalGeometryContextRegistry,
  type ClinicalGeometryContext,
  type OperationContext,
  type GeometryCacheEvent
} from './context/ClinicalGeometryContext.js';

export {
  geometryWarmup,
  GeometryWarmupService,
  type GeometryWarmupState,
  type GeometryWarmupStage,
  type GeometryWarmupStatus,
  type GeometryWarmupTimings,
  type GeometryWarmupFailure,
  type GeometryWarmupBackend,
  type WarmMeshOptions
} from './context/GeometryWarmup.js';

export { GeometryCache } from './cache/GeometryCache.js';

export {
  buildSpatialIndex,
  type SpatialIndex,
  type TriangleBounds,
  type Vec3
} from './spatial/SpatialIndex.js';

export { SurfaceOperations } from './ops/SurfaceOperations.js';
export { BoundaryOperations } from './ops/BoundaryOperations.js';
export { MeshRepairOperations } from './ops/MeshRepairOperations.js';
export { ClinicalGeometryValidation } from './ops/ClinicalGeometryValidation.js';

export {
  trimMesh,
  trimMeshByBoundary,
  projectBoundaryToMeshXY,
  projectBoundaryToMeshPlane,
  inferTrimProjectionAxes,
  pointInPolygon,
  type TrimMeshOptions,
  type TrimMeshResult,
  type TrimPoint2D,
  type TrimPoint3D,
  type TrimBoundaryPoint,
  type TrimAlgorithm,
  type TrimKeepMode,
  normalizeTrimKeepMode,
  type TrimViewportSize,
  type TrimProjectionAxes
} from './ops/trimMesh.js';

export {
  clipTriangleExteriorExact,
  polygonAbsoluteArea,
  polygonSignedArea,
  type ExactTrimTriangle,
  type ExactTrimVertex
} from './ops/trimMeshExact.js';

export {
  closeBaseMesh,
  inferCloseBaseExtrudeAxis,
  CLOSE_BASE_MAX_BOUNDARY_EDGES,
  CLOSE_BASE_MAX_LOOP_VERTICES,
  CLOSE_BASE_MAX_ADDED_TRIANGLES,
  CLOSE_BASE_MAX_ELAPSED_MS,
  CLOSE_BASE_MAX_LOOPS,
  type CloseBaseOptions,
  type CloseBaseOrientation,
  type CloseBaseResult,
  type CloseBaseStrategy
} from './ops/closeBaseMesh.js';

export {
  prepareDisplayMesh,
  type DisplayMeshOptions,
  type DisplayMeshResult
} from './ops/displayMesh.js';

export {
  NativeReferenceBackend,
  type GeometryBackend
} from './adapters/GeometryBackend.js';
export { Open3DAdapter } from './adapters/Open3DAdapter.js';
export { VtkClipAdapter } from './adapters/VtkClipAdapter.js';
export {
  VtkHttpWorkerBackend,
  probeVtkHttpWorker,
  type VtkHttpWorkerConfig,
  type VtkWorkerSessionInfo,
  type VtkTransportMetrics
} from './adapters/VtkHttpWorkerBackend.js';
export { HybridGeometryBackend } from './adapters/HybridGeometryBackend.js';
export {
  runTrim,
  runCloseBase,
  type AsyncGeometryBackend
} from './adapters/AsyncGeometryBackend.js';
export {
  encodeBinaryGeometryFrame,
  decodeBinaryGeometryFrame,
  isBinaryGeometryFrame,
  CGF_MAGIC,
  CGF_VERSION,
  CGF_CONTENT_TYPE,
  type EncodedBinaryGeometryFrame,
  type DecodedBinaryGeometryFrame,
  type BinaryGeometryFrameMeta
} from './transport/BinaryGeometryFrame.js';
export {
  HttpGeometryDeliveryClient,
  NodeHostGeometryDeliveryClient,
  TauriIpcGeometryDeliveryClient,
  resolveGeometryDeliveryClient,
  setGeometryDeliveryClientForTests,
  isTauriRuntime,
  type GeometryDeliveryClient,
  type GeometryDeliveryMode,
  type GeometryDeliveryResult
} from './transport/GeometryDelivery.js';
export {
  ManifoldWasmAdapter,
  injectManifoldModuleForTests,
  tryCreateManifoldSolid,
  getManifoldModule
} from './adapters/ManifoldWasmAdapter.js';
export {
  GEOMETRY_BACKEND_POLICY,
  isPrototypeAlgorithmAllowed,
  type GeometryBackendDescriptor,
  type GeometryBackendRole
} from './adapters/GeometryBackendPolicy.js';
export { MeshOptimizationAdapter } from './adapters/MeshOptimizationAdapter.js';
export {
  MeshOptimizerAdapter,
  prepareWithMeshoptimizer,
  injectMeshoptimizerForTests
} from './adapters/MeshOptimizerAdapter.js';

export {
  ClinicalGeometryKernelBridge,
  readMeshStatsForManagers,
  type MeshStatsSnapshot
} from './ClinicalGeometryKernelBridge.js';

export {
  ClinicalGeometryEngine,
  getClinicalGeometryEngine,
  analyzeMesh,
  calculateMetrics,
  buildTopology,
  extractBoundaryLoops,
  buildClinicalSpatialIndex,
  invalidateSpatialCache,
  rayIntersectMesh,
  nearestSurfacePoint,
  projectPointToSurface,
  createSurfacePath,
  appendSurfacePath,
  validateSurfacePath,
  resampleSurfacePath,
  closeSurfacePath,
  measureSurfacePath,
  measureSurfacePathQuality,
  simplifySurfacePath,
  thinSurfacePath,
  adaptiveSampleSpacingMm,
  clinicalSurfacePathMessage,
  countSelfIntersections,
  repairMesh,
  normalizeMeshTopology,
  measureImportVertexSpacing,
  DEFAULT_TOPOLOGY_WELD_POLICY,
  selectBackendForCapability,
  ClinicalTrimEngine,
  ClinicalBaseEngine,
  constructClinicalBase,
  selectClinicalBaseBoundary,
  analyzeBoundaryLoop,
  asClinicalMesh,
  type ClinicalMesh,
  type MeshQualityReport,
  type GeometryMetrics,
  type GeometryDiagnostics,
  type SurfacePath,
  type SurfaceQueryResult,
  type TrimEngineResult,
  type BaseEngineResult,
  type BoundaryLoopCandidate,
  type GeometryCapability,
  type ClinicalGeometryEngineOptions,
  type TopologyWeldMode,
  type TopologyWeldPolicy,
  type TopologyNormalizationReport,
  type TopologyNormalizationResult
} from './engine/index.js';
