import { describe, expect, it } from 'vitest';
import {
  ReservedSpatialIndex,
  SceneProjectionEngine,
  asDocumentRevisionId,
  asDomainEntityId,
  createDocumentEntity,
  createDocumentRevision
} from '../src/index.js';

describe('architecture boundaries', () => {
  it('does not expose gpu three react or kernel APIs on the engine', () => {
    const engine = new SceneProjectionEngine();
    const keys = Object.getOwnPropertyNames(Object.getPrototypeOf(engine));
    expect(keys.some((k) => /three|gpu|react|kernel|canvas/i.test(k))).toBe(false);
    engine.dispose();
  });

  it('spatial index remains reserved without BVH implementation', () => {
    const index = new ReservedSpatialIndex();
    expect(index.implementation).toBe('reserved');
    expect(index.rebuild([]).ok).toBe(false);
    expect(index.query({ bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } }).ok).toBe(
      false
    );
  });

  it('snapshot contains no mutable collections', () => {
    const engine = new SceneProjectionEngine();
    const result = engine.project(
      createDocumentRevision(asDocumentRevisionId(1), [
        createDocumentEntity({ id: asDomainEntityId('a'), kind: 'mesh' })
      ])
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(() => {
      (result.value.snapshot as unknown as { renderables: unknown[] }).renderables.push({});
    }).toThrow();
    engine.dispose();
  });

  it('world is disposable and rejects use after dispose', () => {
    const engine = new SceneProjectionEngine();
    engine.dispose();
    const result = engine.project(
      createDocumentRevision(asDocumentRevisionId(1), [
        createDocumentEntity({ id: asDomainEntityId('a'), kind: 'mesh' })
      ])
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
    }
  });
});
