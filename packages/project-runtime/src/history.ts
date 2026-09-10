import { freeze } from '@cad-studio/platform-runtime';
import type { ImmutableProjectSnapshot } from './state.js';

/**
 * Immutable history entry for Platform Runtime-style coordination.
 * Project Runtime owns project state transitions only — not command execution.
 */
export interface ProjectHistoryEntry {
  readonly kind: 'project';
  readonly id: string;
  readonly fromPhase: string;
  readonly toPhase: string;
  readonly snapshot: ImmutableProjectSnapshot;
  readonly createdAt: number;
  readonly label: string;
}

/**
 * Local coordinator that records project state transitions as immutable entries.
 */
export class ProjectHistoryCoordinator {
  private readonly entries: ProjectHistoryEntry[] = [];
  private serial = 0;

  public constructor(private readonly limit = 64) {}

  public record(input: {
    readonly fromPhase: string;
    readonly toPhase: string;
    readonly snapshot: ImmutableProjectSnapshot;
    readonly label?: string;
  }): ProjectHistoryEntry {
    const entry = freeze({
      kind: 'project' as const,
      id: `proj-hist-${String(++this.serial)}`,
      fromPhase: input.fromPhase,
      toPhase: input.toPhase,
      snapshot: input.snapshot,
      createdAt: input.snapshot.createdAt,
      label: input.label ?? `${input.fromPhase}→${input.toPhase}`
    });
    this.entries.push(entry);
    while (this.entries.length > this.limit) {
      this.entries.shift();
    }
    return entry;
  }

  public list(): readonly ProjectHistoryEntry[] {
    return Object.freeze([...this.entries]);
  }

  public clear(): void {
    this.entries.length = 0;
  }

  public size(): number {
    return this.entries.length;
  }
}
