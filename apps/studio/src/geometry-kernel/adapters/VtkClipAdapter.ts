/**
 * VTK specialized clipping adapter scaffold (PROD-001R).
 *
 * Offline benchmarks on upper/lower.stl show vtkClipPolyData performs real
 * cell cutting (~180–225ms plane clip). This adapter is NOT linked into the
 * Studio UI thread; a native/WASM worker must host VTK.
 */

import { GeometryKernelError } from '../errors.js';
import type { GeometryBackend } from './GeometryBackend.js';
import type { TriangleMesh } from '../mesh/TriangleMesh.js';
import type { GeometryQualityReport } from '../quality/GeometryQualityPipeline.js';
import type { SpatialIndex } from '../spatial/SpatialIndex.js';
import type { TrimMeshOptions, TrimMeshResult } from '../ops/trimMesh.js';
import type { CloseBaseOptions, CloseBaseResult } from '../ops/closeBaseMesh.js';
import type { DisplayMeshOptions, DisplayMeshResult } from '../ops/displayMesh.js';

export class VtkClipAdapter implements GeometryBackend {
  public readonly name = 'vtk-clip-polydata-scaffold';

  public validate(_mesh: TriangleMesh): GeometryQualityReport {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'VTK adapter requires native/worker binding (not loaded in browser)'
    );
  }

  public buildSpatialIndex(_mesh: TriangleMesh): SpatialIndex {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'VTK adapter requires native/worker binding (not loaded in browser)'
    );
  }

  public trim(_mesh: TriangleMesh, _options: TrimMeshOptions): TrimMeshResult {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'VTK vtkClipPolyData selected as specialized clipping backend (PROD-001R) but native/worker runtime is not wired. Plane-clip evidence exists; polygon-boundary cutter not yet bound.'
    );
  }

  public closeBase(_mesh: TriangleMesh, _options: CloseBaseOptions): CloseBaseResult {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'VTK fill-holes evaluated offline; not approved as authoritative close-base without worker + quality gates'
    );
  }

  public prepareDisplay(_mesh: TriangleMesh, _options?: DisplayMeshOptions): DisplayMeshResult {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'VTK must not be used for viewport rendering'
    );
  }
}
