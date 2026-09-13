/**
 * GEO-001 — backend capability selection (no silent unreliable fallback).
 */

import { GEOMETRY_BACKEND_POLICY } from '../adapters/GeometryBackendPolicy.js';
import type { BackendSelection, GeometryCapability } from './types.js';

const CAPABILITY_MAP: Record<GeometryCapability, { preferred: string[]; reason: string }> = {
  TRIM_SURFACE_SELECTION: {
    preferred: ['vtk-http-worker-v1', 'vtk-native-worker-v1', 'clinical-reference-v1'],
    reason: 'Surface-loop selection prefers VTK SelectPolyData (Dijkstra) when worker healthy'
  },
  TRIM_CLIPPING: {
    preferred: ['vtk-http-worker-v1', 'vtk-native-worker-v1', 'clinical-reference-v1'],
    reason: 'Clipping prefers VTK ClipPolyData; reference exact-edge-clip is browser authority fallback'
  },
  BOUNDARY_EXTRACTION: {
    preferred: ['clinical-reference-v1'],
    reason: 'Boundary extraction is topology-graph based in the clinical reference kernel'
  },
  TRIANGULATION: {
    preferred: ['clinical-reference-v1'],
    reason: 'Boundary triangulation uses reference ear-clip with hard caps until worker triangulation is certified'
  },
  BASE_GENERATION: {
    preferred: ['vtk-http-worker-v1', 'clinical-reference-v1'],
    reason: 'Base generation prefers VTK close-base when available; otherwise capped reference base'
  },
  MESH_REPAIR: {
    preferred: ['clinical-reference-v1'],
    reason: 'Safe deterministic cleanup only — no aggressive remesh backends'
  },
  SOLID_BOOLEAN: {
    preferred: ['manifold-3d'],
    reason: 'Solid boolean only when manifold contract is satisfied'
  },
  VALIDATION: {
    preferred: ['clinical-reference-v1', 'open3d-quality'],
    reason: 'Validation uses MeshQualityReport; Open3D quality remains offline evidence only'
  }
};

export const selectBackendForCapability = (
  capability: GeometryCapability,
  options?: { readonly vtkHealthy?: boolean; readonly allowManifold?: boolean }
): BackendSelection => {
  const entry = CAPABILITY_MAP[capability];
  for (const id of entry.preferred) {
    const policy = GEOMETRY_BACKEND_POLICY.find((d) => d.id === id);
    if (policy === undefined) continue;
    if (id.startsWith('vtk') && options?.vtkHealthy === false) continue;
    if (id === 'manifold-3d' && options?.allowManifold !== true) continue;
    if (!policy.productionEnabled && id !== 'vtk-native-worker-v1') continue;
    return {
      capability,
      backendId: id,
      reason: `${entry.reason} → selected ${id} (${policy.role})`
    };
  }
  return {
    capability,
    backendId: 'clinical-reference-v1',
    reason: `${entry.reason} → forced clinical-reference-v1 (no preferred production backend available)`
  };
};
