/**
 * PROD-002R — Trim clear / redraw state machine regression.
 */

import { describe, expect, it } from 'vitest';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { ClinicalTrimSession } from '../../src/clinical/trim/ClinicalTrimSession.js';
import { asClinicalObjectId } from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import { withClinicalObjects } from '../../src/clinical/document/ClinicalDocument.js';
import type { TrimBoundaryPoint } from '../../src/clinical/trim/ClinicalTrimBoundaryMath.js';

const point = (x: number, y: number): TrimBoundaryPoint =>
  Object.freeze({ x, y, localX: x, localY: y, localZ: 0 });

const bootTrim = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 18500 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  await host.attachViewport({
    width: 640,
    height: 480,
    clientWidth: 640,
    clientHeight: 480,
    getContext: () => null
  });
  expect(clinical.session.newCase({ name: 'Trim Clear Case' }).ok).toBe(true);
  return { host, clinical };
};

describe('PROD-002R ClinicalTrimSession.clearPoints', () => {
  it('resets pointerCaptured, validation, and kernelFingerprint', () => {
    const session = new ClinicalTrimSession();
    const objectId = asClinicalObjectId('case-1:upper-arch');
    session.begin({ objectId, now: 1000 });
    session.setDrawMode('polyline');
    session.addPoint(point(10, 10));
    session.addPoint(point(20, 10));
    session.addPoint(point(20, 20));
    session.closePoints();
    session.setPointerCaptured(true);
    session.setLastHitSummary('hit upper molar');
    session.setValidationReport({
      passed: true,
      validatedAt: 1000,
      checks: Object.freeze([
        Object.freeze({
          id: 'finite-values' as const,
          label: 'Finite values',
          passed: true,
          message: 'ok'
        })
      ])
    });
    session.markExecuting('geo:abc123', 'op-trim-1');

    expect(session.getState().points.length).toBeGreaterThan(0);
    expect(session.getState().pointerCaptured).toBe(true);
    expect(session.getState().validationReport).toBeDefined();
    expect(session.getState().kernelFingerprint).toBe('geo:abc123');

    session.clearPoints();

    const state = session.getState();
    expect(state.points).toHaveLength(0);
    expect(state.closed).toBe(false);
    expect(state.pointerCaptured).toBe(false);
    expect(state.validationReport).toBeUndefined();
    expect(state.kernelFingerprint).toBeUndefined();
    expect(state.operationId).toBeUndefined();
    expect(state.lastHitSummary).toBeUndefined();
    expect(state.phase).toBe('drawing');
  });
});

describe('PROD-002R trim clear / redraw via controller', () => {
  it('clears boundary then accepts five new points repeatedly', async () => {
    const { host, clinical } = await bootTrim();
    const trim = clinical.workspace.trim;
    const objectId = asClinicalObjectId('jaw');

    // Minimal mesh so trim can enter (orientation + prep path from trim.test.ts).
    const mesh = Object.freeze({
      id: objectId,
      displayName: 'Jaw',
      sourceFile: 'jaw.stl',
      format: 'stl' as const,
      units: 'mm' as const,
      bounds: Object.freeze({
        min: Object.freeze({ x: 0, y: 0, z: 0 }),
        max: Object.freeze({ x: 100, y: 100, z: 20 })
      }),
      vertexCount: 100,
      faceCount: 200,
      importedAt: 1,
      visible: true,
      selectable: true,
      hierarchyParentId: undefined,
      importerId: 'studio-passthrough',
      sourceEntityId: 'jaw',
      displayState: 'default' as const,
      transform: Object.freeze({
        elements: Object.freeze([
          1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1
        ] as const)
      })
    });

    const doc = clinical.session.getPublicState().activeCase!;
    expect(clinical.session.applyDocument(withClinicalObjects(doc, [mesh], 18501), true).ok).toBe(
      true
    );

    expect(clinical.workspace.orientation.enter().ok).toBe(true);
    expect(clinical.workspace.orientation.accept().ok).toBe(true);
    clinical.workspace.preparation.notifyOrientationComplete();
    expect(clinical.workspace.preparation.start().ok).toBe(true);
    expect(clinical.workspace.preparation.activateSession().ok).toBe(true);
    expect(clinical.workspace.preparation.advanceStage().ok).toBe(true);

    expect(trim.enter().ok).toBe(true);
    expect(trim.setDrawMode('polyline').ok).toBe(true);

    for (let i = 0; i < 3; i += 1) {
      trim.session.addPoint(point(100 + i * 10, 100));
      trim.session.addPoint(point(200 + i * 10, 100));
      trim.session.addPoint(point(200 + i * 10, 200));
      expect(trim.session.getState().points.length).toBe(3);

      expect(trim.clearBoundary().ok).toBe(true);
      expect(trim.session.getState().points).toHaveLength(0);
      expect(trim.session.getState().closed).toBe(false);

      for (let p = 0; p < 5; p += 1) {
        expect(trim.addPoint(point(110 + p * 5, 110 + p * 5)).ok).toBe(true);
      }
      expect(trim.session.getState().points).toHaveLength(5);

      expect(trim.clearBoundary().ok).toBe(true);
      expect(trim.session.getState().points).toHaveLength(0);
    }

    clinical.runtime.dispose();
    host.dispose();
  });
});
