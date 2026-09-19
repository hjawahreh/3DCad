/**
 * Registers clinical commands into the host command palette.
 */

import type { ClinicalSession } from './runtime/session.js';
import type { ClinicalWorkspace } from './workspace/ClinicalWorkspace.js';
import { asClinicalToolId } from './runtime/types.js';
import {
  DISPLAY_MODES,
  type ClinicalDisplayMode
} from './display/ClinicalDisplayPreferences.js';

export const registerClinicalCommands = (
  session: ClinicalSession,
  workspace: ClinicalWorkspace
): void => {
  const host = session.getHost();
  const { commands } = host;

  const wrap =
    (run: () => void | Promise<void>) =>
    async (): Promise<void> => {
      session.getMetrics().recordCommandInvoke();
      await run();
      session.notifyUi();
    };

  commands.register({
    id: 'clinical.case.new',
    title: 'New Case',
    category: 'application',
    shortcut: 'Mod+Shift+N',
    enabled: true,
    run: wrap(() => {
      host.dialogs.open('new-case', 'Create Case');
    })
  });

  commands.register({
    id: 'clinical.case.open',
    title: 'Open Case…',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      host.dialogs.open('open-case', 'Open Case');
    })
  });

  commands.register({
    id: 'clinical.case.close',
    title: 'Close Case',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      const result = session.closeCase(true);
      if (!result.ok) {
        host.notifications.push('error', 'Case', result.error.message);
        return;
      }
      workspace.importCoordinator.objects.clear();
      workspace.importCoordinator.sceneBuilder.publishEmpty(host, host.runtimes.scene);
      host.runtimes.kernel.registry.clear();
      host.sessions.selectionSession?.clear();
      host.sessions.cameraSession?.resetView();
    })
  });

  commands.register({
    id: 'clinical.case.save',
    title: 'Save Case',
    category: 'application',
    shortcut: 'Mod+S',
    enabled: true,
    run: wrap(async () => {
      const saved = await workspace.cases.saveActiveCase(workspace);
      if (!saved.ok) {
        host.notifications.push('warning', 'Save', saved.error.message);
        return;
      }
      host.notifications.push('success', 'Save', 'Case saved.');
    })
  });

  commands.register({
    id: 'clinical.case.recent',
    title: 'Recent Cases',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      host.dialogs.open('open-case', 'Open Case');
    })
  });

  commands.register({
    id: 'clinical.tool.import',
    title: 'Activate Import Tool',
    category: 'application',
    enabled: true,
    run: wrap(async () => {
      const activated = session.activateTool(asClinicalToolId('import'));
      if (!activated.ok) {
        return;
      }
      host.dialogs.open('import', 'Import Mesh');
    })
  });

  commands.register({
    id: 'clinical.panel.toggleLeft',
    title: 'Toggle Clinical Left Panel',
    category: 'view',
    enabled: true,
    run: wrap(() => {
      const layout = workspace.layout.get();
      workspace.layout.update({ leftCollapsed: !layout.leftCollapsed });
    })
  });

  commands.register({
    id: 'clinical.panel.toggleRight',
    title: 'Toggle Clinical Right Panel',
    category: 'view',
    enabled: true,
    run: wrap(() => {
      const layout = workspace.layout.get();
      workspace.layout.update({ rightCollapsed: !layout.rightCollapsed });
    })
  });

  commands.register({
    id: 'clinical.panel.toggleBottom',
    title: 'Toggle Clinical Bottom Panel',
    category: 'view',
    enabled: true,
    run: wrap(() => {
      const layout = workspace.layout.get();
      workspace.layout.update({ bottomCollapsed: !layout.bottomCollapsed });
    })
  });

  commands.register({
    id: 'clinical.diagnostics',
    title: 'Clinical Diagnostics',
    category: 'runtime',
    enabled: true,
    run: wrap(() => {
      workspace.layout.update({ bottomCollapsed: false, bottomTab: 'diagnostics' });
      host.dialogs.open('diagnostics', 'Clinical Diagnostics');
    })
  });

  commands.register({
    id: 'clinical.viewport.fitAll',
    title: 'Fit All',
    category: 'view',
    shortcut: 'Mod+F',
    enabled: true,
    run: wrap(() => {
      const result = workspace.viewport.fitAll();
      if (!result.ok) {
        host.notifications.push('warning', 'Camera', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.viewport.fitSelected',
    title: 'Fit Selected',
    category: 'view',
    enabled: true,
    run: wrap(() => {
      workspace.viewport.fitSelected();
    })
  });

  commands.register({
    id: 'clinical.viewport.reset',
    title: 'Reset View',
    category: 'view',
    shortcut: 'Home',
    enabled: true,
    run: wrap(() => {
      const result = workspace.viewport.resetView();
      if (!result.ok) {
        host.notifications.push('warning', 'Camera', result.error.message);
      }
    })
  });

  for (const preset of workspace.viewport.listPresets()) {
    commands.register({
      id: `clinical.viewport.preset.${preset}`,
      title: `View ${preset}`,
      category: 'view',
      enabled: true,
      run: wrap(() => {
        const result = workspace.viewport.presetView(preset);
        if (!result.ok) {
          host.notifications.push('warning', 'Camera', result.error.message);
        }
      })
    });
  }

  commands.register({
    id: 'clinical.display.cycleMode',
    title: 'Cycle Display Mode',
    category: 'view',
    shortcut: 'Mod+Shift+D',
    enabled: true,
    run: wrap(() => {
      const current = workspace.viewport.preferences.get().displayMode;
      const idx = DISPLAY_MODES.indexOf(current);
      const next = (DISPLAY_MODES[(idx + 1) % DISPLAY_MODES.length] ??
        'smooth') as ClinicalDisplayMode;
      workspace.viewport.setDisplayMode(next);
    })
  });

  commands.register({
    id: 'clinical.display.showAll',
    title: 'Show All Objects',
    category: 'view',
    enabled: true,
    run: wrap(() => {
      workspace.viewport.showAll();
    })
  });

  commands.register({
    id: 'clinical.display.toggleHud',
    title: 'Toggle Viewport HUD',
    category: 'view',
    enabled: true,
    run: wrap(() => {
      const prefs = workspace.viewport.preferences.get();
      workspace.viewport.preferences.update({ showHud: !prefs.showHud });
    })
  });

  commands.register({
    id: 'clinical.display.toggleOverlays',
    title: 'Toggle Viewport Overlays',
    category: 'view',
    enabled: true,
    run: wrap(() => {
      const prefs = workspace.viewport.preferences.get();
      workspace.viewport.preferences.update({ showOverlays: !prefs.showOverlays });
    })
  });

  commands.register({
    id: 'clinical.display.toggleGrid',
    title: 'Toggle Grid',
    category: 'view',
    enabled: true,
    run: wrap(() => {
      const prefs = workspace.viewport.preferences.get();
      workspace.viewport.appearance.setGrid(!prefs.showGrid);
    })
  });

  commands.register({
    id: 'clinical.tool.orient',
    title: 'Orientation Tool',
    category: 'application',
    shortcut: 'Mod+O',
    enabled: true,
    run: wrap(() => {
      const result = workspace.orientation.enter();
      if (!result.ok) {
        host.notifications.push('warning', 'Orientation', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.orientation.auto',
    title: 'Auto Orient',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      if (!workspace.orientation.isActive()) {
        const entered = workspace.orientation.enter();
        if (!entered.ok) {
          host.notifications.push('warning', 'Orientation', entered.error.message);
          return;
        }
      }
      const result = workspace.orientation.autoOrient({ force: true });
      if (!result.ok) {
        host.notifications.push('warning', 'Orientation', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.orientation.accept',
    title: 'Accept Orientation',
    category: 'application',
    shortcut: 'Enter',
    enabled: true,
    run: wrap(() => {
      if (!workspace.orientation.isActive()) return;
      const result = workspace.orientation.accept();
      if (!result.ok) {
        host.notifications.push('warning', 'Orientation', result.error.message);
        return;
      }
      workspace.preparation.notifyOrientationComplete();
      const prep = workspace.preparation.autoPrepare();
      if (!prep.ok) {
        host.notifications.push('warning', 'Prepare', prep.error.message);
        return;
      }
      const trim = workspace.trim.enter();
      if (!trim.ok) {
        host.notifications.push('warning', 'Trim', trim.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.orientation.cancel',
    title: 'Cancel Orientation',
    category: 'application',
    shortcut: 'Escape',
    enabled: true,
    run: wrap(() => {
      workspace.orientation.cancel();
    })
  });

  commands.register({
    id: 'clinical.orientation.reset',
    title: 'Reset Orientation',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.orientation.reset();
    })
  });

  commands.register({
    id: 'clinical.orientation.snap',
    title: 'Snap Orientation to World Axes',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.orientation.snap();
    })
  });

  commands.register({
    id: 'clinical.orientation.rotatePositive',
    title: 'Rotate +Increment',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.orientation.rotateIncremental(1);
    })
  });

  commands.register({
    id: 'clinical.orientation.rotateNegative',
    title: 'Rotate −Increment',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.orientation.rotateIncremental(-1);
    })
  });

  commands.register({
    id: 'clinical.orientation.mode.free',
    title: 'Orientation Mode: Free',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.orientation.setMode('free');
    })
  });

  commands.register({
    id: 'clinical.orientation.mode.x',
    title: 'Orientation Mode: X',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.orientation.setMode('axis-x');
    })
  });

  commands.register({
    id: 'clinical.orientation.mode.y',
    title: 'Orientation Mode: Y',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.orientation.setMode('axis-y');
    })
  });

  commands.register({
    id: 'clinical.orientation.mode.z',
    title: 'Orientation Mode: Z',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.orientation.setMode('axis-z');
    })
  });

  commands.register({
    id: 'clinical.orientation.increment.1',
    title: 'Orientation Increment 1°',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.orientation.setIncrement(1);
    })
  });

  commands.register({
    id: 'clinical.orientation.increment.5',
    title: 'Orientation Increment 5°',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.orientation.setIncrement(5);
    })
  });

  commands.register({
    id: 'clinical.orientation.increment.15',
    title: 'Orientation Increment 15°',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.orientation.setIncrement(15);
    })
  });

  commands.register({
    id: 'clinical.orientation.undo',
    title: 'Undo Orientation',
    category: 'application',
    shortcut: 'Mod+Z',
    enabled: true,
    run: wrap(() => {
      const result = workspace.orientation.undo();
      if (!result.ok) {
        host.notifications.push('info', 'Undo', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.orientation.redo',
    title: 'Redo Orientation',
    category: 'application',
    shortcut: 'Mod+Shift+Z',
    enabled: true,
    run: wrap(() => {
      const result = workspace.orientation.redo();
      if (!result.ok) {
        host.notifications.push('info', 'Redo', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.preparation.start',
    title: 'Prepare Case',
    category: 'application',
    shortcut: 'Mod+Shift+P',
    enabled: true,
    run: wrap(() => {
      workspace.layout.update({ leftSection: 'preparation', leftCollapsed: false });
      const result = workspace.preparation.autoPrepare();
      if (!result.ok) {
        host.notifications.push('warning', 'Preparation', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.preparation.validate',
    title: 'Validate Preparation',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      const result = workspace.preparation.validate();
      if (!result.ok) {
        host.notifications.push('warning', 'Preparation', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.preparation.activateSession',
    title: 'Activate Preparation Session',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      const result = workspace.preparation.activateSession();
      if (!result.ok) {
        host.notifications.push('warning', 'Preparation', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.preparation.suspend',
    title: 'Suspend Preparation Session',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.preparation.suspend();
    })
  });

  commands.register({
    id: 'clinical.preparation.resume',
    title: 'Resume Preparation Session',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.preparation.resume();
    })
  });

  commands.register({
    id: 'clinical.preparation.advanceStage',
    title: 'Advance Preparation Stage',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      const result = workspace.preparation.advanceStage();
      if (!result.ok) {
        host.notifications.push('warning', 'Preparation', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.preparation.complete',
    title: 'Complete Preparation',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      const result = workspace.preparation.complete();
      if (!result.ok) {
        host.notifications.push('warning', 'Preparation', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.preparation.cancel',
    title: 'Cancel Preparation',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.preparation.cancel();
    })
  });

  commands.register({
    id: 'clinical.preparation.openPanel',
    title: 'Open Preparation Panel',
    category: 'view',
    enabled: true,
    run: wrap(() => {
      workspace.layout.update({ leftSection: 'preparation', leftCollapsed: false });
      workspace.preparation.openPanel();
    })
  });

  commands.register({
    id: 'clinical.preparation.selectTool.trim',
    title: 'Select Trim Tool (Orchestration)',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.preparation.selectTool('trim');
    })
  });

  commands.register({
    id: 'clinical.preparation.selectTool.closeBase',
    title: 'Select Close Base Tool (Orchestration)',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.preparation.selectTool('close-base');
    })
  });

  commands.register({
    id: 'clinical.preparation.selectTool.segment',
    title: 'Select Segmentation Tool (Orchestration)',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.preparation.selectTool('segment');
    })
  });

  commands.register({
    id: 'clinical.preparation.selectTool.move',
    title: 'Select Movement Tool (Orchestration)',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.preparation.selectTool('move');
    })
  });

  commands.register({
    id: 'clinical.preparation.activateTool',
    title: 'Orchestrate Preparation Tool',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      const result = workspace.preparation.activateTool();
      if (!result.ok) {
        host.notifications.push('warning', 'Preparation', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.tool.trim',
    title: 'Trim Tool',
    category: 'application',
    shortcut: 'Mod+T',
    enabled: true,
    run: wrap(() => {
      const result = workspace.trim.enter();
      if (!result.ok) {
        host.notifications.push('warning', 'Trim', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.trim.accept',
    title: 'Accept Trim',
    category: 'application',
    shortcut: 'Enter',
    enabled: true,
    run: wrap(async () => {
      if (!workspace.trim.isActive()) return;
      const result = await workspace.trim.accept();
      if (!result.ok) {
        host.notifications.push('warning', 'Trim', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.trim.cancel',
    title: 'Cancel Trim',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.trim.cancel();
    })
  });

  commands.register({
    id: 'clinical.trim.reset',
    title: 'Reset Trim Boundary',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.trim.clearBoundary();
    })
  });

  commands.register({
    id: 'clinical.trim.undoPoint',
    title: 'Undo Trim Point',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.trim.undoPoint();
    })
  });

  commands.register({
    id: 'clinical.trim.clear',
    title: 'Clear Trim Boundary',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.trim.clearBoundary();
    })
  });

  commands.register({
    id: 'clinical.trim.close',
    title: 'Close Trim Boundary',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.trim.closeBoundary();
    })
  });

  commands.register({
    id: 'clinical.trim.undo',
    title: 'Undo Trim',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      const result = workspace.trim.undo();
      if (!result.ok) {
        host.notifications.push('info', 'Undo', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.trim.redo',
    title: 'Redo Trim',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      const result = workspace.trim.redo();
      if (!result.ok) {
        host.notifications.push('info', 'Redo', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.tool.closeBase',
    title: 'Close Base Tool',
    category: 'application',
    shortcut: 'Mod+B',
    enabled: true,
    run: wrap(() => {
      const result = workspace.closeBase.enter();
      if (!result.ok) {
        host.notifications.push('warning', 'Close Base', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.closeBase.accept',
    title: 'Accept Close Base',
    category: 'application',
    enabled: true,
    run: wrap(async () => {
      if (!workspace.closeBase.isActive()) return;
      const result = await workspace.closeBase.accept();
      if (!result.ok) {
        host.notifications.push('warning', 'Close Base', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.closeBase.preview',
    title: 'Preview Close Base',
    category: 'application',
    enabled: true,
    run: wrap(async () => {
      if (!workspace.closeBase.isActive()) {
        const entered = workspace.closeBase.enter();
        if (!entered.ok) {
          host.notifications.push('warning', 'Close Base', entered.error.message);
          return;
        }
      }
      const result = await workspace.closeBase.preview();
      if (!result.ok) {
        host.notifications.push('warning', 'Close Base', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.closeBase.auto',
    title: 'Auto Create Base',
    category: 'application',
    enabled: true,
    run: wrap(async () => {
      const result = await workspace.closeBase.autoCreateBase();
      if (!result.ok) {
        host.notifications.push('warning', 'Close Base', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.closeBase.manual',
    title: 'Adjust Close Base Manually',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      const result = workspace.closeBase.enterManualMode();
      if (!result.ok) {
        host.notifications.push('warning', 'Close Base', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.closeBase.cancel',
    title: 'Cancel Close Base',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.closeBase.cancel();
    })
  });

  commands.register({
    id: 'clinical.closeBase.reset',
    title: 'Reset Close Base Parameters',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.closeBase.reset();
    })
  });

  commands.register({
    id: 'clinical.closeBase.undo',
    title: 'Undo Close Base',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      const result = workspace.closeBase.undo();
      if (!result.ok) {
        host.notifications.push('info', 'Undo', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.closeBase.redo',
    title: 'Redo Close Base',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      const result = workspace.closeBase.redo();
      if (!result.ok) {
        host.notifications.push('info', 'Redo', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.closeBase.strategy.plane',
    title: 'Close Base Strategy: Plane',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.closeBase.setStrategy('plane');
    })
  });

  commands.register({
    id: 'clinical.closeBase.strategy.surface',
    title: 'Close Base Strategy: Surface',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.closeBase.setStrategy('surface');
    })
  });

  commands.register({
    id: 'clinical.closeBase.parameter.height',
    title: 'Close Base Height +0.5',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.closeBase.bumpHeight(0.5);
    })
  });

  commands.register({
    id: 'clinical.closeBase.parameter.thickness',
    title: 'Close Base Thickness +0.1',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.closeBase.bumpThickness(0.1);
    })
  });

  commands.register({
    id: 'clinical.closeBase.parameter.margin',
    title: 'Close Base Margin +0.1',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.closeBase.bumpMargin(0.1);
    })
  });

  commands.register({
    id: 'clinical.closeBase.parameter.orientation',
    title: 'Cycle Close Base Orientation',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.closeBase.cycleOrientation();
    })
  });

  commands.register({
    id: 'clinical.closeBase.parameter.smoothing',
    title: 'Toggle Close Base Smoothing',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.closeBase.toggleSmoothing();
    })
  });

  commands.register({
    id: 'clinical.tool.segmentation',
    title: 'Segmentation Tool',
    category: 'application',
    shortcut: 'Mod+G',
    enabled: true,
    run: wrap(async () => {
      const result = await workspace.segmentation.segmentTeeth();
      if (!result.ok) {
        host.notifications.push('warning', 'Segmentation', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.segmentation.run',
    title: 'Run Segmentation',
    category: 'application',
    enabled: true,
    run: wrap(async () => {
      const result = await workspace.segmentation.segmentTeeth();
      if (!result.ok) {
        host.notifications.push('warning', 'Segmentation', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.segmentation.accept',
    title: 'Accept Segmentation',
    category: 'application',
    enabled: true,
    run: wrap(async () => {
      if (!workspace.segmentation.isActive()) return;
      const result = await workspace.segmentation.accept();
      if (!result.ok) {
        host.notifications.push('warning', 'Segmentation', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.segmentation.reject',
    title: 'Reject Segmentation',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.segmentation.reject();
    })
  });

  commands.register({
    id: 'clinical.segmentation.cancel',
    title: 'Cancel Segmentation',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.segmentation.cancel();
    })
  });

  commands.register({
    id: 'clinical.segmentation.undo',
    title: 'Undo Segmentation',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      const result = workspace.segmentation.undo();
      if (!result.ok) {
        host.notifications.push('info', 'Undo', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.segmentation.redo',
    title: 'Redo Segmentation',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      const result = workspace.segmentation.redo();
      if (!result.ok) {
        host.notifications.push('info', 'Redo', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.tool.analysis',
    title: 'Analysis Tool',
    category: 'application',
    shortcut: 'Mod+A',
    enabled: true,
    run: wrap(() => {
      const result = workspace.analysis.enter();
      if (!result.ok) {
        host.notifications.push('warning', 'Analysis', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.analysis.measure',
    title: 'Measure Distance',
    category: 'application',
    shortcut: 'M',
    enabled: true,
    run: wrap(() => {
      if (!workspace.analysis.isActive()) {
        const entered = workspace.analysis.enter();
        if (!entered.ok) {
          host.notifications.push('warning', 'Analysis', entered.error.message);
          return;
        }
      }
      workspace.analysis.setMode('distance');
    })
  });

  commands.register({
    id: 'clinical.analysis.angle',
    title: 'Measure Angle',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      if (!workspace.analysis.isActive()) {
        const entered = workspace.analysis.enter();
        if (!entered.ok) {
          host.notifications.push('warning', 'Analysis', entered.error.message);
          return;
        }
      }
      workspace.analysis.setMode('angle');
    })
  });

  commands.register({
    id: 'clinical.analysis.tooth',
    title: 'Tooth Analysis',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      if (!workspace.analysis.isActive()) {
        const entered = workspace.analysis.enter();
        if (!entered.ok) {
          host.notifications.push('warning', 'Analysis', entered.error.message);
          return;
        }
      }
      const result = workspace.analysis.analyzeTooth();
      if (!result.ok) {
        host.notifications.push('warning', 'Analysis', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.analysis.arch',
    title: 'Arch Analysis',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      if (!workspace.analysis.isActive()) return;
      const result = workspace.analysis.analyzeArch();
      if (!result.ok) {
        host.notifications.push('warning', 'Analysis', result.error.message);
      }
    })
  });

  commands.register({
    id: 'clinical.analysis.spacing',
    title: 'Spacing Analysis',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      if (!workspace.analysis.isActive()) return;
      workspace.analysis.analyzeSpacing();
    })
  });

  commands.register({
    id: 'clinical.analysis.crowding',
    title: 'Crowding Analysis',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      if (!workspace.analysis.isActive()) return;
      workspace.analysis.analyzeCrowding();
    })
  });

  commands.register({
    id: 'clinical.analysis.occlusion',
    title: 'Occlusion Analysis',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      if (!workspace.analysis.isActive()) return;
      workspace.analysis.analyzeOcclusion();
    })
  });

  commands.register({
    id: 'clinical.analysis.clear',
    title: 'Clear Measurement',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.analysis.clearMeasurement();
    })
  });

  commands.register({
    id: 'clinical.analysis.save',
    title: 'Save Analysis Result',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      const result = workspace.analysis.saveResult();
      if (!result.ok) {
        host.notifications.push('info', 'Analysis', result.error.message);
      } else {
        host.notifications.push('success', 'Analysis', 'Result saved (geometry unchanged).');
      }
    })
  });

  commands.register({
    id: 'clinical.analysis.cancel',
    title: 'Cancel Analysis',
    category: 'application',
    enabled: true,
    run: wrap(() => {
      workspace.analysis.cancel();
    })
  });

  host.hotkeys.register('Mod+Shift+N', 'clinical.case.new');
  host.hotkeys.register('Mod+S', 'clinical.case.save');
  host.hotkeys.register('Mod+F', 'clinical.viewport.fitAll');
  host.hotkeys.register('Home', 'clinical.viewport.reset');
  host.hotkeys.register('Mod+Shift+D', 'clinical.display.cycleMode');
  host.hotkeys.register('Mod+O', 'clinical.tool.orient');
  host.hotkeys.register('Mod+T', 'clinical.tool.trim');
  host.hotkeys.register('Mod+B', 'clinical.tool.closeBase');
  host.hotkeys.register('Mod+G', 'clinical.tool.segmentation');
  host.hotkeys.register('Mod+A', 'clinical.tool.analysis');
  host.hotkeys.register('M', 'clinical.analysis.measure');
  host.hotkeys.register('Mod+Shift+P', 'clinical.preparation.start');
  host.hotkeys.register('Escape', 'clinical.orientation.cancel');
  host.hotkeys.register('Mod+Z', 'clinical.orientation.undo');
  host.hotkeys.register('Mod+Shift+Z', 'clinical.orientation.redo');
};
