import { describe, expect, it } from 'vitest';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { MemoryClinicalCasePersistence } from '../../src/clinical/case/ClinicalCasePersistence.js';
import { ClinicalCaseService } from '../../src/clinical/case/ClinicalCaseService.js';
import { ClinicalWorkspace } from '../../src/clinical/workspace/ClinicalWorkspace.js';
import {
  createEmptyClinicalDocument,
  type ClinicalDocumentSnapshot
} from '../../src/clinical/document/ClinicalDocument.js';
import {
  deriveClinicalCasePhase,
  deriveClinicalCaseWorkflowStatus
} from '../../src/clinical/case/ClinicalCaseWorkflowStatus.js';
import { asClinicalObjectId } from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import { IDENTITY_CLINICAL_TRANSFORM } from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import { asClinicalCaseId, asClinicalRevision } from '../../src/clinical/runtime/types.js';

/** Minimal binary STL with one triangle. */
const makeBinaryStl = (offsetY = 0): ArrayBuffer => {
  const buf = new ArrayBuffer(84 + 50);
  const view = new DataView(buf);
  view.setUint32(80, 1, true);
  let o = 84;
  view.setFloat32(o, 0, true);
  o += 4;
  view.setFloat32(o, 0, true);
  o += 4;
  view.setFloat32(o, 1, true);
  o += 4;
  view.setFloat32(o, 0, true);
  o += 4;
  view.setFloat32(o, offsetY, true);
  o += 4;
  view.setFloat32(o, 0, true);
  o += 4;
  view.setFloat32(o, 10, true);
  o += 4;
  view.setFloat32(o, offsetY, true);
  o += 4;
  view.setFloat32(o, 0, true);
  o += 4;
  view.setFloat32(o, 0, true);
  o += 4;
  view.setFloat32(o, offsetY + 10, true);
  o += 4;
  view.setFloat32(o, 0, true);
  o += 4;
  view.setUint16(o, 0, true);
  return buf;
};

const bootWithMemory = () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 9000 }
  });
  const runtimeBoot = new ClinicalBootstrap().bootstrap(host);
  // Replace workspace cases service with memory persistence for deterministic tests.
  const persistence = new MemoryClinicalCasePersistence();
  const workspace = new ClinicalWorkspace(runtimeBoot.session, undefined, persistence);
  return { host, runtime: runtimeBoot.runtime, session: runtimeBoot.session, workspace, persistence };
};

const attach = async (host: StudioCompositionRoot) => {
  expect(
    await host.attachViewport({
      width: 640,
      height: 480,
      clientWidth: 640,
      clientHeight: 480,
      getContext: () => null
    })
  ).toBe(true);
};

describe('patient + case creation', () => {
  it('creates a patient and case with stable identity fields', () => {
    const doc = createEmptyClinicalDocument({
      now: 42,
      firstName: 'John',
      lastName: 'Doe',
      patientId: 'P-100',
      name: 'Case #10482',
      notes: 'Initial dual-arch'
    });
    expect(doc.patient.displayName).toBe('John Doe');
    expect(doc.patient.patientId).toBe('P-100');
    expect(doc.patient.chartNumber).toBe('P-100');
    expect(doc.patient.notes).toBe('Initial dual-arch');
    expect(doc.caseMeta.name).toBe('Case #10482');
    expect(doc.caseId).toBe(asClinicalCaseId('case-42'));
  });

  it('persists and retrieves a patient/case relationship', async () => {
    const persistence = new MemoryClinicalCasePersistence();
    const doc = createEmptyClinicalDocument({
      now: 100,
      patientName: 'Sarah Smith',
      name: 'Case #10476'
    });
    await persistence.save({
      document: doc,
      meshes: Object.freeze([]),
      savedAt: 100
    });
    const loaded = await persistence.load(doc.caseId);
    expect(loaded).toBeDefined();
    expect(loaded?.document.patient.displayName).toBe('Sarah Smith');
    expect(loaded?.document.caseMeta.name).toBe('Case #10476');
    expect(loaded?.document.caseId).toBe(doc.caseId);
    const listed = await persistence.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.patientName).toBe('Sarah Smith');
  });
});

describe('case workflow status', () => {
  it('maps empty case to case-created and dual-arch to orientation-ready', () => {
    const empty = createEmptyClinicalDocument({ now: 1, name: 'A', patientName: 'P' });
    expect(deriveClinicalCasePhase(empty)).toBe('case-created');
    expect(deriveClinicalCaseWorkflowStatus(empty)).toContain('Ready for Import');

    const withArches: ClinicalDocumentSnapshot = Object.freeze({
      ...empty,
      revision: asClinicalRevision(2),
      objects: Object.freeze([
        Object.freeze({
          id: asClinicalObjectId('case-1:upper-arch'),
          displayName: 'Upper Arch',
          sourceFile: 'upper.stl',
          format: 'stl' as const,
          units: 'mm' as const,
          bounds: Object.freeze({
            min: Object.freeze({ x: 0, y: 0, z: 0 }),
            max: Object.freeze({ x: 1, y: 1, z: 1 })
          }),
          vertexCount: 3,
          faceCount: 1,
          importedAt: 1,
          visible: true,
          selectable: true,
          hierarchyParentId: undefined,
          importerId: 'studio-passthrough',
          sourceEntityId: 'e1',
          displayState: 'default' as const,
          archRole: 'upper' as const,
          transform: IDENTITY_CLINICAL_TRANSFORM
        }),
        Object.freeze({
          id: asClinicalObjectId('case-1:lower-arch'),
          displayName: 'Lower Arch',
          sourceFile: 'lower.stl',
          format: 'stl' as const,
          units: 'mm' as const,
          bounds: Object.freeze({
            min: Object.freeze({ x: 0, y: 0, z: 0 }),
            max: Object.freeze({ x: 1, y: 1, z: 1 })
          }),
          vertexCount: 3,
          faceCount: 1,
          importedAt: 1,
          visible: true,
          selectable: true,
          hierarchyParentId: undefined,
          importerId: 'studio-passthrough',
          sourceEntityId: 'e2',
          displayState: 'default' as const,
          archRole: 'lower' as const,
          transform: IDENTITY_CLINICAL_TRANSFORM
        })
      ])
    });
    expect(deriveClinicalCasePhase(withArches)).toBe('orientation-ready');
    expect(deriveClinicalCaseWorkflowStatus(withArches)).toContain('Ready for Orientation');
  });
});

describe('import validation + case persist/reopen', () => {
  it('imports valid upper and lower, persists, and reopens with identity + meshes', async () => {
    const { host, runtime, session, workspace, persistence } = bootWithMemory();
    await attach(host);

    const created = session.newCase({
      firstName: 'John',
      lastName: 'Doe',
      name: 'Case #10482',
      patientId: 'P-10482'
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const upper = await workspace.importController.importSelectedFile({
      source: 'file://upper.stl',
      fileName: 'upper.stl',
      extension: 'stl',
      bytes: makeBinaryStl(0),
      archRole: 'upper',
      quiet: true
    });
    expect(upper.ok).toBe(true);

    const lower = await workspace.importController.importSelectedFile({
      source: 'file://lower.stl',
      fileName: 'lower.stl',
      extension: 'stl',
      bytes: makeBinaryStl(20),
      archRole: 'lower',
      quiet: true
    });
    expect(lower.ok).toBe(true);

    const caseId = session.getPublicState().activeCase!.caseId;
    const saved = await workspace.cases.saveActiveCase(workspace);
    expect(saved.ok).toBe(true);
    expect(deriveClinicalCasePhase(session.getPublicState().activeCase)).toBe('orientation-ready');

    session.closeCase(true);
    host.runtimes.kernel.registry.clear();
    workspace.importCoordinator.objects.clear();
    expect(session.getPublicState().activeCase).toBeUndefined();

    const opened = await workspace.cases.openCase(workspace, caseId);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value.patient.displayName).toBe('John Doe');
    expect(opened.value.patient.patientId).toBe('P-10482');
    expect(opened.value.caseMeta.name).toBe('Case #10482');
    expect(opened.value.objects).toHaveLength(2);
    expect(opened.value.objects.some((o) => o.archRole === 'upper')).toBe(true);
    expect(opened.value.objects.some((o) => o.archRole === 'lower')).toBe(true);
    expect(host.runtimes.kernel.registry.getByObjectId(`${caseId as string}:upper-arch`)).toBeDefined();
    expect(host.runtimes.kernel.registry.getByObjectId(`${caseId as string}:lower-arch`)).toBeDefined();
    expect(deriveClinicalCasePhase(opened.value)).toBe('orientation-ready');

    const listed = await persistence.list();
    expect(listed.some((e) => e.caseId === caseId)).toBe(true);

    runtime.dispose();
    host.dispose();
  });

  it('rejects unsupported and empty mesh imports with actionable errors', async () => {
    const { host, runtime, session, workspace } = bootWithMemory();
    await attach(host);
    expect(session.newCase({ patientName: 'Test' }).ok).toBe(true);

    const unsupported = await workspace.importController.importSelectedFile({
      source: 'file://scan.xyz',
      fileName: 'scan.xyz',
      extension: 'xyz',
      bytes: new ArrayBuffer(8),
      archRole: 'upper'
    });
    expect(unsupported.ok).toBe(false);

    const empty = await workspace.importController.importSelectedFile({
      source: 'file://empty.stl',
      fileName: 'empty.stl',
      extension: 'stl',
      bytes: new ArrayBuffer(4),
      archRole: 'lower'
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.error.message.length).toBeGreaterThan(0);
    }

    runtime.dispose();
    host.dispose();
  });

  it('preserves a successful upper import when lower fails, allowing retry', async () => {
    const { host, runtime, session, workspace } = bootWithMemory();
    await attach(host);
    expect(session.newCase({ patientName: 'Retry Patient', name: 'Retry Case' }).ok).toBe(true);

    const upper = await workspace.importController.importSelectedFile({
      source: 'file://upper.stl',
      fileName: 'upper.stl',
      extension: 'stl',
      bytes: makeBinaryStl(0),
      archRole: 'upper',
      quiet: true
    });
    expect(upper.ok).toBe(true);

    const failedLower = await workspace.importController.importSelectedFile({
      source: 'file://bad.stl',
      fileName: 'bad.stl',
      extension: 'stl',
      bytes: new ArrayBuffer(4),
      archRole: 'lower',
      quiet: true
    });
    expect(failedLower.ok).toBe(false);

    const doc = session.getPublicState().activeCase!;
    expect(doc.objects.some((o) => o.archRole === 'upper')).toBe(true);
    expect(doc.objects.some((o) => o.archRole === 'lower')).toBe(false);
    expect(deriveClinicalCasePhase(doc)).toBe('importing');

    const retryLower = await workspace.importController.importSelectedFile({
      source: 'file://lower.stl',
      fileName: 'lower.stl',
      extension: 'stl',
      bytes: makeBinaryStl(15),
      archRole: 'lower',
      quiet: true
    });
    expect(retryLower.ok).toBe(true);
    expect(deriveClinicalCasePhase(session.getPublicState().activeCase)).toBe('orientation-ready');

    runtime.dispose();
    host.dispose();
  });
});

describe('ClinicalCaseService wiring', () => {
  it('exposes list/save/load through workspace.cases', async () => {
    const persistence = new MemoryClinicalCasePersistence();
    const service = new ClinicalCaseService(persistence);
    expect(await service.listCases()).toHaveLength(0);
    const doc = createEmptyClinicalDocument({ now: 3, name: 'N', patientName: 'P' });
    await persistence.save({ document: doc, meshes: [], savedAt: 3 });
    expect(await service.listCases()).toHaveLength(1);
  });
});
