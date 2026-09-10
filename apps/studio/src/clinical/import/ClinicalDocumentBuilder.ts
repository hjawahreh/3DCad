/**
 * ClinicalDocumentBuilder — maps Import Runtime results into immutable clinical objects.
 * No mesh buffers; descriptors only.
 */

import type { ImmutableImportedDocument } from '@cad-studio/import-runtime';
import type { ImportRequest } from '@cad-studio/import-runtime';
import {
  withClinicalObjects,
  type ClinicalDocumentSnapshot,
  type LengthUnit
} from '../document/ClinicalDocument.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  inferMeshFormat,
  type ClinicalMeshDescriptor
} from './ClinicalMeshDescriptor.js';
import { clinicalFailure, clinicalSuccess, type ClinicalResult } from '../runtime/types.js';

export interface DocumentBuildInput {
  readonly document: ClinicalDocumentSnapshot;
  readonly request: ImportRequest;
  readonly imported: ImmutableImportedDocument;
  readonly now: number;
  readonly units?: LengthUnit;
}

const parseOptionalInt = (value: string | undefined): number | undefined => {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};

const boundsFromAttributes = (
  attributes: Readonly<Record<string, string>>
): ClinicalMeshDescriptor['bounds'] => {
  const minX = Number(attributes['bounds.min.x']);
  const minY = Number(attributes['bounds.min.y']);
  const minZ = Number(attributes['bounds.min.z']);
  const maxX = Number(attributes['bounds.max.x']);
  const maxY = Number(attributes['bounds.max.y']);
  const maxZ = Number(attributes['bounds.max.z']);
  if (
    [minX, minY, minZ, maxX, maxY, maxZ].every((n) => Number.isFinite(n)) &&
    maxX >= minX &&
    maxY >= minY &&
    maxZ >= minZ
  ) {
    return Object.freeze({
      min: Object.freeze({ x: minX, y: minY, z: minZ }),
      max: Object.freeze({ x: maxX, y: maxY, z: maxZ })
    });
  }
  return DEFAULT_MESH_BOUNDS;
};

export class ClinicalDocumentBuilder {
  public buildDescriptors(input: DocumentBuildInput): ClinicalResult<readonly ClinicalMeshDescriptor[]> {
    if (input.imported.entities.length === 0) {
      return clinicalFailure('validation', 'Importer returned no entities');
    }
    const format = inferMeshFormat(input.request.extension);
    const units = input.units ?? input.document.units;
    const descriptors = input.imported.entities.map((entity, index) => {
      const id = asClinicalObjectId(
        `${input.document.caseId as string}:${entity.id}:${String(input.now)}:${String(index)}`
      );
      const descriptor: ClinicalMeshDescriptor = Object.freeze({
        id,
        displayName: entity.sourceName ?? input.request.fileName,
        sourceFile: input.request.source as string,
        format,
        units,
        bounds: boundsFromAttributes(entity.attributes),
        vertexCount: parseOptionalInt(entity.attributes.vertexCount),
        faceCount: parseOptionalInt(entity.attributes.faceCount),
        importedAt: input.now,
        visible: true,
        selectable: true,
        hierarchyParentId: undefined,
        importerId: input.imported.importerId as string,
        sourceEntityId: entity.id,
        displayState: 'default',
        transform: IDENTITY_CLINICAL_TRANSFORM
      });
      return descriptor;
    });
    return clinicalSuccess(Object.freeze(descriptors));
  }

  public appendToDocument(input: DocumentBuildInput): ClinicalResult<ClinicalDocumentSnapshot> {
    const built = this.buildDescriptors(input);
    if (!built.ok) {
      return built;
    }
    const existingIds = new Set(input.document.objects.map((o) => o.id as string));
    const merged = [...input.document.objects];
    for (const obj of built.value) {
      if (existingIds.has(obj.id as string)) {
        return clinicalFailure('conflict', `Duplicate clinical object ${obj.id}`);
      }
      merged.push(obj);
    }
    return clinicalSuccess(withClinicalObjects(input.document, merged, input.now));
  }
}
