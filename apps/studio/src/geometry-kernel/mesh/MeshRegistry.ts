/**
 * Mesh registry — source/working/preview/display roles keyed by handle and objectId.
 */

import { asOpaqueGeometryHandle, type OpaqueGeometryHandle } from '@cad-studio/kernel-bridge';
import {
  cloneMesh,
  createMesh,
  fingerprintMesh,
  type AABB,
  type MeshRole,
  type TriangleMesh
} from './TriangleMesh.js';

export interface EnsureSourceOptions {
  readonly bounds?: AABB;
  readonly gridResolution?: number;
  readonly revision?: number;
}

const DEFAULT_BOUNDS: AABB = {
  min: [-25, -25, 0],
  max: [25, 25, 8]
};

/**
 * Deterministic synthetic open dental-like surface:
 * XY grid with Z height variation (no Math.random).
 */
export const buildSyntheticDentalSurface = (
  objectId: string,
  handleId: number,
  options?: EnsureSourceOptions
): TriangleMesh => {
  const bounds = options?.bounds ?? DEFAULT_BOUNDS;
  const res = Math.max(4, options?.gridResolution ?? 24);
  const revision = options?.revision ?? 0;
  const minX = bounds.min[0];
  const minY = bounds.min[1];
  const maxX = bounds.max[0];
  const maxY = bounds.max[1];
  const zAmp = Math.max(1, bounds.max[2] - bounds.min[2]);
  const dx = (maxX - minX) / res;
  const dy = (maxY - minY) / res;
  const cols = res + 1;
  const rows = res + 1;
  const positions = new Float32Array(cols * rows * 3);
  let pi = 0;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = minX + i * dx;
      const y = minY + j * dy;
      const nx = (i / res) * 2 - 1;
      const ny = (j / res) * 2 - 1;
      const ridge = 1 - Math.min(1, Math.hypot(nx * 0.85, ny * 1.15));
      const z =
        bounds.min[2] +
        zAmp * (0.15 + 0.85 * ridge * ridge) +
        0.35 * Math.sin(i * 0.55) * Math.cos(j * 0.4);
      positions[pi++] = x;
      positions[pi++] = y;
      positions[pi++] = z;
    }
  }
  const indices = new Uint32Array(res * res * 6);
  let ii = 0;
  for (let j = 0; j < res; j += 1) {
    for (let i = 0; i < res; i += 1) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[ii++] = a;
      indices[ii++] = c;
      indices[ii++] = b;
      indices[ii++] = b;
      indices[ii++] = c;
      indices[ii++] = d;
    }
  }
  return createMesh({
    id: handleId,
    objectId,
    role: 'source',
    revision,
    positions,
    indices,
    fingerprint: fingerprintMesh(positions, indices)
  });
};

interface ObjectMeshes {
  source?: TriangleMesh | undefined;
  working?: TriangleMesh | undefined;
  preview?: TriangleMesh | undefined;
  display?: TriangleMesh | undefined;
  revision: number;
}

export class MeshRegistry {
  private readonly byHandle = new Map<number, TriangleMesh>();
  private readonly byObject = new Map<string, ObjectMeshes>();
  private nextHandle = 1;

  public allocateHandle(): OpaqueGeometryHandle {
    return asOpaqueGeometryHandle(this.nextHandle++);
  }

  public register(mesh: TriangleMesh): OpaqueGeometryHandle {
    const handle = asOpaqueGeometryHandle(mesh.id > 0 ? mesh.id : this.nextHandle++);
    const stored =
      mesh.id === (handle as number)
        ? mesh
        : createMesh({
            id: handle as number,
            objectId: mesh.objectId,
            role: mesh.role,
            revision: mesh.revision,
            positions: mesh.positions,
            indices: mesh.indices,
            ...(mesh.normals !== undefined ? { normals: mesh.normals } : {}),
            fingerprint: mesh.fingerprint
          });
    this.byHandle.set(stored.id, stored);
    const entry = this.byObject.get(stored.objectId) ?? { revision: stored.revision };
    entry[stored.role] = stored;
    entry.revision = Math.max(entry.revision, stored.revision);
    this.byObject.set(stored.objectId, entry);
    return handle;
  }

  public getByHandle(handle: OpaqueGeometryHandle | number): TriangleMesh | undefined {
    return this.byHandle.get(handle as number);
  }

  public getByObjectId(objectId: string, role: MeshRole = 'working'): TriangleMesh | undefined {
    const entry = this.byObject.get(objectId);
    if (entry === undefined) {
      return undefined;
    }
    if (role === 'working') {
      return entry.working ?? entry.source;
    }
    return entry[role];
  }

  /**
   * Returns a mutable clone for algorithms. Source mesh itself stays immutable in the registry.
   */
  public cloneForMutation(objectId: string, role: MeshRole = 'working'): TriangleMesh | undefined {
    const mesh = this.getByObjectId(objectId, role) ?? this.getByObjectId(objectId, 'source');
    if (mesh === undefined) {
      return undefined;
    }
    return cloneMesh(mesh);
  }

  public ensureSourceMesh(objectId: string, options?: EnsureSourceOptions): TriangleMesh {
    const existing = this.getByObjectId(objectId, 'source');
    if (existing !== undefined) {
      return existing;
    }
    const handle = this.allocateHandle();
    const mesh = buildSyntheticDentalSurface(objectId, handle as number, options);
    this.register(mesh);
    // Seed working from source (clone) so commits have a starting point.
    const working = cloneMesh(mesh, {
      id: this.allocateHandle() as number,
      role: 'working',
      revision: mesh.revision
    });
    this.register(working);
    return mesh;
  }

  public commitWorking(objectId: string, mesh: TriangleMesh): TriangleMesh {
    const entry = this.byObject.get(objectId) ?? { revision: 0 };
    const nextRevision = Math.max(entry.revision, mesh.revision);
    const committed = cloneMesh(mesh, {
      id: mesh.id > 0 ? mesh.id : (this.allocateHandle() as number),
      role: 'working',
      revision: nextRevision,
      objectId
    });
    if (entry.working !== undefined) {
      this.byHandle.delete(entry.working.id);
    }
    this.byHandle.set(committed.id, committed);
    entry.working = committed;
    entry.preview = undefined;
    entry.revision = nextRevision;
    this.byObject.set(objectId, entry);
    return committed;
  }

  public setPreview(objectId: string, mesh: TriangleMesh): TriangleMesh {
    const entry = this.byObject.get(objectId) ?? { revision: mesh.revision };
    if (entry.preview !== undefined) {
      this.byHandle.delete(entry.preview.id);
    }
    const preview = cloneMesh(mesh, {
      id: mesh.id > 0 ? mesh.id : (this.allocateHandle() as number),
      role: 'preview',
      objectId
    });
    this.byHandle.set(preview.id, preview);
    entry.preview = preview;
    this.byObject.set(objectId, entry);
    return preview;
  }

  public setDisplay(objectId: string, mesh: TriangleMesh): TriangleMesh {
    const entry = this.byObject.get(objectId) ?? { revision: mesh.revision };
    if (entry.display !== undefined) {
      this.byHandle.delete(entry.display.id);
    }
    const display = cloneMesh(mesh, {
      id: mesh.id > 0 ? mesh.id : (this.allocateHandle() as number),
      role: 'display',
      objectId
    });
    this.byHandle.set(display.id, display);
    entry.display = display;
    this.byObject.set(objectId, entry);
    return display;
  }

  public clearPreview(objectId: string): void {
    const entry = this.byObject.get(objectId);
    if (entry?.preview === undefined) {
      return;
    }
    this.byHandle.delete(entry.preview.id);
    entry.preview = undefined;
  }

  public cancelPreviews(objectId?: string): void {
    if (objectId !== undefined) {
      this.clearPreview(objectId);
      return;
    }
    for (const id of this.byObject.keys()) {
      this.clearPreview(id);
    }
  }

  public getRevision(objectId: string): number {
    return this.byObject.get(objectId)?.revision ?? 0;
  }

  public release(handle: OpaqueGeometryHandle | number): boolean {
    const mesh = this.byHandle.get(handle as number);
    if (mesh === undefined) {
      return false;
    }
    this.byHandle.delete(handle as number);
    const entry = this.byObject.get(mesh.objectId);
    if (entry !== undefined && entry[mesh.role]?.id === mesh.id) {
      entry[mesh.role] = undefined;
    }
    return true;
  }

  public releaseObject(objectId: string): void {
    const entry = this.byObject.get(objectId);
    if (entry === undefined) {
      return;
    }
    for (const role of ['source', 'working', 'preview', 'display'] as const) {
      const mesh = entry[role];
      if (mesh !== undefined) {
        this.byHandle.delete(mesh.id);
      }
    }
    this.byObject.delete(objectId);
  }

  /** Clears all registered meshes (case reset / close). */
  public clear(): void {
    this.byHandle.clear();
    this.byObject.clear();
  }

  public listObjectIds(): readonly string[] {
    return Object.freeze([...this.byObject.keys()]);
  }
}
