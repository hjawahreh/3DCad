import { describe, expect, it } from 'vitest';
import {
  MockKernelPort,
  OperationHost,
  asDocumentRevision,
  opFailure,
  opSuccess
} from '../src/index.js';

describe('operation runtime subsystems', () => {
  it('lists expanded reserved kinds in the registry', () => {
    const host = new OperationHost({ kernel: new MockKernelPort() });
    const kinds = host.operationRegistry.kinds();
    expect(kinds).toContain('trim');
    expect(kinds).toContain('boolean');
    expect(kinds).toContain('mesh-healing');
    expect(kinds).toContain('margin-detection');
  });

  it('runs validation pipeline preconditions before kernel', async () => {
    const host = new OperationHost({ kernel: new MockKernelPort() });
    host.validationPipeline.add({
      stage: 'precondition',
      name: 'require-height',
      run: (ctx) =>
        typeof ctx.params['height'] === 'number'
          ? opSuccess(undefined)
          : opFailure('validation', 'height required')
    });

    const missing = host.start({
      kind: 'close-base',
      baseRevision: asDocumentRevision(1)
    });
    expect(missing.ok).toBe(false);

    const ok = host.start({
      kind: 'close-base',
      baseRevision: asDocumentRevision(1),
      params: { height: 2 }
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect((await ok.value.runKernel()).ok).toBe(true);
  });

  it('retries kernel on configured error codes', async () => {
    const kernel = new MockKernelPort();
    let calls = 0;
    const original = kernel.execute.bind(kernel);
    kernel.execute = async (request, signal, report) => {
      calls += 1;
      if (calls === 1) {
        return opFailure('unavailable', 'transient');
      }
      return original(request, signal, report);
    };

    const host = new OperationHost({
      kernel,
      retry: { maxAttempts: 2, retryOn: new Set(['unavailable']) }
    });
    const started = host.start({
      kind: 'trim',
      baseRevision: asDocumentRevision(1)
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect((await started.value.runKernel()).ok).toBe(true);
    expect(calls).toBe(2);
    expect(host.operationMetrics.snapshot().retries).toBe(1);
  });

  it('records metrics for commit and failure paths', async () => {
    const kernel = new MockKernelPort();
    const host = new OperationHost({ kernel });
    const ok = host.start({ kind: 'movement', baseRevision: asDocumentRevision(1) });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect((await ok.value.runKernel()).ok).toBe(true);
    expect(ok.value.commit().ok).toBe(true);
    host.clearActiveIfTerminal();

    kernel.failNext = opFailure('kernel', 'boom');
    const bad = host.start({ kind: 'ipr', baseRevision: asDocumentRevision(2) });
    expect(bad.ok).toBe(true);
    if (!bad.ok) return;
    expect((await bad.value.runKernel()).ok).toBe(false);

    const metrics = host.operationMetrics.snapshot();
    expect(metrics.started).toBe(2);
    expect(metrics.commits).toBe(1);
    expect(metrics.failed).toBe(1);
    expect(metrics.commitRate).toBeCloseTo(0.5);
    expect(host.operationDiagnostics.list().length).toBeGreaterThan(0);
  });

  it('rejects result validation without fingerprint', async () => {
    const kernel = new MockKernelPort();
    kernel.execute = async () =>
      opSuccess({
        fingerprint: '   ',
        outputRevisionHint: 1,
        payload: {}
      });
    const host = new OperationHost({ kernel });
    const started = host.start({ kind: 'collision', baseRevision: asDocumentRevision(1) });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const ran = await started.value.runKernel();
    expect(ran.ok).toBe(false);
    expect(started.value.commit().ok).toBe(false);
  });
});
