/**
 * Geometry backend abstraction — adapters must not leak third-party types upward.
 */

import type { TriangleMesh } from '../mesh/TriangleMesh.js';
import type { SpatialIndex } from '../spatial/SpatialIndex.js';
import type { GeometryQualityReport } from '../quality/GeometryQualityPipeline.js';
import { runGeometryQualityPipeline } from '../quality/GeometryQualityPipeline.js';
import { buildSpatialIndex } from '../spatial/SpatialIndex.js';
import { trimMesh, type TrimMeshOptions, type TrimMeshResult } from '../ops/trimMesh.js';
import {
  closeBaseMesh,
  type CloseBaseOptions,
  type CloseBaseResult
} from '../ops/closeBaseMesh.js';
import {
  prepareDisplayMesh,
  type DisplayMeshOptions,
  type DisplayMeshResult
} from '../ops/displayMesh.js';

export interface GeometryBackend {
  readonly name: string;
  validate(mesh: TriangleMesh): GeometryQualityReport;
  buildSpatialIndex(mesh: TriangleMesh): SpatialIndex;
  trim(mesh: TriangleMesh, options: TrimMeshOptions): TrimMeshResult;
  closeBase(mesh: TriangleMesh, options: CloseBaseOptions): CloseBaseResult;
  prepareDisplay(mesh: TriangleMesh, options?: DisplayMeshOptions): DisplayMeshResult;
}

export class NativeReferenceBackend implements GeometryBackend {
  public readonly name = 'clinical-reference-v1';

  public validate(mesh: TriangleMesh): GeometryQualityReport {
    return runGeometryQualityPipeline(mesh);
  }

  public buildSpatialIndex(mesh: TriangleMesh): SpatialIndex {
    return buildSpatialIndex(mesh);
  }

  public trim(mesh: TriangleMesh, options: TrimMeshOptions): TrimMeshResult {
    return trimMesh(mesh, options);
  }

  public closeBase(mesh: TriangleMesh, options: CloseBaseOptions): CloseBaseResult {
    return closeBaseMesh(mesh, options);
  }

  public prepareDisplay(mesh: TriangleMesh, options?: DisplayMeshOptions): DisplayMeshResult {
    return prepareDisplayMesh(mesh, options);
  }
}
