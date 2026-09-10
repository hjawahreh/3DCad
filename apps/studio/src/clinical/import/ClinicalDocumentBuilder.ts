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
  type ClinicalArchRole,
  type ClinicalMeshDescriptor
} from './ClinicalMeshDescriptor.js';
import { clinicalFailure, clinicalSuccess, type ClinicalResult } from '../runtime/types.js';
import { ARCH_DISPLAY_NAME, ARCH_STABLE_SUFFIX } from './ClinicalMeshParsers.js';

export interface DocumentBuildInput {
  readonly document: ClinicalDocumentSnapshot;
  readonly request: ImportRequest;
  readonly imported: ImmutableImportedDocument;
  readonly now: number;
  readonly units?: LengthUnit;
  readonly archRole?: ClinicalArchRole;
  readonly replaceArch?: boolean;
  /** Real mesh stats from studio parsers (overrides importer attributes). */
  readonly meshStats?: {
    readonly bounds: ClinicalMeshDescriptor['bounds'];
    readonly vertexCount: number;
    readonly faceCount: number;
  };
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
    const archRole =
      input.archRole ??
      (input.request.metadata['clinicalArch'] === 'upper' ||
      input.request.metadata['clinicalArch'] === 'lower'
        ? (input.request.metadata['clinicalArch'] as ClinicalArchRole)
        : undefined);
    const descriptors = input.imported.entities.map((entity, index) => {
      const stableId =
        archRole !== undefined
          ? asClinicalObjectId(
              `${input.document.caseId as string}:${ARCH_STABLE_SUFFIX[archRole]}`
            )
          : asClinicalObjectId(
              `${input.document.caseId as string}:${entity.id}:${String(input.now)}:${String(index)}`
            );
      const displayName =
        archRole !== undefined
          ? ARCH_DISPLAY_NAME[archRole]
          : (entity.sourceName ?? input.request.fileName);
      const descriptor: ClinicalMeshDescriptor = Object.freeze({
        id: stableId,
        displayName,
        sourceFile: input.request.fileName,
        format,
        units,
        bounds: input.meshStats?.bounds ?? boundsFromAttributes(entity.attributes),
        vertexCount: input.meshStats?.vertexCount ?? parseOptionalInt(entity.attributes.vertexCount),
        faceCount: input.meshStats?.faceCount ?? parseOptionalInt(entity.attributes.faceCount),
        importedAt: input.now,
        visible: true,
        selectable: true,
        hierarchyParentId: undefined,
        importerId: input.imported.importerId as string,
        sourceEntityId: archRole !== undefined ? ARCH_STABLE_SUFFIX[archRole] : entity.id,
        displayState: 'default',
        transform: IDENTITY_CLINICAL_TRANSFORM,
        ...(archRole === undefined ? {} : { archRole }),
        ...(entity.attributes.geometryFingerprint !== undefined
          ? { geometryFingerprint: entity.attributes.geometryFingerprint }
          : {})
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
    let merged = [...input.document.objects];
    for (const obj of built.value) {
      const existingIndex = merged.findIndex((o) => o.id === obj.id);
      const sameArchIndex =
        obj.archRole === undefined
          ? -1
          : merged.findIndex((o) => o.archRole === obj.archRole);
      const conflictIndex = existingIndex >= 0 ? existingIndex : sameArchIndex;
      if (conflictIndex >= 0) {
        if (input.replaceArch !== true) {
          const label = obj.archRole !== undefined ? ARCH_DISPLAY_NAME[obj.archRole] : String(obj.id);
          return clinicalFailure(
            'conflict',
            `${label} already contains a scan. Choose Replace to overwrite.`
          );
        }
        merged = merged.filter((_, i) => i !== conflictIndex);
      }
      merged.push(obj);
    }
    return clinicalSuccess(withClinicalObjects(input.document, merged, input.now));
  }
}
