import { describe, expect, it } from 'vitest';
import {
  ImportLifecycle,
  ImportRuntime,
  RESERVED_PARSER_CONTRACTS,
  type ImportEvent,
  type ImmutableImportSnapshot
} from '../src/index.js';

const bootstrap = () => {
  const runtime = new ImportRuntime({
    clock: { now: () => 1000 },
    configuration: { allowDuplicateRequests: true, maxConcurrentSessions: 4 }
  });
  runtime.getFactory().registerPassthrough(runtime.getPlugins(), {
    id: 'mock-mesh',
    name: 'Mock Mesh Importer',
    extensions: ['stl', 'obj'],
    mimeTypes: ['model/stl'],
    priority: 10
  });
  return runtime;
};

describe('ImportLifecycle', () => {
  it('allows created → validating → … → completed', () => {
    const life = new ImportLifecycle();
    expect(life.transition('validating')).toBe(true);
    expect(life.transition('selecting')).toBe(true);
    expect(life.transition('initializing')).toBe(true);
    expect(life.transition('importing')).toBe(true);
    expect(life.transition('finalizing')).toBe(true);
    expect(life.transition('completed')).toBe(true);
    expect(life.transition('disposed')).toBe(true);
  });
});

describe('validation', () => {
  it('rejects missing extension and missing source', async () => {
    const runtime = bootstrap();
    const bad = runtime.createRequest({
      source: '',
      fileName: 'x',
      extension: ''
    });
    const result = await runtime.import(bad);
    expect(result.ok).toBe(false);
    runtime.dispose();
  });

  it('honors exists=false metadata contract', async () => {
    const runtime = bootstrap();
    const request = runtime.createRequest({
      source: 'file://missing.stl',
      fileName: 'missing.stl',
      metadata: { exists: 'false' }
    });
    const result = await runtime.import(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not-found');
    }
    runtime.dispose();
  });
});

describe('plugin registry', () => {
  it('resolves by extension priority and respects disable', async () => {
    const runtime = bootstrap();
    runtime.getFactory().registerPassthrough(runtime.getPlugins(), {
      id: 'high-priority',
      name: 'High',
      extensions: ['stl'],
      priority: 1000
    });
    const request = runtime.createRequest({
      source: 'file://a.stl',
      fileName: 'a.stl'
    });
    const result = await runtime.import(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.importerId).toBe('high-priority');

    runtime.getPlugins().disable(result.value.importerId!);
    const again = await runtime.import(
      runtime.createRequest({ source: 'file://b.stl', fileName: 'b.stl' })
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.importerId).toBe('mock-mesh');
    runtime.dispose();
  });
});

describe('lifecycle and progress', () => {
  it('runs import and emits progress + complete', async () => {
    const runtime = bootstrap();
    const session = runtime.createSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const seen: ImportEvent[] = [];
    session.value.getEvents().subscribe((e) => seen.push(e));
    const request = runtime.createRequest({
      source: 'file://part.stl',
      fileName: 'part.stl'
    });
    const result = await session.value.run(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.phase).toBe('completed');
    expect(result.value.outcome?.ok).toBe(true);
    expect(seen.some((e) => e.type === 'progress')).toBe(true);
    expect(seen.some((e) => e.type === 'complete')).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    runtime.dispose();
  });
});

describe('cancellation', () => {
  it('cancels an in-flight import via AbortSignal', async () => {
    const runtime = bootstrap();
    const { asImporterPluginId, importFailure, importSuccess } = await import('../src/index.js');
    let released: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      released = resolve;
    });
    runtime.getPlugins().register({
      info: {
        id: asImporterPluginId('slow'),
        name: 'Slow',
        version: '0.0.1',
        priority: 5000,
        enabled: true,
        capabilities: {
          extensions: ['stl'],
          mimeTypes: [],
          formats: ['stl'],
          maxBytesHint: undefined,
          supportsCancellation: true,
          supportsProgress: true
        }
      },
      canHandle: () => true,
      import: async (ctx) => {
        await gate;
        if (ctx.signal?.aborted === true) {
          return importFailure('cancelled', 'aborted');
        }
        return importSuccess(
          (
            await import('../src/index.js')
          ).freezeImportedDocument({
            documentId: 'x',
            sourceRequestId: ctx.request.id,
            importerId: asImporterPluginId('slow'),
            entities: [],
            createdAt: ctx.now()
          })
        );
      }
    });

    const controller = new AbortController();
    const request = runtime.createRequest({
      source: 'file://slow.stl',
      fileName: 'slow.stl'
    });
    const pending = runtime.import(request, controller.signal);
    controller.abort();
    released?.();
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cancelled');
    }
    runtime.dispose();
  });
});

describe('diagnostics and metrics', () => {
  it('records missing importer failures', async () => {
    const runtime = new ImportRuntime({ clock: { now: () => 1 } });
    const session = runtime.createSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const result = await session.value.run(
      runtime.createRequest({ source: 'file://x.unknown', fileName: 'x.unknown' })
    );
    expect(result.ok).toBe(false);
    expect(session.value.getDiagnostics().snapshot().missingImporter).toBeGreaterThan(0);
    expect(session.value.getMetrics().snapshot().failureCount).toBe(1);
    runtime.dispose();
  });
});

describe('snapshots', () => {
  it('publishes immutable snapshots with document descriptors', async () => {
    const runtime = bootstrap();
    const result = await runtime.import(
      runtime.createRequest({ source: 'file://m.obj', fileName: 'm.obj' })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const snap: ImmutableImportSnapshot = result.value;
    expect(() => {
      (snap as { durationMs: number }).durationMs = -1;
    }).toThrow();
    if (snap.outcome?.ok) {
      expect(snap.outcome.document.entities.length).toBe(1);
    }
    expect(RESERVED_PARSER_CONTRACTS.length).toBe(8);
    runtime.dispose();
  });
});

describe('concurrent sessions', () => {
  it('supports parallel imports', async () => {
    const runtime = bootstrap();
    const a = runtime.createSession();
    const b = runtime.createSession();
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const [ra, rb] = await Promise.all([
      a.value.run(runtime.createRequest({ source: 'file://1.stl', fileName: '1.stl' })),
      b.value.run(runtime.createRequest({ source: 'file://2.obj', fileName: '2.obj' }))
    ]);
    expect(ra.ok && rb.ok).toBe(true);
    runtime.dispose();
  });
});
