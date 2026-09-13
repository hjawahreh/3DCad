/**
 * Clinical case persistence — host-owned durable store for documents + mesh buffers.
 * Implements CasePersistenceContract; does not redesign frozen platforms.
 */

import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import type { ClinicalCaseId } from '../runtime/types.js';
import { asClinicalCaseId } from '../runtime/types.js';
import {
  deriveClinicalCaseWorkflowStatus,
  type ClinicalCasePhase
} from './ClinicalCaseWorkflowStatus.js';
import type { RecentCaseEntry } from './RecentCases.js';
import type { ClinicalHandoffSnapshot } from '../handoff/ClinicalHandoffSnapshot.js';

export interface PersistedMeshGeometry {
  readonly objectId: string;
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly revision: number;
  /** Optional immutable raw import buffers (GEO-001B). When present, hydrate restores SOURCE separately. */
  readonly sourcePositions?: Float32Array;
  readonly sourceIndices?: Uint32Array;
}

export interface PersistedClinicalCase {
  readonly document: ClinicalDocumentSnapshot;
  readonly meshes: readonly PersistedMeshGeometry[];
  readonly savedAt: number;
  /** Optional provider-agnostic clinical handoff snapshot (PROD-002). */
  readonly handoff?: ClinicalHandoffSnapshot;
}

export interface CasePersistenceContract {
  readonly save: (payload: PersistedClinicalCase) => Promise<void>;
  readonly load: (caseId: ClinicalCaseId) => Promise<PersistedClinicalCase | undefined>;
  readonly list: () => Promise<readonly RecentCaseEntry[]>;
  readonly remove: (caseId: ClinicalCaseId) => Promise<void>;
}

const DB_NAME = 'cad-studio.clinical.cases.v1';
const DB_VERSION = 1;
const STORE_META = 'cases';
const STORE_MESH = 'meshes';

interface StoredCaseMeta {
  readonly caseId: string;
  readonly documentJson: string;
  readonly savedAt: number;
  readonly name: string;
  readonly patientName: string;
  readonly updatedAt: number;
  readonly workflowStatus: string;
  readonly phase: ClinicalCasePhase;
  readonly objectIds: readonly string[];
  readonly handoffJson?: string;
}

interface StoredMeshRow {
  readonly key: string;
  readonly caseId: string;
  readonly objectId: string;
  readonly revision: number;
  readonly positions: ArrayBuffer;
  readonly indices: ArrayBuffer;
  readonly sourcePositions?: ArrayBuffer;
  readonly sourceIndices?: ArrayBuffer;
}

const entryFromMeta = (meta: StoredCaseMeta): RecentCaseEntry =>
  Object.freeze({
    caseId: asClinicalCaseId(meta.caseId),
    name: meta.name,
    patientName: meta.patientName,
    lastOpenedAt: meta.savedAt,
    updatedAt: meta.updatedAt,
    workflowStatus: meta.workflowStatus
  });

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'caseId' });
      }
      if (!db.objectStoreNames.contains(STORE_MESH)) {
        const mesh = db.createObjectStore(STORE_MESH, { keyPath: 'key' });
        mesh.createIndex('byCase', 'caseId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });

const idbRequest = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });

const txDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });

/** In-memory persistence for tests / environments without IndexedDB. */
export class MemoryClinicalCasePersistence implements CasePersistenceContract {
  private readonly cases = new Map<string, PersistedClinicalCase>();

  public async save(payload: PersistedClinicalCase): Promise<void> {
    const meshes = payload.meshes.map((m) =>
      Object.freeze({
        objectId: m.objectId,
        positions: new Float32Array(m.positions),
        indices: new Uint32Array(m.indices),
        revision: m.revision,
        ...(m.sourcePositions !== undefined && m.sourceIndices !== undefined
          ? {
              sourcePositions: new Float32Array(m.sourcePositions),
              sourceIndices: new Uint32Array(m.sourceIndices)
            }
          : {})
      })
    );
    this.cases.set(payload.document.caseId as string, {
      document: payload.document,
      meshes: Object.freeze(meshes),
      savedAt: payload.savedAt,
      ...(payload.handoff !== undefined ? { handoff: payload.handoff } : {})
    });
  }

  public async load(caseId: ClinicalCaseId): Promise<PersistedClinicalCase | undefined> {
    const found = this.cases.get(caseId as string);
    if (found === undefined) return undefined;
    return {
      document: found.document,
      meshes: found.meshes.map((m) =>
        Object.freeze({
          objectId: m.objectId,
          positions: new Float32Array(m.positions),
          indices: new Uint32Array(m.indices),
          revision: m.revision,
          ...(m.sourcePositions !== undefined && m.sourceIndices !== undefined
            ? {
                sourcePositions: new Float32Array(m.sourcePositions),
                sourceIndices: new Uint32Array(m.sourceIndices)
              }
            : {})
        })
      ),
      savedAt: found.savedAt,
      ...(found.handoff !== undefined ? { handoff: found.handoff } : {})
    };
  }

  public async list(): Promise<readonly RecentCaseEntry[]> {
    const entries = [...this.cases.values()]
      .map((c) =>
        Object.freeze({
          caseId: c.document.caseId,
          name: c.document.caseMeta.name,
          patientName: c.document.patient.displayName,
          lastOpenedAt: c.savedAt,
          updatedAt: c.document.updatedAt,
          workflowStatus: deriveClinicalCaseWorkflowStatus(c.document)
        })
      )
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    return Object.freeze(entries);
  }

  public async remove(caseId: ClinicalCaseId): Promise<void> {
    this.cases.delete(caseId as string);
  }
}

export class IndexedDbClinicalCasePersistence implements CasePersistenceContract {
  public async save(payload: PersistedClinicalCase): Promise<void> {
    const db = await openDb();
    try {
      const caseId = payload.document.caseId as string;
      const meta: StoredCaseMeta = {
        caseId,
        documentJson: JSON.stringify(payload.document),
        savedAt: payload.savedAt,
        name: payload.document.caseMeta.name,
        patientName: payload.document.patient.displayName,
        updatedAt: payload.document.updatedAt,
        workflowStatus: deriveClinicalCaseWorkflowStatus(payload.document),
        phase: payload.document.objects.length === 0 ? 'case-created' : 'orientation-ready',
        objectIds: payload.meshes.map((m) => m.objectId),
        ...(payload.handoff !== undefined
          ? { handoffJson: JSON.stringify(payload.handoff) }
          : {})
      };

      const tx = db.transaction([STORE_META, STORE_MESH], 'readwrite');
      const metaStore = tx.objectStore(STORE_META);
      const meshStore = tx.objectStore(STORE_MESH);

      // Remove prior mesh rows for this case
      const byCase = meshStore.index('byCase');
      const existing = await idbRequest(byCase.getAllKeys(caseId));
      for (const key of existing) {
        meshStore.delete(key);
      }

      metaStore.put(meta);
      for (const mesh of payload.meshes) {
        const positionsCopy = new Float32Array(mesh.positions);
        const indicesCopy = new Uint32Array(mesh.indices);
        const row: StoredMeshRow = {
          key: `${caseId}::${mesh.objectId}`,
          caseId,
          objectId: mesh.objectId,
          revision: mesh.revision,
          positions: positionsCopy.buffer as ArrayBuffer,
          indices: indicesCopy.buffer as ArrayBuffer,
          ...(mesh.sourcePositions !== undefined && mesh.sourceIndices !== undefined
            ? {
                sourcePositions: new Float32Array(mesh.sourcePositions).buffer as ArrayBuffer,
                sourceIndices: new Uint32Array(mesh.sourceIndices).buffer as ArrayBuffer
              }
            : {})
        };
        meshStore.put(row);
      }
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  public async load(caseId: ClinicalCaseId): Promise<PersistedClinicalCase | undefined> {
    const db = await openDb();
    try {
      const id = caseId as string;
      const tx = db.transaction([STORE_META, STORE_MESH], 'readonly');
      const meta = (await idbRequest(
        tx.objectStore(STORE_META).get(id)
      )) as StoredCaseMeta | undefined;
      if (meta === undefined) {
        await txDone(tx);
        return undefined;
      }
      const rows = (await idbRequest(
        tx.objectStore(STORE_MESH).index('byCase').getAll(id)
      )) as StoredMeshRow[];
      await txDone(tx);

      const document = JSON.parse(meta.documentJson) as ClinicalDocumentSnapshot;
      const meshes = rows.map((row) =>
        Object.freeze({
          objectId: row.objectId,
          positions: new Float32Array(row.positions),
          indices: new Uint32Array(row.indices),
          revision: row.revision,
          ...(row.sourcePositions !== undefined && row.sourceIndices !== undefined
            ? {
                sourcePositions: new Float32Array(row.sourcePositions),
                sourceIndices: new Uint32Array(row.sourceIndices)
              }
            : {})
        })
      );
      const handoff =
        meta.handoffJson !== undefined && meta.handoffJson.length > 0
          ? (JSON.parse(meta.handoffJson) as ClinicalHandoffSnapshot)
          : undefined;
      return {
        document,
        meshes: Object.freeze(meshes),
        savedAt: meta.savedAt,
        ...(handoff !== undefined ? { handoff } : {})
      };
    } finally {
      db.close();
    }
  }

  public async list(): Promise<readonly RecentCaseEntry[]> {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_META, 'readonly');
      const all = (await idbRequest(tx.objectStore(STORE_META).getAll())) as StoredCaseMeta[];
      await txDone(tx);
      return Object.freeze(
        all
          .map(entryFromMeta)
          .sort((a, b) => (b.updatedAt ?? b.lastOpenedAt) - (a.updatedAt ?? a.lastOpenedAt))
      );
    } finally {
      db.close();
    }
  }

  public async remove(caseId: ClinicalCaseId): Promise<void> {
    const db = await openDb();
    try {
      const id = caseId as string;
      const tx = db.transaction([STORE_META, STORE_MESH], 'readwrite');
      tx.objectStore(STORE_META).delete(id);
      const keys = await idbRequest(tx.objectStore(STORE_MESH).index('byCase').getAllKeys(id));
      for (const key of keys) {
        tx.objectStore(STORE_MESH).delete(key);
      }
      await txDone(tx);
    } finally {
      db.close();
    }
  }
}

export const createClinicalCasePersistence = (): CasePersistenceContract => {
  if (typeof indexedDB === 'undefined') {
    return new MemoryClinicalCasePersistence();
  }
  return new IndexedDbClinicalCasePersistence();
};
