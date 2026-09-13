/**
 * Restrained clinical palettes for segmentation visualization (Phase 8).
 * Avoid neon; prefer enamel / gingiva / review tones.
 */

import type {
  SegmentationPrediction,
  SemanticLabel,
  ToothInstancePrediction
} from '../prediction/types.js';
import type { SegmentationViewMode } from '../ClinicalSegmentationSession.js';

/** Professional semantic colors (sRGB hex). */
export const SEGMENTATION_SEMANTIC_COLORS: Readonly<Record<SemanticLabel, number>> = Object.freeze({
  GINGIVA: 0x8f6b5c,
  TOOTH: 0xe8ddd0,
  UNKNOWN: 0x6b7280
});

const INSTANCE_PALETTE: readonly number[] = Object.freeze([
  0xd4c4a8, 0xc9b8a0, 0xe0d2bc, 0xbba890, 0xd8c8b0, 0xc2b094, 0xe6d6c0, 0xae9a82, 0xd0c0a8,
  0xc6b49c, 0xdbcbb4, 0xb4a088, 0xcebea6, 0xbfad95, 0xe2d4be, 0xa8927a
]);

const hexToRgb = (hex: number): readonly [number, number, number] =>
  Object.freeze([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255] as const);

const writeRgb = (out: Float32Array, faceIndex: number, hex: number, boost = 1): void => {
  const [r, g, b] = hexToRgb(hex);
  const o = faceIndex * 3;
  out[o] = Math.min(1, (r / 255) * boost);
  out[o + 1] = Math.min(1, (g / 255) * boost);
  out[o + 2] = Math.min(1, (b / 255) * boost);
};

const instanceColor = (index: number): number =>
  INSTANCE_PALETTE[index % INSTANCE_PALETTE.length] ?? 0xd4c4a8;

const confidenceHex = (value: number): number => {
  if (value >= 0.85) return 0xc5d4c0; // muted sage — high
  if (value >= 0.65) return 0xd8c9a8; // warm sand — moderate
  if (value >= 0.4) return 0xd4b896; // amber muted — low
  return 0xc4a090; // soft terracotta — needs review
};

/**
 * Build per-face RGB colors (length faceCount * 3, 0–1).
 * Does not mutate prediction or source mesh.
 */
export const buildSegmentationFaceColors = (input: {
  readonly prediction: SegmentationPrediction;
  readonly viewMode: SegmentationViewMode;
  readonly selectedInstanceId: string | undefined;
  readonly faceCount: number;
}): Float32Array => {
  const { prediction, viewMode, selectedInstanceId, faceCount } = input;
  const out = new Float32Array(faceCount * 3);
  const faceToInstance = new Map<number, ToothInstancePrediction>();
  prediction.instances.forEach((inst, idx) => {
    for (const f of inst.faceIndices) {
      faceToInstance.set(f, inst);
    }
    void idx;
  });
  const instanceIndex = new Map<string, number>();
  prediction.instances.forEach((inst, idx) => instanceIndex.set(inst.instanceId, idx));

  for (let f = 0; f < faceCount; f += 1) {
    const semantic = prediction.faceLabels[f];
    const label: SemanticLabel = semantic?.label ?? 'UNKNOWN';
    const inst = faceToInstance.get(f);

    if (viewMode === 'semantic') {
      writeRgb(out, f, SEGMENTATION_SEMANTIC_COLORS[label]);
      continue;
    }

    if (viewMode === 'confidence') {
      const c = semantic?.confidence ?? inst?.confidence ?? 0.35;
      writeRgb(out, f, confidenceHex(c));
      continue;
    }

    if (viewMode === 'boundary') {
      const base =
        label === 'GINGIVA'
          ? SEGMENTATION_SEMANTIC_COLORS.GINGIVA
          : inst !== undefined
            ? instanceColor(instanceIndex.get(inst.instanceId) ?? 0)
            : SEGMENTATION_SEMANTIC_COLORS.UNKNOWN;
      // Emphasize uncertain / unknown borders with darker tone
      const uncertain =
        label === 'UNKNOWN' ||
        inst?.identification.status === 'UNCERTAIN' ||
        inst?.identification.status === 'UNKNOWN';
      writeRgb(out, f, base, uncertain ? 0.55 : 0.92);
      continue;
    }

    // instance | fdi | review — tooth instances as clinical entities; gingiva distinct
    if (label === 'GINGIVA' || inst === undefined) {
      writeRgb(
        out,
        f,
        label === 'GINGIVA' ? SEGMENTATION_SEMANTIC_COLORS.GINGIVA : SEGMENTATION_SEMANTIC_COLORS.UNKNOWN
      );
      continue;
    }

    let hex = instanceColor(instanceIndex.get(inst.instanceId) ?? 0);
    if (viewMode === 'review' || viewMode === 'fdi') {
      if (
        inst.identification.status === 'UNCERTAIN' ||
        inst.identification.status === 'UNKNOWN' ||
        inst.confidence < 0.5
      ) {
        hex = 0xc4a090;
      }
    }
    const selected = selectedInstanceId === inst.instanceId;
    writeRgb(out, f, hex, selected ? 1.18 : 1);
  }

  return out;
};

/** Expand per-face RGB to non-indexed vertex colors (3 corners × 3 channels). */
export const expandFaceColorsToVertexColors = (faceColors: Float32Array): Float32Array => {
  const faceCount = Math.floor(faceColors.length / 3);
  const out = new Float32Array(faceCount * 9);
  for (let f = 0; f < faceCount; f += 1) {
    const r = faceColors[f * 3]!;
    const g = faceColors[f * 3 + 1]!;
    const b = faceColors[f * 3 + 2]!;
    const o = f * 9;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = r;
    out[o + 4] = g;
    out[o + 5] = b;
    out[o + 6] = r;
    out[o + 7] = g;
    out[o + 8] = b;
  }
  return out;
};
