import { describe, expect, it } from 'vitest';
import { MockKernelBridge, kernelFailure } from '@cad-studio/kernel-bridge';
import { GEOMETRY_SERVICE_FAMILIES, GeometryServices } from '../src/index.js';

describe('geometry services adapters', () => {
  it('registers all reserved service families', () => {
    const geo = new GeometryServices(new MockKernelBridge());
    expect(geo.listFamilies()).toEqual([...GEOMETRY_SERVICE_FAMILIES]);
    expect(geo.get('boolean').ok).toBe(true);
    expect(geo.get('collision').ok).toBe(true);
  });

  it('opens a kernel session with resource and topology caches', () => {
    const geo = new GeometryServices(new MockKernelBridge());
    const session = geo.openSession();
    expect(session.cacheHandle('mesh-a').ok).toBe(true);
    expect(session.putTopology('bvh', { nodes: 1 }).ok).toBe(true);
    expect(session.getTopology('bvh').ok).toBe(true);
    expect(session.state().resourceCount).toBe(1);
    geo.closeSession();
    expect(session.state().disposed).toBe(true);
  });

  it('executes through abstract ports without knowing mock vs native', async () => {
    const bridge = new MockKernelBridge();
    const geo = new GeometryServices(bridge);
    const result = await geo.execute(
      {
        family: 'transform',
        operation: 'translate',
        inputRevision: 2,
        payload: { dx: 1 }
      },
      new AbortController().signal
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.validated).toBe(true);
    expect(result.value.kernel.fingerprint).toContain('translate');
    expect(result.value.kernel.geometryHandles.length).toBe(1);
    expect(bridge.calls).toHaveLength(1);
  });

  it('rejects unsupported operations', async () => {
    const geo = new GeometryServices(new MockKernelBridge());
    const result = await geo.execute(
      {
        family: 'boolean',
        operation: 'not-a-real-op',
        inputRevision: 0,
        payload: {}
      },
      new AbortController().signal
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unsupported');
    }
  });

  it('propagates kernel failures without inventing success', async () => {
    const bridge = new MockKernelBridge();
    bridge.failNext = kernelFailure('abi', 'native failure');
    const geo = new GeometryServices(bridge);
    const result = await geo.execute(
      {
        family: 'repair',
        operation: 'heal',
        inputRevision: 1,
        payload: {}
      },
      new AbortController().signal
    );
    expect(result.ok).toBe(false);
  });

  it('does not own document mutation APIs', () => {
    const geo = new GeometryServices(new MockKernelBridge());
    expect('commit' in geo).toBe(false);
    expect('dispatchCommand' in geo).toBe(false);
  });
});
