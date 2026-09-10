/**
 * Authoritative triangle mesh model for the clinical geometry kernel.
 * Deterministic — no Math.random in geometry paths.
 */

export type MeshRole = 'source' | 'working' | 'preview' | 'display';

export interface AABB {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface MeshStats {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly hasNormals: boolean;
  readonly role: MeshRole;
  readonly revision: number;
  readonly fingerprint: string;
}

export interface TriangleMesh {
  readonly id: number;
  readonly objectId: string;
  readonly role: MeshRole;
  readonly revision: number;
  readonly fingerprint: string;
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly normals?: Float32Array;
}

export interface CreateMeshInput {
  readonly id: number;
  readonly objectId: string;
  readonly role: MeshRole;
  readonly revision: number;
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly normals?: Float32Array | undefined;
  readonly fingerprint?: string | undefined;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const mixU32 = (hash: number, value: number): number => {
  let h = (hash ^ (value >>> 0)) >>> 0;
  h = Math.imul(h, FNV_PRIME) >>> 0;
  return h;
};

const mixF32Bits = (hash: number, value: number): number => {
  const buf = new ArrayBuffer(4);
  new Float32Array(buf)[0] = value;
  return mixU32(hash, new Uint32Array(buf)[0]!);
};

/** Deterministic FNV-1a style fingerprint over positions + indices. */
export const fingerprintMesh = (
  positions: Float32Array,
  indices: Uint32Array,
  prefix = 'geo:'
): string => {
  let hash = FNV_OFFSET;
  hash = mixU32(hash, positions.length);
  hash = mixU32(hash, indices.length);
  for (let i = 0; i < positions.length; i += 1) {
    hash = mixF32Bits(hash, positions[i]!);
  }
  for (let i = 0; i < indices.length; i += 1) {
    hash = mixU32(hash, indices[i]!);
  }
  return `${prefix}${hash.toString(16).padStart(8, '0')}`;
};

export const computeAABB = (positions: Float32Array): AABB => {
  if (positions.length < 3) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  let minX = positions[0]!;
  let minY = positions[1]!;
  let minZ = positions[2]!;
  let maxX = minX;
  let maxY = minY;
  let maxZ = minZ;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
};

export const meshStats = (mesh: TriangleMesh): MeshStats => ({
  vertexCount: Math.floor(mesh.positions.length / 3),
  triangleCount: Math.floor(mesh.indices.length / 3),
  hasNormals: mesh.normals !== undefined && mesh.normals.length === mesh.positions.length,
  role: mesh.role,
  revision: mesh.revision,
  fingerprint: mesh.fingerprint
});

export const createMesh = (input: CreateMeshInput): TriangleMesh => {
  const fingerprint =
    input.fingerprint ?? fingerprintMesh(input.positions, input.indices);
  return Object.freeze({
    id: input.id,
    objectId: input.objectId,
    role: input.role,
    revision: input.revision,
    fingerprint,
    positions: input.positions,
    indices: input.indices,
    ...(input.normals !== undefined ? { normals: input.normals } : {})
  });
};

export const emptyMesh = (
  objectId: string,
  role: MeshRole = 'working',
  id = 0,
  revision = 0
): TriangleMesh =>
  createMesh({
    id,
    objectId,
    role,
    revision,
    positions: new Float32Array(0),
    indices: new Uint32Array(0),
    fingerprint: fingerprintMesh(new Float32Array(0), new Uint32Array(0))
  });

export const cloneMesh = (
  mesh: TriangleMesh,
  overrides?: Partial<{
    id: number;
    role: MeshRole;
    revision: number;
    objectId: string;
    fingerprint: string;
  }>
): TriangleMesh => {
  const input: CreateMeshInput = {
    id: overrides?.id ?? mesh.id,
    objectId: overrides?.objectId ?? mesh.objectId,
    role: overrides?.role ?? mesh.role,
    revision: overrides?.revision ?? mesh.revision,
    positions: new Float32Array(mesh.positions),
    indices: new Uint32Array(mesh.indices)
  };
  if (mesh.normals !== undefined) {
    (input as { normals?: Float32Array }).normals = new Float32Array(mesh.normals);
  }
  if (overrides?.fingerprint !== undefined) {
    (input as { fingerprint?: string }).fingerprint = overrides.fingerprint;
  }
  return createMesh(input);
};
