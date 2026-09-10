/**
 * CaseManager — façade over ClinicalSession case lifecycle.
 */

import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalResult } from '../runtime/types.js';
import type { RecentCasesRegistry } from './RecentCases.js';

export class CaseManager {
  public constructor(private readonly session: ClinicalSession) {}

  public newCase(input?: {
    readonly name?: string;
    readonly patientName?: string;
  }): ClinicalResult<ClinicalDocumentSnapshot> {
    return this.session.newCase(input);
  }

  public openCase(document: ClinicalDocumentSnapshot): ClinicalResult<ClinicalDocumentSnapshot> {
    return this.session.openCase(document);
  }

  public closeCase(force = false): ClinicalResult<void> {
    return this.session.closeCase(force);
  }

  public markDirty(): ClinicalResult<ClinicalDocumentSnapshot> {
    return this.session.markDirty();
  }

  public save(): ClinicalResult<ClinicalDocumentSnapshot> {
    return this.session.clearDirty();
  }

  public getActive(): ClinicalDocumentSnapshot | undefined {
    return this.session.getPublicState().activeCase;
  }

  public getRecent(): RecentCasesRegistry {
    return this.session.getRecentCases();
  }
}
