/**
 * PROD-003 — canonical workflow order: Import → Orient → Prepare → Trim → Base → Segment.
 */
import { describe, expect, it } from 'vitest';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import {
  withClinicalObjects,
  withPreparationMeta
} from '../../src/clinical/document/ClinicalDocument.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import { buildClinicalWorkflowPresentation } from '../../src/clinical/shell/ClinicalWorkflowPresentation.js';
import { inferPreparationStageFromDocument } from '../../src/clinical/case/ClinicalPipelineStatus.js';

const mesh = (
  id: string,
  name: string,
  arch: 'upper' | 'lower',
  revision = 0
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
    archRole: arch,
    geometryRevision: revision,
    geometryFingerprint: `geo:${id}:${String(revision)}`
  });

const boot = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 5000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  await host.attachViewport({
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    getContext: () => null
  });
  expect(clinical.session.newCase({ name: 'PROD-003' }).ok).toBe(true);
  return { clinical, workspace: clinical.workspace };
};

describe('PROD-003 canonical workflow order', () => {
  it('workflow bar order is Import → Orient → Prepare → Trim → Base → Segment', async () => {
    const { workspace } = await boot();
    const presentation = buildClinicalWorkflowPresentation(workspace);
    const ids = presentation.steps.slice(0, 6).map((s) => s.id);
    expect(ids).toEqual(['import', 'orient', 'prepare', 'trim', 'close-base', 'segment']);
  });

  it('locks Close Base and Segment until Trim unlocks Close Base stage', async () => {
    const { clinical, workspace } = await boot();
    const doc = clinical.session.getPublicState().activeCase!;
    expect(
      clinical.session.applyDocument(
        withClinicalObjects(doc, [mesh('u', 'Upper', 'upper'), mesh('l', 'Lower', 'lower')], 5001),
        true
      ).ok
    ).toBe(true);
    workspace.preparation.session.setStage('ready-for-trim');

    const afterPrep = buildClinicalWorkflowPresentation(workspace);
    expect(afterPrep.steps.find((s) => s.id === 'trim')?.status).not.toBe('locked');
    expect(afterPrep.steps.find((s) => s.id === 'close-base')?.status).toBe('locked');
    expect(afterPrep.steps.find((s) => s.id === 'segment')?.status).toBe('locked');

    workspace.preparation.session.setStage('ready-for-close-base');
    const afterTrim = buildClinicalWorkflowPresentation(workspace);
    expect(afterTrim.steps.find((s) => s.id === 'close-base')?.status).not.toBe('locked');
    expect(afterTrim.steps.find((s) => s.id === 'segment')?.status).toBe('locked');

    workspace.preparation.session.setStage('ready-for-segmentation');
    const afterBase = buildClinicalWorkflowPresentation(workspace);
    expect(afterBase.steps.find((s) => s.id === 'segment')?.status).not.toBe('locked');
  });

  it('reopen inference never jumps Trim → Segment without Base', async () => {
    const { clinical } = await boot();
    const doc = clinical.session.getPublicState().activeCase!;
    const withMeshes = withClinicalObjects(
      doc,
      [mesh('u', 'Upper', 'upper', 2)],
      5002
    );
    const trimmed = withPreparationMeta(
      withMeshes,
      Object.freeze({
        algorithmVersion: 'v1',
        uiState: 'ready' as const,
        sourceFingerprint: 'fp',
        warningCount: 0,
        archCount: 1,
        preparedAt: 1,
        timingMs: 1,
        message: 'ok',
        lastMilestone: 'trimmed' as const
      }),
      5003
    );
    expect(inferPreparationStageFromDocument(trimmed)).toBe('ready-for-close-base');

    const based = withPreparationMeta(
      trimmed,
      Object.freeze({
        ...trimmed.preparationMeta!,
        lastMilestone: 'based' as const
      }),
      5004
    );
    expect(inferPreparationStageFromDocument(based)).toBe('ready-for-segmentation');

    // Geometry revision alone must not unlock Segment (old bug).
    const revisionOnly = withPreparationMeta(
      withClinicalObjects(doc, [mesh('u2', 'Upper', 'upper', 3)], 5005),
      Object.freeze({
        algorithmVersion: 'v1',
        uiState: 'ready' as const,
        sourceFingerprint: 'fp2',
        warningCount: 0,
        archCount: 1,
        preparedAt: 1,
        timingMs: 1,
        message: 'ok'
      }),
      5006
    );
    expect(inferPreparationStageFromDocument(revisionOnly)).toBe('ready-for-close-base');
  });
});
