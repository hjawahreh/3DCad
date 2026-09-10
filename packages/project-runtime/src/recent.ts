import type { ProjectMetadata } from './metadata.js';
import type { ProjectId } from './types.js';
import { projectSuccess, type ProjectResult } from './types.js';

export interface RecentProjectEntry {
  readonly metadata: ProjectMetadata;
  readonly lastOpenedAt: number;
}

/**
 * Recent projects list with ordering and duplicate suppression.
 * Ownership: runtime-owned; no hidden globals.
 */
export class RecentProjectsRegistry {
  private readonly entries: RecentProjectEntry[] = [];

  public constructor(private readonly maxEntries: number) {}

  public register(metadata: ProjectMetadata, openedAt: number): ProjectResult<void> {
    const id = metadata.id as string;
    const filtered = this.entries.filter((e) => (e.metadata.id as string) !== id);
    this.entries.length = 0;
    this.entries.push(
      Object.freeze({
        metadata,
        lastOpenedAt: openedAt
      })
    );
    this.entries.push(...filtered);
    while (this.entries.length > this.maxEntries) {
      this.entries.pop();
    }
    return projectSuccess(undefined);
  }

  public remove(projectId: ProjectId): boolean {
    const before = this.entries.length;
    const next = this.entries.filter((e) => e.metadata.id !== projectId);
    this.entries.length = 0;
    this.entries.push(...next);
    return this.entries.length < before;
  }

  public updateMetadata(metadata: ProjectMetadata): boolean {
    const index = this.entries.findIndex((e) => e.metadata.id === metadata.id);
    if (index < 0) {
      return false;
    }
    const existing = this.entries[index]!;
    this.entries[index] = Object.freeze({
      metadata,
      lastOpenedAt: existing.lastOpenedAt
    });
    return true;
  }

  public list(): readonly RecentProjectEntry[] {
    return Object.freeze([...this.entries]);
  }

  public clear(): void {
    this.entries.length = 0;
  }

  public size(): number {
    return this.entries.length;
  }
}
