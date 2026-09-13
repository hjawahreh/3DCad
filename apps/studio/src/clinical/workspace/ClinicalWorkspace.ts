/**
 * ClinicalWorkspace — coordinates layout + session + import + viewport + orientation + preparation.
 */

import type { ClinicalSession } from '../runtime/session.js';
import { ClinicalImportController } from '../import/ClinicalImportController.js';
import { ClinicalImportCoordinator } from '../import/ClinicalImportCoordinator.js';
import { ClinicalViewportRuntime } from '../display/ClinicalViewportRuntime.js';
import { ClinicalMeshPicker } from '../display/ClinicalMeshPicker.js';
import { ClinicalOrientationRuntime } from '../orientation/ClinicalOrientationRuntime.js';
import { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import { ClinicalTrimRuntime } from '../trim/ClinicalTrimRuntime.js';
import { ClinicalCloseBaseRuntime } from '../close-base/ClinicalCloseBaseRuntime.js';
import { ClinicalSegmentationRuntime } from '../segmentation/ClinicalSegmentationRuntime.js';
import { ClinicalAnalysisRuntime } from '../analysis/ClinicalAnalysisRuntime.js';
import { ClinicalCaseService } from '../case/ClinicalCaseService.js';
import type { CasePersistenceContract } from '../case/ClinicalCasePersistence.js';
import { ClinicalLayout } from './ClinicalLayout.js';
import { ClinicalArchContext } from '../shell/ClinicalArchContext.js';
import { unionOrientedBounds } from '../document/ClinicalDocument.js';

export class ClinicalWorkspace {
  public readonly layout: ClinicalLayout;
  public readonly archContext: ClinicalArchContext;
  public readonly importCoordinator: ClinicalImportCoordinator;
  public readonly importController: ClinicalImportController;
  public readonly viewport: ClinicalViewportRuntime;
  public readonly meshPicker: ClinicalMeshPicker;
  public readonly orientation: ClinicalOrientationRuntime;
  public readonly preparation: ClinicalPreparationRuntime;
  public readonly trim: ClinicalTrimRuntime;
  public readonly closeBase: ClinicalCloseBaseRuntime;
  public readonly segmentation: ClinicalSegmentationRuntime;
  public readonly analysis: ClinicalAnalysisRuntime;
  public readonly cases: ClinicalCaseService;

  public constructor(
    public readonly session: ClinicalSession,
    layout?: ClinicalLayout,
    casePersistence?: CasePersistenceContract
  ) {
    this.layout = layout ?? new ClinicalLayout();
    this.archContext = new ClinicalArchContext();
    this.importCoordinator = new ClinicalImportCoordinator(session);
    this.importController = new ClinicalImportController(this.importCoordinator);
    this.viewport = new ClinicalViewportRuntime(
      session,
      this.importCoordinator.sceneBuilder
    );
    this.meshPicker = new ClinicalMeshPicker();
    this.importCoordinator.setAfterImportPresenter(() => {
      // Pre-orientation: AABB inference only. Clinical frame applied after auto-orient.
      this.viewport.presentClinicalAnteriorView({ preferClinicalFrame: false });
    });
    this.orientation = new ClinicalOrientationRuntime(
      session,
      this.importCoordinator.sceneBuilder
    );
    // While Orientation is active, document transforms may still be identity — camera
    // must fit the same preview-transformed bounds used by the scene + Auto Orient.
    this.viewport.setPresentationBoundsProvider(() => {
      if (!this.orientation.isActive()) {
        return undefined;
      }
      const orientState = this.orientation.session.getState();
      const doc = this.session.getPublicState().activeCase;
      if (doc === undefined || orientState.caseLevel !== true) {
        return undefined;
      }
      const previewDoc = this.orientation.controller.manager.previewCaseDocument(
        doc,
        orientState.preview
      );
      return unionOrientedBounds(previewDoc.objects.filter((o) => o.visible));
    });
    this.orientation.setOnEnterPresenter(() => {
      this.archContext.setMode('both');
      this.viewport.showAll();
    });
    this.orientation.setAfterAcceptPresenter(() => {
      // BOTH is the default clinical presentation; never leave a conflicting hidden arch.
      this.archContext.setMode('both');
      this.viewport.showAll();
      const orientState = this.orientation.session.getState();
      const doc = this.session.getPublicState().activeCase;
      // While still active (auto-orient preview), camera uses preview-transformed bounds.
      // After accept/commit, document already holds the clinical transform — do not re-apply preview.
      if (doc !== undefined && this.orientation.isActive() && orientState.caseLevel) {
        const previewDoc = this.orientation.controller.manager.previewCaseDocument(
          doc,
          orientState.preview
        );
        const bounds = unionOrientedBounds(previewDoc.objects.filter((o) => o.visible));
        this.viewport.presentCanonicalClinicalView('front', {
          ...(bounds !== undefined ? { boundsOverride: bounds } : {})
        });
        return;
      }
      this.viewport.presentCanonicalClinicalView('front');
    });
    this.preparation = new ClinicalPreparationRuntime(
      session,
      this.orientation,
      this.viewport,
      this.archContext
    );
    this.trim = new ClinicalTrimRuntime(
      session,
      this.preparation,
      this.importCoordinator.sceneBuilder,
      this.meshPicker,
      this.viewport,
      this.archContext
    );
    this.closeBase = new ClinicalCloseBaseRuntime(
      session,
      this.preparation,
      this.importCoordinator.sceneBuilder,
      this.viewport
    );
    this.segmentation = new ClinicalSegmentationRuntime(
      session,
      this.preparation,
      this.importCoordinator.sceneBuilder,
      this.meshPicker,
      this.viewport
    );
    this.analysis = new ClinicalAnalysisRuntime(
      session,
      this.preparation,
      this.segmentation
    );
    this.cases = new ClinicalCaseService(casePersistence);
  }

  public getHost() {
    return this.session.getHost();
  }
}
