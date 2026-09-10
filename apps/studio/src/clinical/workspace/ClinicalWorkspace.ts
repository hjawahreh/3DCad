/**
 * ClinicalWorkspace — coordinates layout + session + import + viewport + orientation + preparation.
 */

import type { ClinicalSession } from '../runtime/session.js';
import { ClinicalImportController } from '../import/ClinicalImportController.js';
import { ClinicalImportCoordinator } from '../import/ClinicalImportCoordinator.js';
import { ClinicalViewportRuntime } from '../display/ClinicalViewportRuntime.js';
import { ClinicalOrientationRuntime } from '../orientation/ClinicalOrientationRuntime.js';
import { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import { ClinicalTrimRuntime } from '../trim/ClinicalTrimRuntime.js';
import { ClinicalCloseBaseRuntime } from '../close-base/ClinicalCloseBaseRuntime.js';
import { ClinicalLayout } from './ClinicalLayout.js';

export class ClinicalWorkspace {
  public readonly layout: ClinicalLayout;
  public readonly importCoordinator: ClinicalImportCoordinator;
  public readonly importController: ClinicalImportController;
  public readonly viewport: ClinicalViewportRuntime;
  public readonly orientation: ClinicalOrientationRuntime;
  public readonly preparation: ClinicalPreparationRuntime;
  public readonly trim: ClinicalTrimRuntime;
  public readonly closeBase: ClinicalCloseBaseRuntime;

  public constructor(
    public readonly session: ClinicalSession,
    layout?: ClinicalLayout
  ) {
    this.layout = layout ?? new ClinicalLayout();
    this.importCoordinator = new ClinicalImportCoordinator(session);
    this.importController = new ClinicalImportController(this.importCoordinator);
    this.viewport = new ClinicalViewportRuntime(
      session,
      this.importCoordinator.sceneBuilder
    );
    this.orientation = new ClinicalOrientationRuntime(
      session,
      this.importCoordinator.sceneBuilder
    );
    this.preparation = new ClinicalPreparationRuntime(
      session,
      this.orientation,
      this.viewport
    );
    this.trim = new ClinicalTrimRuntime(
      session,
      this.preparation,
      this.importCoordinator.sceneBuilder
    );
    this.closeBase = new ClinicalCloseBaseRuntime(
      session,
      this.preparation,
      this.importCoordinator.sceneBuilder
    );
  }

  public getHost() {
    return this.session.getHost();
  }
}
