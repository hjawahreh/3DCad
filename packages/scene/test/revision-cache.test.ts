import { describe, expect, it } from 'vitest';
import {
  EntityMapper,
  PickingIdRegistry,
  ProjectionCache,
  RevisionDiffEngine,
  asDocumentRevisionId,
  asDomainEntityId,
  createDocumentEntity,
  createDocumentRevision,
  entityFingerprint,
  translate
} from '../src/index.js';

describe('revision diff and identity', () => {
  it('classifies added removed updated visibility transform', () => {
    const engine = new RevisionDiffEngine();
    const prev = createDocumentRevision(asDocumentRevisionId(1), [
      createDocumentEntity({
        id: asDomainEntityId('a'),
        kind: 'mesh',
        visible: true,
        transform: translate(0, 0, 0)
      }),
      createDocumentEntity({
        id: asDomainEntityId('b'),
        kind: 'mesh'
      })
    ]);
    const next = createDocumentRevision(asDocumentRevisionId(2), [
      createDocumentEntity({
        id: asDomainEntityId('a'),
        kind: 'mesh',
        visible: false,
        transform: translate(1, 0, 0)
      }),
      createDocumentEntity({
        id: asDomainEntityId('c'),
        kind: 'mesh'
      })
    ]);
    const diff = engine.diff(prev, next);
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;
    expect(diff.value.added).toEqual(['c']);
    expect(diff.value.removed).toEqual(['b']);
    expect(diff.value.updated).toContain('a');
    const changeA = diff.value.changes.find((c) => c.entityId === 'a');
    expect(changeA?.kinds).toEqual(expect.arrayContaining(['visibility', 'transform']));
  });

  it('keeps stable scene and picking ids across mapper lifetime', () => {
    const mapper = new EntityMapper();
    const picking = new PickingIdRegistry();
    const id = asDomainEntityId('tooth-1');
    const s1 = mapper.map(id);
    const s2 = mapper.map(id);
    expect(s1).toBe(s2);
    const p1 = picking.assign(id);
    const p2 = picking.assign(id);
    expect(p1).toBe(p2);
    expect(picking.resolve(p1).ok).toBe(true);
  });

  it('cache hits on identical fingerprints', () => {
    const cache = new ProjectionCache();
    const fp = entityFingerprint({
      kind: 'mesh',
      layer: 'world',
      visible: true,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    });
    const id = asDomainEntityId('a');
    expect(cache.get(id)).toBeUndefined();
    // miss counted
    expect(cache.stats().misses).toBe(1);
    cache.set({
      domainEntityId: id,
      sceneEntityId: 'scene:a' as never,
      pickingId: 1 as never,
      bounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 }
      },
      visibility: { visible: true, layer: 'world', culled: false },
      selectionProxy: {
        sceneEntityId: 'scene:a' as never,
        domainEntityId: id,
        pickingId: 1 as never,
        layer: 'world',
        bounds: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 1, y: 1, z: 1 }
        },
        selectable: true
      },
      renderable: {} as never,
      fingerprint: fp
    });
    expect(cache.get(id)?.fingerprint).toBe(fp);
    expect(cache.stats().hits).toBe(1);
  });
});
