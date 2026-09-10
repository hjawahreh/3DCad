import { describe, expect, it } from 'vitest';
import { MaterialRegistry } from '../src/index.js';

describe('materials', () => {
  it('provides default parameters per material kind', () => {
    const registry = new MaterialRegistry();
    const pbrDefaults = registry.defaultParams('pbr');
    expect(pbrDefaults.metallic).toBe(0);
    expect(pbrDefaults.roughness).toBe(0.5);
    expect(pbrDefaults.opacity).toBe(1);

    const created = registry.create('pbr');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.params.roughness).toBe(0.5);
    registry.dispose();
  });

  it('creates material instances from a parent', () => {
    const registry = new MaterialRegistry();
    const parent = registry.create('unlit', {
      color: { r: 1, g: 0, b: 0, a: 1 }
    });
    expect(parent.ok).toBe(true);
    if (!parent.ok) return;

    const child = registry.createInstance(parent.value.id, { opacity: 0.25 });
    expect(child.ok).toBe(true);
    if (!child.ok) return;
    expect(child.value.parentId).toBe(parent.value.id);
    expect(child.value.params.opacity).toBe(0.25);
    expect(child.value.params.color).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    registry.dispose();
  });

  it('versions materials on update', () => {
    const registry = new MaterialRegistry();
    const created = registry.create('wireframe');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.version).toBe(1);

    const updated = registry.update(created.value.id, { opacity: 0.8 });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.version).toBe(2);
    expect(updated.value.params.opacity).toBe(0.8);
    registry.dispose();
  });

  it('lists and removes materials', () => {
    const registry = new MaterialRegistry();
    const first = registry.create('points');
    const second = registry.create('lines');
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(registry.list()).toHaveLength(2);
    expect(registry.remove(first.value.id).ok).toBe(true);
    expect(registry.list()).toHaveLength(1);
    expect(registry.resolve(first.value.id).ok).toBe(false);
    registry.dispose();
  });
});
