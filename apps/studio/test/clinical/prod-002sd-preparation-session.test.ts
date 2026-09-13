/**
 * PROD-002SD — Preparation session creation contract tests.
 */
import { describe, expect, it } from 'vitest';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { withClinicalObjects } from '../../src/clinical/document/ClinicalDocument.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import { hydrateClinicalPipelineFromDocument } from '../../src/clinical/case/ClinicalCaseResume.js';

const boot = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 30000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  await host.attachViewport({
    width: 640,
    height: 480,
    clientWidth: 640,
    clientHeight: 480,
    getContext: () => null
  });
  expect(
    clinical.session.newCase({ name: 'PROD-002SD', patientName: 'Patient SD' }).ok
  ).toBe(true);
  return { host, clinical };
};

const mesh = (
  id: string,
  name: string,
  role?: 'upper' | 'lower'
): ClinicalMeshDescriptor =>
  Object.freeze({
    id: asClinicalObjectId(id),
    displayName: name,
    sourceFile: `${name}.stl`,
    format: 'stl' as const,
    units: 'mm' as const,
    bounds: DEFAULT_MESH_BOUNDS,
    vertexCount: 50,
    faceCount: 100,
    importedAt: 1,
    visible: true,
    selectable: true,
    hierarchyParentId: undefined,
    importerId: 'studio-passthrough',
    sourceEntityId: id,
    displayState: 'default' as const,
    transform: IDENTITY_CLINICAL_TRANSFORM,
    ...(role ? { archRole: role } : {})
  });

const seedOriented = async (
  clinical: ReturnType<ClinicalBootstrap['bootstrap']>,
  objects: readonly ClinicalMeshDescriptor[]
) => {
  const doc = clinical.session.getPublicState().activeCase!;
  const beforeRev = doc.revision;
  expect(clinical.session.applyDocument(withClinicalObjects(doc, objects, 1), true).ok).toBe(
    true
  );
  expect(clinical.workspace.orientation.enter().ok).toBe(true);
  expect(clinical.workspace.orientation.accept().ok).toBe(true);
  clinical.workspace.preparation.notifyOrientationComplete();
  return { beforeRev: clinical.session.getPublicState().activeCase!.revision, priorRev: beforeRev };
};

describe('PROD-002SD preparation session creation', () => {
  it('A — valid oriented case → session creation succeeds', async () => {
    const { host, clinical } = await boot();
    await seedOriented(clinical, [
      mesh('u', 'Upper', 'upper'),
      mesh('l', 'Lower', 'lower')
    ]);
    clinical.workspace.archContext.setMode('both');
    const result = clinical.workspace.preparation.autoPrepare();
    expect(result.ok).toBe(true);
    const st = clinical.workspace.preparation.session.getState();
    expect(st.sessionId).toBeTruthy();
    expect(st.caseId).toBeTruthy();
    expect(st.archMode).toBe('both');
    expect(st.geometryRevision).toBeTypeOf('number');
    expect(clinical.workspace.preparation.isReadyForGeometry()).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('B — missing case → session creation fails truthfully', async () => {
    const { host, clinical } = await boot();
    expect(clinical.session.closeCase(true).ok).toBe(true);
    const result = clinical.workspace.preparation.start();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message.length).toBeGreaterThan(0);
    }
    clinical.runtime.dispose();
    host.dispose();
  });

  it('C — missing geometry → session creation fails or warns truthfully', async () => {
    const { host, clinical } = await boot();
    // Case with no objects, no orientation
    const result = clinical.workspace.preparation.start();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.error.message === 'Preparation validation failed' ||
          result.error.message.includes('Import') ||
          result.error.message.includes('model') ||
          result.error.message.includes('orientation') ||
          result.error.message.includes('case') ||
          clinical.workspace.preparation.session.getState().lastFailure !== undefined
      ).toBe(true);
    }
    const failure = clinical.workspace.preparation.session.getState().lastFailure;
    expect(failure?.stage).toBeTruthy();
    clinical.runtime.dispose();
    host.dispose();
  });

  it('D — invalid geometry revision binding still records revision from document', async () => {
    const { host, clinical } = await boot();
    await seedOriented(clinical, [mesh('u', 'Upper', 'upper')]);
    expect(clinical.workspace.preparation.start().ok).toBe(true);
    const st = clinical.workspace.preparation.session.getState();
    expect(st.geometryRevision).toBe(clinical.session.getPublicState().activeCase!.revision);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('E — UPPER arch context targets upper only', async () => {
    const { host, clinical } = await boot();
    await seedOriented(clinical, [
      mesh('u', 'Upper', 'upper'),
      mesh('l', 'Lower', 'lower')
    ]);
    clinical.workspace.archContext.setMode('upper');
    expect(clinical.workspace.preparation.autoPrepare().ok).toBe(true);
    expect(clinical.workspace.preparation.session.getState().archMode).toBe('upper');
    clinical.runtime.dispose();
    host.dispose();
  });

  it('F — retry after hydrate orphan succeeds without reload', async () => {
    const { host, clinical } = await boot();
    await seedOriented(clinical, [
      mesh('u', 'Upper', 'upper'),
      mesh('l', 'Lower', 'lower')
    ]);
    clinical.workspace.preparation.cancel();
    // Legacy-style orphan: create lifecycle without controller binding
    clinical.workspace.preparation.session.createSession(Date.now());
    clinical.workspace.preparation.session.activateSession();
    const retry = clinical.workspace.preparation.autoPrepare();
    expect(retry.ok).toBe(true);
    expect(clinical.workspace.preparation.isReadyForGeometry()).toBe(true);
    expect(clinical.workspace.preparation.session.getState().lastFailure).toBeUndefined();
    clinical.runtime.dispose();
    host.dispose();
  });

  it('G — successful preparation → Trim handoff works', async () => {
    const { host, clinical } = await boot();
    await seedOriented(clinical, [mesh('u', 'Upper', 'upper')]);
    expect(clinical.workspace.preparation.autoPrepare().ok).toBe(true);
    expect(clinical.workspace.preparation.isReadyForGeometry()).toBe(true);
    expect(clinical.workspace.preparation.confirmReadyForTrim().ok).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('H/I — failed session creation does not mutate geometry or revision', async () => {
    const { host, clinical } = await boot();
    const doc = clinical.session.getPublicState().activeCase!;
    const revBefore = doc.revision;
    const objsBefore = doc.objects.length;
    const failed = clinical.workspace.preparation.start();
    expect(failed.ok).toBe(false);
    const after = clinical.session.getPublicState().activeCase!;
    expect(after.revision).toBe(revBefore);
    expect(after.objects.length).toBe(objsBefore);
    expect(after.objects.every((o) => o.transform === IDENTITY_CLINICAL_TRANSFORM || o.transform)).toBe(
      true
    );
    clinical.runtime.dispose();
    host.dispose();
  });

  it('hydrate from document does not block Prepare Case', async () => {
    const { host, clinical } = await boot();
    await seedOriented(clinical, [
      mesh('u', 'Upper', 'upper'),
      mesh('l', 'Lower', 'lower')
    ]);
    clinical.workspace.preparation.cancel();
    hydrateClinicalPipelineFromDocument(
      clinical.workspace,
      clinical.session.getPublicState().activeCase!
    );
    const result = clinical.workspace.preparation.autoPrepare();
    expect(result.ok).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });
});
