/**
 * Operation metadata retained for history / reproducibility (no mesh buffers).
 */

export interface ClinicalGeometryStatistics {
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly triangleCount?: number;
  readonly componentCount?: number;
  readonly boundaryEdgeCount?: number;
  readonly memoryEstimateBytes?: number;
}

export interface ClinicalGeometryOperationMeta {
  readonly operationId: string;
  readonly operationType: string;
  readonly sourceRevision: number;
  readonly resultingRevision: number;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly algorithm: string;
  readonly backend: string;
  readonly backendVersion: string;
  readonly executionTimeMs: number;
  readonly geometryStatistics: ClinicalGeometryStatistics;
  readonly warnings: readonly string[];
  readonly timestamp: number;
}

export const createClinicalGeometryOperationMeta = (
  input: ClinicalGeometryOperationMeta
): ClinicalGeometryOperationMeta =>
  Object.freeze({
    operationId: input.operationId,
    operationType: input.operationType,
    sourceRevision: input.sourceRevision,
    resultingRevision: input.resultingRevision,
    parameters: Object.freeze({ ...input.parameters }),
    algorithm: input.algorithm,
    backend: input.backend,
    backendVersion: input.backendVersion,
    executionTimeMs: input.executionTimeMs,
    geometryStatistics: Object.freeze({ ...input.geometryStatistics }),
    warnings: Object.freeze([...input.warnings]),
    timestamp: input.timestamp
  });
