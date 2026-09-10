import { describe, expect, it } from 'vitest';
import {
  SelectionLifecycle,
  SelectionRuntime,
  type SelectionEvent,
  type ImmutableSelectionSnapshot
} from '../src/index.js';

const bootstrap = (config?: Parameters<SelectionRuntime['bootstrapSession']>[0]) => {
  const runtime = new SelectionRuntime({ clock: { now: () => 100 } });
  const result = runtime.bootstrapSession(config);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('bootstrap failed');
  }
  return { runtime, session: result.value };
};

describe('SelectionLifecycle', () => {
  it('follows create → ready → modify → commit path', () => {
    const life = new SelectionLifecycle();
    expect(life.transition('beginning')).toBe(true);
    expect(life.transition('ready')).toBe(true);
    expect(life.transition('modifying')).toBe(true);
    expect(life.transition('committing')).toBe(true);
    expect(life.transition('committed')).toBe(true);
    expect(life.transition('clearing')).toBe(true);
    expect(life.transition('ready')).toBe(true);
    expect(life.transition('disposed')).toBe(true);
  });
});

describe('session lifecycle', () => {
  it('bootstraps and disposes', () => {
    const { runtime, session } = bootstrap();
    expect(session.getLifecyclePhase()).toBe('ready');
    expect(session.getSnapshot().empty).toBe(true);
    expect(session.dispose().ok).toBe(true);
    expect(session.getLifecyclePhase()).toBe('disposed');
    runtime.dispose();
  });
});

describe('selection modes', () => {
  it('supports replace, add, subtract, toggle with deterministic order', () => {
    const { runtime, session } = bootstrap();
    expect(session.select('replace', ['a', 'b', 'c']).ok).toBe(true);
    expect([...session.getSnapshot().ids]).toEqual(['a', 'b', 'c']);

    expect(session.select('add', ['d', 'b']).ok).toBe(true);
    expect([...session.getSnapshot().ids]).toEqual(['a', 'b', 'c', 'd']);

    expect(session.select('subtract', ['b']).ok).toBe(true);
    expect([...session.getSnapshot().ids]).toEqual(['a', 'c', 'd']);

    expect(session.select('toggle', ['c', 'e']).ok).toBe(true);
    expect([...session.getSnapshot().ids]).toEqual(['a', 'd', 'e']);

    expect(Object.isFrozen(session.getSnapshot())).toBe(true);
    runtime.dispose();
  });

  it('rejects reserved range mode', () => {
    const { runtime, session } = bootstrap();
    const result = session.select('range-reserved', ['a', 'b']);
    expect(result.ok).toBe(false);
    runtime.dispose();
  });
});

describe('policies', () => {
  it('enforces single-select and max size', () => {
    const { runtime, session } = bootstrap({
      configuration: { policyMode: 'single', maxSelectionSize: 2 }
    });
    expect(session.select('replace', ['a', 'b', 'c']).ok).toBe(true);
    expect(session.getSnapshot().count).toBe(1);
    expect(session.getDiagnostics().snapshot().policyViolations).toBeGreaterThan(0);

    const multi = bootstrap({
      configuration: { policyMode: 'multi', maxSelectionSize: 2 }
    });
    expect(multi.session.select('replace', ['1', '2', '3']).ok).toBe(true);
    expect(multi.session.getSnapshot().count).toBe(2);
    multi.runtime.dispose();
    runtime.dispose();
  });

  it('rejects empty ids and suppresses duplicates', () => {
    const { runtime, session } = bootstrap();
    expect(session.select('replace', ['a', '', 'a', 'b']).ok).toBe(true);
    expect([...session.getSnapshot().ids]).toEqual(['a', 'b']);
    const diag = session.getDiagnostics().snapshot();
    expect(diag.invalidIds).toBeGreaterThan(0);
    expect(diag.duplicateIds).toBeGreaterThan(0);
    runtime.dispose();
  });
});

describe('clipboard', () => {
  it('copies references and duplicates without geometry', () => {
    const { runtime, session } = bootstrap();
    session.select('replace', ['x', 'y']);
    expect(session.copyToClipboard().ok).toBe(true);
    const dup = session.duplicateFromClipboard();
    expect(dup.ok).toBe(true);
    if (!dup.ok) return;
    expect([...dup.value.ids]).toEqual(['x', 'y']);
    expect(session.clearClipboard().ok).toBe(true);
    expect(session.getClipboard().isEmpty()).toBe(true);
    expect(session.getMetrics().snapshot().clipboardOperations).toBeGreaterThan(0);
    runtime.dispose();
  });
});

describe('history', () => {
  it('supports undo and redo hooks via immutable entries', () => {
    const { runtime, session } = bootstrap();
    session.select('replace', ['a']);
    session.select('replace', ['b']);
    expect([...session.getSnapshot().ids]).toEqual(['b']);
    expect(session.undo().ok).toBe(true);
    expect([...session.getSnapshot().ids]).toEqual(['a']);
    expect(session.redo().ok).toBe(true);
    expect([...session.getSnapshot().ids]).toEqual(['b']);
    const entry = session.lastHistoryEntry();
    expect(entry?.kind).toBe('selection');
    expect(entry?.previous).toBeDefined();
    expect(entry?.next).toBeDefined();
    runtime.dispose();
  });
});

describe('snapshots', () => {
  it('publishes immutable snapshots', () => {
    const { runtime, session } = bootstrap();
    session.select('replace', ['p']);
    const snap: ImmutableSelectionSnapshot = session.getSnapshot();
    expect(() => {
      (snap as { count: number }).count = 99;
    }).toThrow();
    runtime.dispose();
  });
});

describe('diagnostics', () => {
  it('emits commit events', () => {
    const { runtime, session } = bootstrap();
    const seen: SelectionEvent[] = [];
    session.getEvents().subscribe((e) => seen.push(e));
    session.select('replace', ['z']);
    expect(seen.some((e) => e.type === 'commit')).toBe(true);
    runtime.dispose();
  });
});
