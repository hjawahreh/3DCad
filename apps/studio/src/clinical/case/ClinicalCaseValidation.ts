/**
 * ClinicalCaseValidation — post-import / pre-orient geometry + case gates.
 * Classifies findings as ERROR | WARNING | INFO. Does not mutate meshes.
 * Repairs are not performed here; callers may apply deterministic prep separately.
 */

import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import type { ClinicalMeshDescriptor } from '../import/ClinicalMeshDescriptor.js';
import type { TriangleMesh } from '../../geometry-kernel/mesh/TriangleMesh.js';
import {
  runGeometryQualityPipeline,
  type GeometryQualityReport
} from '../../geometry-kernel/quality/GeometryQualityPipeline.js';
import { computeAABB } from '../../geometry-kernel/mesh/TriangleMesh.js';

export type CaseValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export type CaseValidationVerdict = 'PASS' | 'WARNING' | 'FAIL';

export interface CaseValidationFinding {
  readonly id: string;
  readonly severity: CaseValidationSeverity;
  readonly objectId?: string;
  readonly archRole?: 'upper' | 'lower';
  readonly message: string;
  readonly code?: string;
}

export interface CaseObjectValidation {
  readonly objectId: string;
  readonly archRole: 'upper' | 'lower' | undefined;
  readonly quality: GeometryQualityReport;
  readonly findings: readonly CaseValidationFinding[];
}

export interface ClinicalCaseValidationReport {
  readonly version: string;
  readonly verdict: CaseValidationVerdict;
  readonly findings: readonly CaseValidationFinding[];
  readonly objects: readonly CaseObjectValidation[];
  readonly hasUpper: boolean;
  readonly hasLower: boolean;
  readonly validatedAt: number;
  readonly timingMs: number;
}

export const CASE_VALIDATION_VERSION = 'clinical-case-validation-v1';

export interface ValidateClinicalCaseInput {
  readonly document: ClinicalDocumentSnapshot;
  readonly meshes: ReadonlyMap<string, TriangleMesh>;
  readonly now?: number;
  /** When true, missing dual arch is ERROR; otherwise WARNING. */
  readonly requireDualArch?: boolean;
}

const freezeFinding = (f: CaseValidationFinding): CaseValidationFinding => Object.freeze(f);

const classifyQuality = (
  obj: ClinicalMeshDescriptor,
  quality: GeometryQualityReport
): CaseValidationFinding[] => {
  const findings: CaseValidationFinding[] = [];
  const base = {
    objectId: obj.id as string,
    ...(obj.archRole !== undefined ? { archRole: obj.archRole } : {})
  };

  if (quality.stats.vertexCount === 0 || quality.stats.triangleCount === 0) {
    findings.push(
      freezeFinding({
        ...base,
        id: 'empty-mesh',
        severity: 'ERROR',
        message: 'Mesh has no vertices or triangles',
        code: 'EMPTY_MESH'
      })
    );
  }

  for (const code of quality.codes) {
    const severity: CaseValidationSeverity =
      code === 'INPUT_INVALID' || code === 'TOPOLOGY_INVALID' ? 'ERROR' : 'WARNING';
    findings.push(
      freezeFinding({
        ...base,
        id: `quality-${code}`,
        severity,
        message: `Geometry quality code: ${code}`,
        code
      })
    );
  }

  for (const warning of quality.warnings) {
    // Open dental scans commonly have boundaries — INFO unless extreme.
    const severity: CaseValidationSeverity = /Non-manifold|Non-finite|Empty mesh/i.test(warning)
      ? 'ERROR'
      : /boundary|Duplicate|Degenerate|components|Normals missing|Self-intersection/i.test(warning)
        ? 'WARNING'
        : 'INFO';
    // Avoid double-counting empty already emitted as ERROR
    if (/Empty mesh/i.test(warning) && findings.some((f) => f.id === 'empty-mesh')) {
      continue;
    }
    findings.push(
      freezeFinding({
        ...base,
        id: `warn-${warning.slice(0, 48)}`,
        severity: severity === 'ERROR' && /Normals missing/i.test(warning) ? 'WARNING' : severity,
        message: warning
      })
    );
  }

  if (quality.stats.boundaryEdges > 0) {
    findings.push(
      freezeFinding({
        ...base,
        id: 'open-boundary',
        severity: 'INFO',
        message: `Open boundary edges: ${String(quality.stats.boundaryEdges)} (expected for dental scans)`
      })
    );
  }

  return findings;
};

const scaleFindings = (
  obj: ClinicalMeshDescriptor,
  mesh: TriangleMesh
): CaseValidationFinding[] => {
  const aabb = computeAABB(mesh.positions);
  const dx = aabb.max[0] - aabb.min[0];
  const dy = aabb.max[1] - aabb.min[1];
  const dz = aabb.max[2] - aabb.min[2];
  const diag = Math.hypot(dx, dy, dz);
  const findings: CaseValidationFinding[] = [];
  const base = {
    objectId: obj.id as string,
    ...(obj.archRole !== undefined ? { archRole: obj.archRole } : {})
  };

  if (!(diag > 0) || !Number.isFinite(diag)) {
    findings.push(
      freezeFinding({
        ...base,
        id: 'degenerate-bounds',
        severity: 'ERROR',
        message: 'Mesh bounds are degenerate'
      })
    );
    return findings;
  }

  // Clinical dental arches are typically tens of mm; reject absurd units.
  if (diag < 1) {
    findings.push(
      freezeFinding({
        ...base,
        id: 'scale-too-small',
        severity: 'WARNING',
        message: `Diagonal ${diag.toFixed(3)} looks too small for mm dental scans — check units`
      })
    );
  } else if (diag > 500) {
    findings.push(
      freezeFinding({
        ...base,
        id: 'scale-too-large',
        severity: 'WARNING',
        message: `Diagonal ${diag.toFixed(1)} looks too large for mm dental scans — check units`
      })
    );
  } else {
    findings.push(
      freezeFinding({
        ...base,
        id: 'scale-ok',
        severity: 'INFO',
        message: `Bounds diagonal ${diag.toFixed(2)} (mm-scale assumed)`
      })
    );
  }
  return findings;
};

export const validateClinicalCase = (
  input: ValidateClinicalCaseInput
): ClinicalCaseValidationReport => {
  const started = performance.now();
  const now = input.now ?? Date.now();
  const doc = input.document;
  const findings: CaseValidationFinding[] = [];
  const objects: CaseObjectValidation[] = [];

  if (doc.objects.length === 0) {
    findings.push(
      freezeFinding({
        id: 'no-meshes',
        severity: 'ERROR',
        message: 'Case has no imported mesh objects'
      })
    );
  }

  const hasUpper = doc.objects.some((o) => o.archRole === 'upper');
  const hasLower = doc.objects.some((o) => o.archRole === 'lower');
  if (!hasUpper || !hasLower) {
    findings.push(
      freezeFinding({
        id: 'dual-arch',
        severity: input.requireDualArch === true ? 'ERROR' : 'WARNING',
        message: !hasUpper && !hasLower
          ? 'Neither upper nor lower arch assigned'
          : !hasUpper
            ? 'Upper arch missing'
            : 'Lower arch missing'
      })
    );
  }

  for (const obj of doc.objects) {
    const mesh = input.meshes.get(obj.id as string);
    if (mesh === undefined) {
      const missing = freezeFinding({
        id: 'mesh-missing',
        severity: 'ERROR',
        objectId: obj.id as string,
        ...(obj.archRole !== undefined ? { archRole: obj.archRole } : {}),
        message: `No MeshRegistry geometry for ${obj.displayName}`
      });
      findings.push(missing);
      objects.push(
        Object.freeze({
          objectId: obj.id as string,
          archRole: obj.archRole,
          quality: Object.freeze({
            ok: false,
            codes: Object.freeze(['INPUT_INVALID'] as const),
            warnings: Object.freeze(['Mesh buffer missing']),
            stats: Object.freeze({
              vertexCount: 0,
              triangleCount: 0,
              boundaryEdges: 0,
              nonManifoldEdges: 0,
              components: 0,
              degenerateCount: 0,
              duplicateVertexEstimate: 0
            }),
            timingMs: 0,
            spatialReady: false
          }),
          findings: Object.freeze([missing])
        })
      );
      continue;
    }

    const quality = runGeometryQualityPipeline(mesh);
    const objFindings = [
      ...classifyQuality(obj, quality),
      ...scaleFindings(obj, mesh)
    ];
    findings.push(...objFindings);
    objects.push(
      Object.freeze({
        objectId: obj.id as string,
        archRole: obj.archRole,
        quality,
        findings: Object.freeze(objFindings)
      })
    );
  }

  const hasError = findings.some((f) => f.severity === 'ERROR');
  const hasWarning = findings.some((f) => f.severity === 'WARNING');
  const verdict: CaseValidationVerdict = hasError ? 'FAIL' : hasWarning ? 'WARNING' : 'PASS';

  return Object.freeze({
    version: CASE_VALIDATION_VERSION,
    verdict,
    findings: Object.freeze(findings),
    objects: Object.freeze(objects),
    hasUpper,
    hasLower,
    validatedAt: now,
    timingMs: performance.now() - started
  });
};
