import type { BoundsBuilder } from './bounds-builder.js';
import type { EntityMapper } from './entity-mapper.js';
import type { PickingIdRegistry } from './picking-id-registry.js';
import type { ProjectionCache } from './cache.js';
import type { ProjectionDiagnostics } from './diagnostics.js';
import type { ProjectionMetrics } from './metrics.js';
import type { RevisionDiffEngine } from './revision-diff.js';
import type { SelectionProxyBuilder } from './selection-proxy-builder.js';
import type { VisibilityBuilder } from './visibility-builder.js';
import type { DocumentRevisionView } from './document.js';
import type { SceneSnapshot } from './snapshot.js';

export interface ProjectionContext {
  readonly previousDocument: DocumentRevisionView | undefined;
  readonly nextDocument: DocumentRevisionView;
  readonly signal?: AbortSignal;
  readonly now: () => number;
}

export interface ProjectionDependencies {
  readonly diffEngine: RevisionDiffEngine;
  readonly entityMapper: EntityMapper;
  readonly boundsBuilder: BoundsBuilder;
  readonly visibilityBuilder: VisibilityBuilder;
  readonly pickingIds: PickingIdRegistry;
  readonly selectionProxies: SelectionProxyBuilder;
  readonly cache: ProjectionCache;
  readonly diagnostics: ProjectionDiagnostics;
  readonly metrics: ProjectionMetrics;
}

export type ProjectionStepName =
  | 'context'
  | 'diff'
  | 'map'
  | 'bounds'
  | 'visibility'
  | 'selection'
  | 'picking'
  | 'assemble';

export interface ProjectionStep {
  readonly name: ProjectionStepName;
  readonly run: (
    ctx: ProjectionContext,
    deps: ProjectionDependencies,
    state: ProjectionWorkingState
  ) => void;
}

export interface ProjectionWorkingState {
  renderables: import('./snapshot.js').RenderableDescriptor[];
  worldBounds: import('./types.js').Aabb;
  warnings: string[];
  errors: string[];
  entitiesUpdated: number;
  entitiesRemoved: number;
  fullRebuild: boolean;
  snapshot: SceneSnapshot | undefined;
}
