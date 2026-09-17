/**
 * CLN-WORKFLOW-002 — guided segmentation steps.
 * Edit Scans → Mark Teeth → Auto Segmentation / Adjust → Verify Teeth → Next (Biomech locked).
 */

export type SegmentationGuideStepId =
  | 'edit-scans'
  | 'mark-teeth'
  | 'auto-segmentation'
  | 'adjust-boundaries'
  | 'verify-teeth';

export interface SegmentationGuideStep {
  readonly id: SegmentationGuideStepId;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
}

export const SEGMENTATION_GUIDE_STEPS: readonly SegmentationGuideStep[] = Object.freeze([
  Object.freeze({
    id: 'edit-scans',
    label: 'Edit Scans',
    shortLabel: '1 Edit',
    description: 'Inspect the prepared model before marking teeth.'
  }),
  Object.freeze({
    id: 'mark-teeth',
    label: 'Mark Teeth',
    shortLabel: '2 Mark',
    description: 'Click each tooth surface to place a marker.'
  }),
  Object.freeze({
    id: 'auto-segmentation',
    label: 'Auto Segmentation',
    shortLabel: '3 Auto',
    description: 'Run automatic tooth and gingiva identification.'
  }),
  Object.freeze({
    id: 'adjust-boundaries',
    label: 'Adjust Boundaries',
    shortLabel: '4 Adjust',
    description: 'Select, split, merge, or reassign tooth regions.'
  }),
  Object.freeze({
    id: 'verify-teeth',
    label: 'Verify Teeth',
    shortLabel: '5 Verify',
    description: 'Review FDI, confidence, and missing teeth before continuing.'
  })
]);

export interface ToothMarker {
  readonly id: string;
  readonly arch: 'upper' | 'lower' | 'unknown';
  readonly position: readonly [number, number, number];
  readonly faceIndex: number;
  readonly objectId: string;
  /** Mesh fingerprint at placement — markers bind to CURRENT FINAL geometry. */
  readonly geometryFingerprint: string;
  readonly tentativeFdi?: number;
  readonly createdAt: number;
}

export const nextGuideStep = (
  current: SegmentationGuideStepId
): SegmentationGuideStepId | undefined => {
  const idx = SEGMENTATION_GUIDE_STEPS.findIndex((s) => s.id === current);
  if (idx < 0 || idx >= SEGMENTATION_GUIDE_STEPS.length - 1) return undefined;
  return SEGMENTATION_GUIDE_STEPS[idx + 1]!.id;
};

export const prevGuideStep = (
  current: SegmentationGuideStepId
): SegmentationGuideStepId | undefined => {
  const idx = SEGMENTATION_GUIDE_STEPS.findIndex((s) => s.id === current);
  if (idx <= 0) return undefined;
  return SEGMENTATION_GUIDE_STEPS[idx - 1]!.id;
};
