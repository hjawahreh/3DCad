/**
 * GEO-001 Clinical Geometry Engine V2 — public barrel.
 */

export {
  asClinicalMesh,
  type ClinicalMesh,
  type GeometryGate,
  type MeshQualityReport,
  type GeometryMetrics,
  type GeometryDiagnostics,
  type SurfaceHit,
  type SurfaceMiss,
  type SurfaceQueryResult,
  type SurfacePath,
  type SurfacePathSample,
  type TrimEngineInput,
  type TrimEngineResult,
  type BaseEngineInput,
  type BaseEngineResult,
  type BoundaryLoopCandidate,
  type GeometryCapability,
  type BackendSelection,
  type TrimKeepModeEngine,
  type BaseStrategyEngine,
  type SelfIntersectionStatus
} from './types.js';

export { analyzeMesh, calculateMetrics } from './MeshAnalysis.js';
export {
  buildTopology,
  extractBoundaryLoops,
  invalidateTopologyCache,
  shortestFacePath,
  type TopologyGraph,
  type TopologyEdge
} from './TopologyGraph.js';
export {
  buildClinicalSpatialIndex,
  invalidateSpatialCache,
  rayIntersectMesh,
  nearestSurfacePoint,
  projectPointToSurface,
  type ClinicalSpatialIndex
} from './SpatialAcceleration.js';
export {
  createSurfacePath,
  validateSurfacePath,
  resampleSurfacePath,
  closeSurfacePath,
  measureSurfacePath,
  measureSurfacePathQuality,
  simplifySurfacePath,
  thinSurfacePath,
  reconstructSurfaceSegment,
  adaptiveSampleSpacingMm,
  clinicalSurfacePathMessage,
  countSelfIntersections,
  type SurfacePathQualityMetrics,
  type SurfacePathReconstructMode
} from './SurfacePath.js';
export { repairMesh } from './MeshRepair.js';
export {
  normalizeMeshTopology,
  measureImportVertexSpacing,
  DEFAULT_TOPOLOGY_WELD_POLICY,
  type TopologyWeldMode,
  type TopologyWeldPolicy,
  type TopologyNormalizationReport,
  type TopologyNormalizationResult
} from './TopologyNormalization.js';
export { selectBackendForCapability } from './BackendCapability.js';
export { ClinicalTrimEngine } from './ClinicalTrimEngine.js';
export { ClinicalBaseEngine } from './ClinicalBaseEngine.js';
export {
  constructClinicalBase,
  selectClinicalBaseBoundary,
  analyzeBoundaryLoop,
  type BaseQualityReport,
  type AnalyzedBoundaryLoop,
  type ClinicalBaseConstructionInput,
  type ClinicalBaseConstructionResult
} from './ClinicalBaseConstruction.js';
export {
  ClinicalGeometryEngine,
  getClinicalGeometryEngine,
  type ClinicalGeometryEngineOptions
} from './ClinicalGeometryEngine.js';
