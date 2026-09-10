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
  type QualityReport,
  type QualityStats
} from './quality/GeometryQualityPipeline.js';

export {
  buildSpatialIndex,
  type SpatialIndex,
  type TriangleBounds,
  type Vec3
} from './spatial/SpatialIndex.js';

export { GeometryCache } from './cache/GeometryCache.js';

export {
  trimMesh,
  trimMeshByBoundary,
  projectBoundaryToMeshXY,
  pointInPolygon,
  type TrimMeshOptions,
  type TrimMeshResult,
  type TrimPoint2D,
  type TrimBoundaryPoint
} from './ops/trimMesh.js';

export {
  closeBaseMesh,
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
