/**
 * Clinical document model — case metadata + immutable mesh object descriptors.
 */

import {
  asClinicalCaseId,
  asClinicalRevision,
  type ClinicalCaseId,
  type ClinicalRevision
} from '../runtime/types.js';
import type { ClinicalMeshDescriptor } from '../import/ClinicalMeshDescriptor.js';
import type {
  OrientationConfidence
} from '../orientation/ClinicalAutoOrientationEstimator.js';

export type LengthUnit = 'mm' | 'cm' | 'm' | 'in';
export type CoordinateSystem = 'rhs-y-up' | 'rhs-z-up';

export interface PatientMetadata {
  readonly patientId: string;
  readonly displayName: string;
  readonly chartNumber: string | undefined;
  readonly notes: string | undefined;
}

export interface CaseMetadata {
  readonly caseId: ClinicalCaseId;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly clinician: string | undefined;
  readonly practice: string | undefined;
  readonly tags: readonly string[];
}

export interface DisplaySettings {
  readonly showGrid: boolean;
  readonly showOrigin: boolean;
  readonly showAxes: boolean;
  readonly background: 'dark' | 'neutral';
}

/** Compact accepted/estimated orientation metadata (no mesh payloads). */
export interface ClinicalOrientationMeta {
  readonly algorithmVersion: string;
  readonly confidence: OrientationConfidence;
  readonly source: 'auto' | 'manual';
  readonly method: string;
  readonly hasUpper: boolean;
  readonly hasLower: boolean;
  readonly warnings: readonly string[];
  readonly estimatedAt: number;
  readonly acceptedAt: number | undefined;
}

/** Compact preparation metadata (no mesh payloads). */
export interface ClinicalPreparationMeta {
  readonly algorithmVersion: string;
  readonly uiState: 'ready' | 'warning' | 'failed';
  readonly sourceFingerprint: string;
  readonly warningCount: number;
  readonly archCount: number;
  readonly preparedAt: number;
  readonly timingMs: number;
  readonly message: string;
}

export interface ClinicalDocumentSnapshot {
  readonly caseId: ClinicalCaseId;
  readonly revision: ClinicalRevision;
  readonly patient: PatientMetadata;
  readonly caseMeta: CaseMetadata;
  readonly units: LengthUnit;
  readonly coordinateSystem: CoordinateSystem;
  readonly display: DisplaySettings;
  readonly objects: readonly ClinicalMeshDescriptor[];
  readonly orientationMeta: ClinicalOrientationMeta | undefined;
  readonly preparationMeta: ClinicalPreparationMeta | undefined;
  readonly dirty: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = Object.freeze({
  showGrid: true,
  showOrigin: true,
  showAxes: true,
  background: 'dark'
});

export interface CreateClinicalDocumentInput {
  readonly name?: string;
  readonly patientName?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly patientId?: string;
  readonly chartNumber?: string;
  readonly notes?: string;
  readonly now: number;
}

const resolvePatientDisplayName = (input: CreateClinicalDocumentInput): string => {
  if (input.patientName !== undefined && input.patientName.trim().length > 0) {
    return input.patientName.trim();
  }
  const parts = [input.firstName, input.lastName]
    .map((p) => p?.trim())
    .filter((p): p is string => p !== undefined && p.length > 0);
  if (parts.length > 0) {
    return parts.join(' ');
  }
  return 'Unassigned Patient';
};

export const createEmptyClinicalDocument = (
  input: CreateClinicalDocumentInput
): ClinicalDocumentSnapshot => {
  const caseId = asClinicalCaseId(`case-${String(input.now)}`);
  const name =
    input.name !== undefined && input.name.trim().length > 0
      ? input.name.trim()
      : 'Untitled Case';
  const patientName = resolvePatientDisplayName(input);
  const chartNumber =
    input.chartNumber !== undefined && input.chartNumber.trim().length > 0
      ? input.chartNumber.trim()
      : input.patientId !== undefined && input.patientId.trim().length > 0
        ? input.patientId.trim()
        : undefined;
  const notes =
    input.notes !== undefined && input.notes.trim().length > 0 ? input.notes.trim() : undefined;
  const patientId =
    input.patientId !== undefined && input.patientId.trim().length > 0
      ? input.patientId.trim()
      : `patient-${String(input.now)}`;
  return Object.freeze({
    caseId,
    revision: asClinicalRevision(1),
    patient: Object.freeze({
      patientId,
      displayName: patientName,
      chartNumber,
      notes
    }),
    caseMeta: Object.freeze({
      caseId,
      name,
      createdAt: input.now,
      updatedAt: input.now,
      clinician: undefined,
      practice: undefined,
      tags: Object.freeze([])
    }),
    units: 'mm',
    coordinateSystem: 'rhs-y-up',
    display: DEFAULT_DISPLAY_SETTINGS,
    objects: Object.freeze([]),
    orientationMeta: undefined,
    preparationMeta: undefined,
    dirty: false,
    createdAt: input.now,
    updatedAt: input.now
  });
};

export const bumpClinicalRevision = (
  doc: ClinicalDocumentSnapshot,
  now: number,
  dirty = true
): ClinicalDocumentSnapshot =>
  Object.freeze({
    ...doc,
    revision: asClinicalRevision((doc.revision as number) + 1),
    dirty,
    updatedAt: now,
    caseMeta: Object.freeze({ ...doc.caseMeta, updatedAt: now })
  });

export const withDisplaySettings = (
  doc: ClinicalDocumentSnapshot,
  display: Partial<DisplaySettings>,
  now: number
): ClinicalDocumentSnapshot =>
  bumpClinicalRevision(
    Object.freeze({
      ...doc,
      display: Object.freeze({ ...doc.display, ...display })
    }),
    now,
    true
  );

export const withClinicalObjects = (
  doc: ClinicalDocumentSnapshot,
  objects: readonly ClinicalMeshDescriptor[],
  now: number
): ClinicalDocumentSnapshot =>
  bumpClinicalRevision(
    Object.freeze({
      ...doc,
      objects: Object.freeze([...objects])
    }),
    now,
    true
  );

export const withOrientationMeta = (
  doc: ClinicalDocumentSnapshot,
  orientationMeta: ClinicalOrientationMeta | undefined,
  now: number
): ClinicalDocumentSnapshot =>
  bumpClinicalRevision(
    Object.freeze({
      ...doc,
      orientationMeta:
        orientationMeta === undefined
          ? undefined
          : Object.freeze({
              ...orientationMeta,
              warnings: Object.freeze([...orientationMeta.warnings])
            })
    }),
    now,
    true
  );

export const withPreparationMeta = (
  doc: ClinicalDocumentSnapshot,
  preparationMeta: ClinicalPreparationMeta | undefined,
  now: number
): ClinicalDocumentSnapshot =>
  bumpClinicalRevision(
    Object.freeze({
      ...doc,
      preparationMeta:
        preparationMeta === undefined ? undefined : Object.freeze({ ...preparationMeta })
    }),
    now,
    true
  );

export const unionBounds = (
  objects: readonly ClinicalMeshDescriptor[]
): ClinicalMeshDescriptor['bounds'] | undefined => {
  if (objects.length === 0) {
    return undefined;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const obj of objects) {
    minX = Math.min(minX, obj.bounds.min.x);
    minY = Math.min(minY, obj.bounds.min.y);
    minZ = Math.min(minZ, obj.bounds.min.z);
    maxX = Math.max(maxX, obj.bounds.max.x);
    maxY = Math.max(maxY, obj.bounds.max.y);
    maxZ = Math.max(maxZ, obj.bounds.max.z);
  }
  return Object.freeze({
    min: Object.freeze({ x: minX, y: minY, z: minZ }),
    max: Object.freeze({ x: maxX, y: maxY, z: maxZ })
  });
};

/** World-space AABB after applying each object's orientation transform to its local bounds. */
export const unionOrientedBounds = (
  objects: readonly ClinicalMeshDescriptor[]
): ClinicalMeshDescriptor['bounds'] | undefined => {
  if (objects.length === 0) {
    return undefined;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const obj of objects) {
    const e = obj.transform.elements;
    const corners: Array<readonly [number, number, number]> = [
      [obj.bounds.min.x, obj.bounds.min.y, obj.bounds.min.z],
      [obj.bounds.max.x, obj.bounds.min.y, obj.bounds.min.z],
      [obj.bounds.min.x, obj.bounds.max.y, obj.bounds.min.z],
      [obj.bounds.max.x, obj.bounds.max.y, obj.bounds.min.z],
      [obj.bounds.min.x, obj.bounds.min.y, obj.bounds.max.z],
      [obj.bounds.max.x, obj.bounds.min.y, obj.bounds.max.z],
      [obj.bounds.min.x, obj.bounds.max.y, obj.bounds.max.z],
      [obj.bounds.max.x, obj.bounds.max.y, obj.bounds.max.z]
    ];
    for (const [x, y, z] of corners) {
      const wx = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
      const wy = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
      const wz = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
      minX = Math.min(minX, wx);
      minY = Math.min(minY, wy);
      minZ = Math.min(minZ, wz);
      maxX = Math.max(maxX, wx);
      maxY = Math.max(maxY, wy);
      maxZ = Math.max(maxZ, wz);
    }
  }
  return Object.freeze({
    min: Object.freeze({ x: minX, y: minY, z: minZ }),
    max: Object.freeze({ x: maxX, y: maxY, z: maxZ })
  });
};
