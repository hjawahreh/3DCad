/**
 * Open3D adapter (PROD-001R).
 *
 * Offline evidence (Open3D 0.19.0):
 * - Legacy TriangleMesh has NO clip_plane.
 * - Tensor TriangleMesh.clip_plane succeeds on open dental STLs and matches
 *   VTK face-count deltas on upper/lower fixtures.
 * - Boolean ops require watertight inputs — our scans are open → rejected.
 * - fill_holes doubled triangle counts and still left meshes non-watertight
 *   (~48–53s) — NOT approved for clinical close-base.
 *
 * This scaffold remains unlinked in the Studio browser path. Native/worker
 * binding required. Types must not leak to React/clinical contracts.
 */

import { GeometryKernelError } from '../errors.js';
import type { GeometryBackend } from './GeometryBackend.js';
import type { TriangleMesh } from '../mesh/TriangleMesh.js';
import type { GeometryQualityReport } from '../quality/GeometryQualityPipeline.js';
import type { SpatialIndex } from '../spatial/SpatialIndex.js';
import type { TrimMeshOptions, TrimMeshResult } from '../ops/trimMesh.js';
import type { CloseBaseOptions, CloseBaseResult } from '../ops/closeBaseMesh.js';
import type { DisplayMeshOptions, DisplayMeshResult } from '../ops/displayMesh.js';

export class Open3DAdapter implements GeometryBackend {
  public readonly name = 'open3d-scaffold';

  public validate(_mesh: TriangleMesh): GeometryQualityReport {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'Open3D validation adapter requires native/worker binding (PROD-001R eval only)'
    );
  }

  public buildSpatialIndex(_mesh: TriangleMesh): SpatialIndex {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'Open3D spatial adapter requires native/worker binding'
    );
  }

  public trim(_mesh: TriangleMesh, _options: TrimMeshOptions): TrimMeshResult {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'Open3D tensor clip_plane is a specialized clipping candidate (plane cuts). Clinical polygon-boundary trim is not mapped in-browser.'
    );
  }

  public closeBase(_mesh: TriangleMesh, _options: CloseBaseOptions): CloseBaseResult {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'Open3D fill_holes failed quality gates on real dental fixtures (non-watertight + triangle doubling)'
    );
  }

  public prepareDisplay(_mesh: TriangleMesh, _options?: DisplayMeshOptions): DisplayMeshResult {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'Open3D is not the viewport renderer'
    );
  }
}
