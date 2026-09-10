import { describe, expect, it } from 'vitest';
import { RenderGraphBuilder } from '../src/index.js';

describe('render graph', () => {
  it('schedules producers before consumers', () => {
    const builder = new RenderGraphBuilder();
    builder.addResource({ name: 'gbuffer', kind: 'texture' });
    builder.addPass({ id: 'produce', writes: ['gbuffer'] });
    builder.addPass({ id: 'consume', reads: ['gbuffer'] });
    const compiled = builder.compile();
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.value.schedule.map(String)).toEqual(['produce', 'consume']);
  });

  it('rejects cycles', () => {
    const builder = new RenderGraphBuilder();
    builder.addResource({ name: 'a', kind: 'texture' });
    builder.addResource({ name: 'b', kind: 'texture' });
    builder.addPass({ id: 'one', reads: ['b'], writes: ['a'] });
    builder.addPass({ id: 'two', reads: ['a'], writes: ['b'] });
    const compiled = builder.compile();
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.error.code).toBe('validation');
    expect(compiled.error.message).toMatch(/cycle/i);
  });

  it('rejects unproduced resources', () => {
    const builder = new RenderGraphBuilder();
    builder.addResource({ name: 'orphan', kind: 'texture' });
    builder.addPass({ id: 'reader', reads: ['orphan'] });
    const compiled = builder.compile();
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.error.message).toMatch(/never produced/i);
  });

  it('allows external resources without producers', () => {
    const builder = new RenderGraphBuilder();
    builder.addResource({
      name: 'swapchain',
      kind: 'external',
      lifetime: 'external'
    });
    builder.addPass({ id: 'present', writes: ['swapchain'] });
    const compiled = builder.compile();
    expect(compiled.ok).toBe(true);
  });

  it('executes passes in scheduled order', () => {
    const order: string[] = [];
    const builder = new RenderGraphBuilder();
    builder.addResource({ name: 'tex', kind: 'texture' });
    builder.addPass({
      id: 'alpha',
      writes: ['tex'],
      execute: () => {
        order.push('alpha');
      }
    });
    builder.addPass({
      id: 'beta',
      reads: ['tex'],
      execute: () => {
        order.push('beta');
      }
    });
    const compiled = builder.compile();
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const executed = compiled.value.execute();
    expect(executed.ok).toBe(true);
    expect(order).toEqual(['alpha', 'beta']);
    if (!executed.ok) return;
    expect(executed.value.map(String)).toEqual(['alpha', 'beta']);
  });

  it('exposes a debug view of passes, edges, and schedule', () => {
    const builder = new RenderGraphBuilder();
    builder.addResource({ name: 'color', kind: 'texture' });
    builder.addPass({ id: 'draw', writes: ['color'] });
    builder.addPass({ id: 'blit', reads: ['color'] });
    const compiled = builder.compile();
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const view = compiled.value.debugView();
    expect(view.passes).toContain('draw');
    expect(view.schedule).toEqual(['draw', 'blit']);
    expect(view.resources).toContain('color');
    expect(view.edges).toContain('draw->blit');
  });

  it('computes resource lifetimes across first and last use', () => {
    const builder = new RenderGraphBuilder();
    builder.addResource({ name: 'temp', kind: 'texture', lifetime: 'transient' });
    builder.addPass({ id: 'write', writes: ['temp'] });
    builder.addPass({ id: 'read-a', reads: ['temp'] });
    builder.addPass({ id: 'read-b', reads: ['temp'] });
    const compiled = builder.compile();
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const lifetime = compiled.value.resources.find((entry) => entry.name === 'temp');
    expect(lifetime).toBeDefined();
    expect(String(lifetime?.firstUse)).toBe('write');
    expect(String(lifetime?.lastUse)).toBe('read-b');
    expect(lifetime?.lifetime).toBe('transient');
  });
});
