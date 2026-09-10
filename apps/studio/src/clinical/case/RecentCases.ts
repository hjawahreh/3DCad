/**
 * Recent cases registry + persistence contracts (host I/O owned elsewhere).
 */

import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import type { ClinicalCaseId } from '../runtime/types.js';

export interface RecentCaseEntry {
  readonly caseId: ClinicalCaseId;
  readonly name: string;
  readonly patientName: string;
  readonly lastOpenedAt: number;
}

/** Host-owned persistence port — no file I/O in clinical module. */
export interface CasePersistenceContract {
  readonly save: (document: ClinicalDocumentSnapshot) => Promise<void> | void;
  readonly load: (caseId: ClinicalCaseId) => Promise<ClinicalDocumentSnapshot | undefined> | ClinicalDocumentSnapshot | undefined;
}

export class RecentCasesRegistry {
  private readonly entries: RecentCaseEntry[] = [];
  private readonly storageKey = 'cad-studio.clinical.recent.v1';

  public constructor(private readonly maxEntries = 12) {
    this.hydrate();
  }

  public list(): readonly RecentCaseEntry[] {
    return Object.freeze([...this.entries]);
  }

  public register(doc: ClinicalDocumentSnapshot, openedAt: number): void {
    const filtered = this.entries.filter((e) => e.caseId !== doc.caseId);
    this.entries.length = 0;
    this.entries.push(
      Object.freeze({
        caseId: doc.caseId,
        name: doc.caseMeta.name,
        patientName: doc.patient.displayName,
        lastOpenedAt: openedAt
      })
    );
    this.entries.push(...filtered);
    while (this.entries.length > this.maxEntries) {
      this.entries.pop();
    }
    this.persist();
  }

  private hydrate(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw === null) {
        return;
      }
      const parsed = JSON.parse(raw) as RecentCaseEntry[];
      for (const entry of parsed) {
        this.entries.push(Object.freeze(entry));
      }
    } catch {
      // ignore
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.entries));
    } catch {
      // ignore
    }
  }
}
