import { BoundsBuilder } from './bounds-builder.js';
import { EntityMapper } from './entity-mapper.js';
import { PickingIdRegistry } from './picking-id-registry.js';
import { ProjectionCache } from './cache.js';
import { ProjectionDiagnostics } from './diagnostics.js';
import { ProjectionMetrics } from './metrics.js';
import { RevisionDiffEngine } from './revision-diff.js';
import { SelectionProxyBuilder } from './selection-proxy-builder.js';
import { VisibilityBuilder } from './visibility-builder.js';
import type { ProjectionDependencies, ProjectionStep } from './context.js';

export class ProjectionRegistry {
  private readonly steps = new Map<string, ProjectionStep>();
  private readonly deps: ProjectionDependencies;

  public constructor(deps?: Partial<ProjectionDependencies>) {
    this.deps = {
      diffEngine: deps?.diffEngine ?? new RevisionDiffEngine(),
      entityMapper: deps?.entityMapper ?? new EntityMapper(),
      boundsBuilder: deps?.boundsBuilder ?? new BoundsBuilder(),
      visibilityBuilder: deps?.visibilityBuilder ?? new VisibilityBuilder(),
      pickingIds: deps?.pickingIds ?? new PickingIdRegistry(),
      selectionProxies: deps?.selectionProxies ?? new SelectionProxyBuilder(),
      cache: deps?.cache ?? new ProjectionCache(),
      diagnostics: deps?.diagnostics ?? new ProjectionDiagnostics(),
      metrics: deps?.metrics ?? new ProjectionMetrics()
    };
  }

  public dependencies(): ProjectionDependencies {
    return this.deps;
  }

  public registerStep(step: ProjectionStep): void {
    this.steps.set(step.name, step);
  }

  public getStep(name: string): ProjectionStep | undefined {
    return this.steps.get(name);
  }

  public listSteps(): readonly ProjectionStep[] {
    return [...this.steps.values()];
  }
}
