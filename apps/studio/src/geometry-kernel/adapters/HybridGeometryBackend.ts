/**
 * Hybrid geometry backend (PROD-001T).
 * Prefers VTK HTTP worker when healthy + loop3d present; otherwise clinical-reference.
 */

import type { AsyncGeometryBackend } from './AsyncGeometryBackend.js';
import { NativeReferenceBackend, type GeometryBackend } from './GeometryBackend.js';
import { VtkHttpWorkerBackend, probeVtkHttpWorker } from './VtkHttpWorkerBackend.js';
import { GeometryKernelError } from '../errors.js';
import type { TriangleMesh } from '../mesh/TriangleMesh.js';
import type { GeometryQualityReport } from '../quality/GeometryQualityPipeline.js';
import type { SpatialIndex } from '../spatial/SpatialIndex.js';
import type { TrimMeshOptions, TrimMeshResult } from '../ops/trimMesh.js';
import type { CloseBaseOptions, CloseBaseResult } from '../ops/closeBaseMesh.js';
import type { DisplayMeshOptions, DisplayMeshResult } from '../ops/displayMesh.js';

export class HybridGeometryBackend implements AsyncGeometryBackend {
  public readonly name = 'hybrid-vtk-reference-v1';
  private vtkHealthy = false;
  private readonly reference: GeometryBackend;
  private readonly vtk: VtkHttpWorkerBackend;

  public constructor(
    reference: GeometryBackend = new NativeReferenceBackend(),
    vtk: VtkHttpWorkerBackend = new VtkHttpWorkerBackend()
  ) {
    this.reference = reference;
    this.vtk = vtk;
  }

  public async refreshVtkHealth(): Promise<boolean> {
    this.vtkHealthy = await probeVtkHttpWorker();
    return this.vtkHealthy;
  }

  public setVtkHealthy(value: boolean): void {
    this.vtkHealthy = value;
  }

  public get vtkAvailable(): boolean {
    return this.vtkHealthy;
  }

  public validate(mesh: TriangleMesh): GeometryQualityReport {
    return this.reference.validate(mesh);
  }

  public buildSpatialIndex(mesh: TriangleMesh): SpatialIndex {
    return this.reference.buildSpatialIndex(mesh);
  }

  public trim(mesh: TriangleMesh, options: TrimMeshOptions): TrimMeshResult {
    // Sync path: reference only (VTK must be async)
    return this.reference.trim(mesh, options);
  }

  public closeBase(mesh: TriangleMesh, options: CloseBaseOptions): CloseBaseResult {
    return this.reference.closeBase(mesh, options);
  }

  public prepareDisplay(mesh: TriangleMesh, options?: DisplayMeshOptions): DisplayMeshResult {
    return this.reference.prepareDisplay(mesh, options);
  }

  public async trimAsync(
    mesh: TriangleMesh,
    options: TrimMeshOptions,
    signal?: AbortSignal
  ): Promise<TrimMeshResult> {
    const wantVtk =
      options.loop3d !== undefined &&
      options.loop3d.length >= 3 &&
      (options.algorithm === 'vtk-implicit-loop' || options.algorithm === 'vtk-select-polydata');
    if (wantVtk) {
      if (!this.vtkHealthy) {
        await this.refreshVtkHealth();
      }
      if (!this.vtkHealthy) {
        throw new GeometryKernelError(
          'UNSUPPORTED_OPERATION',
          'VTK worker unavailable. Start tools/geometry-backend-bench/vtk_worker_http.py (port 8765).'
        );
      }
      return await this.vtk.trimAsync(mesh, options, signal);
    }
    return this.reference.trim(mesh, options);
  }

  public async closeBaseAsync(
    mesh: TriangleMesh,
    options: CloseBaseOptions,
    signal?: AbortSignal
  ): Promise<CloseBaseResult> {
    void signal;
    // GEO-001D: authoritative Close Base is boundary-driven clinical-base-v2 (reference).
    // VTK HTTP close_base remains a bench/diagnostic path — it must NOT author the
    // clinical base perimeter (historical AABB-slab behavior).
    return this.reference.closeBase(mesh, options);
  }
}
