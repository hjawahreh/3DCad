/**
 * ClinicalImportController — UI-facing entry for clinical import.
 */

import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import type { ClinicalResult } from '../runtime/types.js';
import type { ClinicalImportCoordinator, ClinicalImportFileSelection } from './ClinicalImportCoordinator.js';

export class ClinicalImportController {
  public constructor(private readonly coordinator: ClinicalImportCoordinator) {}

  public async importSelectedFile(
    selection: ClinicalImportFileSelection
  ): Promise<ClinicalResult<ClinicalDocumentSnapshot>> {
    return this.coordinator.importFile(selection);
  }

  public cancel(): void {
    this.coordinator.cancelActive();
  }

  public getCoordinator(): ClinicalImportCoordinator {
    return this.coordinator;
  }
}
