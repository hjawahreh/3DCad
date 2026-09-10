/**
 * ClinicalPreparationCommands — command id catalog for preparation workflow.
 */

export const CLINICAL_PREPARATION_COMMANDS = Object.freeze({
  start: 'clinical.preparation.start',
  validate: 'clinical.preparation.validate',
  advanceStage: 'clinical.preparation.advanceStage',
  selectTool: 'clinical.preparation.selectTool',
  activateTool: 'clinical.preparation.activateTool',
  activateSession: 'clinical.preparation.activateSession',
  suspend: 'clinical.preparation.suspend',
  resume: 'clinical.preparation.resume',
  cancel: 'clinical.preparation.cancel',
  complete: 'clinical.preparation.complete',
  openPanel: 'clinical.preparation.openPanel'
});

export type ClinicalPreparationCommandId =
  (typeof CLINICAL_PREPARATION_COMMANDS)[keyof typeof CLINICAL_PREPARATION_COMMANDS];
