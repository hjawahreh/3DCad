/**
 * CLN-SEG-001 — production gate + reference labeling + worker mapping honesty.
 */
import { describe, expect, it } from 'vitest';
import {
  createProductionModelProvider,
  PRODUCTION_MODEL_GOVERNANCE
} from '../../../src/clinical/accuracy/index.js';
import {
  createDefaultSegmentationRegistry,
  PRODUCTION_MODEL_NOT_CONFIGURED,
  resolveProductionModelGate,
  resolveSegmentationClinicalStatus,
  TSEGFORMER_REPRODUCIBILITY
} from '../../../src/clinical/segmentation/index.js';
import { ReferenceHeuristicProvider } from '../../../src/clinical/segmentation/provider/ReferenceHeuristicProvider.js';

describe('CLN-SEG-001 production gate', () => {
  it('records TSegFormer reproducibility fields', () => {
    expect(TSEGFORMER_REPRODUCIBILITY.modelName).toBe('TSegFormer');
    expect(TSEGFORMER_REPRODUCIBILITY.license).toMatch(/MIT/i);
    expect(TSEGFORMER_REPRODUCIBILITY.checkpointClearedForProduct).toBe(false);
    expect(TSEGFORMER_REPRODUCIBILITY.availability).toBe('unavailable');
  });

  it('exposes Production model not configured when checkpoint absent', () => {
    const gate = resolveProductionModelGate();
    expect(gate.unavailableReason).toContain('Production model not configured');
    expect(PRODUCTION_MODEL_NOT_CONFIGURED).toMatch(/unavailable/i);
  });

  it('ProductionModelProvider refuses inference without checkpoint', async () => {
    const p = createProductionModelProvider();
    expect(p.info.operational).toBe(false);
    await expect(
      p.infer({
        objectId: 'x',
        sourceRevision: 1,
        geometryFingerprint: 'geo:x',
        mesh: null as never,
        preprocess: null as never,
        identificationThreshold: 0.5,
        signal: new AbortController().signal,
        report: () => undefined
      })
    ).rejects.toThrow(/unavailable|not configured/i);
  });

  it('does not claim clinical clearance in governance', () => {
    expect(PRODUCTION_MODEL_GOVERNANCE.clearedForClinicalClaims).toBe(false);
  });
});

describe('CLN-SEG-001 reference heuristic labeling', () => {
  it('marks reference provider as REFERENCE HEURISTIC development', () => {
    const p = new ReferenceHeuristicProvider();
    expect(p.info.displayName).toMatch(/REFERENCE HEURISTIC/i);
    expect(p.info.licenseNotes).toMatch(/NOT.*clinically accurate/i);
  });

  it('registry defaults to reference when production unavailable', () => {
    const registry = createDefaultSegmentationRegistry();
    expect(registry.getDefault().info.id).toBe('reference-heuristic');
    expect(registry.get('production-clinical-model').info.operational).toBe(false);
  });

  it('clinical status distinguishes reference vs production', () => {
    expect(
      resolveSegmentationClinicalStatus({ providerId: 'reference-heuristic' })
    ).toBe('Reference Segmentation');
    expect(
      resolveSegmentationClinicalStatus({ providerId: 'production-clinical-model' })
    ).toBe('Production Model — Not Validated');
  });
});
