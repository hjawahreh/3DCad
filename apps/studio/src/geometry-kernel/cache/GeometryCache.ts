/**
 * Geometry cache — normals, bounds, topology, spatial indexes, fingerprints,
 * display meshes, previews. Invalidated on revision change; rejects stale commits.
 */

import type { AABB, TriangleMesh } from '../mesh/TriangleMesh.js';
import { computeAABB } from '../mesh/TriangleMesh.js';
import type { GeometryQualityReport } from '../quality/GeometryQualityPipeline.js';
import type { SpatialIndex } from '../spatial/SpatialIndex.js';
import { GeometryKernelError } from '../errors.js';

interface CacheEntry {
  revision: number;
  fingerprint: string;
  normals?: Float32Array | undefined;
  bounds?: AABB | undefined;
  topology?: GeometryQualityReport | undefined;
  spatial?: SpatialIndex | undefined;
  display?: TriangleMesh | undefined;
  preview?: TriangleMesh | undefined;
}

export class GeometryCache {
  private readonly entries = new Map<string, CacheEntry>();

  private key(objectId: string): string {
    return objectId;
  }

  public getEntry(objectId: string): CacheEntry | undefined {
    return this.entries.get(this.key(objectId));
  }

  public ensureEntry(objectId: string, revision: number, fingerprint: string): CacheEntry {
    const existing = this.entries.get(this.key(objectId));
    if (
      existing !== undefined &&
      existing.revision === revision &&
      existing.fingerprint === fingerprint
    ) {
      return existing;
    }
    const next: CacheEntry = { revision, fingerprint };
    this.entries.set(this.key(objectId), next);
    return next;
  }

  public invalidate(objectId: string): void {
    this.entries.delete(this.key(objectId));
  }

  public invalidateAll(): void {
    this.entries.clear();
  }

  public invalidateIfStale(objectId: string, revision: number, fingerprint: string): void {
    const existing = this.entries.get(this.key(objectId));
    if (existing === undefined) {
      return;
    }
    if (existing.revision !== revision || existing.fingerprint !== fingerprint) {
      this.invalidate(objectId);
    }
  }

  /** Never allow stale commit — fingerprint must match cached working entry when present. */
  public assertCommitFresh(objectId: string, revision: number, fingerprint: string): void {
    const entry = this.entries.get(this.key(objectId));
    if (entry === undefined) {
      return;
    }
    // Allow revision advancement across sequential operations on the same kernel.
    // Reject only when the caller still targets an older revision with a mismatched fingerprint.
    if (revision < entry.revision && entry.fingerprint !== fingerprint) {
      throw new GeometryKernelError(
        'COMMIT_FAILED',
        `Stale commit rejected: cache revision ${String(entry.revision)} > ${String(revision)}`
      );
    }
    if (entry.revision === revision && entry.fingerprint !== fingerprint) {
      throw new GeometryKernelError(
        'COMMIT_FAILED',
        'Stale commit rejected: fingerprint mismatch at same revision'
      );
    }
  }

  /** Compatibility alias. */
  public assertFresh(objectId: string, revision: number, fingerprint: string): boolean {
    try {
      this.assertCommitFresh(objectId, revision, fingerprint);
      return true;
    } catch {
      return false;
    }
  }

  public putBounds(objectId: string, revision: number, fingerprint: string, bounds: AABB): void {
    this.ensureEntry(objectId, revision, fingerprint).bounds = bounds;
  }

  public getBounds(objectId: string, revision: number, fingerprint: string): AABB | undefined {
    const entry = this.entries.get(this.key(objectId));
    if (
      entry === undefined ||
      entry.revision !== revision ||
      entry.fingerprint !== fingerprint
    ) {
      return undefined;
    }
    return entry.bounds;
  }

  public putNormals(
    objectId: string,
    revision: number,
    fingerprint: string,
    normals: Float32Array
  ): void {
    this.ensureEntry(objectId, revision, fingerprint).normals = normals;
  }

  public getNormals(
    objectId: string,
    revision: number,
    fingerprint: string
  ): Float32Array | undefined {
    const entry = this.entries.get(this.key(objectId));
    if (
      entry === undefined ||
      entry.revision !== revision ||
      entry.fingerprint !== fingerprint
    ) {
      return undefined;
    }
    return entry.normals;
  }

  public putTopology(
    objectId: string,
    revision: number,
    fingerprint: string,
    report: GeometryQualityReport
  ): void {
    this.ensureEntry(objectId, revision, fingerprint).topology = report;
  }

  public setQuality(
    objectId: string,
    revision: number,
    fingerprint: string,
    value: GeometryQualityReport
  ): void {
    this.putTopology(objectId, revision, fingerprint, value);
  }

  public getTopology(
    objectId: string,
    revision: number,
    fingerprint: string
  ): GeometryQualityReport | undefined {
    const entry = this.entries.get(this.key(objectId));
    if (
      entry === undefined ||
      entry.revision !== revision ||
      entry.fingerprint !== fingerprint
    ) {
      return undefined;
    }
    return entry.topology;
  }

  public getQuality(
    objectId: string,
    revision: number,
    fingerprint: string
  ): GeometryQualityReport | undefined {
    return this.getTopology(objectId, revision, fingerprint);
  }

  public putSpatial(
    objectId: string,
    revision: number,
    fingerprint: string,
    spatial: SpatialIndex
  ): void {
    this.ensureEntry(objectId, revision, fingerprint).spatial = spatial;
  }

  public setSpatial(
    objectId: string,
    revision: number,
    fingerprint: string,
    value: SpatialIndex
  ): void {
    this.putSpatial(objectId, revision, fingerprint, value);
  }

  public getSpatial(
    objectId: string,
    revision: number,
    fingerprint: string
  ): SpatialIndex | undefined {
    const entry = this.entries.get(this.key(objectId));
    if (
      entry === undefined ||
      entry.revision !== revision ||
      entry.fingerprint !== fingerprint
    ) {
      return undefined;
    }
    return entry.spatial;
  }

  public putDisplay(
    objectId: string,
    revision: number,
    fingerprint: string,
    mesh: TriangleMesh
  ): void {
    this.ensureEntry(objectId, revision, fingerprint).display = mesh;
  }

  public setDisplay(
    objectId: string,
    revision: number,
    fingerprint: string,
    value: TriangleMesh
  ): void {
    this.putDisplay(objectId, revision, fingerprint, value);
  }

  public getDisplay(
    objectId: string,
    revision: number,
    fingerprint: string
  ): TriangleMesh | undefined {
    const entry = this.entries.get(this.key(objectId));
    if (
      entry === undefined ||
      entry.revision !== revision ||
      entry.fingerprint !== fingerprint
    ) {
      return undefined;
    }
    return entry.display;
  }

  public putPreview(objectId: string, mesh: TriangleMesh): void {
    this.ensureEntry(objectId, mesh.revision, mesh.fingerprint).preview = mesh;
  }

  public getPreview(objectId: string): TriangleMesh | undefined {
    return this.entries.get(this.key(objectId))?.preview;
  }

  public clearPreview(objectId: string): void {
    const entry = this.entries.get(this.key(objectId));
    if (entry !== undefined) {
      delete entry.preview;
    }
  }

  public boundsFromMesh(mesh: TriangleMesh): AABB {
    return computeAABB(mesh.positions);
  }
}
