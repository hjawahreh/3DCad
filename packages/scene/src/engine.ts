import type { DocumentRevisionView } from './document.js';
import { ProjectionLifecycle } from './lifecycle.js';
import { ProjectionPipeline } from './pipeline.js';
import { ProjectionRegistry } from './registry.js';
import { SceneRevision } from './revision.js';
import type { SceneSnapshot } from './snapshot.js';
import { ReservedSpatialIndex, type SpatialIndex } from './spatial-index.js';
import {
  asSceneRevisionId,
  sceneFailure,
  sceneSuccess,
  type SceneResult
} from './types.js';
import { SceneWorld } from './world.js';

export interface SceneProjectionEngineOptions {
  readonly registry?: ProjectionRegistry;
  readonly spatialIndex?: SpatialIndex;
  readonly now?: () => number;
}

/**
 * Production Scene Projection Engine.
 * Domain → immutable SceneSnapshot. No React, Three.js, GPU, or kernel.
 */
export class SceneProjectionEngine {
  private readonly registry: ProjectionRegistry;
  private readonly pipeline: ProjectionPipeline;
  private readonly lifecycle = new ProjectionLifecycle();
  private readonly world: SceneWorld;
  private readonly spatialIndex: SpatialIndex;
  private readonly now: () => number;
  private disposed = false;

  public constructor(options: SceneProjectionEngineOptions = {}) {
    this.registry = options.registry ?? new ProjectionRegistry();
    this.pipeline = new ProjectionPipeline();
    this.world = new SceneWorld();
    this.spatialIndex = options.spatialIndex ?? new ReservedSpatialIndex();
    this.now = options.now ?? (() => performance.now());
  }

  public getWorld(): SceneWorld {
    return this.world;
  }

  public getRegistry(): ProjectionRegistry {
    return this.registry;
  }

  public getSpatialIndex(): SpatialIndex {
    return this.spatialIndex;
  }

  public getLifecyclePhase(): string {
    return this.lifecycle.getPhase();
  }

  /**
   * Project a document revision into a SceneRevision / Snapshot.
   * Incremental when previous world document exists and next.replaced is not set.
   */
  public project(document: DocumentRevisionView, signal?: AbortSignal): SceneResult<SceneRevision> {
    if (this.disposed) {
      return sceneFailure('unavailable', 'SceneProjectionEngine disposed');
    }
    if (!this.lifecycle.beginProjection()) {
      return sceneFailure('conflict', 'Projection already in progress or disposed');
    }

    const deps = this.registry.dependencies();
    const previous = this.world.getDocument();
    const result = this.pipeline.run(
      {
        previousDocument: previous,
        nextDocument: document,
        ...(signal === undefined ? {} : { signal }),
        now: this.now
      },
      deps
    );

    if (!result.ok) {
      this.lifecycle.failProjection();
      return result;
    }

    const revision = new SceneRevision(
      asSceneRevisionId(document.revision),
      document.revision,
      result.value
    );
    const stored = this.world.setProjected(document, revision);
    if (!stored.ok) {
      this.lifecycle.failProjection();
      return stored;
    }
    this.lifecycle.completeProjection();
    return sceneSuccess(revision);
  }

  public currentSnapshot(): SceneSnapshot | undefined {
    return this.world.getSnapshot();
  }

  public metrics() {
    return this.registry.dependencies().metrics.snapshot();
  }

  public diagnostics() {
    return this.registry.dependencies().diagnostics.list();
  }

  /** Force full rebuild on next project by clearing world document identity. */
  public invalidate(): void {
    this.registry.dependencies().cache.clear();
    this.world.clear();
  }

  public dispose(): void {
    this.disposed = true;
    this.lifecycle.dispose();
    this.world.dispose();
    this.registry.dependencies().cache.clear();
    this.registry.dependencies().entityMapper.clear();
    this.registry.dependencies().pickingIds.clear();
    this.spatialIndex.clear();
  }
}
