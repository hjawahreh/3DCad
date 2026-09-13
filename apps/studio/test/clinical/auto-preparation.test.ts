import { describe, expect, it } from 'vitest';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import {
  computeVertexNormals,
  prepareArchGeometry,
  runClinicalAutoPreparation,
  AUTO_PREPARATION_ALGORITHM_VERSION
} from '../../src/clinical/preparation/ClinicalAutoPreparationRunner.js';
import { GeometryCache } from '../../src/geometry-kernel/cache/GeometryCache.js';
import { MeshRegistry } from '../../src/geometry-kernel/mesh/MeshRegistry.js';
import { createMesh } from '../../src/geometry-kernel/mesh/TriangleMesh.js';
import { registerParsedClinicalMesh } from '../../src/clinical/import/ClinicalMeshRegistration.js';
import { computeAABB } from '../../src/geometry-kernel/mesh/TriangleMesh.js';

const makePositions = (z = 0): Float32Array => {
  // Simple grid quad → 2 triangles worth of unique verts (4 verts)
  return new Float32Array([
    0, 0, z,
    10, 0, z,
    10, 10, z,
    0, 10, z,
    5, 5, z + 1
  ]);
};

const makeIndices = (): Uint32Array =>
  new Uint32Array([0, 1, 2, 0, 2, 3, 0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]);

const boot = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 16000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  await host.attachViewport({
    width: 640,
    height: 480,
    clientWidth: 640,
    clientHeight: 480,
    getContext: () => null
  });
  expect(clinical.session.newCase({ name: 'Prep Auto', patientName: 'P' }).ok).toBe(true);
  return { host, clinical };
};

const seedArch = (
  host: StudioCompositionRoot,
  objectId: string,
  z: number
): void => {
  const positions = makePositions(z);
  const indices = makeIndices();
  registerParsedClinicalMesh(host.runtimes.kernel.registry, objectId, {
    positions,
    indices,
    bounds: computeAABB(positions),
    vertexCount: Math.floor(positions.length / 3),
    faceCount: Math.floor(indices.length / 3),
    unitsHint: 'mm',
    warnings: Object.freeze([])
  });
};

describe('auto preparation runner', () => {
  it('computes deterministic vertex normals', () => {
    const positions = makePositions();
    const indices = makeIndices();
    const a = computeVertexNormals(positions, indices);
    const b = computeVertexNormals(positions, indices);
    expect(a).toEqual(b);
    expect(a.length).toBe(positions.length);
  });

  it('prepares an arch and caches bounds/normals/topology/spatial', () => {
    const cache = new GeometryCache();
    const registry = new MeshRegistry();
    const positions = makePositions();
    const indices = makeIndices();
    const mesh = createMesh({
      id: 1,
      objectId: 'upper',
      role: 'source',
      revision: 1,
      positions,
      indices
    });
    registry.register(mesh);
    const result = prepareArchGeometry(
      {
        objectId: 'upper',
        archRole: 'upper',
        displayName: 'Upper Arch',
        mesh
      },
      cache
    );
    expect(result.ok).toBe(true);
    expect(result.hardFailure).toBe(false);
    expect(cache.getBounds('upper', 1, mesh.fingerprint)).toBeDefined();
    expect(cache.getNormals('upper', 1, mesh.fingerprint)).toBeDefined();
    expect(cache.getTopology('upper', 1, mesh.fingerprint)).toBeDefined();
    expect(cache.getSpatial('upper', 1, mesh.fingerprint)).toBeDefined();

    // Idempotent cache reuse
    const again = prepareArchGeometry(
      {
        objectId: 'upper',
        archRole: 'upper',
        displayName: 'Upper Arch',
        mesh
      },
      cache
    );
    expect(again.fingerprint).toBe(result.fingerprint);
  });

  it('fails hard on empty geometry', () => {
    const cache = new GeometryCache();
    const mesh = createMesh({
      id: 2,
      objectId: 'bad',
      role: 'source',
      revision: 1,
      positions: new Float32Array(0),
      indices: new Uint32Array(0)
    });
    const result = prepareArchGeometry(
      {
        objectId: 'bad',
        archRole: 'upper',
        displayName: 'Upper Arch',
        mesh
      },
      cache
    );
    expect(result.ok).toBe(false);
    expect(result.hardFailure).toBe(true);
    expect(result.message.toLowerCase()).toContain('could not be prepared');
  });

  it('runs dual-arch preparation deterministically', () => {
    const cache = new GeometryCache();
    const upper = createMesh({
      id: 3,
      objectId: 'u',
      role: 'source',
      revision: 1,
      positions: makePositions(5),
      indices: makeIndices()
    });
    const lower = createMesh({
      id: 4,
      objectId: 'l',
      role: 'source',
      revision: 1,
      positions: makePositions(-5),
      indices: makeIndices()
    });
    const report = runClinicalAutoPreparation({
      arches: [
        { objectId: 'u', archRole: 'upper', displayName: 'Upper Arch', mesh: upper },
        { objectId: 'l', archRole: 'lower', displayName: 'Lower Arch', mesh: lower }
      ],
      registry: new MeshRegistry(),
      cache
    });
    expect(report.ok).toBe(true);
    expect(report.algorithmVersion).toBe(AUTO_PREPARATION_ALGORITHM_VERSION);
    expect(report.arches).toHaveLength(2);
    expect(report.uiState === 'ready' || report.uiState === 'warning').toBe(true);
    const again = runClinicalAutoPreparation({
      arches: [
        { objectId: 'u', archRole: 'upper', displayName: 'Upper Arch', mesh: upper },
        { objectId: 'l', archRole: 'lower', displayName: 'Lower Arch', mesh: lower }
      ],
      registry: new MeshRegistry(),
      cache
    });
    expect(again.sourceFingerprint).toBe(report.sourceFingerprint);
  });
});

describe('auto preparation workflow', () => {
  it('auto-prepares dual arch and reaches ready-for-trim', async () => {
    const { host, clinical } = await boot();
    const { withClinicalObjects } = await import('../../src/clinical/document/ClinicalDocument.js');
    const { asClinicalObjectId, DEFAULT_MESH_BOUNDS, IDENTITY_CLINICAL_TRANSFORM } = await import(
      '../../src/clinical/import/ClinicalMeshDescriptor.js'
    );
    const doc = clinical.session.getPublicState().activeCase!;
    const objects = [
      Object.freeze({
        id: asClinicalObjectId('upper-arch'),
        displayName: 'Upper Arch',
        sourceFile: 'u.stl',
        format: 'stl' as const,
        units: 'mm' as const,
        bounds: DEFAULT_MESH_BOUNDS,
        vertexCount: 5,
        faceCount: 6,
        importedAt: 1,
        visible: true,
        selectable: true,
        hierarchyParentId: undefined,
        importerId: 'studio',
        sourceEntityId: 'u',
        displayState: 'default' as const,
        transform: IDENTITY_CLINICAL_TRANSFORM,
        archRole: 'upper' as const
      }),
      Object.freeze({
        id: asClinicalObjectId('lower-arch'),
        displayName: 'Lower Arch',
        sourceFile: 'l.stl',
        format: 'stl' as const,
        units: 'mm' as const,
        bounds: DEFAULT_MESH_BOUNDS,
        vertexCount: 5,
        faceCount: 6,
        importedAt: 1,
        visible: true,
        selectable: true,
        hierarchyParentId: undefined,
        importerId: 'studio',
        sourceEntityId: 'l',
        displayState: 'default' as const,
        transform: IDENTITY_CLINICAL_TRANSFORM,
        archRole: 'lower' as const
      })
    ];
    expect(clinical.session.applyDocument(withClinicalObjects(doc, objects, 1), true).ok).toBe(true);
    seedArch(host, 'upper-arch', 5);
    seedArch(host, 'lower-arch', -5);

    clinical.workspace.preparation.notifyOrientationComplete();
    const result = clinical.workspace.preparation.autoPrepare();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ok).toBe(true);
    expect(clinical.workspace.preparation.isReadyForGeometry()).toBe(true);
    expect(clinical.session.getPublicState().activeCase?.preparationMeta).toBeDefined();

    // Idempotent
    const again = clinical.workspace.preparation.autoPrepare();
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.value.sourceFingerprint).toBe(result.value.sourceFingerprint);
    }

    clinical.runtime.dispose();
    host.dispose();
  });

  it('surfaces actionable failure for invalid geometry', async () => {
    const { host, clinical } = await boot();
    const { withClinicalObjects } = await import('../../src/clinical/document/ClinicalDocument.js');
    const { asClinicalObjectId, DEFAULT_MESH_BOUNDS, IDENTITY_CLINICAL_TRANSFORM } = await import(
      '../../src/clinical/import/ClinicalMeshDescriptor.js'
    );
    const doc = clinical.session.getPublicState().activeCase!;
    expect(
      clinical.session.applyDocument(
        withClinicalObjects(
          doc,
          [
            Object.freeze({
              id: asClinicalObjectId('bad-arch'),
              displayName: 'Upper Arch',
              sourceFile: 'bad.stl',
              format: 'stl' as const,
              units: 'mm' as const,
              bounds: DEFAULT_MESH_BOUNDS,
              vertexCount: 0,
              faceCount: 0,
              importedAt: 1,
              visible: true,
              selectable: true,
              hierarchyParentId: undefined,
              importerId: 'studio',
              sourceEntityId: 'bad',
              displayState: 'default' as const,
              transform: IDENTITY_CLINICAL_TRANSFORM,
              archRole: 'upper' as const
            })
          ],
          1
        ),
        true
      ).ok
    ).toBe(true);

    const empty = createMesh({
      id: 9,
      objectId: 'bad-arch',
      role: 'source',
      revision: 1,
      positions: new Float32Array(0),
      indices: new Uint32Array(0)
    });
    host.runtimes.kernel.registry.register(empty);

    clinical.workspace.preparation.notifyOrientationComplete();
    const result = clinical.workspace.preparation.autoPrepare();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ok).toBe(false);
    expect(result.value.uiState).toBe('failed');
    expect(result.value.message.toLowerCase()).toContain('could not be prepared');

    clinical.runtime.dispose();
    host.dispose();
  });
});
