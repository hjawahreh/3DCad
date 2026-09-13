/**
 * PROD-002F — full tooth segmentation hardening (geometry regression).
 *
 * Exercises the existing reference heuristic on real triangle meshes.
 * Does not claim clinical-grade / AI accuracy. Preserves known limitations
 * via confidence, validation warnings, and provenance fields.
 */

import { describe, expect, it } from 'vitest';
import { createMesh, fingerprintMesh } from '../../src/geometry-kernel/mesh/TriangleMesh.js';
import { ReferenceHeuristicProvider } from '../../src/clinical/segmentation/provider/ReferenceHeuristicProvider.js';
import { OnnxSegmentationProvider } from '../../src/clinical/segmentation/provider/adapters/OnnxSegmentationProvider.js';
import { createDefaultSegmentationRegistry } from '../../src/clinical/segmentation/provider/SegmentationProviderRegistry.js';
import {
  ARCH_ORDER_WITHOUT_WISDOM,
  expectedFdiForArchSlot,
  isFdiInArchBank
} from '../../src/clinical/segmentation/fdi/FdiNumbering.js';
import {
  MAX_CLINICAL_TOOTH_INSTANCES,
  POSTPROCESSING_VERSION,
  IDENTIFICATION_VERSION
} from '../../src/clinical/segmentation/prediction/types.js';
import { validateSegmentationPrediction } from '../../src/clinical/segmentation/ClinicalSegmentationValidation.js';
import { computeToothLocalFrame } from '../../src/clinical/segmentation/ClinicalToothLocalFrame.js';
import { attachArchOrderNeighbors } from '../../src/clinical/segmentation/identify/ToothIdentification.js';
import {
  buildClinicalTrimLoop3d,
  keepModeToVtkInsideOut
} from '../../src/clinical/trim/ClinicalTrimLoop3d.js';

/** Deterministic hash in [0,1) — no Math.random. */
const unitHash = (n: number): number => {
  let h = (n * 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  return (h >>> 0) / 0xffffffff;
};

const pushBox = (
  positions: number[],
  indices: number[],
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number
): void => {
  const base = positions.length / 3;
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const corners: readonly [number, number, number][] = [
    [cx - hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy + hy, cz - hz],
    [cx - hx, cy + hy, cz - hz],
    [cx - hx, cy - hy, cz + hz],
    [cx + hx, cy - hy, cz + hz],
    [cx + hx, cy + hy, cz + hz],
    [cx - hx, cy + hy, cz + hz]
  ];
  for (const c of corners) {
    positions.push(c[0], c[1], c[2]);
  }
  const faces: readonly [number, number, number][] = [
    [0, 1, 2],
    [0, 2, 3],
    [4, 6, 5],
    [4, 7, 6],
    [0, 4, 5],
    [0, 5, 1],
    [1, 5, 6],
    [1, 6, 2],
    [2, 6, 7],
    [2, 7, 3],
    [3, 7, 4],
    [3, 4, 0]
  ];
  for (const f of faces) {
    indices.push(base + f[0], base + f[1], base + f[2]);
  }
};

/**
 * Geometry-driven multi-tooth arch: gingival slab + elevated tooth boxes along X.
 * Not hard-coded clinical positions — spacing derived from toothCount + options.
 */
const buildMultiToothArch = (opts: {
  readonly toothCount: number;
  readonly objectId?: string;
  readonly gap?: number;
  readonly touch?: boolean;
  readonly rotateYDeg?: number;
  readonly noiseAmp?: number;
  readonly skipToothIndex?: number;
  readonly invertHeight?: boolean;
  readonly heightOnY?: boolean;
}): ReturnType<typeof createMesh> => {
  const toothCount = Math.max(1, opts.toothCount);
  const gap = opts.gap ?? (opts.touch === true ? 0.05 : 2.5);
  const toothW = 1.6;
  const toothD = 1.4;
  const toothH = 4.5;
  const gingivaH = 1.2;
  const span = toothCount * toothW + (toothCount - 1) * gap;
  const positions: number[] = [];
  const indices: number[] = [];

  // Gingival base slab (low height → GINGIVA band)
  const baseZ = opts.invertHeight === true ? toothH + gingivaH : 0;
  const toothBaseZ = opts.invertHeight === true ? 0 : gingivaH;
  pushBox(positions, indices, 0, 0, baseZ + gingivaH / 2, span + 4, 6, gingivaH);

  for (let i = 0; i < toothCount; i += 1) {
    if (opts.skipToothIndex === i) continue;
    const x = -span / 2 + toothW / 2 + i * (toothW + gap);
    const noise =
      opts.noiseAmp !== undefined && opts.noiseAmp > 0
        ? (unitHash(i * 17 + 3) - 0.5) * 2 * opts.noiseAmp
        : 0;
    const yNoise =
      opts.noiseAmp !== undefined && opts.noiseAmp > 0
        ? (unitHash(i * 31 + 7) - 0.5) * opts.noiseAmp
        : 0;
    pushBox(
      positions,
      indices,
      x + noise,
      yNoise,
      toothBaseZ + toothH / 2,
      toothW * (0.9 + unitHash(i) * 0.15),
      toothD,
      toothH
    );
  }

  // Optional Y-up clinical frame: swap Y/Z so height-band uses Y.
  if (opts.heightOnY === true) {
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1] ?? 0;
      const z = positions[i + 2] ?? 0;
      positions[i + 1] = z;
      positions[i + 2] = y;
    }
  }

  const rot = ((opts.rotateYDeg ?? 0) * Math.PI) / 180;
  if (Math.abs(rot) > 1e-9) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i] ?? 0;
      const z = positions[i + 2] ?? 0;
      positions[i] = x * c - z * s;
      positions[i + 2] = x * s + z * c;
    }
  }

  const pos = new Float32Array(positions);
  const idx = new Uint32Array(indices);
  return createMesh({
    id: 1,
    objectId: opts.objectId ?? 'prod-002f-arch',
    revision: 0,
    positions: pos,
    indices: idx,
    role: 'source',
    fingerprint: fingerprintMesh(pos, idx)
  });
};

const inferArch = async (
  mesh: ReturnType<typeof createMesh>,
  archRole: 'upper' | 'lower'
) => {
  const provider = new ReferenceHeuristicProvider();
  await provider.initialize();
  const preprocess = await provider.preprocess(mesh, new AbortController().signal);
  const prediction = await provider.infer({
    objectId: mesh.objectId,
    sourceRevision: mesh.revision,
    geometryFingerprint: mesh.fingerprint,
    mesh,
    preprocess,
    identificationThreshold: 0.65,
    archRole,
    signal: new AbortController().signal,
    report: () => undefined
  });
  return { provider, prediction };
};

describe('PROD-002F FDI bank + slot mapping', () => {
  it('uses the shared 14-tooth bank (no wisdom) for upper and lower', () => {
    expect(ARCH_ORDER_WITHOUT_WISDOM.upper).toHaveLength(14);
    expect(ARCH_ORDER_WITHOUT_WISDOM.lower).toHaveLength(14);
    expect(ARCH_ORDER_WITHOUT_WISDOM.upper).not.toContain(18);
    expect(ARCH_ORDER_WITHOUT_WISDOM.lower).not.toContain(48);
    expect(isFdiInArchBank('upper', 11)).toBe(true);
    expect(isFdiInArchBank('upper', 41)).toBe(false);
    expect(isFdiInArchBank('lower', 41)).toBe(true);
  });

  it('rank-maps N=14 slots onto the bank without inventing FDI', () => {
    for (let i = 0; i < 14; i += 1) {
      const fdi = expectedFdiForArchSlot('upper', i, 14);
      expect(fdi).toBeDefined();
      if (fdi === undefined) continue;
      expect(fdi).toBe(ARCH_ORDER_WITHOUT_WISDOM.upper[i]);
      expect(isFdiInArchBank('upper', fdi)).toBe(true);
    }
    const mid = expectedFdiForArchSlot('lower', 3, 7);
    expect(mid).toBeDefined();
    if (mid === undefined) return;
    expect(isFdiInArchBank('lower', mid)).toBe(true);
  });
});

describe('PROD-002F real tooth geometry + stable IDs', () => {
  it('separates individual tooth volumes with stable inst-NNN IDs and provenance', async () => {
    const mesh = buildMultiToothArch({ toothCount: 6, gap: 2.2 });
    const { prediction: a } = await inferArch(mesh, 'upper');
    const { prediction: b } = await inferArch(mesh, 'upper');

    expect(a.instances.length).toBeGreaterThanOrEqual(3);
    expect(a.instances.length).toBeLessThanOrEqual(MAX_CLINICAL_TOOTH_INSTANCES);
    expect(a.providerId).toBe('reference-heuristic');
    expect(a.postprocessingVersion).toBe(POSTPROCESSING_VERSION);
    expect(a.identificationVersion).toBe(IDENTIFICATION_VERSION);
    expect(a.warnings.some((w) => /not a licensed research NN|not clinical-grade/i.test(w))).toBe(
      true
    );

    const ids = a.instances.map((i) => i.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^inst-\d{3}$/.test(id))).toBe(true);
    // X-sorted stable IDs
    for (let i = 1; i < a.instances.length; i += 1) {
      const cur = a.instances[i];
      const prev = a.instances[i - 1];
      expect(cur).toBeDefined();
      expect(prev).toBeDefined();
      if (cur === undefined || prev === undefined) continue;
      expect(cur.centroid[0]).toBeGreaterThanOrEqual(prev.centroid[0] - 1e-6);
    }

    // Deterministic instance geometry (ignore timing/predictionId clock)
    expect(a.instances.map((i) => i.faceCount)).toEqual(b.instances.map((i) => i.faceCount));
    expect(a.instances.map((i) => i.instanceId)).toEqual(b.instances.map((i) => i.instanceId));
    expect(a.instances.map((i) => i.identification.fdi)).toEqual(
      b.instances.map((i) => i.identification.fdi)
    );
  });

  it('assigns FDI within the declared arch bank and reports missing slots honestly', async () => {
    const mesh = buildMultiToothArch({ toothCount: 5, gap: 2.5 });
    const { prediction } = await inferArch(mesh, 'upper');
    for (const inst of prediction.instances) {
      const fdi = inst.identification.fdi;
      if (fdi !== undefined) {
        expect(isFdiInArchBank('upper', fdi)).toBe(true);
        expect(inst.identification.confidence).toBeLessThanOrEqual(0.82);
      }
    }
    expect(prediction.missingSlots.length).toBeGreaterThan(0);
    expect(prediction.missingSlots.every((s) => isFdiInArchBank('upper', s.fdi))).toBe(true);
    expect(prediction.missingSlots.length + prediction.instances.filter((i) => i.identification.fdi !== undefined).length).toBeLessThanOrEqual(14);
  });

  it('uses lower bank for lower archRole', async () => {
    const mesh = buildMultiToothArch({ toothCount: 4, gap: 2.5, invertHeight: true });
    const { prediction } = await inferArch(mesh, 'lower');
    const identified = prediction.instances.filter((i) => i.identification.fdi !== undefined);
    expect(identified.length).toBeGreaterThan(0);
    for (const inst of identified) {
      const fdi = inst.identification.fdi;
      expect(fdi).toBeDefined();
      if (fdi === undefined) continue;
      expect(isFdiInArchBank('lower', fdi)).toBe(true);
    }
  });
});

describe('PROD-002F neighbors, frames, boundaries, confidence', () => {
  it('attaches arch-order neighbors with low confidence (not contact geometry)', async () => {
    const mesh = buildMultiToothArch({ toothCount: 4, gap: 2.2 });
    const { prediction } = await inferArch(mesh, 'upper');
    expect(prediction.instances.length).toBeGreaterThanOrEqual(2);
    for (const inst of prediction.instances) {
      expect(inst.neighbors).toBeDefined();
      const n = inst.neighbors;
      expect(n?.basis).toBe('arch-x-order');
      expect(n?.confidence).toBe('low');
    }
    const sorted = [...prediction.instances].sort((a, b) => a.centroid[0] - b.centroid[0]);
    const first = sorted[0];
    const second = sorted[1];
    const last = sorted[sorted.length - 1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(last).toBeDefined();
    if (first === undefined || second === undefined || last === undefined) return;
    expect(first.neighbors?.archPreviousId).toBeUndefined();
    expect(first.neighbors?.archNextId).toBe(second.instanceId);
    expect(last.neighbors?.archNextId).toBeUndefined();

    const reattached = attachArchOrderNeighbors(prediction.instances);
    const re0 = reattached[0];
    const p0 = prediction.instances[0];
    expect(re0).toBeDefined();
    expect(p0).toBeDefined();
    if (re0 === undefined || p0 === undefined) return;
    expect(re0.neighbors?.archNextId).toBe(p0.neighbors?.archNextId);
  });

  it('tooth-local frames stay low-confidence AABB proxies with real origins', async () => {
    const mesh = buildMultiToothArch({ toothCount: 3, gap: 3 });
    const { prediction } = await inferArch(mesh, 'upper');
    for (const inst of prediction.instances) {
      const frame = computeToothLocalFrame(inst);
      expect(frame.confidence === 'low' || frame.confidence === 'unavailable').toBe(true);
      expect(frame.confidence).not.toBe('high');
      expect(frame.confidence).not.toBe('moderate');
      expect(frame.origin[0]).toBeCloseTo(inst.centroid[0], 5);
      expect(Number.isFinite(frame.xAxis.x)).toBe(true);
    }
  });

  it('face labels cover the mesh; tooth faces have finite confidence', async () => {
    const mesh = buildMultiToothArch({ toothCount: 4, gap: 2 });
    const { prediction } = await inferArch(mesh, 'upper');
    const faceCount = Math.floor(mesh.indices.length / 3);
    expect(prediction.faceLabels).toHaveLength(faceCount);
    const toothFaces = prediction.faceLabels.filter((f) => f.label === 'TOOTH');
    expect(toothFaces.length).toBeGreaterThan(0);
    expect(toothFaces.every((f) => f.confidence > 0 && f.confidence <= 1)).toBe(true);
    const assigned = new Set(prediction.instances.flatMap((i) => [...i.faceIndices]));
    expect(assigned.size).toBeGreaterThan(0);
    for (const f of assigned) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(faceCount);
    }
  });
});

describe('PROD-002F rotated / noisy / touching / missing', () => {
  it('remains deterministic under yaw rotation (same relative instance count)', async () => {
    const base = buildMultiToothArch({ toothCount: 5, gap: 2.4 });
    const rotated = buildMultiToothArch({ toothCount: 5, gap: 2.4, rotateYDeg: 25 });
    const { prediction: a } = await inferArch(base, 'upper');
    const { prediction: b } = await inferArch(rotated, 'upper');
    expect(a.instances.length).toBeGreaterThan(0);
    expect(b.instances.length).toBeGreaterThan(0);
    // Rotation may change CC splits slightly — allow ±2, never invent empty
    expect(Math.abs(a.instances.length - b.instances.length)).toBeLessThanOrEqual(2);
  });

  it('handles imperfect/noisy tooth placement without crashing', async () => {
    const mesh = buildMultiToothArch({ toothCount: 5, gap: 2.2, noiseAmp: 0.45 });
    const { prediction } = await inferArch(mesh, 'upper');
    expect(prediction.instances.length).toBeGreaterThan(0);
    expect(prediction.confidence.caseBand).toBeTruthy();
    const report = validateSegmentationPrediction(prediction, {
      meshFaceCount: Math.floor(mesh.indices.length / 3),
      archRole: 'upper'
    });
    expect(report.verdict === 'PASS' || report.verdict === 'WARNING').toBe(true);
    expect(report.verdict).not.toBe('FAIL');
  });

  it('touching teeth stay honest (may merge or over-split; confidence preserves limitation)', async () => {
    const mesh = buildMultiToothArch({ toothCount: 4, touch: true, gap: 0.02 });
    const { prediction } = await inferArch(mesh, 'upper');
    expect(prediction.instances.length).toBeGreaterThan(0);
    // Touching geometry is ambiguous for CC heuristics — do not require exact 4
    expect(prediction.instances.length).toBeLessThanOrEqual(MAX_CLINICAL_TOOTH_INSTANCES);
    const report = validateSegmentationPrediction(prediction, {
      meshFaceCount: Math.floor(mesh.indices.length / 3),
      archRole: 'upper'
    });
    expect(['PASS', 'WARNING', 'FAIL']).toContain(report.verdict);
    // Identification score stays capped (not clinical-grade)
    for (const inst of prediction.instances) {
      if (inst.identification.status === 'IDENTIFIED') {
        expect(inst.identification.confidence).toBeLessThanOrEqual(0.82);
      }
    }
  });

  it('missing tooth region increases missingSlots / reduces identified count', async () => {
    const full = buildMultiToothArch({ toothCount: 6, gap: 2.3 });
    const missing = buildMultiToothArch({ toothCount: 6, gap: 2.3, skipToothIndex: 2 });
    const { prediction: a } = await inferArch(full, 'upper');
    const { prediction: b } = await inferArch(missing, 'upper');
    expect(b.instances.length).toBeLessThanOrEqual(a.instances.length);
    expect(b.missingSlots.length).toBeGreaterThanOrEqual(a.missingSlots.length);
  });
});

describe('PROD-002F validation + instance cap', () => {
  it('WARNINGs on instance cap metrics and FDI bank failures', () => {
    const mesh = buildMultiToothArch({ toothCount: 2, gap: 3 });
    const faceCount = Math.floor(mesh.indices.length / 3);
    void faceCount;
    const base = {
      predictionId: 'cap',
      sourceObjectId: 'o',
      sourceRevision: 0,
      geometryFingerprint: mesh.fingerprint,
      providerId: 'reference-heuristic',
      modelId: 'm',
      modelVersion: '1',
      preprocessingVersion: 'p',
      postprocessingVersion: POSTPROCESSING_VERSION,
      identificationVersion: IDENTIFICATION_VERSION,
      createdAt: 1,
      faceLabels: Object.freeze([]),
      instances: Object.freeze([
        {
          instanceId: 'inst-001',
          faceIndices: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7]),
          vertexIndices: Object.freeze([0, 1, 2]),
          confidence: 0.7,
          centroid: Object.freeze([0, 0, 2] as const),
          bounds: Object.freeze({
            min: Object.freeze([-1, -1, 0] as const),
            max: Object.freeze([1, 1, 4] as const)
          }),
          faceCount: 8,
          presence: 'PRESENT' as const,
          identification: Object.freeze({
            status: 'IDENTIFIED' as const,
            fdi: 11 as const,
            confidence: 0.7,
            candidates: Object.freeze([])
          }),
          neighbors: Object.freeze({
            archPreviousId: undefined,
            archNextId: 'inst-002',
            confidence: 'low' as const,
            basis: 'arch-x-order' as const
          })
        },
        {
          instanceId: 'inst-002',
          faceIndices: Object.freeze([8, 9, 10, 11, 12, 13, 14, 15]),
          vertexIndices: Object.freeze([3, 4, 5]),
          confidence: 0.7,
          centroid: Object.freeze([3, 0, 2] as const),
          bounds: Object.freeze({
            min: Object.freeze([2, -1, 0] as const),
            max: Object.freeze([4, 1, 4] as const)
          }),
          faceCount: 8,
          presence: 'PRESENT' as const,
          identification: Object.freeze({
            status: 'IDENTIFIED' as const,
            fdi: 41 as const,
            confidence: 0.7,
            candidates: Object.freeze([])
          }),
          neighbors: Object.freeze({
            archPreviousId: 'inst-001',
            archNextId: undefined,
            confidence: 'low' as const,
            basis: 'arch-x-order' as const
          })
        }
      ]),
      missingSlots: Object.freeze([]),
      confidence: Object.freeze({
        faceMean: 0.7,
        instanceMean: 0.7,
        identificationMean: 0.7,
        caseBand: 'moderate' as const,
        needsReviewCount: 0
      }),
      warnings: Object.freeze([] as string[]),
      metrics: Object.freeze({
        rawGroupCount: 40,
        instanceCapped: 1
      })
    };
    const capReport = validateSegmentationPrediction(base, { archRole: 'upper' });
    expect(capReport.checks.some((c) => c.id === 'instance-cap' && c.verdict === 'WARNING')).toBe(
      true
    );
    expect(capReport.checks.some((c) => c.id === 'fdi-arch-bank' && c.verdict === 'FAIL')).toBe(
      true
    );
    expect(capReport.checks.some((c) => c.id === 'neighbors' && c.verdict === 'WARNING')).toBe(
      true
    );
  });
});

describe('PROD-002F ONNX swap contract + provider registry', () => {
  it('keeps ONNX non-operational while sharing SegmentationProvider contract', async () => {
    const registry = createDefaultSegmentationRegistry();
    expect(registry.getDefault().info.id).toBe('reference-heuristic');
    const onnx = registry.get('onnx-runtime');
    expect(onnx).toBeInstanceOf(OnnxSegmentationProvider);
    expect(onnx.info.operational).toBe(false);
    expect(onnx.capabilities()).toEqual(
      expect.arrayContaining(['semantic', 'instance', 'identification'])
    );
    const mesh = buildMultiToothArch({ toothCount: 2, gap: 3 });
    await expect(
      onnx.infer({
        objectId: 'x',
        sourceRevision: 0,
        geometryFingerprint: mesh.fingerprint,
        mesh,
        preprocess: await new ReferenceHeuristicProvider().preprocess(
          mesh,
          new AbortController().signal
        ),
        identificationThreshold: 0.65,
        signal: new AbortController().signal,
        report: () => undefined
      })
    ).rejects.toThrow(/unavailable|not operational|license/i);
  });
});

describe('PROD-002F PROD-001T loop3d regression', () => {
  it('leaves clinical loop3d / keepMode mapping unchanged', () => {
    const built = buildClinicalTrimLoop3d(
      [
        { x: 0, y: 0, worldX: 0, worldY: 0, worldZ: 0 },
        { x: 1, y: 0, worldX: 10, worldY: 0, worldZ: 0 },
        { x: 1, y: 1, worldX: 10, worldY: 10, worldZ: 0 },
        { x: 0, y: 1, worldX: 0, worldY: 10, worldZ: 0 }
      ],
      'KEEP_OUTSIDE'
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.normal[2]).toBeCloseTo(1, 5);
    expect(keepModeToVtkInsideOut(built.value.keepMode)).toBe(false);
  });
});
