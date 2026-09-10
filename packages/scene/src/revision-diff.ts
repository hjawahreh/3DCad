import type { DocumentEntityView, DocumentRevisionView } from './document.js';
import type { DomainEntityId } from './types.js';
import { sceneFailure, sceneSuccess, type SceneResult } from './types.js';

export type EntityChangeKind =
  | 'added'
  | 'removed'
  | 'updated'
  | 'visibility'
  | 'transform'
  | 'display'
  | 'metadata';

export interface EntityChange {
  readonly entityId: DomainEntityId;
  readonly kinds: readonly EntityChangeKind[];
  readonly previous?: DocumentEntityView;
  readonly next?: DocumentEntityView;
}

export interface RevisionDiff {
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly fullRebuild: boolean;
  readonly added: readonly DomainEntityId[];
  readonly removed: readonly DomainEntityId[];
  readonly updated: readonly DomainEntityId[];
  readonly changes: readonly EntityChange[];
}

const sameMat = (
  a: DocumentEntityView['transform'],
  b: DocumentEntityView['transform']
): boolean => {
  for (let i = 0; i < 16; i += 1) {
    if (a.elements[i] !== b.elements[i]) {
      return false;
    }
  }
  return true;
};

const shallowRecordEqual = (
  a: Readonly<Record<string, unknown>> | undefined,
  b: Readonly<Record<string, unknown>> | undefined
): boolean => {
  if (a === b) {
    return true;
  }
  if (a === undefined || b === undefined) {
    return a === b;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
};

const classifyUpdate = (
  previous: DocumentEntityView,
  next: DocumentEntityView
): EntityChangeKind[] => {
  const kinds: EntityChangeKind[] = [];
  if (previous.visible !== next.visible) {
    kinds.push('visibility');
  }
  if (!sameMat(previous.transform, next.transform)) {
    kinds.push('transform');
  }
  if (!shallowRecordEqual(previous.display, next.display)) {
    kinds.push('display');
  }
  if (!shallowRecordEqual(previous.metadata, next.metadata)) {
    kinds.push('metadata');
  }
  if (
    previous.kind !== next.kind ||
    previous.layer !== next.layer ||
    previous.geometryRef !== next.geometryRef ||
    previous.materialRef !== next.materialRef
  ) {
    kinds.push('updated');
  }
  return kinds.length === 0 ? ['updated'] : kinds;
};

export class RevisionDiffEngine {
  public diff(
    previous: DocumentRevisionView | undefined,
    next: DocumentRevisionView
  ): SceneResult<RevisionDiff> {
    if (next.revision < 0) {
      return sceneFailure('invalid', 'Document revision must be non-negative');
    }

    if (previous === undefined || next.replaced === true) {
      const added = [...next.entities.keys()];
      const changes: EntityChange[] = [];
      for (const entityId of added) {
        const entity = next.entities.get(entityId);
        if (entity === undefined) {
          continue;
        }
        changes.push({ entityId, kinds: ['added'], next: entity });
      }
      return sceneSuccess({
        fromRevision: previous?.revision ?? -1,
        toRevision: next.revision,
        fullRebuild: true,
        added,
        removed: previous === undefined ? [] : [...previous.entities.keys()],
        updated: [],
        changes
      });
    }

    if (next.revision < previous.revision) {
      return sceneFailure(
        'revision-mismatch',
        `Cannot project older revision ${String(next.revision)} after ${String(previous.revision)}`
      );
    }

    if (next.revision === previous.revision) {
      return sceneSuccess({
        fromRevision: previous.revision,
        toRevision: next.revision,
        fullRebuild: false,
        added: [],
        removed: [],
        updated: [],
        changes: []
      });
    }

    const added: DomainEntityId[] = [];
    const removed: DomainEntityId[] = [];
    const updated: DomainEntityId[] = [];
    const changes: EntityChange[] = [];

    for (const [id, entity] of next.entities) {
      const prior = previous.entities.get(id);
      if (prior === undefined) {
        added.push(id);
        changes.push({ entityId: id, kinds: ['added'], next: entity });
        continue;
      }
      const kinds = classifyUpdate(prior, entity);
      const structurallySame =
        prior.kind === entity.kind &&
        prior.layer === entity.layer &&
        prior.geometryRef === entity.geometryRef &&
        prior.materialRef === entity.materialRef &&
        prior.visible === entity.visible &&
        sameMat(prior.transform, entity.transform) &&
        shallowRecordEqual(prior.display, entity.display) &&
        shallowRecordEqual(prior.metadata, entity.metadata);
      if (!structurallySame) {
        updated.push(id);
        changes.push({ entityId: id, kinds, previous: prior, next: entity });
      }
    }

    for (const [id, entity] of previous.entities) {
      if (!next.entities.has(id)) {
        removed.push(id);
        changes.push({
          entityId: id,
          kinds: ['removed'],
          previous: entity
        });
      }
    }

    added.sort((a, b) => a.localeCompare(b));
    removed.sort((a, b) => a.localeCompare(b));
    updated.sort((a, b) => a.localeCompare(b));
    changes.sort((a, b) => a.entityId.localeCompare(b.entityId));

    return sceneSuccess({
      fromRevision: previous.revision,
      toRevision: next.revision,
      fullRebuild: false,
      added,
      removed,
      updated,
      changes
    });
  }
}
