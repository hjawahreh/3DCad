/**
 * Geometry backend policy (PROD-001R).
 *
 * Evidence-based hybrid — no single library passed all production gates
 * for open dental scans in-browser. Roles are explicit; silent algorithm
 * chaining is forbidden.
 */

export type GeometryBackendRole =
  | 'authoritative-browser'
  | 'specialized-clipping'
  | 'validation'
  | 'solid-manifold'
  | 'display-only'
  | 'prototype-disabled';

export interface GeometryBackendDescriptor {
  readonly id: string;
  readonly role: GeometryBackendRole;
  readonly license: string;
  readonly version: string;
  readonly runtime: 'browser-ts' | 'wasm' | 'native-worker' | 'offline-python' | 'optional-npm';
  readonly productionEnabled: boolean;
  readonly notes: string;
}

/**
 * Production selection (PROD-001R decision):
 *
 * - Browser authoritative mesh ops remain `clinical-reference-v1` until a
 *   native/WASM worker for VTK or Open3D tensor clipping is wired through
 *   Kernel Bridge AND polygon-boundary trim parity is proven.
 * - VTK / Open3D tensor clip_plane are evidence winners for *plane* clipping
 *   on real open dental STLs (offline benchmarks).
 * - Manifold is solid-only; open scans return NotManifold (correct refuse).
 * - Centroid-polygon trim and unbounded AABB extrusion prototypes are disabled
 *   as authoritative defaults.
 */
export const GEOMETRY_BACKEND_POLICY: readonly GeometryBackendDescriptor[] = [
  {
    id: 'clinical-reference-v1',
    role: 'authoritative-browser',
    license: 'Project',
    version: '1.0.0',
    runtime: 'browser-ts',
    productionEnabled: true,
    notes:
      'Exact-edge-clip polygon trim + capped close-base. Interim browser authority pending native worker.'
  },
  {
    id: 'vtk-clip-polydata',
    role: 'specialized-clipping',
    license: 'BSD-3-Clause',
    version: '9.7.0 (PROD-001S spike)',
    runtime: 'native-worker',
    productionEnabled: false,
    notes:
      'PROD-001S: vtkImplicitSelectionLoop + vtkClipPolyData evaluated via Python native worker. Not Studio UI-thread linked.'
  },
  {
    id: 'vtk-http-worker-v1',
    role: 'specialized-clipping',
    license: 'BSD-3-Clause',
    version: '9.7.0',
    runtime: 'native-worker',
    productionEnabled: true,
    notes:
      'PROD-001T HybridGeometryBackend enables VTK over HTTP sidecar when /health is OK. Interactive browser certification signed PASS.'
  },
  {
    id: 'vtk-native-worker-v1',
    role: 'specialized-clipping',
    license: 'BSD-3-Clause',
    version: '9.7.0',
    runtime: 'native-worker',
    productionEnabled: false,
    notes:
      'Node child_process spike for Vitest only — not browser-bundled.'
  },
  {
    id: 'open3d-tensor-clip',
    role: 'specialized-clipping',
    license: 'MIT',
    version: '0.19.0 (eval)',
    runtime: 'native-worker',
    productionEnabled: false,
    notes:
      'Tensor clip_plane matches VTK face deltas on fixtures. Legacy TriangleMesh has no clip_plane.'
  },
  {
    id: 'open3d-quality',
    role: 'validation',
    license: 'MIT',
    version: '0.19.0 (eval)',
    runtime: 'offline-python',
    productionEnabled: false,
    notes: 'Watertight/manifold/orientability checks. Must not mutate clinical source.'
  },
  {
    id: 'manifold-3d',
    role: 'solid-manifold',
    license: 'Apache-2.0',
    version: '3.5.3',
    runtime: 'wasm',
    productionEnabled: false,
    notes:
      'Boolean/TrimByPlane/SplitByPlane on manifold solids only. Open dental STLs → Error.NotManifold.'
  },
  {
    id: 'meshoptimizer',
    role: 'display-only',
    license: 'MIT',
    version: '0.21.x (eval)',
    runtime: 'optional-npm',
    productionEnabled: false,
    notes: 'Display/LOD only — never alters authoritative clinical geometry.'
  },
  {
    id: 'trim.centroid-polygon',
    role: 'prototype-disabled',
    license: 'Project',
    version: 'legacy',
    runtime: 'browser-ts',
    productionEnabled: false,
    notes: 'Legacy whole-triangle classifier. Available only when algorithm explicitly requested in tests.'
  },
  {
    id: 'close-base.unbounded-aabb-extrude',
    role: 'prototype-disabled',
    license: 'Project',
    version: 'legacy',
    runtime: 'browser-ts',
    productionEnabled: false,
    notes: 'Replaced by capped AABB-shortest extrude with loop/triangle/time budgets (PROD-001).'
  }
] as const;

export const isPrototypeAlgorithmAllowed = (algorithmId: string): boolean => {
  const entry = GEOMETRY_BACKEND_POLICY.find((d) => d.id === algorithmId);
  if (!entry) return false;
  return entry.role === 'prototype-disabled' ? false : entry.productionEnabled;
};
