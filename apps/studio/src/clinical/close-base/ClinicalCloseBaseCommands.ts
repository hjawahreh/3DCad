/**
 * ClinicalCloseBaseCommands — command id catalog for Close Base.
 */

export const CLINICAL_CLOSE_BASE_COMMANDS = Object.freeze({
  activate: 'clinical.tool.closeBase',
  accept: 'clinical.closeBase.accept',
  preview: 'clinical.closeBase.preview',
  auto: 'clinical.closeBase.auto',
  manual: 'clinical.closeBase.manual',
  cancel: 'clinical.closeBase.cancel',
  reset: 'clinical.closeBase.reset',
  undo: 'clinical.closeBase.undo',
  redo: 'clinical.closeBase.redo',
  strategyPlane: 'clinical.closeBase.strategy.plane',
  strategySurface: 'clinical.closeBase.strategy.surface',
  parameterHeight: 'clinical.closeBase.parameter.height',
  parameterThickness: 'clinical.closeBase.parameter.thickness',
  parameterMargin: 'clinical.closeBase.parameter.margin',
  parameterOrientation: 'clinical.closeBase.parameter.orientation',
  parameterSmoothing: 'clinical.closeBase.parameter.smoothing'
});

export type ClinicalCloseBaseCommandId =
  (typeof CLINICAL_CLOSE_BASE_COMMANDS)[keyof typeof CLINICAL_CLOSE_BASE_COMMANDS];
