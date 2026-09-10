import { describe, expect, it } from 'vitest';
import {
  ALL_PASS_KINDS,
  BasePass,
  PassRegistry,
  RenderPipeline,
  type PassKind
} from '../src/index.js';

describe('passes', () => {
  it('runs lifecycle setup → execute → teardown for every pass kind', () => {
    const registry = new PassRegistry();
    for (const kind of ALL_PASS_KINDS) {
      const created = registry.create(kind);
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const context = {
        passId: created.value.id,
        kind,
        frameIndex: 1
      };
      expect(created.value.setup(context).ok).toBe(true);
      expect(created.value.execute(context).ok).toBe(true);
      expect(created.value.teardown(context).ok).toBe(true);
    }
    expect(registry.list()).toHaveLength(ALL_PASS_KINDS.length);
    registry.dispose();
  });

  it('rejects duplicate pass factories', () => {
    const registry = new PassRegistry();
    const first = registry.registerFactory(
      'custom',
      (id, label) => new BasePass(id, 'custom', label ?? 'custom')
    );
    expect(first.ok).toBe(true);

    const second = registry.registerFactory(
      'custom',
      (id, label) => new BasePass(id, 'custom', label ?? 'custom')
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe('conflict');
    registry.dispose();
  });

  it('orders pipeline passes by declared order', () => {
    const registry = new PassRegistry();
    const pipeline = new RenderPipeline();
    const kinds: PassKind[] = ['depth', 'geometry', 'overlay'];
    const passes = kinds.map((kind, index) => {
      const created = registry.create(kind);
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error('create failed');
      expect(pipeline.addPass(created.value, index).ok).toBe(true);
      return created.value;
    });

    expect(pipeline.orderedPasses().map((pass) => pass.kind)).toEqual(kinds);
    const executed = pipeline.execute({ frameIndex: 3 });
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(executed.value).toEqual(passes.map((pass) => pass.id));
    registry.dispose();
  });
});
