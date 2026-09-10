import type { CompiledRenderGraph } from '../render-graph/graph.js';
import type { PassContext, RenderPass } from '../passes/registry.js';
import {
  type PassId,
  type RenderResult,
  renderFailure,
  renderSuccess
} from '../types.js';

export interface PipelinePassBinding {
  readonly pass: RenderPass;
  readonly order: number;
}

export class RenderPipeline {
  private readonly bindings = new Map<PassId, PipelinePassBinding>();
  private graph: CompiledRenderGraph | undefined;

  public setGraph(graph: CompiledRenderGraph): void {
    this.graph = graph;
  }

  public getGraph(): CompiledRenderGraph | undefined {
    return this.graph;
  }

  public addPass(pass: RenderPass, order?: number): RenderResult<void> {
    if (this.bindings.has(pass.id)) {
      return renderFailure('conflict', `Pass ${String(pass.id)} already in pipeline.`);
    }
    const resolvedOrder = order ?? this.bindings.size;
    this.bindings.set(pass.id, { pass, order: resolvedOrder });
    return renderSuccess(undefined);
  }

  public removePass(id: PassId): RenderResult<void> {
    if (!this.bindings.delete(id)) {
      return renderFailure('not-found', `Pass ${String(id)} not in pipeline.`);
    }
    return renderSuccess(undefined);
  }

  public orderedPasses(): readonly RenderPass[] {
    return Object.freeze(
      [...this.bindings.values()]
        .sort((a, b) => a.order - b.order || String(a.pass.id).localeCompare(String(b.pass.id)))
        .map((binding) => binding.pass)
    );
  }

  public execute(context: Omit<PassContext, 'passId' | 'kind'>): RenderResult<readonly PassId[]> {
    if (this.graph !== undefined) {
      return this.graph.execute();
    }
    const executed: PassId[] = [];
    for (const pass of this.orderedPasses()) {
      const result = pass.execute({
        passId: pass.id,
        kind: pass.kind,
        frameIndex: context.frameIndex
      });
      if (!result.ok) return result;
      executed.push(pass.id);
    }
    return renderSuccess(Object.freeze(executed));
  }

  public clear(): void {
    this.bindings.clear();
    this.graph = undefined;
  }
}
