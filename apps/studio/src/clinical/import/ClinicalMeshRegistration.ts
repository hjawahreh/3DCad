/**
 * Registers parsed clinical mesh buffers into the geometry kernel MeshRegistry.
 * GEO-001B: SOURCE remains raw import; WORKING is topology-normalized.
 */

import {
  createMesh,
  type TriangleMesh
} from '../../geometry-kernel/mesh/TriangleMesh.js';
import type { MeshRegistry } from '../../geometry-kernel/mesh/MeshRegistry.js';
import {
  DEFAULT_TOPOLOGY_WELD_POLICY,
  normalizeMeshTopology,
  type TopologyNormalizationReport,
  type TopologyWeldPolicy
} from '../../geometry-kernel/engine/TopologyNormalization.js';
import type { ParsedClinicalMesh } from './ClinicalMeshParsers.js';
import { recordClinicalGeometryDevDiag } from '../diagnostics/ClinicalGeometryDevDiagnostics.js';

export interface RegisterParsedClinicalMeshResult {
  readonly source: TriangleMesh;
  readonly working: TriangleMesh;
  readonly normalization: TopologyNormalizationReport;
}

export const registerParsedClinicalMesh = (
  registry: MeshRegistry,
  objectId: string,
  parsed: ParsedClinicalMesh,
  revision = 1,
  weldPolicy: TopologyWeldPolicy = DEFAULT_TOPOLOGY_WELD_POLICY
): TriangleMesh => {
  const result = registerParsedClinicalMeshWithReport(
    registry,
    objectId,
    parsed,
    revision,
    weldPolicy
  );
  return result.source;
};

export const registerParsedClinicalMeshWithReport = (
  registry: MeshRegistry,
  objectId: string,
  parsed: ParsedClinicalMesh,
  revision = 1,
  weldPolicy: TopologyWeldPolicy = DEFAULT_TOPOLOGY_WELD_POLICY
): RegisterParsedClinicalMeshResult => {
  const sourceHandle = registry.allocateHandle();
  const source = createMesh({
    id: sourceHandle as number,
    objectId,
    role: 'source',
    revision,
    positions: parsed.positions,
    indices: parsed.indices
  });
  registry.register(source);

  const workingHandle = registry.allocateHandle();
  const draftWorking = createMesh({
    id: workingHandle as number,
    objectId,
    role: 'working',
    revision,
    positions: new Float32Array(parsed.positions),
    indices: new Uint32Array(parsed.indices)
  });
  const normalized = normalizeMeshTopology(draftWorking, weldPolicy);
  const working = createMesh({
    id: workingHandle as number,
    objectId,
    role: 'working',
    revision,
    positions: normalized.mesh.positions,
    indices: normalized.mesh.indices,
    fingerprint: normalized.mesh.fingerprint
  });
  registry.register(working);

  recordClinicalGeometryDevDiag({
    operation: 'normalize-topology',
    objectId,
    revision,
    role: 'working',
    inputFingerprint: normalized.report.geometryFingerprintBefore,
    outputFingerprint: normalized.report.geometryFingerprintAfter,
    vertices: normalized.report.normalizedVertexCount,
    faces: normalized.report.normalizedTriangleCount,
    elapsedMs: normalized.report.durationMs,
    warning: [
      `rawV=${String(normalized.report.rawVertexCount)}`,
      `rawT=${String(normalized.report.rawTriangleCount)}`,
      `normV=${String(normalized.report.normalizedVertexCount)}`,
      `normT=${String(normalized.report.normalizedTriangleCount)}`,
      `comps ${String(normalized.report.connectedComponentsBefore)}→${String(normalized.report.connectedComponentsAfter)}`,
      `exactDup=${String(normalized.report.exactDuplicatesRemoved)}`,
      `nearDup=${String(normalized.report.nearDuplicatesMerged)}`,
      `tol=${String(normalized.report.weldTolerance)}`,
      `boundaryEdges=${String(normalized.report.boundaryEdges)}`
    ].join(' ')
  });

  return {
    source,
    working,
    normalization: normalized.report
  };
};
