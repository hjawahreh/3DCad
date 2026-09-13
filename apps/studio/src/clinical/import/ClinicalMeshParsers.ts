/**
 * Clinical mesh file parsers (STL / OBJ / PLY) — first-party, apps/studio only.
 * Produces typed arrays for MeshRegistry; does not mutate source files.
 */

import { computeAABB, type AABB } from '../../geometry-kernel/mesh/TriangleMesh.js';
import type { ClinicalArchRole } from './ClinicalMeshDescriptor.js';

export type { ClinicalArchRole };

export interface ParsedClinicalMesh {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly bounds: AABB;
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly unitsHint: 'mm' | undefined;
  readonly warnings: readonly string[];
}

export const ARCH_DISPLAY_NAME: Readonly<Record<ClinicalArchRole, string>> = Object.freeze({
  upper: 'Upper Arch',
  lower: 'Lower Arch'
});

export const ARCH_STABLE_SUFFIX: Readonly<Record<ClinicalArchRole, string>> = Object.freeze({
  upper: 'upper-arch',
  lower: 'lower-arch'
});

const isFiniteMesh = (positions: Float32Array): boolean => {
  for (let i = 0; i < positions.length; i += 1) {
    if (!Number.isFinite(positions[i]!)) return false;
  }
  return positions.length >= 9;
};

export const parseClinicalMeshBytes = (
  bytes: ArrayBuffer,
  extension: string
): ParsedClinicalMesh => {
  const ext = extension.toLowerCase().replace(/^\./, '');
  if (ext === 'stl') {
    return parseStl(bytes);
  }
  if (ext === 'obj') {
    return parseObj(bytes);
  }
  if (ext === 'ply') {
    return parsePly(bytes);
  }
  throw new Error(`Unsupported mesh format ".${ext}"`);
};

const parseStl = (bytes: ArrayBuffer): ParsedClinicalMesh => {
  const u8 = new Uint8Array(bytes);
  if (u8.byteLength < 84) {
    throw new Error('STL file is too small to contain geometry');
  }
  // ASCII STL starts with "solid" but some binary files also start with solid — prefer binary if triangle count matches.
  const triangleCount = new DataView(bytes).getUint32(80, true);
  const expectedBinary = 84 + triangleCount * 50;
  const looksBinary =
    expectedBinary === u8.byteLength ||
    (triangleCount > 0 && expectedBinary <= u8.byteLength && !isMostlyAscii(u8.subarray(0, 256)));

  if (looksBinary) {
    return parseStlBinary(bytes, triangleCount);
  }
  return parseStlAscii(new TextDecoder().decode(u8));
};

const isMostlyAscii = (slice: Uint8Array): boolean => {
  let printable = 0;
  for (let i = 0; i < slice.length; i += 1) {
    const c = slice[i]!;
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) printable += 1;
  }
  return printable / Math.max(1, slice.length) > 0.9;
};

const parseStlBinary = (bytes: ArrayBuffer, triangleCount: number): ParsedClinicalMesh => {
  if (triangleCount <= 0) {
    throw new Error('STL contains no triangles');
  }
  const view = new DataView(bytes);
  const positions = new Float32Array(triangleCount * 9);
  const indices = new Uint32Array(triangleCount * 3);
  let po = 0;
  let io = 0;
  let offset = 84;
  for (let t = 0; t < triangleCount; t += 1) {
    offset += 12; // normal
    for (let v = 0; v < 3; v += 1) {
      positions[po++] = view.getFloat32(offset, true);
      positions[po++] = view.getFloat32(offset + 4, true);
      positions[po++] = view.getFloat32(offset + 8, true);
      indices[io++] = t * 3 + v;
      offset += 12;
    }
    offset += 2; // attribute byte count
  }
  return finalize(positions, indices, ['Parsed binary STL']);
};

const parseStlAscii = (text: string): ParsedClinicalMesh => {
  const vertexRe = /vertex\s+([-+eE0-9.]+)\s+([-+eE0-9.]+)\s+([-+eE0-9.]+)/g;
  const verts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = vertexRe.exec(text)) !== null) {
    verts.push(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  if (verts.length < 9 || verts.length % 9 !== 0) {
    throw new Error('ASCII STL did not contain valid triangles');
  }
  const positions = new Float32Array(verts);
  const faceCount = positions.length / 9;
  const indices = new Uint32Array(faceCount * 3);
  for (let i = 0; i < indices.length; i += 1) {
    indices[i] = i;
  }
  return finalize(positions, indices, ['Parsed ASCII STL']);
};

const parseObj = (bytes: ArrayBuffer): ParsedClinicalMesh => {
  const text = new TextDecoder().decode(bytes);
  const positionsList: number[] = [];
  const faces: number[] = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const parts = line.split(/\s+/);
      if (parts.length < 4) {
        throw new Error('OBJ vertex line is incomplete (expected v x y z)');
      }
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      const z = Number(parts[3]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        throw new Error('OBJ vertex contains non-finite coordinates');
      }
      positionsList.push(x, y, z);
    } else if (line.startsWith('f ')) {
      const parts = line.split(/\s+/).slice(1);
      if (parts.length < 3) {
        throw new Error('OBJ face line needs at least 3 vertices');
      }
      const vertexCount = positionsList.length / 3;
      const idxs = parts.map((p) => {
        const a = p.split('/')[0]!;
        const n = Number(a);
        if (!Number.isFinite(n) || n === 0) {
          throw new Error('OBJ face index is invalid');
        }
        return n < 0 ? vertexCount + n : n - 1;
      });
      for (let i = 1; i + 1 < idxs.length; i += 1) {
        faces.push(idxs[0]!, idxs[i]!, idxs[i + 1]!);
      }
    }
  }
  if (positionsList.length < 9 || faces.length < 3) {
    throw new Error('OBJ did not contain valid triangle geometry');
  }
  return finalize(new Float32Array(positionsList), new Uint32Array(faces), ['Parsed OBJ']);
};

const parsePly = (bytes: ArrayBuffer): ParsedClinicalMesh => {
  const text = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.byteLength, 4096)));
  if (!text.startsWith('ply')) {
    throw new Error('Not a PLY file');
  }
  if (!/format\s+ascii/i.test(text)) {
    throw new Error('Only ASCII PLY is supported in this import path');
  }
  const full = new TextDecoder().decode(bytes);
  const headerEnd = full.indexOf('end_header');
  if (headerEnd < 0) {
    throw new Error('PLY header is incomplete');
  }
  const vertexMatch = /element\s+vertex\s+(\d+)/i.exec(full);
  const faceMatch = /element\s+face\s+(\d+)/i.exec(full);
  const vertexCount = Number(vertexMatch?.[1] ?? 0);
  const faceCount = Number(faceMatch?.[1] ?? 0);
  if (vertexCount < 3 || faceCount < 1) {
    throw new Error('PLY contains insufficient geometry');
  }
  const body = full.slice(full.indexOf('\n', headerEnd) + 1).trim().split(/\r?\n/);
  const positions = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i += 1) {
    const parts = body[i]!.trim().split(/\s+/);
    positions[i * 3] = Number(parts[0]);
    positions[i * 3 + 1] = Number(parts[1]);
    positions[i * 3 + 2] = Number(parts[2]);
  }
  const indices: number[] = [];
  for (let i = 0; i < faceCount; i += 1) {
    const parts = body[vertexCount + i]!.trim().split(/\s+/).map(Number);
    const n = parts[0]!;
    const verts = parts.slice(1, 1 + n);
    for (let t = 1; t + 1 < verts.length; t += 1) {
      indices.push(verts[0]!, verts[t]!, verts[t + 1]!);
    }
  }
  return finalize(positions, new Uint32Array(indices), ['Parsed ASCII PLY']);
};

const finalize = (
  positions: Float32Array,
  indices: Uint32Array,
  warnings: string[]
): ParsedClinicalMesh => {
  if (!isFiniteMesh(positions)) {
    throw new Error('Mesh contains non-finite coordinates');
  }
  if (indices.length < 3 || indices.length % 3 !== 0) {
    throw new Error('Mesh contains no triangles');
  }
  const vertexCount = Math.floor(positions.length / 3);
  for (let i = 0; i < indices.length; i += 1) {
    const idx = indices[i]!;
    if (!Number.isFinite(idx) || idx < 0 || idx >= vertexCount) {
      throw new Error('Mesh contains out-of-range triangle indices');
    }
  }
  const bounds = computeAABB(positions);
  const dx = bounds.max[0]! - bounds.min[0]!;
  const dy = bounds.max[1]! - bounds.min[1]!;
  const dz = bounds.max[2]! - bounds.min[2]!;
  if (dx <= 0 && dy <= 0 && dz <= 0) {
    throw new Error('Mesh bounding box is empty');
  }
  const unitsHint: 'mm' | undefined = undefined;
  const warn = [...warnings];
  if (unitsHint === undefined) {
    warn.push('Units could not be determined from the file; assuming case units (mm).');
  }
  return Object.freeze({
    positions,
    indices,
    bounds,
    vertexCount,
    faceCount: Math.floor(indices.length / 3),
    unitsHint,
    warnings: Object.freeze(warn)
  });
};

export const suggestArchRole = (fileName: string): ClinicalArchRole | undefined => {
  const n = fileName.toLowerCase();
  if (/(^|[^a-z])(upper|maxilla|maxillary|ux|u_)([^a-z]|$)/.test(n)) return 'upper';
  if (/(^|[^a-z])(lower|mandible|mandibular|lx|l_)([^a-z]|$)/.test(n)) return 'lower';
  return undefined;
};
