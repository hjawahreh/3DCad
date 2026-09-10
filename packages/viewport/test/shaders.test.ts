import { describe, expect, it } from 'vitest';
import { ShaderRegistry, asShaderId } from '../src/index.js';

const SAMPLE_WGSL = `
@group(0) @binding(0) var<uniform> params: vec4f;
@vertex fn vs_main() -> @builtin(position) vec4f {
  return vec4f(0.0);
}
@fragment fn fs_main() -> @location(0) vec4f {
  return vec4f(1.0);
}
`;

describe('shaders', () => {
  it('registers, reflects, and caches identical sources', () => {
    const registry = new ShaderRegistry();
    const first = registry.register(SAMPLE_WGSL, { label: 'lit' });
    const second = registry.register(SAMPLE_WGSL, { label: 'lit-again' });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.value.id).toBe(second.value.id);
    expect(first.value.hash).toBe(second.value.hash);

    const reflection = registry.reflect(first.value.id);
    expect(reflection.ok).toBe(true);
    if (!reflection.ok) return;
    expect(reflection.value.entryPoints).toEqual(['vs_main', 'fs_main']);
    expect(reflection.value.bindings[0]?.name).toBe('params');
    registry.dispose();
  });

  it('creates variants and supports hot reload versioning', () => {
    const registry = new ShaderRegistry();
    const base = registry.register(SAMPLE_WGSL, { label: 'base' });
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    const variant = registry.createVariant(base.value.id, ['SKINNING']);
    expect(variant.ok).toBe(true);
    if (!variant.ok) return;
    expect(variant.value.keywords).toEqual(['SKINNING']);
    expect(variant.value.dependencies).toEqual([base.value.id]);

    const reloaded = registry.hotReload(
      base.value.id,
      `${SAMPLE_WGSL}\n// revision`
    );
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;
    expect(reloaded.value.version).toBe(2);
    registry.dispose();
  });

  it('tracks dependencies and rejects empty sources', () => {
    const registry = new ShaderRegistry();
    expect(registry.register('').ok).toBe(false);
    expect(registry.register('   ').ok).toBe(false);

    const base = registry.register(SAMPLE_WGSL);
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    const missing = registry.register(SAMPLE_WGSL, {
      id: asShaderId('child'),
      keywords: ['A'],
      dependencies: [asShaderId('missing-dep')]
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error.code).toBe('not-found');

    const child = registry.register(SAMPLE_WGSL, {
      keywords: ['B'],
      dependencies: [base.value.id]
    });
    expect(child.ok).toBe(true);
    if (!child.ok) return;
    const deps = registry.dependencies(child.value.id);
    expect(deps.ok).toBe(true);
    if (!deps.ok) return;
    expect(deps.value).toEqual([base.value.id]);
    registry.dispose();
  });
});
