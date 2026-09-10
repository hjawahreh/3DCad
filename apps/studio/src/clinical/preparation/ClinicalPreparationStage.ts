/**
 * ClinicalPreparationStage — immutable preparation milestones.
 */

export type ClinicalPreparationStage =
  | 'orientation-complete'
  | 'ready-for-trim'
  | 'ready-for-close-base'
  | 'ready-for-segmentation'
  | 'ready-for-movement'
  | 'preparation-complete';

export const PREPARATION_STAGE_ORDER: readonly ClinicalPreparationStage[] = Object.freeze([
  'orientation-complete',
  'ready-for-trim',
  'ready-for-close-base',
  'ready-for-segmentation',
  'ready-for-movement',
  'preparation-complete'
]);

export const STAGE_LABELS: Readonly<Record<ClinicalPreparationStage, string>> = Object.freeze({
  'orientation-complete': 'Orientation Complete',
  'ready-for-trim': 'Ready For Trim',
  'ready-for-close-base': 'Ready For Close Base',
  'ready-for-segmentation': 'Ready For Segmentation',
  'ready-for-movement': 'Ready For Movement',
  'preparation-complete': 'Preparation Complete'
});

export const nextStage = (
  current: ClinicalPreparationStage
): ClinicalPreparationStage | undefined => {
  const index = PREPARATION_STAGE_ORDER.indexOf(current);
  if (index < 0 || index >= PREPARATION_STAGE_ORDER.length - 1) {
    return undefined;
  }
  return PREPARATION_STAGE_ORDER[index + 1];
};

export const isTerminalStage = (stage: ClinicalPreparationStage): boolean =>
  stage === 'preparation-complete';
