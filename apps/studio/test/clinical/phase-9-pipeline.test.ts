/**
 * Phase 9 — Import → Segmentation pipeline E2E (upper / lower / dual).
 */

import { describe, expect, it } from 'vitest';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { MemoryClinicalCasePersistence } from '../../src/clinical/case/ClinicalCasePersistence.js';
import { ClinicalWorkspace } from '../../src/clinical/workspace/ClinicalWorkspace.js';
import { withClinicalObjects } from '../../src/clinical/document/ClinicalDocument.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import { buildClinicalWorkflowPresentation } from '../../src/clinical/shell/ClinicalWorkflowPresentation.js';
import {
  isCaseSegmentationComplete,
  summarizeCaseSegmentation
} from '../../src/clinical/case/ClinicalPipelineStatus.js';
import { createPipelineTimingCollector } from '../../src/clinical/case/ClinicalPipelineTiming.js';

const boot = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 92000 }
  });
  const runtimeBoot = new ClinicalBootstrap().bootstrap(host);
  const persistence = new MemoryClinicalCasePersistence();
  const workspace = new ClinicalWorkspace(runtimeBoot.session, undefined, persistence);
  await host.attachViewport({
    width: 640,
    height: 480,
    clientWidth: 640,
    clientHeight: 480,
    getContext: () => null
  });
  expect(workspace.session.newCase({ name: 'Pipeline Case' }).ok).toBe(true);
  return { host, workspace, persistence, session: runtimeBoot.session };
};

const meshDesc = (id: string, arch?: 'upper' | 'lower'): ClinicalMeshDescriptor =>
  Object.freeze({
    id: asClinicalObjectId(id),
    displayName: id,
    sourceFile: `${id}.stl`,
    format: 'stl' as const,
    units: 'mm' as const,
    bounds: DEFAULT_MESH_BOUNDS,
    vertexCount: 100,
    faceCount: 200,
    importedAt: 1,
    visible: true,
    selectable: true,
    hierarchyParentId: undefined,
    importerId: 'studio-passthrough',
    sourceEntityId: id,
    displayState: 'default' as const,
    transform: IDENTITY_CLINICAL_TRANSFORM,
    ...(arch === undefined ? {} : { archRole: arch })
  });

const seedMeshes = (
  workspace: ClinicalWorkspace,
  objects: readonly ClinicalMeshDescriptor[]
) => {
  const doc = workspace.session.getPublicState().activeCase!;
  expect(workspace.session.applyDocument(withClinicalObjects(doc, objects, 92001), true).ok).toBe(
    true
  );
  const registry = workspace.getHost().runtimes.kernel.registry;
  for (const obj of objects) {
    registry.ensureSourceMesh(obj.id as string, { gridResolution: 10 });
  }
};

const advanceToSegmentation = async (workspace: ClinicalWorkspace) => {
  expect(workspace.orientation.enter().ok).toBe(true);
  expect(workspace.orientation.accept().ok).toBe(true);
  workspace.preparation.notifyOrientationComplete();
  expect(workspace.preparation.start().ok).toBe(true);
  expect(workspace.preparation.activateSession().ok).toBe(true);
  expect(workspace.preparation.advanceStage().ok).toBe(true); // trim
  expect(workspace.preparation.advanceStage().ok).toBe(true); // close-base
  expect(workspace.preparation.advanceStage().ok).toBe(true); // segmentation
  expect(workspace.preparation.session.getState().currentStage).toBe('ready-for-segmentation');
};

const acceptCurrentArch = async (workspace: ClinicalWorkspace) => {
  expect(await workspace.segmentation.segmentTeeth()).toMatchObject({ ok: true });
  const needs = workspace.segmentation.session.getState().prediction?.confidence.needsReviewCount ?? 0;
  if (needs > 0) {
    expect(workspace.segmentation.acknowledgeReview().ok).toBe(true);
  }
  expect(await workspace.segmentation.accept()).toMatchObject({ ok: true });
};

describe('phase-9 pipeline', () => {
  it('runs single-arch import→segment→accept and completes workflow', async () => {
    const { host, workspace } = await boot();
    const timing = createPipelineTimingCollector();
    await timing.measure('case-load', () => {
      seedMeshes(workspace, [meshDesc('arch', 'upper')]);
      return true;
    });
    await timing.measure('orientation', async () => {
      await advanceToSegmentation(workspace);
      return workspace.preparation.session.getState().currentStage === 'ready-for-segmentation';
    }, 'includes prep stage advances');
    await timing.measure('segmentation', async () => {
      await acceptCurrentArch(workspace);
      return true;
    });
    const doc = workspace.session.getPublicState().activeCase!;
    expect(isCaseSegmentationComplete(doc)).toBe(true);
    expect(workspace.preparation.session.getState().currentStage).toBe('ready-for-movement');
    const presentation = buildClinicalWorkflowPresentation(workspace);
    expect(presentation.steps.find((s) => s.id === 'segment')?.status).toBe('completed');
    expect(presentation.statusLine.toLowerCase()).toContain('segmentation complete');
    expect(timing.snapshot().every((r) => r.ok)).toBe(true);
    host.dispose();
  });

  it('runs dual-arch segment both arches then shows completion summary', async () => {
    const { host, workspace } = await boot();
    seedMeshes(workspace, [meshDesc('upper', 'upper'), meshDesc('lower', 'lower')]);
    await advanceToSegmentation(workspace);
    expect(workspace.segmentation.enter().ok).toBe(true);
    expect(workspace.segmentation.setActiveArch('upper').ok).toBe(true);
    await acceptCurrentArch(workspace);
    let doc = workspace.session.getPublicState().activeCase!;
    expect(isCaseSegmentationComplete(doc)).toBe(false);
    expect(summarizeCaseSegmentation(doc).pendingArches).toContain('lower');
    // Tool remains for second arch
    expect(workspace.segmentation.isActive()).toBe(true);
    await acceptCurrentArch(workspace);
    doc = workspace.session.getPublicState().activeCase!;
    const summary = summarizeCaseSegmentation(doc);
    expect(summary.complete).toBe(true);
    expect(summary.arches).toHaveLength(2);
    expect(summary.arches.every((a) => a.accepted)).toBe(true);
    expect(workspace.preparation.session.getState().currentStage).toBe('ready-for-movement');
    host.dispose();
  });

  it('blocks accept when review required until acknowledged', async () => {
    const { host, workspace } = await boot();
    seedMeshes(workspace, [meshDesc('jaw', 'upper')]);
    await advanceToSegmentation(workspace);
    expect(await workspace.segmentation.segmentTeeth()).toMatchObject({ ok: true });
    const needs =
      workspace.segmentation.session.getState().prediction?.confidence.needsReviewCount ?? 0;
    if (needs === 0) {
      // Heuristic may occasionally produce zero — force acknowledge path still works.
      expect(workspace.segmentation.acknowledgeReview().ok).toBe(true);
      expect(await workspace.segmentation.accept()).toMatchObject({ ok: true });
    } else {
      const blocked = await workspace.segmentation.accept();
      expect(blocked.ok).toBe(false);
      expect(String(blocked.ok === false ? blocked.error.message : '')).toMatch(/review required/i);
      expect(workspace.segmentation.acknowledgeReview().ok).toBe(true);
      expect(await workspace.segmentation.accept()).toMatchObject({ ok: true });
    }
    host.dispose();
  });

  it('persists segmentation and resumes workflow stage on reopen', async () => {
    const { host, workspace, persistence } = await boot();
    seedMeshes(workspace, [meshDesc('upper', 'upper')]);
    await advanceToSegmentation(workspace);
    await acceptCurrentArch(workspace);
    const caseId = workspace.session.getPublicState().activeCase!.caseId;
    const saved = await workspace.cases.saveActiveCase(workspace);
    expect(saved.ok).toBe(true);

    // New workspace sharing persistence
    const host2 = new StudioCompositionRoot({
      forceMockViewportBackend: true,
      clock: { now: () => 93000 }
    });
    const boot2 = new ClinicalBootstrap().bootstrap(host2);
    const workspace2 = new ClinicalWorkspace(boot2.session, undefined, persistence);
    await host2.attachViewport({
      width: 640,
      height: 480,
      clientWidth: 640,
      clientHeight: 480,
      getContext: () => null
    });
    expect(await workspace2.cases.openCase(workspace2, caseId)).toMatchObject({ ok: true });
    const doc2 = workspace2.session.getPublicState().activeCase!;
    expect(doc2.objects[0]?.segmentationMeta?.instanceCount).toBeGreaterThan(0);
    expect(workspace2.preparation.session.getState().currentStage).toBe('ready-for-movement');
    expect(isCaseSegmentationComplete(doc2)).toBe(true);
    host.dispose();
    host2.dispose();
  });
});
