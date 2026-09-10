/**
 * Open3D adapter scaffold — not linked in CLN-008.
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
      'Open3D adapter is scaffolded for future C++ binding'
    );
  }

  public buildSpatialIndex(_mesh: TriangleMesh): SpatialIndex {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'Open3D adapter is scaffolded for future C++ binding'
    );
  }

  public trim(_mesh: TriangleMesh, _options: TrimMeshOptions): TrimMeshResult {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'Open3D adapter is scaffolded for future C++ binding'
    );
  }

  public closeBase(_mesh: TriangleMesh, _options: CloseBaseOptions): CloseBaseResult {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'Open3D adapter is scaffolded for future C++ binding'
    );
  }

  public prepareDisplay(_mesh: TriangleMesh, _options?: DisplayMeshOptions): DisplayMeshResult {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'Open3D adapter is scaffolded for future C++ binding'
    );
  }
}
