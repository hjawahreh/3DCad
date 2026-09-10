import { describe, expect, it } from 'vitest';
import {
  SceneProjectionEngine,
  asDocumentRevisionId,
  asDomainEntityId,
  createDocumentEntity,
  createDocumentRevision,
  translate,
  vec3,
  aabb
} from '../src/index.js';

const entity = (
  id: string,
  opts: {
    readonly visible?: boolean;
    readonly x?: number;
    readonly kind?: string;
  } = {}
) =>
  createDocumentEntity({
    id: asDomainEntityId(id),
    kind: opts.kind ?? 'mesh',
    visible: opts.visible ?? true,
    transform: translate(opts.x ?? 0, 0, 0),
    geometryRef: `geo:${id}`,
    materialRef: 'mat:default',
    localBounds: aabb(vec3(-1, -1, -1), vec3(1, 1, 1))
  });

describe('scene projection engine', () => {
  it('projects a document revision into an immutable snapshot', () => {
    const engine = new SceneProjectionEngine({ now: () => 1000 });
    const doc = createDocumentRevision(asDocumentRevisionId(1), [
      entity('a'),
      entity('b', { x: 2 })
    ]);
    const result = engine.project(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.snapshot.renderables).toHaveLength(2);
    expect(result.value.snapshot.documentRevision).toBe(1);
    expect(Object.isFrozen(result.value.snapshot)).toBe(true);
    engine.dispose();
  });

  it('applies incremental updates without changing stable scene identities', () => {
    const engine = new SceneProjectionEngine({ now: () => 1 });
    const first = engine.project(
      createDocumentRevision(asDocumentRevisionId(1), [entity('a'), entity('b')])
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const idA = first.value.snapshot.renderables.find((r) => r.domainEntityId === 'a')
      ?.sceneEntityId;

    const second = engine.project(
      createDocumentRevision(asDocumentRevisionId(2), [
        entity('a', { x: 5 }),
        entity('c', { x: 1 })
      ])
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const idA2 = second.value.snapshot.renderables.find((r) => r.domainEntityId === 'a')
      ?.sceneEntityId;
    expect(idA2).toBe(idA);
    expect(second.value.snapshot.renderables.map((r) => r.domainEntityId).sort()).toEqual([
      'a',
      'c'
    ]);
    expect(second.value.snapshot.metrics.entitiesRemoved).toBe(1);
    expect(second.value.snapshot.metrics.entitiesUpdated).toBe(1);
    engine.dispose();
  });

  it('is deterministic for the same document revision', () => {
    const make = () => {
      const engine = new SceneProjectionEngine({ now: () => 42 });
      const result = engine.project(
        createDocumentRevision(asDocumentRevisionId(3), [
          entity('z'),
          entity('a'),
          entity('m')
        ])
      );
      engine.dispose();
      return result;
    };
    const a = make();
    const b = make();
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.snapshot.renderables.map((r) => r.sceneEntityId)).toEqual(
      b.value.snapshot.renderables.map((r) => r.sceneEntityId)
    );
    expect(a.value.snapshot.renderables.map((r) => r.pickingId)).toEqual(
      b.value.snapshot.renderables.map((r) => r.pickingId)
    );
  });

  it('rejects projecting an older revision after a newer one', () => {
    const engine = new SceneProjectionEngine();
    expect(
      engine.project(createDocumentRevision(asDocumentRevisionId(2), [entity('a')])).ok
    ).toBe(true);
    const older = engine.project(
      createDocumentRevision(asDocumentRevisionId(1), [entity('a')])
    );
    expect(older.ok).toBe(false);
    if (!older.ok) {
      expect(older.error.code).toBe('revision-mismatch');
    }
    engine.dispose();
  });

  it('supports full rebuild via replaced flag', () => {
    const engine = new SceneProjectionEngine();
    expect(
      engine.project(createDocumentRevision(asDocumentRevisionId(1), [entity('a')])).ok
    ).toBe(true);
    const replaced = engine.project(
      createDocumentRevision(asDocumentRevisionId(1), [entity('x')], true)
    );
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.value.snapshot.renderables).toHaveLength(1);
    expect(replaced.value.snapshot.renderables[0]?.domainEntityId).toBe('x');
    engine.dispose();
  });

  it('records metrics and diagnostics', () => {
    const engine = new SceneProjectionEngine({ now: (() => {
      let t = 0;
      return () => {
        t += 5;
        return t;
      };
    })() });
    expect(
      engine.project(createDocumentRevision(asDocumentRevisionId(1), [entity('a')])).ok
    ).toBe(true);
    const metrics = engine.metrics();
    expect(metrics.revisionCount).toBe(1);
    expect(metrics.entitiesProjected).toBe(1);
    expect(metrics.projectionDurationMs).toBeGreaterThanOrEqual(0);
    engine.dispose();
  });
});
