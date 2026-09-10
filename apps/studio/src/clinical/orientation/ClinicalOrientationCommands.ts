/**
 * ClinicalOrientationCommands — command id catalog for orientation.
 */

export const CLINICAL_ORIENTATION_COMMANDS = Object.freeze({
  enter: 'clinical.tool.orient',
  accept: 'clinical.orientation.accept',
  cancel: 'clinical.orientation.cancel',
  reset: 'clinical.orientation.reset',
  snap: 'clinical.orientation.snap',
  rotatePos: 'clinical.orientation.rotatePositive',
  rotateNeg: 'clinical.orientation.rotateNegative',
  modeFree: 'clinical.orientation.mode.free',
  modeX: 'clinical.orientation.mode.x',
  modeY: 'clinical.orientation.mode.y',
  modeZ: 'clinical.orientation.mode.z',
  increment1: 'clinical.orientation.increment.1',
  increment5: 'clinical.orientation.increment.5',
  increment15: 'clinical.orientation.increment.15',
  undo: 'clinical.orientation.undo',
  redo: 'clinical.orientation.redo'
} as const);

export type ClinicalOrientationCommandId =
  (typeof CLINICAL_ORIENTATION_COMMANDS)[keyof typeof CLINICAL_ORIENTATION_COMMANDS];
