import { describe, expect, it } from 'vitest';
import {
  MockKernelPort,
  OperationHost,
  RESERVED_OPERATION_KINDS,
  asDocumentRevision,
  createDefaultHandlers,
  createPreviewDescriptor,
  opSuccess
} from '../src/index.js';

describe('operation host architecture', () => {
  it('exposes all reserved CAD operation kinds', () => {
    const host = new OperationHost({ kernel: new MockKernelPort() });
    for (const kind of [
      'trim',
      'close-base',
      'segmentation',
      'movement',
      'ipr',
      'collision',
      'boolean',
      'mesh-healing'
    ] as const) {
      expect(host.supportedKinds).toContain(kind);
    }
    expect(RESERVED_OPERATION_KINDS.length).toBeGreaterThanOrEqual(12);
  });

  it('rejects a second concurrent active operation', () => {
    const host = new OperationHost({ kernel: new MockKernelPort() });
    expect(
      host.start({ kind: 'trim', baseRevision: asDocumentRevision(0) }).ok
    ).toBe(true);
    const second = host.start({ kind: 'movement', baseRevision: asDocumentRevision(0) });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('conflict');
    }
  });

  it('preview descriptors are opaque and not commit payloads by themselves', () => {
    const host = new OperationHost({ kernel: new MockKernelPort() });
    const started = host.start({
      kind: 'segmentation',
      baseRevision: asDocumentRevision(1)
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const preview = createPreviewDescriptor({
      id: 'brush',
      kind: 'boundary',
      operationId: started.value.id,
      revision: 1
    });
    expect(preview.opaque).toBe(true);
    expect(started.value.setPreview(preview).ok).toBe(true);
    expect(started.value.commit().ok).toBe(false);
  });

  it('registers kind handlers once', () => {
    const host = new OperationHost({ kernel: new MockKernelPort() });
    for (const handler of createDefaultHandlers()) {
      expect(host.registerHandler(handler).ok).toBe(true);
    }
    expect(host.registerHandler({ kind: 'trim', validate: () => opSuccess(undefined) }).ok).toBe(
      false
    );
  });

  it('does not import or own document state', async () => {
    const host = new OperationHost({ kernel: new MockKernelPort() });
    const started = host.start({
      kind: 'ipr',
      baseRevision: asDocumentRevision(5),
      params: { amountMm: 0.2 }
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect((await started.value.runKernel()).ok).toBe(true);
    const receipt = started.value.commit();
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    // Host only yields a command intent — domain commit is the application's job.
    expect(receipt.value.commandIntent.baseRevision).toBe(5);
    expect(receipt.value.commandIntent.payload).toBeDefined();
  });
});
