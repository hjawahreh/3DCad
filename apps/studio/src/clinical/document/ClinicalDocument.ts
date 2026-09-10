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

export interface ClinicalDocumentSnapshot {
  readonly caseId: ClinicalCaseId;
  readonly revision: ClinicalRevision;
  readonly patient: PatientMetadata;
  readonly caseMeta: CaseMetadata;
  readonly units: LengthUnit;
  readonly coordinateSystem: CoordinateSystem;
  readonly display: DisplaySettings;
  readonly objects: readonly ClinicalMeshDescriptor[];
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

export const createEmptyClinicalDocument = (input: {
  readonly name?: string;
  readonly patientName?: string;
  readonly now: number;
}): ClinicalDocumentSnapshot => {
  const caseId = asClinicalCaseId(`case-${String(input.now)}`);
  const name = input.name ?? 'Untitled Case';
  const patientName = input.patientName ?? 'Unassigned Patient';
  return Object.freeze({
    caseId,
    revision: asClinicalRevision(1),
    patient: Object.freeze({
      patientId: `patient-${String(input.now)}`,
      displayName: patientName,
      chartNumber: undefined,
      notes: undefined
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
