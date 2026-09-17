/**
 * CLN-WORKSTATION-001 — compact clinical workstation UX.
 */
import { describe, expect, it } from 'vitest';
import { ClinicalBootstrap } from '../../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../../src/application/composition-root.js';
import { screenDeltaToOrbitRadians } from '../../../src/application/camera-orbit-mapping.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../../src/clinical/import/ClinicalMeshDescriptor.js';
import { withClinicalObjects } from '../../../src/clinical/document/ClinicalDocument.js';
import {
  deriveTrimInteractionState,
  trimGuidedMessage
} from '../../../src/clinical/trim/ClinicalTrimInteractionState.js';
import {
  DEFAULT_TRIM_STATE,
  isLassoLikeTrimMode,
  isStrokeTrimMode
} from '../../../src/clinical/trim/ClinicalTrimState.js';
import type { TrimBoundaryPoint } from '../../../src/clinical/trim/ClinicalTrimBoundaryMath.js';
import { DEFAULT_CLINICAL_DISPLAY_PREFERENCES } from '../../../src/clinical/display/ClinicalDisplayPreferences.js';
import { DEFAULT_CLINICAL_LAYOUT } from '../../../src/clinical/workspace/ClinicalLayout.js';
import { reconstructModeForDraw } from '../../../src/clinical/trim/ClinicalTrimSurfacePath.js';
import { buildClinicalWorkflowPresentation } from '../../../src/clinical/shell/ClinicalWorkflowPresentation.js';

const point = (x: number, y: number, z = 0): TrimBoundaryPoint =>
  Object.freeze({ x, y, localX: x, localY: y, localZ: z });

const mesh = (id: string, name: string, arch: 'upper' | 'lower' = 'upper'): ClinicalMeshDescriptor =>
  Object.freeze({
    id: asClinicalObjectId(id),
    displayName: name,
    sourceFile: `${name}.stl`,
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
    archRole: arch
  });

const bootWorkstation = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 44000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  await host.attachViewport({
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    getContext: () => null
  });
  expect(clinical.session.newCase({ name: 'CLN-WORKSTATION-001' }).ok).toBe(true);
  const doc = clinical.session.getPublicState().activeCase!;
  expect(
    clinical.session.applyDocument(
      withClinicalObjects(doc, [mesh('upper', 'Upper'), mesh('lower', 'Lower', 'lower')], 44001),
      true
    ).ok
  ).toBe(true);
  host.runtimes.kernel.registry.ensureSourceMesh('upper', { gridResolution: 8 });
  host.runtimes.kernel.registry.ensureSourceMesh('lower', { gridResolution: 8 });
  const { geometryWarmup } = await import('../../../src/geometry-kernel/context/GeometryWarmup.js');
  for (const id of ['upper', 'lower']) {
    const working =
      host.runtimes.kernel.registry.getByObjectId(id, 'working') ??
      host.runtimes.kernel.registry.getByObjectId(id, 'source');
    if (working !== undefined) {
      await geometryWarmup.warmMesh(working, { arch: id === 'upper' ? 'upper' : 'lower' });
    }
  }
  expect(clinical.workspace.orientation.enter().ok).toBe(true);
  expect(clinical.workspace.orientation.accept().ok).toBe(true);
  clinical.workspace.preparation.notifyOrientationComplete();
  expect(clinical.workspace.preparation.start().ok).toBe(true);
  expect(clinical.workspace.preparation.activateSession().ok).toBe(true);
  expect(clinical.workspace.preparation.advanceStage().ok).toBe(true);
  return { host, clinical };
};

describe('CLN-WORKSTATION-001', () => {
  it('layout defaults favor viewport (rail + collapsed inspector)', () => {
    expect(DEFAULT_CLINICAL_LAYOUT.leftWidth).toBeLessThanOrEqual(120);
    expect(DEFAULT_CLINICAL_LAYOUT.rightCollapsed).toBe(true);
    expect(DEFAULT_CLINICAL_LAYOUT.bottomCollapsed).toBe(true);
  });

  it('axes stay off by default', () => {
    expect(DEFAULT_CLINICAL_DISPLAY_PREFERENCES.showAxes).toBe(false);
    expect(DEFAULT_CLINICAL_DISPLAY_PREFERENCES.showOrigin).toBe(false);
    expect(DEFAULT_CLINICAL_DISPLAY_PREFERENCES.showOrientationIndicator).toBe(false);
  });

  it('orbit mapping is single-authoritative and directionally consistent', () => {
    const right = screenDeltaToOrbitRadians(20, 0);
    const up = screenDeltaToOrbitRadians(0, -20);
    expect(right.yaw).toBeLessThan(0);
    expect(up.pitch).toBeGreaterThan(0);
  });

  it('Lasso and Curve are stroke modes; Curve uses smooth SurfacePath', () => {
    expect(isStrokeTrimMode('lasso')).toBe(true);
    expect(isStrokeTrimMode('curve')).toBe(true);
    expect(isLassoLikeTrimMode('curve')).toBe(true);
    expect(reconstructModeForDraw('curve')).toBe('always');
    expect(reconstructModeForDraw('lasso')).toBe('gaps');
    expect(trimGuidedMessage('ARMED', 'lasso')).toMatch(/release to trim/i);
    expect(trimGuidedMessage('ARMED', 'curve')).toMatch(/release to trim/i);
  });

  it('workflow presentation stays Import→Orient→Prepare→Trim→Base→Segment', async () => {
    const { clinical, host } = await bootWorkstation();
    const presentation = buildClinicalWorkflowPresentation(clinical.workspace);
    const clinicalIds = presentation.steps.map((s) => s.id).slice(0, 6);
    expect(clinicalIds).toEqual([
      'import',
      'orient',
      'prepare',
      'trim',
      'close-base',
      'segment'
    ]);
    // Future stages may exist as locked placeholders — Movement must not be started.
    expect(presentation.steps.find((s) => s.id === 'movement')?.status).not.toBe('current');
    clinical.runtime.dispose();
    host.dispose();
  });

  it('Trim enter defaults to Lasso; Clear keeps mode for redraw', async () => {
    const { clinical, host } = await bootWorkstation();
    const trim = clinical.workspace.trim;
    expect(trim.enter().ok).toBe(true);
    expect(trim.session.getState().drawMode).toBe('lasso');
    expect(
      deriveTrimInteractionState({
        state: trim.session.getState(),
        previewReady: false,
        pointerDrawing: false
      })
    ).toBe('ARMED');
    for (let i = 0; i < 5; i += 1) expect(trim.addPoint(point(i, i, 0)).ok).toBe(true);
    expect(trim.clearBoundary().ok).toBe(true);
    expect(trim.session.getState().points).toHaveLength(0);
    expect(trim.session.getState().drawMode).toBe('lasso');
    expect(trim.isActive()).toBe(true);
    expect(trim.addPoint(point(12, 8, 1)).ok).toBe(true);
    expect(trim.session.getState().points).toHaveLength(1);
    expect(trim.setDrawMode('curve').ok).toBe(true);
    expect(trim.session.getState().drawMode).toBe('curve');
    clinical.runtime.dispose();
    host.dispose();
  });

  it('arch context defaults to BOTH and switches without corrupting trim idle state', async () => {
    const { clinical, host } = await bootWorkstation();
    expect(clinical.workspace.archContext.getMode()).toBe('both');
    clinical.workspace.archContext.setMode('upper');
    expect(clinical.workspace.archContext.getMode()).toBe('upper');
    clinical.workspace.archContext.setMode('both');
    expect(clinical.workspace.archContext.getMode()).toBe('both');
    expect(DEFAULT_TRIM_STATE.drawMode).toBe('idle');
    clinical.runtime.dispose();
    host.dispose();
  });
});
