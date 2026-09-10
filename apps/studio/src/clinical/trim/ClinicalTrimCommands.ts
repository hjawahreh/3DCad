/**
 * ClinicalTrimCommands — command id catalog for trim tool.
 */

export const CLINICAL_TRIM_COMMANDS = Object.freeze({
  activate: 'clinical.tool.trim',
  accept: 'clinical.trim.accept',
  cancel: 'clinical.trim.cancel',
  reset: 'clinical.trim.reset',
  undoPoint: 'clinical.trim.undoPoint',
  clear: 'clinical.trim.clear',
  close: 'clinical.trim.close',
  modeFreehand: 'clinical.trim.mode.freehand',
  modePolyline: 'clinical.trim.mode.polyline',
  undo: 'clinical.trim.undo',
  redo: 'clinical.trim.redo'
});

export type ClinicalTrimCommandId =
  (typeof CLINICAL_TRIM_COMMANDS)[keyof typeof CLINICAL_TRIM_COMMANDS];
