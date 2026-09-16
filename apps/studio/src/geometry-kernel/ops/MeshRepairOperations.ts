/**
 * GEO-002 — explicit mesh repair operations (no silent destructive "repairMesh()").
 */

import type { TriangleMesh } from '../mesh/TriangleMesh.js';
import { repairMesh } from '../engine/MeshRepair.js';
import { buildTopology, invalidateTopologyCache } from '../engine/TopologyGraph.js';
import { invalidateSpatialCache } from '../engine/SpatialAcceleration.js';
import { createMesh, fingerprintMesh } from '../mesh/TriangleMesh.js';

export const MeshRepairOperations = {
  removeUnusedVertices(mesh: TriangleMesh): TriangleMesh {
    return repairMesh(mesh, { mergeExactDuplicates: false, dropDegenerates: false });
  },

  removeDegenerateFaces(mesh: TriangleMesh): TriangleMesh {
    return repairMesh(mesh, { mergeExactDuplicates: false, dropDegenerates: true });
  },

  mergeExactDuplicates(mesh: TriangleMesh): TriangleMesh {
    return repairMesh(mesh, { mergeExactDuplicates: true, dropDegenerates: false });
  },

  repairWinding(mesh: TriangleMesh): TriangleMesh {
    // Explicit no-op until a dedicated winding repair is certified — do not invent flips.
    return mesh;
  },

  rebuildNormals(mesh: TriangleMesh): TriangleMesh {
    // Normals are display-derived; keep authoritative mesh buffers unchanged.
    return mesh;
  },

  rebuildTopology(mesh: TriangleMesh): TriangleMesh {
    invalidateTopologyCache(mesh.fingerprint);
    invalidateSpatialCache(mesh.fingerprint);
    void buildTopology(mesh);
    return createMesh({
      id: mesh.id,
      objectId: mesh.objectId,
      role: mesh.role,
      revision: mesh.revision,
      positions: mesh.positions,
      indices: mesh.indices,
      ...(mesh.normals !== undefined ? { normals: mesh.normals } : {}),
      fingerprint: fingerprintMesh(mesh.positions, mesh.indices)
    });
  }
} as const;
