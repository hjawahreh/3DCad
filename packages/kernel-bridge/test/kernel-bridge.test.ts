import { describe, expect, it } from 'vitest';
import {
  CapabilityNegotiator,
  GeometryTransactionReserve,
  KERNEL_ABI_VERSION,
  KernelSessionManager,
  MockKernelBridge,
  createKernelPortSet,
  createTransformPort,
  kernelFailure
} from '../src/index.js';

describe('kernel integration layer', () => {
  it('exposes stable ABI version and opaque handles on invoke', async () => {
    const bridge = new MockKernelBridge();
    expect(bridge.capabilities.snapshot().abiVersion).toBe(KERNEL_ABI_VERSION);
    const sessions = new KernelSessionManager(bridge);
    const session = sessions.open();
    const result = await session.invoke(
      {
        capability: 'boolean',
        operation: 'union',
        inputRevision: 1,
        payload: {}
      },
      new AbortController().signal
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fingerprint).toContain('union');
    expect(result.value.geometryHandles.length).toBe(1);
    expect(result.value.validation.ok).toBe(true);
    expect(typeof result.value.geometryHandles[0]).toBe('number');
  });

  it('negotiates capabilities and rejects unsupported families', async () => {
    const caps = new CapabilityNegotiator({
      abiVersion: KERNEL_ABI_VERSION,
      implementation: 'mock',
      supported: ['transform'],
      deviceLabel: 'limited'
    });
    const bridge = new MockKernelBridge(caps);
    const session = new KernelSessionManager(bridge).open();
    const denied = await session.invoke(
      {
        capability: 'boolean',
        operation: 'union',
        inputRevision: 0,
        payload: {}
      },
      new AbortController().signal
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe('unsupported');
    }
  });

  it('manages session resource and topology caches', () => {
    const session = new KernelSessionManager(new MockKernelBridge()).open();
    expect(session.cacheHandle('mesh').ok).toBe(true);
    expect(session.putTopology('bvh', { depth: 2 }).ok).toBe(true);
    expect(session.getTopology('bvh').ok).toBe(true);
    session.dispose();
    expect(session.cacheHandle('x').ok).toBe(false);
  });

  it('family ports hide bridge implementation from callers', async () => {
    const bridge = new MockKernelBridge();
    const session = new KernelSessionManager(bridge).open();
    const port = createTransformPort();
    const result = await port.execute(
      session,
      'translate',
      3,
      { dx: 1 },
      new AbortController().signal,
      () => undefined
    );
    expect(result.ok).toBe(true);
    expect(bridge.calls[0]?.capability).toBe('transform');
  });

  it('port set covers all geometry service families', () => {
    const ports = createKernelPortSet();
    expect(ports.boolean.capability).toBe('boolean');
    expect(ports.collision.capability).toBe('collision');
    expect(ports.topology.capability).toBe('topology');
  });

  it('propagates kernel failures with typed results', async () => {
    const bridge = new MockKernelBridge();
    bridge.failNext = kernelFailure('abi', 'native panic');
    const session = new KernelSessionManager(bridge).open();
    const result = await session.invoke(
      {
        capability: 'repair',
        operation: 'heal',
        inputRevision: 0,
        payload: {}
      },
      new AbortController().signal
    );
    expect(result.ok).toBe(false);
  });

  it('reserves geometry transaction commit without implementing it', () => {
    const session = new KernelSessionManager(new MockKernelBridge()).open();
    const tx = new GeometryTransactionReserve(session);
    expect(tx.begin().ok).toBe(true);
    const committed = tx.commit();
    expect(committed.ok).toBe(false);
    if (!committed.ok) {
      expect(committed.error.code).toBe('unavailable');
    }
  });
});
