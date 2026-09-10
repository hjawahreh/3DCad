/**
 * Clinical workflow presentation adapter — maps existing clinical state to
 * user-facing workflow steps and actions. Presentation-only; no runtime changes.
 */

import type { ClinicalPreparationStage } from '../preparation/ClinicalPreparationStage.js';
import type { ClinicalPreparationState } from '../preparation/ClinicalPreparationState.js';
import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';

export type ClinicalWorkflowStepId =
  | 'import'
  | 'orient'
  | 'prepare'
  | 'trim'
  | 'close-base'
  | 'segment'
  | 'identify'
  | 'analyze'
  | 'movement'
  | 'biomechanics'
  | 'treatment';

export type ClinicalWorkflowStepStatus =
  | 'completed'
  | 'current'
  | 'available'
  | 'locked'
  | 'optional';

export interface ClinicalWorkflowStepView {
  readonly id: ClinicalWorkflowStepId;
  readonly label: string;
  readonly shortLabel: string;
  readonly status: ClinicalWorkflowStepStatus;
  readonly hint: string;
}

export interface ClinicalPrimaryAction {
  readonly id: string;
  readonly label: string;
  readonly commandId?: string;
  readonly disabled?: boolean;
}

export interface ClinicalWorkflowPresentation {
  readonly steps: readonly ClinicalWorkflowStepView[];
  readonly currentStepId: ClinicalWorkflowStepId;
  readonly currentTitle: string;
  readonly currentDescription: string;
  readonly nextTitle: string;
  readonly statusLine: string;
  readonly primaryAction: ClinicalPrimaryAction;
  readonly secondaryActions: readonly ClinicalPrimaryAction[];
  readonly checklist: readonly { readonly id: string; readonly label: string; readonly done: boolean }[];
  readonly emptyWorkspace: boolean;
  readonly caseName: string | undefined;
  readonly saveLabel: 'Saved' | 'Unsaved changes' | 'No case';
  readonly activeToolLabel: string | undefined;
}

const STEP_META: readonly {
  readonly id: ClinicalWorkflowStepId;
  readonly label: string;
  readonly shortLabel: string;
}[] = Object.freeze([
  Object.freeze({ id: 'import', label: 'Import', shortLabel: 'Import' }),
  Object.freeze({ id: 'orient', label: 'Orient', shortLabel: 'Orient' }),
  Object.freeze({ id: 'prepare', label: 'Prepare', shortLabel: 'Prepare' }),
  Object.freeze({ id: 'trim', label: 'Trim', shortLabel: 'Trim' }),
  Object.freeze({ id: 'close-base', label: 'Close Base', shortLabel: 'Base' }),
  Object.freeze({ id: 'segment', label: 'Segment', shortLabel: 'Segment' }),
  Object.freeze({ id: 'identify', label: 'Identify', shortLabel: 'Identify' }),
  Object.freeze({ id: 'analyze', label: 'Analyze', shortLabel: 'Analyze' }),
  Object.freeze({ id: 'movement', label: 'Movement', shortLabel: 'Move' }),
  Object.freeze({ id: 'biomechanics', label: 'Biomechanics', shortLabel: 'Biomech' }),
  Object.freeze({ id: 'treatment', label: 'Treatment', shortLabel: 'Plan' })
]);

const STAGE_INDEX: Readonly<Record<ClinicalPreparationStage, number>> = Object.freeze({
  'orientation-complete': 0,
  'ready-for-trim': 1,
  'ready-for-close-base': 2,
  'ready-for-segmentation': 3,
  'ready-for-movement': 4,
  'preparation-complete': 5
});

const USER_STATUS: Readonly<Record<string, string>> = Object.freeze({
  'Preparation idle': 'Ready to prepare your model',
  'Preparation session created': 'Preparation started',
  'Preparation session active': 'Preparing model…',
  'Preparation session suspended': 'Preparation paused',
  'Preparation session resumed': 'Preparation resumed',
  'Preparation cancelled': 'Preparation cancelled',
  'Preparation complete — ready for geometry tools': 'Preparation complete — ready for Trim',
  'Orientation validated': 'Orientation complete',
  'Preparation ready': 'Model ready for preparation',
  'Validation passed': 'Checks passed',
  'Validation failed': 'Some checks need attention'
});

export const toUserFacingStatus = (internal: string): string =>
  USER_STATUS[internal] ?? internal.replace(/_/g, ' ');

const hasModels = (doc: ClinicalDocumentSnapshot | undefined): boolean =>
  doc !== undefined && doc.objects.length > 0;

const stageReached = (
  prep: ClinicalPreparationState,
  stage: ClinicalPreparationStage
): boolean => {
  if (prep.completedStages.includes(stage)) {
    return true;
  }
  return STAGE_INDEX[prep.currentStage] >= STAGE_INDEX[stage];
};

const resolveCurrentStep = (input: {
  readonly hasModels: boolean;
  readonly prep: ClinicalPreparationState;
  readonly orienting: boolean;
  readonly trimming: boolean;
  readonly closingBase: boolean;
  readonly segmenting: boolean;
  readonly segmentPhase: string;
}): ClinicalWorkflowStepId => {
  if (input.trimming) return 'trim';
  if (input.closingBase) return 'close-base';
  if (input.segmenting) {
    if (input.segmentPhase === 'ready-for-review' || input.segmentPhase === 'complete') {
      return 'identify';
    }
    return 'segment';
  }
  if (input.orienting) return 'orient';
  if (!input.hasModels) return 'import';

  const stage = input.prep.currentStage;
  const phase = input.prep.workflowPhase;

  if (stage === 'ready-for-segmentation' || STAGE_INDEX[stage] >= STAGE_INDEX['ready-for-segmentation']) {
    return 'segment';
  }
  if (stage === 'ready-for-close-base') return 'close-base';
  if (stage === 'ready-for-trim' || phase === 'ready-for-geometry') return 'trim';

  if (
    phase === 'preparation-ready' ||
    phase === 'tool-selection' ||
    phase === 'preparation-session' ||
    phase === 'tool-activation' ||
    phase === 'validation' ||
    phase === 'complete' ||
    input.prep.orientationValidated
  ) {
    return 'prepare';
  }

  return 'orient';
};

const buildSteps = (
  current: ClinicalWorkflowStepId,
  prep: ClinicalPreparationState,
  models: boolean,
  oriented: boolean
): readonly ClinicalWorkflowStepView[] => {
  const currentIndex = STEP_META.findIndex((s) => s.id === current);

  return STEP_META.map((meta, index) => {
    let status: ClinicalWorkflowStepStatus = 'locked';
    let hint = `Complete ${STEP_META[Math.max(0, index - 1)]?.label ?? 'previous step'} first`;

    if (meta.id === 'import') {
      status = models ? 'completed' : current === 'import' ? 'current' : 'available';
      hint = models ? 'Scan imported' : 'Import a dental scan to begin';
    } else if (meta.id === 'orient') {
      if (oriented || stageReached(prep, 'ready-for-trim')) {
        status = 'completed';
        hint = 'Orientation complete';
      } else if (!models) {
        status = 'locked';
        hint = 'Import a case to continue';
      } else if (current === 'orient') {
        status = 'current';
        hint = 'Align the dental arch with the workspace axes';
      } else {
        status = 'available';
        hint = 'Orient your model';
      }
    } else if (meta.id === 'prepare') {
      if (stageReached(prep, 'ready-for-trim') || prep.workflowPhase === 'ready-for-geometry') {
        status = 'completed';
        hint = 'Preparation complete';
      } else if (!oriented && !models) {
        status = 'locked';
        hint = 'Import a case to continue';
      } else if (!oriented && current !== 'prepare') {
        status = 'locked';
        hint = 'Complete Orient first';
      } else if (current === 'prepare') {
        status = 'current';
        hint = 'Prepare the model for geometry tools';
      } else if (oriented || models) {
        status = 'available';
        hint = 'Prepare your model';
      }
    } else if (meta.id === 'trim') {
      if (stageReached(prep, 'ready-for-close-base') && prep.currentStage !== 'ready-for-trim') {
        status = 'completed';
        hint = 'Trim complete';
      } else if (!stageReached(prep, 'ready-for-trim') && prep.workflowPhase !== 'ready-for-geometry') {
        status = 'locked';
        hint = 'Complete Prepare first';
      } else if (current === 'trim') {
        status = 'current';
        hint = 'Draw a boundary around the area to trim';
      } else {
        status = 'available';
        hint = 'Trim unwanted scan regions';
      }
    } else if (meta.id === 'close-base') {
      if (stageReached(prep, 'ready-for-segmentation') && prep.currentStage !== 'ready-for-close-base') {
        status = 'completed';
        hint = 'Base created';
      } else if (!stageReached(prep, 'ready-for-close-base')) {
        status = 'locked';
        hint = 'Complete Trim first';
      } else if (current === 'close-base') {
        status = 'current';
        hint = 'Create a stable model base';
      } else {
        status = 'available';
        hint = 'Create base';
      }
    } else if (meta.id === 'segment') {
      if (stageReached(prep, 'ready-for-movement') && prep.currentStage !== 'ready-for-segmentation') {
        status = 'completed';
        hint = 'Segmentation complete';
      } else if (!stageReached(prep, 'ready-for-segmentation')) {
        status = 'locked';
        hint = 'Complete Close Base first';
      } else if (current === 'segment') {
        status = 'current';
        hint = 'Identify individual teeth';
      } else {
        status = 'available';
        hint = 'Segment teeth';
      }
    } else if (meta.id === 'identify') {
      if (current === 'identify') {
        status = 'current';
        hint = 'Review tooth identities';
      } else if (stageReached(prep, 'ready-for-movement')) {
        status = 'available';
        hint = 'Review tooth identities';
      } else {
        status = 'locked';
        hint = 'Complete Segment first';
      }
    } else if (meta.id === 'analyze') {
      if (current === 'analyze') {
        status = 'current';
        hint = 'Measure distances, tooth geometry, and arch relationships';
      } else if (
        stageReached(prep, 'ready-for-segmentation') ||
        stageReached(prep, 'ready-for-movement')
      ) {
        status = 'available';
        hint = 'Clinical analysis tools';
      } else {
        status = 'locked';
        hint = 'Available after segmentation';
      }
    } else {
      status = index <= currentIndex ? 'optional' : 'locked';
      hint =
        meta.id === 'movement'
          ? 'Available after segmentation'
          : meta.id === 'biomechanics'
            ? 'Available in a later milestone'
            : 'Available in a later milestone';
      if (
        status === 'locked' ||
        meta.id === 'movement' ||
        meta.id === 'biomechanics' ||
        meta.id === 'treatment'
      ) {
        status = 'locked';
      }
    }

    return Object.freeze({
      id: meta.id,
      label: meta.label,
      shortLabel: meta.shortLabel,
      status,
      hint
    });
  });
};

const contentFor = (
  step: ClinicalWorkflowStepId
): { title: string; description: string; next: string } => {
  switch (step) {
    case 'import':
      return {
        title: 'Start a Case',
        description: 'Bring in a dental scan to begin.',
        next: 'Orient your model after import.'
      };
    case 'orient':
      return {
        title: 'Orient',
        description: 'Align your dental model with the workspace axes.',
        next: 'Prepare the model for geometry tools.'
      };
    case 'prepare':
      return {
        title: 'Prepare',
        description: 'Confirm the model is ready for geometry operations.',
        next: 'Trim the scan boundary.'
      };
    case 'trim':
      return {
        title: 'Trim',
        description: 'Draw a boundary around the area you want to keep or remove.',
        next: 'Create a stable base.'
      };
    case 'close-base':
      return {
        title: 'Close Base',
        description: 'Your model is trimmed. Create a stable base.',
        next: 'Segment teeth.'
      };
    case 'segment':
      return {
        title: 'Segment Teeth',
        description: 'Identify individual teeth automatically.',
        next: 'Review tooth identities.'
      };
    case 'identify':
      return {
        title: 'Review Teeth',
        description: 'Confirm tooth identities and confidence.',
        next: 'Continue to analysis when available.'
      };
    case 'analyze':
      return {
        title: 'Analysis',
        description: 'Measure distances, tooth geometry, and arch relationships.',
        next: 'Use measurements to support later biomechanics.'
      };
    default:
      return {
        title: STEP_META.find((s) => s.id === step)?.label ?? 'Workflow',
        description: 'This step becomes available after earlier stages.',
        next: 'Continue the clinical workflow.'
      };
  }
};

const primaryFor = (
  step: ClinicalWorkflowStepId,
  context: { readonly trimming: boolean; readonly closingBase: boolean; readonly segmenting: boolean }
): { primary: ClinicalPrimaryAction; secondary: readonly ClinicalPrimaryAction[] } => {
  switch (step) {
    case 'import':
      return {
        primary: Object.freeze({
          id: 'import-scan',
          label: 'Import Scan',
          commandId: 'clinical.tool.import'
        }),
        secondary: Object.freeze([
          Object.freeze({ id: 'open-case', label: 'Open Case', commandId: 'clinical.case.open' }),
          Object.freeze({ id: 'new-case', label: 'New Case', commandId: 'clinical.case.new' })
        ])
      };
    case 'orient':
      return {
        primary: Object.freeze({
          id: 'orient-model',
          label: context.trimming ? 'Orient Model' : 'Start Orientation',
          commandId: 'clinical.tool.orient'
        }),
        secondary: Object.freeze([
          Object.freeze({ id: 'skip-orient', label: 'Skip for now', commandId: 'clinical.preparation.start' })
        ])
      };
    case 'prepare':
      return {
        primary: Object.freeze({
          id: 'start-prep',
          label: 'Start Preparation',
          commandId: 'clinical.preparation.start'
        }),
        secondary: Object.freeze([
          Object.freeze({
            id: 'continue-trim',
            label: 'Continue to Trim',
            commandId: 'clinical.tool.trim'
          })
        ])
      };
    case 'trim':
      return {
        primary: Object.freeze({
          id: 'draw-trim',
          label: context.trimming ? 'Accept Trim' : 'Draw Trim Boundary',
          commandId: context.trimming ? 'clinical.trim.accept' : 'clinical.tool.trim'
        }),
        secondary: Object.freeze([
          Object.freeze({ id: 'cancel-trim', label: 'Cancel', commandId: 'clinical.trim.cancel' })
        ])
      };
    case 'close-base':
      return {
        primary: Object.freeze({
          id: 'create-base',
          label: context.closingBase ? 'Accept Base' : 'Create Base',
          commandId: context.closingBase ? 'clinical.closeBase.accept' : 'clinical.tool.closeBase'
        }),
        secondary: Object.freeze([
          Object.freeze({ id: 'cancel-base', label: 'Cancel', commandId: 'clinical.closeBase.cancel' })
        ])
      };
    case 'segment':
      return {
        primary: Object.freeze({
          id: 'run-seg',
          label: context.segmenting ? 'Run Segmentation' : 'Segment Teeth',
          commandId: context.segmenting ? 'clinical.segmentation.run' : 'clinical.tool.segmentation'
        }),
        secondary: Object.freeze([])
      };
    case 'identify':
      return {
        primary: Object.freeze({
          id: 'accept-seg',
          label: 'Accept Segmentation',
          commandId: 'clinical.segmentation.accept'
        }),
        secondary: Object.freeze([
          Object.freeze({ id: 'review', label: 'Review Results', commandId: 'clinical.tool.segmentation' })
        ])
      };
    case 'analyze':
      return {
        primary: Object.freeze({
          id: 'start-analysis',
          label: 'Start Analysis',
          commandId: 'clinical.tool.analysis'
        }),
        secondary: Object.freeze([
          Object.freeze({ id: 'measure', label: 'Measure', commandId: 'clinical.analysis.measure' })
        ])
      };
    default:
      return {
        primary: Object.freeze({
          id: 'locked',
          label: 'Available later',
          disabled: true
        }),
        secondary: Object.freeze([])
      };
  }
};

export const buildClinicalWorkflowPresentation = (
  workspace: ClinicalWorkspace
): ClinicalWorkflowPresentation => {
  const session = workspace.session;
  const state = session.getPublicState();
  const doc = state.activeCase;
  const prep = workspace.preparation.session.getState();
  const models = hasModels(doc);
  const orienting = workspace.orientation.isActive();
  const trimming = workspace.trim.isActive();
  const closingBase = workspace.closeBase.isActive();
  const segmenting = workspace.segmentation.isActive();
  const segmentPhase = workspace.segmentation.session.getState().phase;
  const oriented = prep.orientationValidated || stageReached(prep, 'ready-for-trim');

  const currentStepId = resolveCurrentStep({
    hasModels: models,
    prep,
    orienting,
    trimming,
    closingBase,
    segmenting,
    segmentPhase
  });

  const steps = buildSteps(currentStepId, prep, models, oriented);
  const copy = contentFor(currentStepId);
  const actions = primaryFor(currentStepId, { trimming, closingBase, segmenting });
  const activeTool = session.getTools().getActive();

  const statusLine = (() => {
    if (!models) return 'Ready — Import a dental scan to begin.';
    if (trimming) {
      const trimState = workspace.trim.session.getState();
      if (trimState.phase === 'preview-boundary' || trimState.closed) {
        return 'Boundary ready — accept the trim when ready.';
      }
      return 'Ready — Draw a trim boundary.';
    }
    if (closingBase) return 'Ready — Choose a base strategy and create the base.';
    if (segmenting) {
      if (segmentPhase === 'ready-for-review' || segmentPhase === 'complete') {
        return 'Segmentation complete — review detected teeth.';
      }
      if (
        segmentPhase === 'preparing' ||
        segmentPhase === 'inferencing' ||
        segmentPhase === 'postprocessing' ||
        segmentPhase === 'validating'
      ) {
        return 'Segmenting teeth…';
      }
      return 'Ready — Run segmentation.';
    }
    if (orienting) return 'Ready — Align the model, then accept orientation.';
    if (currentStepId === 'prepare') return 'Ready — Start preparation, then continue to Trim.';
    if (currentStepId === 'orient') return 'Ready — Orient your model.';
    return toUserFacingStatus(prep.statusMessage);
  })();

  return Object.freeze({
    steps,
    currentStepId,
    currentTitle: copy.title,
    currentDescription: copy.description,
    nextTitle: copy.next,
    statusLine,
    primaryAction: actions.primary,
    secondaryActions: actions.secondary,
    checklist: Object.freeze([
      Object.freeze({ id: 'case', label: 'Case loaded', done: doc !== undefined }),
      Object.freeze({ id: 'scan', label: 'Scan imported', done: models }),
      Object.freeze({ id: 'orient', label: 'Orientation complete', done: oriented }),
      Object.freeze({
        id: 'mesh',
        label: 'Mesh valid',
        done: prep.validationReport?.passed === true || models
      })
    ]),
    emptyWorkspace: !models,
    caseName: doc?.caseMeta.name,
    saveLabel: doc === undefined ? 'No case' : state.dirty ? 'Unsaved changes' : 'Saved',
    activeToolLabel: activeTool?.title
  });
};

export const workflowStepBlockMessage = (step: ClinicalWorkflowStepView): string => {
  if (step.status === 'locked' || step.status === 'optional') {
    return step.hint;
  }
  return step.hint;
};
