/**
 * PROD-002SB — Trim interaction arming, clear/redraw, tool switch.
 */

import { describe, expect, it } from 'vitest';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import { withClinicalObjects } from '../../src/clinical/document/ClinicalDocument.js';
import {
  deriveTrimInteractionState,
  type TrimInteractionState
} from '../../src/clinical/trim/ClinicalTrimInteractionState.js';
import { DEFAULT_TRIM_STATE } from '../../src/clinical/trim/ClinicalTrimState.js';
import type { TrimBoundaryPoint } from '../../src/clinical/trim/ClinicalTrimBoundaryMath.js';

const point = (x: number, y: number, z = 0): TrimBoundaryPoint =>
  Object.freeze({ x, y, localX: x, localY: y, localZ: z });

const mesh = (id: string, name: string): ClinicalMeshDescriptor =>
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
    transform: IDENTITY_CLINICAL_TRANSFORM
  });

const bootTrim = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 22000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  await host.attachViewport({
    width: 640,
    height: 480,
    clientWidth: 640,
    clientHeight: 480,
    getContext: () => null
  });
  expect(clinical.session.newCase({ name: 'PROD-002SB Trim' }).ok).toBe(true);
  const doc = clinical.session.getPublicState().activeCase!;
  expect(
    clinical.session.applyDocument(withClinicalObjects(doc, [mesh('jaw', 'Jaw')], 22001), true).ok
  ).toBe(true);
  expect(clinical.workspace.orientation.enter().ok).toBe(true);
  expect(clinical.workspace.orientation.accept().ok).toBe(true);
  clinical.workspace.preparation.notifyOrientationComplete();
  expect(clinical.workspace.preparation.start().ok).toBe(true);
  expect(clinical.workspace.preparation.activateSession().ok).toBe(true);
  expect(clinical.workspace.preparation.advanceStage().ok).toBe(true);
  expect(clinical.workspace.trim.enter().ok).toBe(true);
  return { host, clinical };
};

describe('PROD-002SB deriveTrimInteractionState', () => {
  it('maps freehand/polyline arming and drawing', () => {
    expect(
      deriveTrimInteractionState({
        state: { ...DEFAULT_TRIM_STATE, drawMode: 'idle', phase: 'drawing' },
        previewReady: false,
        pointerDrawing: false
      })
    ).toBe('IDLE');
    expect(
      deriveTrimInteractionState({
        state: { ...DEFAULT_TRIM_STATE, drawMode: 'freehand', phase: 'drawing' },
        previewReady: false,
        pointerDrawing: false
      })
    ).toBe('FREEHAND_ARMED');
    expect(
      deriveTrimInteractionState({
        state: { ...DEFAULT_TRIM_STATE, drawMode: 'polyline', phase: 'drawing' },
        previewReady: false,
        pointerDrawing: false
      })
    ).toBe('POLYLINE_ARMED');
    expect(
      deriveTrimInteractionState({
        state: {
          ...DEFAULT_TRIM_STATE,
          drawMode: 'freehand',
          phase: 'drawing',
          pointerCaptured: true
        },
        previewReady: false,
        pointerDrawing: true
      })
    ).toBe('DRAWING');
    expect(
      deriveTrimInteractionState({
        state: {
          ...DEFAULT_TRIM_STATE,
          drawMode: 'freehand',
          phase: 'drawing',
          closed: true,
          points: [point(0, 0), point(1, 0), point(1, 1)]
        },
        previewReady: false,
        pointerDrawing: false
      })
    ).toBe('CLOSED');
    expect(
      deriveTrimInteractionState({
        state: {
          ...DEFAULT_TRIM_STATE,
          drawMode: 'freehand',
          phase: 'drawing',
          closed: true,
          points: [point(0, 0), point(1, 0), point(1, 1)]
        },
        previewReady: true,
        pointerDrawing: false
      })
    ).toBe('PREVIEWING');
  });
});

describe('PROD-002SB Trim Freehand / Clear / Polyline / Switch', () => {
  it('A — Freehand arms immediately then accepts points', async () => {
    const { clinical, host } = await bootTrim();
    const trim = clinical.workspace.trim;
    expect(trim.setDrawMode('freehand').ok).toBe(true);
    const armed = deriveTrimInteractionState({
      state: trim.session.getState(),
      previewReady: trim.controller.isPreviewReady(),
      pointerDrawing: trim.controller.isPointerCaptured()
    });
    expect(armed).toBe('FREEHAND_ARMED' satisfies TrimInteractionState);

    for (let i = 0; i < 12; i += 1) {
      expect(trim.addPoint(point(10 + i * 3, 20 + (i % 4), i * 0.1)).ok).toBe(true);
    }
    expect(trim.session.getState().points.length).toBeGreaterThan(0);
    expect(trim.closeBoundary().ok).toBe(true);
    expect(trim.session.getState().closed).toBe(true);
    expect(
      deriveTrimInteractionState({
        state: trim.session.getState(),
        previewReady: false,
        pointerDrawing: false
      })
    ).toBe('CLOSED');
    clinical.runtime.dispose();
    host.dispose();
  });

  it('B — Clear resets then redraw works without re-select', async () => {
    const { clinical, host } = await bootTrim();
    const trim = clinical.workspace.trim;
    expect(trim.setDrawMode('freehand').ok).toBe(true);
    for (let i = 0; i < 6; i += 1) {
      expect(trim.addPoint(point(5 + i * 2, 8)).ok).toBe(true);
    }
    expect(trim.clearBoundary().ok).toBe(true);
    const afterClear = trim.session.getState();
    expect(afterClear.points).toHaveLength(0);
    expect(afterClear.closed).toBe(false);
    expect(afterClear.pointerCaptured).toBe(false);
    expect(afterClear.drawMode).toBe('freehand');
    expect(trim.controller.isPointerCaptured()).toBe(false);
    expect(trim.isActive()).toBe(true);
    expect(
      deriveTrimInteractionState({
        state: afterClear,
        previewReady: false,
        pointerDrawing: false
      })
    ).toBe('FREEHAND_ARMED');

    for (let i = 0; i < 5; i += 1) {
      expect(trim.addPoint(point(30 + i * 2, 40)).ok).toBe(true);
    }
    expect(trim.session.getState().points.length).toBeGreaterThan(0);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('B+ — Clear after preview keeps Trim active and armed', async () => {
    const { clinical, host } = await bootTrim();
    const trim = clinical.workspace.trim;
    expect(trim.setDrawMode('polyline').ok).toBe(true);
    for (const p of [
      point(100, 100),
      point(300, 100),
      point(200, 280)
    ]) {
      expect(trim.addPoint(p).ok).toBe(true);
    }
    expect(trim.closeBoundary().ok).toBe(true);
    // Simulate preview-ready / executing without VTK (controller flag + session phase).
    trim.session.markExecuting('geo:preview-test', 'op-trim-preview');
    (trim.controller as unknown as { previewReady: boolean }).previewReady = true;
    expect(trim.isActive()).toBe(true);

    expect(trim.clearBoundary().ok).toBe(true);
    expect(trim.isActive()).toBe(true);
    expect(trim.session.getState().points).toHaveLength(0);
    expect(trim.session.getState().drawMode).toBe('polyline');
    expect(trim.controller.isPreviewReady()).toBe(false);
    expect(trim.addPoint(point(10, 10, 1)).ok).toBe(true);
    expect(trim.session.getState().points.length).toBe(1);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('C — Polyline registers five surface-local points', async () => {
    const { clinical, host } = await bootTrim();
    const trim = clinical.workspace.trim;
    expect(trim.setDrawMode('polyline').ok).toBe(true);
    expect(
      deriveTrimInteractionState({
        state: trim.session.getState(),
        previewReady: false,
        pointerDrawing: false
      })
    ).toBe('POLYLINE_ARMED');
    for (let i = 0; i < 5; i += 1) {
      expect(trim.addPoint(point(12 + i * 4, 18, 2 + i)).ok).toBe(true);
    }
    const pts = trim.session.getState().points;
    expect(pts).toHaveLength(5);
    for (const p of pts) {
      expect(p.localX).toBeTypeOf('number');
      expect(p.localY).toBeTypeOf('number');
      expect(p.localZ).toBeTypeOf('number');
    }
    clinical.runtime.dispose();
    host.dispose();
  });

  it('D — Tool switch cancels gesture and starts clean', async () => {
    const { clinical, host } = await bootTrim();
    const trim = clinical.workspace.trim;
    expect(trim.setDrawMode('freehand').ok).toBe(true);
    expect(trim.addPoint(point(1, 1)).ok).toBe(true);
    expect(trim.addPoint(point(4, 2)).ok).toBe(true);
    expect(trim.session.getState().points.length).toBeGreaterThan(0);

    expect(trim.setDrawMode('polyline').ok).toBe(true);
    expect(trim.session.getState().points).toHaveLength(0);
    expect(trim.session.getState().drawMode).toBe('polyline');
    expect(trim.addPoint(point(10, 10, 1)).ok).toBe(true);
    expect(trim.addPoint(point(20, 12, 1)).ok).toBe(true);
    expect(trim.session.getState().points.length).toBe(2);

    expect(trim.setDrawMode('freehand').ok).toBe(true);
    expect(trim.session.getState().points).toHaveLength(0);
    expect(trim.addPoint(point(7, 7, 0)).ok).toBe(true);
    expect(trim.session.getState().points.length).toBe(1);
    clinical.runtime.dispose();
    host.dispose();
  });
});
