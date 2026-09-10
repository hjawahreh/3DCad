/**
 * Display-only mesh optimization wrapper over prepareDisplayMesh.
 * Does not mutate authoritative clinical / working meshes.
 */

import type { TriangleMesh } from '../mesh/TriangleMesh.js';
import {
  prepareDisplayMesh,
  type DisplayMeshOptions,
  type DisplayMeshResult
} from '../ops/displayMesh.js';
import type { GeometryBackend } from './GeometryBackend.js';
import { GeometryKernelError } from '../errors.js';
import type { GeometryQualityReport } from '../quality/GeometryQualityPipeline.js';
import type { SpatialIndex } from '../spatial/SpatialIndex.js';
import type { TrimMeshOptions, TrimMeshResult } from '../ops/trimMesh.js';
import type { CloseBaseOptions, CloseBaseResult } from '../ops/closeBaseMesh.js';

export class MeshOptimizationAdapter implements GeometryBackend {
  public readonly name = 'mesh-optimization-display';

  public constructor(private readonly inner?: GeometryBackend) {}

  public validate(mesh: TriangleMesh): GeometryQualityReport {
    if (this.inner === undefined) {
      throw new GeometryKernelError(
        'UNSUPPORTED_OPERATION',
        'MeshOptimizationAdapter is display-only; no validate backend'
      );
    }
    return this.inner.validate(mesh);
  }

  public buildSpatialIndex(mesh: TriangleMesh): SpatialIndex {
    if (this.inner === undefined) {
      throw new GeometryKernelError(
        'UNSUPPORTED_OPERATION',
        'MeshOptimizationAdapter is display-only; no spatial backend'
      );
    }
    return this.inner.buildSpatialIndex(mesh);
  }

  public trim(mesh: TriangleMesh, options: TrimMeshOptions): TrimMeshResult {
    if (this.inner === undefined) {
      throw new GeometryKernelError(
        'UNSUPPORTED_OPERATION',
        'MeshOptimizationAdapter is display-only; trim delegated only when wrapped'
      );
    }
    return this.inner.trim(mesh, options);
  }

  public closeBase(mesh: TriangleMesh, options: CloseBaseOptions): CloseBaseResult {
    if (this.inner === undefined) {
      throw new GeometryKernelError(
        'UNSUPPORTED_OPERATION',
        'MeshOptimizationAdapter is display-only; closeBase delegated only when wrapped'
      );
    }
    return this.inner.closeBase(mesh, options);
  }

  public prepareDisplay(mesh: TriangleMesh, options?: DisplayMeshOptions): DisplayMeshResult {
    return prepareDisplayMesh(mesh, options);
  }
}
