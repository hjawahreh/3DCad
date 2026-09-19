import { describe, expect, it } from 'vitest';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { withClinicalObjects } from '../../src/clinical/document/ClinicalDocument.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import { DEFAULT_CLINICAL_DISPLAY_PREFERENCES } from '../../src/clinical/display/ClinicalDisplayPreferences.js';
import {
  buildClinicalWorkflowPresentation,
  toUserFacingStatus,
  workflowStepBlockMessage
} from '../../src/clinical/shell/ClinicalWorkflowPresentation.js';
import { DEFAULT_CLINICAL_LAYOUT } from '../../src/clinical/workspace/ClinicalLayout.js';

const host = () =>
  new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 1000 }
  });

const mesh = (id: string, name: string): ClinicalMeshDescriptor =>
  Object.freeze({
    id: asClinicalObjectId(id),
    displayName: name,
    sourceFile: `${name}.stl`,
    format: 'stl' as const,
    units: 'mm' as const,
    bounds: DEFAULT_MESH_BOUNDS,
    vertexCount: 50,
    faceCount: 100,
    importedAt: 1,
    visible: true,
    selectable: true,
    hierarchyParentId: undefined,
    importerId: 'studio-passthrough',
    sourceEntityId: id,
    displayState: 'default' as const,
    transform: IDENTITY_CLINICAL_TRANSFORM
  });

describe('clinical workflow presentation', () => {
  it('shows empty-state import guidance when no case is loaded', () => {
    const h = host();
    const boot = new ClinicalBootstrap().bootstrap(h);
    const presentation = buildClinicalWorkflowPresentation(boot.workspace);

    expect(presentation.emptyWorkspace).toBe(true);
    expect(presentation.currentStepId).toBe('import');
    expect(presentation.primaryAction.label).toBe('New Case');
    expect(presentation.secondaryActions.some((a) => a.label === 'Open Case')).toBe(true);
    expect(presentation.statusLine).toContain('Import');
    expect(presentation.steps.find((s) => s.id === 'import')?.status).toBe('current');
    expect(presentation.steps.find((s) => s.id === 'movement')?.status).toBe('locked');
    expect(workflowStepBlockMessage(presentation.steps.find((s) => s.id === 'trim')!)).toMatch(
      /Import|Orient|Prepare|Complete/i
    );

    boot.runtime.dispose();
    h.dispose();
  });

  it('keeps Import active after scans exist until Next opens Orientation', () => {
    const h = host();
    const boot = new ClinicalBootstrap().bootstrap(h);
    expect(boot.session.newCase({ name: 'Demo', patientName: 'Patient' }).ok).toBe(true);
    const doc = boot.session.getPublicState().activeCase;
    expect(doc).toBeDefined();
    if (doc === undefined) {
      boot.runtime.dispose();
      h.dispose();
      return;
    }
    expect(boot.session.applyDocument(withClinicalObjects(doc, [mesh('jaw', 'Upper Arch')], 1001), true).ok).toBe(
      true
    );

    const presentation = buildClinicalWorkflowPresentation(boot.workspace);
    expect(presentation.emptyWorkspace).toBe(false);
    expect(presentation.currentStepId).toBe('import');
    expect(presentation.primaryAction.label).toMatch(/New Case|Import/);
    expect(presentation.steps.find((s) => s.id === 'import')?.status).toBe('current');
    expect(presentation.steps.find((s) => s.id === 'orient')?.status).toBe('available');
    expect(presentation.steps.find((s) => s.id === 'analyze')?.status).toBe('locked');

    boot.runtime.dispose();
    h.dispose();
  });

  it('maps prepare and trim readiness from preparation stage', () => {
    const h = host();
    const boot = new ClinicalBootstrap().bootstrap(h);
    expect(boot.session.newCase({ name: 'Demo' }).ok).toBe(true);
    const doc = boot.session.getPublicState().activeCase!;
    expect(boot.session.applyDocument(withClinicalObjects(doc, [mesh('jaw', 'Jaw')], 1002), true).ok).toBe(
      true
    );

    boot.workspace.preparation.session.setOrientationValidated(true);
    boot.workspace.preparation.session.setWorkflowPhase('ready-for-geometry', 'Preparation complete — ready for geometry tools');
    boot.workspace.preparation.session.setStage('ready-for-trim');

    const presentation = buildClinicalWorkflowPresentation(boot.workspace);
    expect(presentation.currentStepId).toBe('prepare');
    expect(presentation.primaryAction.label).toMatch(/Continue to Trim|Trim/);
    expect(presentation.steps.find((s) => s.id === 'prepare')?.status).toBe('current');
    expect(presentation.steps.find((s) => s.id === 'trim')?.status).toBe('available');
    expect(presentation.statusLine.toLowerCase()).toMatch(/trim|ready|preparation/);

    boot.runtime.dispose();
    h.dispose();
  });

  it('translates internal preparation status into clinical language', () => {
    expect(toUserFacingStatus('Preparation idle')).toBe('Ready to prepare your model');
    expect(toUserFacingStatus('Preparation complete — ready for geometry tools')).toContain(
      'confirmed'
    );
  });

  it('defaults layout to collapsed diagnostics and clinical HUD prefs', () => {
    expect(DEFAULT_CLINICAL_LAYOUT.bottomCollapsed).toBe(true);
    expect(DEFAULT_CLINICAL_LAYOUT.bottomTab).toBe('diagnostics');
    expect(DEFAULT_CLINICAL_DISPLAY_PREFERENCES.showFrameStats).toBe(false);
    expect(DEFAULT_CLINICAL_DISPLAY_PREFERENCES.showHud).toBe(true);
  });
});
