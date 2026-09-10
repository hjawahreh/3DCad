/**
 * Registers parsed clinical mesh buffers into the geometry kernel MeshRegistry.
 */

import {
  cloneMesh,
  createMesh,
  type TriangleMesh
} from '../../geometry-kernel/mesh/TriangleMesh.js';
import type { MeshRegistry } from '../../geometry-kernel/mesh/MeshRegistry.js';
import type { ParsedClinicalMesh } from './ClinicalMeshParsers.js';

export const registerParsedClinicalMesh = (
  registry: MeshRegistry,
  objectId: string,
  parsed: ParsedClinicalMesh,
  revision = 1
): TriangleMesh => {
  const sourceHandle = registry.allocateHandle();
  const source = createMesh({
    id: sourceHandle as number,
    objectId,
    role: 'source',
    revision,
    positions: parsed.positions,
    indices: parsed.indices
  });
  registry.register(source);
  const working = cloneMesh(source, {
    id: registry.allocateHandle() as number,
    role: 'working',
    revision
  });
  registry.register(working);
  return source;
};
