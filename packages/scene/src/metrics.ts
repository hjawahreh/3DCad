export interface ProjectionMetricsSnapshot {
  readonly projectionDurationMs: number;
  readonly entitiesProjected: number;
  readonly entitiesUpdated: number;
  readonly entitiesRemoved: number;
  readonly cacheEfficiency: number;
  readonly estimatedBytes: number;
  readonly revisionCount: number;
  readonly fullRebuilds: number;
  readonly incrementalUpdates: number;
}

export class ProjectionMetrics {
  private projectionDurationMs = 0;
  private entitiesProjected = 0;
  private entitiesUpdated = 0;
  private entitiesRemoved = 0;
  private cacheEfficiency = 1;
  private estimatedBytes = 0;
  private revisionCount = 0;
  private fullRebuilds = 0;
  private incrementalUpdates = 0;

  public recordProjection(input: {
    readonly durationMs: number;
    readonly projected: number;
    readonly updated: number;
    readonly removed: number;
    readonly cacheEfficiency: number;
    readonly estimatedBytes: number;
    readonly fullRebuild: boolean;
  }): void {
    this.projectionDurationMs = input.durationMs;
    this.entitiesProjected = input.projected;
    this.entitiesUpdated = input.updated;
    this.entitiesRemoved = input.removed;
    this.cacheEfficiency = input.cacheEfficiency;
    this.estimatedBytes = input.estimatedBytes;
    this.revisionCount += 1;
    if (input.fullRebuild) {
      this.fullRebuilds += 1;
    } else {
      this.incrementalUpdates += 1;
    }
  }

  public snapshot(): ProjectionMetricsSnapshot {
    return {
      projectionDurationMs: this.projectionDurationMs,
      entitiesProjected: this.entitiesProjected,
      entitiesUpdated: this.entitiesUpdated,
      entitiesRemoved: this.entitiesRemoved,
      cacheEfficiency: this.cacheEfficiency,
      estimatedBytes: this.estimatedBytes,
      revisionCount: this.revisionCount,
      fullRebuilds: this.fullRebuilds,
      incrementalUpdates: this.incrementalUpdates
    };
  }

  public reset(): void {
    this.projectionDurationMs = 0;
    this.entitiesProjected = 0;
    this.entitiesUpdated = 0;
    this.entitiesRemoved = 0;
    this.cacheEfficiency = 1;
    this.estimatedBytes = 0;
    this.revisionCount = 0;
    this.fullRebuilds = 0;
    this.incrementalUpdates = 0;
  }
}
