/**
 * ClinicalVisibilityManager — hide / show / isolate / show all (descriptor-level).
 */

import type { ClinicalSession } from '../runtime/session.js';
import {
  withClinicalObjects,
  type ClinicalDocumentSnapshot
} from '../document/ClinicalDocument.js';
import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import { clinicalFailure, type ClinicalResult } from '../runtime/types.js';

export class ClinicalVisibilityManager {
  private isolatedId: ClinicalObjectId | undefined;
  private readonly hidden = new Set<string>();

  public getIsolatedId(): ClinicalObjectId | undefined {
    return this.isolatedId;
  }

  public getHiddenIds(): ReadonlySet<string> {
    return this.hidden;
  }

  public hide(session: ClinicalSession, id: ClinicalObjectId): ClinicalResult<ClinicalDocumentSnapshot> {
    const doc = session.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    this.hidden.add(id);
    if (this.isolatedId === id) {
      this.isolatedId = undefined;
    }
    return this.apply(session, doc);
  }

  public show(session: ClinicalSession, id: ClinicalObjectId): ClinicalResult<ClinicalDocumentSnapshot> {
    const doc = session.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    this.hidden.delete(id);
    return this.apply(session, doc);
  }

  public isolate(session: ClinicalSession, id: ClinicalObjectId): ClinicalResult<ClinicalDocumentSnapshot> {
    const doc = session.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    if (!doc.objects.some((o) => o.id === id)) {
      return clinicalFailure('not-found', `Object ${id} not found`);
    }
    this.isolatedId = id;
    this.hidden.clear();
    return this.apply(session, doc);
  }

  public showAll(session: ClinicalSession): ClinicalResult<ClinicalDocumentSnapshot> {
    const doc = session.getPublicState().activeCase;
    if (doc === undefined) {
      return clinicalFailure('not-found', 'No active case');
    }
    this.isolatedId = undefined;
    this.hidden.clear();
    return this.apply(session, doc);
  }

  public isVisible(id: ClinicalObjectId): boolean {
    if (this.isolatedId !== undefined) {
      return this.isolatedId === id;
    }
    return !this.hidden.has(id);
  }

  private apply(
    session: ClinicalSession,
    doc: ClinicalDocumentSnapshot
  ): ClinicalResult<ClinicalDocumentSnapshot> {
    const now = Date.now();
    const objects = doc.objects.map((obj) =>
      Object.freeze({
        ...obj,
        visible: this.isVisible(obj.id),
        displayState: (this.isVisible(obj.id)
          ? obj.displayState === 'hidden'
            ? 'default'
            : obj.displayState
          : 'hidden') as typeof obj.displayState
      })
    );
    const next = withClinicalObjects(doc, objects, now);
    return session.applyDocument(next, true);
  }
}
