import { entityFingerprint } from './cache.js';
import type { ProjectionContext, ProjectionDependencies, ProjectionWorkingState } from './context.js';
import type { DocumentEntityView } from './document.js';
import { freezeSnapshot, type RenderableDescriptor } from './snapshot.js';
import {
  asSceneRevisionId,
  emptyAabb,
  sceneFailure,
  sceneSuccess,
  type DomainEntityId,
  type SceneResult
} from './types.js';

const estimateBytes = (count: number): number => count * 512;

const projectEntity = (
  entity: DocumentEntityView,
  deps: ProjectionDependencies
): RenderableDescriptor => {
  const fingerprint = entityFingerprint({
    kind: entity.kind,
    layer: entity.layer,
    visible: entity.visible,
    ...(entity.geometryRef === undefined ? {} : { geometryRef: entity.geometryRef }),
    ...(entity.materialRef === undefined ? {} : { materialRef: entity.materialRef }),
    transform: entity.transform.elements,
    ...(entity.display === undefined ? {} : { display: entity.display }),
    ...(entity.metadata === undefined ? {} : { metadata: entity.metadata })
  });

  const cached = deps.cache.get(entity.id);
  if (cached !== undefined && cached.fingerprint === fingerprint) {
    return cached.renderable;
  }

  const sceneEntityId = deps.entityMapper.map(entity.id);
  const pickingId = deps.pickingIds.assign(entity.id);
  const bounds = deps.boundsBuilder.build(entity);
  const visibility = deps.visibilityBuilder.build(entity);
  const selectionProxy = deps.selectionProxies.build({
    entity,
    sceneEntityId,
    pickingId,
    bounds
  });
  const renderable: RenderableDescriptor = Object.freeze({
    sceneEntityId,
    domainEntityId: entity.id,
    kind: entity.kind,
    layer: entity.layer,
    geometryRef: entity.geometryRef,
    transform: Object.freeze({ sceneEntityId, matrix: entity.transform }),
    material: Object.freeze({
      sceneEntityId,
      materialRef: entity.materialRef
    }),
    bounds,
    visibility,
    pickingId,
    selectionProxy
  });

  deps.cache.set({
    domainEntityId: entity.id,
    sceneEntityId,
    pickingId,
    bounds,
    visibility,
    selectionProxy,
    renderable,
    fingerprint
  });
  return renderable;
};

export class ProjectionPipeline {
  public run(
    ctx: ProjectionContext,
    deps: ProjectionDependencies
  ): SceneResult<import('./snapshot.js').SceneSnapshot> {
    if (ctx.signal !== undefined && ctx.signal.aborted) {
      return sceneFailure('cancelled', 'Projection cancelled');
    }

    const started = ctx.now();
    const diffResult = deps.diffEngine.diff(ctx.previousDocument, ctx.nextDocument);
    if (!diffResult.ok) {
      deps.diagnostics.error(diffResult.error.code, diffResult.error.message);
      return diffResult;
    }
    const diff = diffResult.value;
    const revisionStarted = ctx.now();

    const state: ProjectionWorkingState = {
      renderables: [],
      worldBounds: emptyAabb(),
      warnings: [],
      errors: [],
      entitiesUpdated: diff.updated.length,
      entitiesRemoved: diff.removed.length,
      fullRebuild: diff.fullRebuild,
      snapshot: undefined
    };

    for (const id of diff.removed) {
      deps.cache.invalidate(id);
      deps.entityMapper.forget(id);
      deps.pickingIds.release(id);
    }

    if (diff.fullRebuild) {
      deps.cache.clear();
      // Preserve entity mapper / picking stability across full rebuild unless replaced empty
      const keepIds = new Set(ctx.nextDocument.entities.keys());
      // remapping handled via map() below
      void keepIds;
    } else {
      deps.cache.invalidateMany(diff.updated);
    }

    const orderedIds = [...ctx.nextDocument.entities.keys()].sort((a, b) =>
      a.localeCompare(b)
    );

    for (const id of orderedIds) {
      if (ctx.signal !== undefined && ctx.signal.aborted) {
        return sceneFailure('cancelled', 'Projection cancelled during entity mapping');
      }
      const entity = ctx.nextDocument.entities.get(id);
      if (entity === undefined) {
        state.errors.push(`Missing entity ${id}`);
        deps.diagnostics.error('invalid-entity', `Missing entity ${id}`);
        continue;
      }
      if (entity.id !== id) {
        state.warnings.push(`Entity key/id mismatch for ${id}`);
        deps.diagnostics.warn('invalid-entity', `Entity key/id mismatch for ${id}`);
      }
      state.renderables.push(projectEntity(entity, deps));
    }

    state.worldBounds = deps.boundsBuilder.union(state.renderables.map((r) => r.bounds));
    deps.cache.setRevision(ctx.nextDocument.revision);

    const ended = ctx.now();
    const projectionMs = ended - started;
    const revisionMs = ended - revisionStarted;
    const cacheStats = deps.cache.stats();
    deps.diagnostics.setTiming(projectionMs, revisionMs);
    deps.diagnostics.setCache(cacheStats.hits, cacheStats.misses);

    const estimatedBytes = estimateBytes(state.renderables.length);
    deps.metrics.recordProjection({
      durationMs: projectionMs,
      projected: state.renderables.length,
      updated: state.entitiesUpdated,
      removed: state.entitiesRemoved,
      cacheEfficiency: deps.cache.efficiency(),
      estimatedBytes,
      fullRebuild: state.fullRebuild
    });

    const metricsSnap = deps.metrics.snapshot();
    const snapshot = freezeSnapshot({
      sceneRevision: asSceneRevisionId(ctx.nextDocument.revision),
      documentRevision: ctx.nextDocument.revision,
      renderables: state.renderables,
      worldBounds: state.worldBounds,
      diagnostics: {
        warnings: state.warnings,
        errors: state.errors,
        projectionMs,
        cacheHits: cacheStats.hits,
        cacheMisses: cacheStats.misses
      },
      metrics: {
        entitiesProjected: state.renderables.length,
        entitiesUpdated: state.entitiesUpdated,
        entitiesRemoved: state.entitiesRemoved,
        cacheEfficiency: deps.cache.efficiency(),
        estimatedBytes,
        revisionCount: metricsSnap.revisionCount
      },
      createdAt: ended
    });

    return sceneSuccess(snapshot);
  }

  /** Deterministic helper for tests: project a single entity list order. */
  public projectIdsInOrder(ids: readonly DomainEntityId[]): readonly DomainEntityId[] {
    return [...ids].sort((a, b) => a.localeCompare(b));
  }
}
