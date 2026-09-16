/**
 * GEO-001G — compact binary geometry result frame.
 *
 * Layout (little-endian):
 *   [0..63]   fixed header
 *   [64..]    UTF-8 meta JSON (metaLength bytes)
 *   [pad→8]   positions (Float32 or Float64)
 *   [...]     indices (Uint16 or Uint32)
 *   [...]     optional normals (same component type as positions)
 *
 * Large vertex/index buffers are NEVER JSON number arrays.
 */

import { GeometryKernelError } from '../errors.js';

export const CGF_MAGIC = 0x43474631; // 'CGF1'
export const CGF_VERSION = 1;
export const CGF_HEADER_BYTES = 64;
export const CGF_CONTENT_TYPE = 'application/vnd.clinical.geometry-frame';

export const CGF_POS_F32 = 0;
export const CGF_POS_F64 = 1;
export const CGF_IDX_U16 = 0;
export const CGF_IDX_U32 = 1;
export const CGF_FLAG_NORMALS = 1;

export interface BinaryGeometryFrameMeta {
  readonly geometryFingerprint?: string;
  readonly previewId?: string;
  readonly baseFingerprint?: string;
  readonly previewGeometryFingerprint?: string;
  readonly [key: string]: unknown;
}

export interface EncodedBinaryGeometryFrame {
  readonly buffer: ArrayBuffer;
  readonly byteLength: number;
  readonly metaBytes: number;
  readonly binaryBytes: number;
  readonly vertexCount: number;
  readonly indexCount: number;
}

export interface DecodedBinaryGeometryFrame {
  readonly version: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly positionComponentType: number;
  readonly indexComponentType: number;
  readonly normalsPresent: boolean;
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly normals?: Float32Array;
  readonly meta: BinaryGeometryFrameMeta;
  readonly metaBytes: number;
  readonly binaryBytes: number;
  readonly decodeMs: number;
  /** True when positions/indices are views into the source buffer (no copy). */
  readonly zeroCopy: boolean;
}

const align8 = (n: number): number => (n + 7) & ~7;

const textEncoder = () => new TextEncoder();
const textDecoder = () => new TextDecoder();

export const encodeBinaryGeometryFrame = (
  positions: Float32Array | Float64Array,
  indices: Uint32Array | Uint16Array,
  meta: BinaryGeometryFrameMeta = {},
  normals?: Float32Array | Float64Array
): EncodedBinaryGeometryFrame => {
  const posType = positions instanceof Float64Array ? CGF_POS_F64 : CGF_POS_F32;
  const idxType = indices instanceof Uint16Array ? CGF_IDX_U16 : CGF_IDX_U32;
  const vertexCount = Math.floor(positions.length / 3);
  const indexCount = indices.length;
  if (vertexCount * 3 !== positions.length) {
    throw new GeometryKernelError(
      'BINARY_GEOMETRY_INVALID',
      'positions length must be a multiple of 3'
    );
  }
  if (indexCount % 3 !== 0) {
    throw new GeometryKernelError(
      'BINARY_GEOMETRY_INVALID',
      'indices length must be a multiple of 3'
    );
  }

  const metaJson = JSON.stringify(meta);
  const metaBytesArr = textEncoder().encode(metaJson);
  const metaLength = metaBytesArr.byteLength;
  const posBytes = positions.byteLength;
  const idxBytes = indices.byteLength;
  const nrmBytes = normals !== undefined ? normals.byteLength : 0;
  const flags = normals !== undefined ? CGF_FLAG_NORMALS : 0;

  const positionsOffset = align8(CGF_HEADER_BYTES + metaLength);
  const indicesOffset = align8(positionsOffset + posBytes);
  const normalsOffset = nrmBytes > 0 ? align8(indicesOffset + idxBytes) : indicesOffset + idxBytes;
  const total = (nrmBytes > 0 ? normalsOffset + nrmBytes : indicesOffset + idxBytes);

  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  view.setUint32(0, CGF_MAGIC, false); // big-endian magic for ASCII 'CGF1'
  view.setUint16(4, CGF_VERSION, true);
  view.setUint16(6, flags, true);
  view.setUint32(8, vertexCount, true);
  view.setUint32(12, indexCount, true);
  view.setUint8(16, posType);
  view.setUint8(17, idxType);
  view.setUint16(18, 0, true);
  view.setUint32(20, metaLength, true);
  view.setUint32(24, posBytes, true);
  view.setUint32(28, idxBytes, true);
  view.setUint32(32, nrmBytes, true);
  view.setUint32(36, positionsOffset, true);
  view.setUint32(40, indicesOffset, true);
  view.setUint32(44, normalsOffset, true);

  new Uint8Array(buffer, CGF_HEADER_BYTES, metaLength).set(metaBytesArr);
  new Uint8Array(buffer, positionsOffset, posBytes).set(
    new Uint8Array(positions.buffer, positions.byteOffset, posBytes)
  );
  new Uint8Array(buffer, indicesOffset, idxBytes).set(
    new Uint8Array(indices.buffer, indices.byteOffset, idxBytes)
  );
  if (normals !== undefined && nrmBytes > 0) {
    new Uint8Array(buffer, normalsOffset, nrmBytes).set(
      new Uint8Array(normals.buffer, normals.byteOffset, nrmBytes)
    );
  }

  return {
    buffer,
    byteLength: total,
    metaBytes: metaLength,
    binaryBytes: posBytes + idxBytes + nrmBytes,
    vertexCount,
    indexCount
  };
};

export const decodeBinaryGeometryFrame = (
  source: ArrayBuffer | ArrayBufferView,
  options?: { copy?: boolean }
): DecodedBinaryGeometryFrame => {
  const t0 = performance.now();
  const copy = options?.copy === true;

  const buffer =
    source instanceof ArrayBuffer
      ? source
      : source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  if (buffer.byteLength < CGF_HEADER_BYTES) {
    throw new GeometryKernelError(
      'BINARY_GEOMETRY_TRUNCATED',
      `frame shorter than header (${String(buffer.byteLength)} < ${String(CGF_HEADER_BYTES)})`
    );
  }

  const view = new DataView(buffer);
  const magic = view.getUint32(0, false);
  if (magic !== CGF_MAGIC) {
    throw new GeometryKernelError(
      'BINARY_GEOMETRY_INVALID',
      `bad magic 0x${magic.toString(16)}`
    );
  }
  const version = view.getUint16(4, true);
  if (version !== CGF_VERSION) {
    throw new GeometryKernelError(
      'BINARY_GEOMETRY_VERSION_UNSUPPORTED',
      `unsupported CGF version ${String(version)}`
    );
  }
  const flags = view.getUint16(6, true);
  const vertexCount = view.getUint32(8, true);
  const indexCount = view.getUint32(12, true);
  const positionComponentType = view.getUint8(16);
  const indexComponentType = view.getUint8(17);
  const metaLength = view.getUint32(20, true);
  const posBytes = view.getUint32(24, true);
  const idxBytes = view.getUint32(28, true);
  const nrmBytes = view.getUint32(32, true);
  let positionsOffset = view.getUint32(36, true);
  let indicesOffset = view.getUint32(40, true);
  let normalsOffset = view.getUint32(44, true);

  if (positionsOffset === 0) {
    positionsOffset = align8(CGF_HEADER_BYTES + metaLength);
    indicesOffset = align8(positionsOffset + posBytes);
    normalsOffset = nrmBytes > 0 ? align8(indicesOffset + idxBytes) : indicesOffset + idxBytes;
  }

  const needEnd = (nrmBytes > 0 ? normalsOffset + nrmBytes : indicesOffset + idxBytes);
  if (buffer.byteLength < needEnd) {
    throw new GeometryKernelError(
      'BINARY_GEOMETRY_TRUNCATED',
      `frame truncated: have ${String(buffer.byteLength)} need ${String(needEnd)}`
    );
  }

  const expectedPosBytes =
    vertexCount * 3 * (positionComponentType === CGF_POS_F64 ? 8 : 4);
  const expectedIdxBytes =
    indexCount * (indexComponentType === CGF_IDX_U16 ? 2 : 4);
  if (posBytes !== expectedPosBytes || idxBytes !== expectedIdxBytes) {
    throw new GeometryKernelError(
      'BINARY_GEOMETRY_INVALID',
      `byte length mismatch pos=${String(posBytes)}/${String(expectedPosBytes)} idx=${String(idxBytes)}/${String(expectedIdxBytes)}`
    );
  }
  const normalsPresent = (flags & CGF_FLAG_NORMALS) !== 0 || nrmBytes > 0;
  if (normalsPresent && nrmBytes !== expectedPosBytes) {
    throw new GeometryKernelError(
      'BINARY_GEOMETRY_INVALID',
      'normals byte length does not match positions'
    );
  }

  let meta: BinaryGeometryFrameMeta = {};
  if (metaLength > 0) {
    if (CGF_HEADER_BYTES + metaLength > buffer.byteLength) {
      throw new GeometryKernelError('BINARY_GEOMETRY_TRUNCATED', 'meta truncated');
    }
    try {
      const raw = textDecoder().decode(
        new Uint8Array(buffer, CGF_HEADER_BYTES, metaLength)
      );
      meta = JSON.parse(raw) as BinaryGeometryFrameMeta;
    } catch (err) {
      throw new GeometryKernelError(
        'BINARY_GEOMETRY_INVALID',
        `meta JSON invalid: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const takeF32 = (offset: number, floats: number): Float32Array => {
    if (positionComponentType === CGF_POS_F64) {
      const src = new Float64Array(buffer, offset, floats);
      const out = new Float32Array(floats);
      out.set(src);
      return out;
    }
    const viewArr = new Float32Array(buffer, offset, floats);
    return copy ? viewArr.slice() : viewArr;
  };

  const takeU32 = (offset: number, count: number): Uint32Array => {
    if (indexComponentType === CGF_IDX_U16) {
      const src = new Uint16Array(buffer, offset, count);
      const out = new Uint32Array(count);
      out.set(src);
      return out;
    }
    const viewArr = new Uint32Array(buffer, offset, count);
    return copy ? viewArr.slice() : viewArr;
  };

  const positions = takeF32(positionsOffset, vertexCount * 3);
  const indices = takeU32(indicesOffset, indexCount);
  const normals =
    normalsPresent && nrmBytes > 0
      ? takeF32(normalsOffset, vertexCount * 3)
      : undefined;

  const zeroCopy =
    !copy &&
    positionComponentType === CGF_POS_F32 &&
    indexComponentType === CGF_IDX_U32;

  return {
    version,
    vertexCount,
    indexCount,
    positionComponentType,
    indexComponentType,
    normalsPresent,
    positions,
    indices,
    ...(normals !== undefined ? { normals } : {}),
    meta,
    metaBytes: metaLength,
    binaryBytes: posBytes + idxBytes + nrmBytes,
    decodeMs: performance.now() - t0,
    zeroCopy
  };
};

export const isBinaryGeometryFrame = (source: ArrayBuffer | ArrayBufferView): boolean => {
  const buf =
    source instanceof ArrayBuffer
      ? source
      : source.buffer.slice(source.byteOffset, source.byteOffset + Math.min(4, source.byteLength));
  if (buf.byteLength < 4) return false;
  return new DataView(buf).getUint32(0, false) === CGF_MAGIC;
};
