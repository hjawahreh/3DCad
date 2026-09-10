import { describe, expect, it } from 'vitest';
import {
  ALL_PASS_KINDS,
  CanvasHost,
  PassRegistry,
  RenderGraphBuilder,
  RendererFactory,
  RendererRegistry,
  createRenderer,
  detectGpuCapabilities,
  type HostCanvasLike
} from '../src/index.js';

describe('architecture', () => {
  it('creates isolated renderer sessions', async () => {
    const first = await createRenderer({
      id: 'session-a',
      forceBackend: 'mock',
      preferredBackend: 'mock'
    });
    const second = await createRenderer({
      id: 'session-b',
      forceBackend: 'mock',
      preferredBackend: 'mock'
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.value.id).not.toBe(second.value.id);
    first.value.dispose();
    expect(first.value.sessionInfo().disposed).toBe(true);
    expect(second.value.sessionInfo().disposed).toBe(false);
    second.value.dispose();
  });

  it('supports all reserved pass kinds and auto-setup on execute', () => {
    const registry = new PassRegistry();
    expect(registry.kinds()).toEqual([...ALL_PASS_KINDS]);

    const picking = registry.create('picking');
    expect(picking.ok).toBe(true);
    if (!picking.ok) return;

    // Architecture callers may omit an explicit setup(); execute must still succeed.
    const executed = picking.value.execute({
      passId: picking.value.id,
      kind: 'picking',
      frameIndex: 1
    });
    expect(executed.ok).toBe(true);

    const setupFirst = registry.create('geometry');
    expect(setupFirst.ok).toBe(true);
    if (!setupFirst.ok) return;
    const context = {
      passId: setupFirst.value.id,
      kind: 'geometry' as const,
      frameIndex: 2
    };
    expect(setupFirst.value.setup(context).ok).toBe(true);
    expect(setupFirst.value.execute(context).ok).toBe(true);
    registry.dispose();
  });

  it('hosts a canvas without owning GPU objects', () => {
    const host = new CanvasHost();
    const canvas = {
      width: 640,
      height: 480,
      clientWidth: 640,
      clientHeight: 480
    } as HostCanvasLike;
    host.attach(canvas);
    expect(host.getCanvas()).toBe(canvas);
    expect(host.getSize()).toEqual({ width: 640, height: 480 });
    host.setSize({ width: 800, height: 600 });
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    host.detach();
    expect(host.getCanvas()).toBeUndefined();
  });

  it('detects mock GPU capabilities on demand', () => {
    const capabilities = detectGpuCapabilities({ forceMock: true });
    expect(capabilities.preferredBackend).toBe('mock');
    expect(capabilities.availableBackends).toContain('mock');
    expect(capabilities.isSoftwareRasterizer).toBe(true);
  });

  it('exposes a factory-backed renderer registry', async () => {
    const registry = new RendererRegistry();
    const factory = new RendererFactory(registry);
    expect(factory.getRegistry()).toBe(registry);

    const created = await factory.create({
      id: 'factory-one',
      forceBackend: 'mock',
      preferredBackend: 'mock',
      registry
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(registry.get(created.value.id)?.id).toBe(created.value.id);
    created.value.dispose();
  });

  it('builds render graphs without React', () => {
    expect((globalThis as { React?: unknown }).React).toBeUndefined();
    const builder = new RenderGraphBuilder();
    expect(builder.addResource({ name: 'color', kind: 'texture' }).ok).toBe(true);
    expect(builder.addPass({ id: 'clear', writes: ['color'] }).ok).toBe(true);
    const compiled = builder.compile();
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.value.schedule.map(String)).toEqual(['clear']);
  });
});
