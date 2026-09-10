import {
  asPassId,
  type PassId,
  type RenderResult,
  type ResourceLifetime,
  renderFailure,
  renderSuccess
} from '../types.js';

export type GraphResourceKind = 'texture' | 'buffer' | 'external';

export interface GraphResourceDesc {
  readonly name: string;
  readonly kind: GraphResourceKind;
  readonly lifetime?: ResourceLifetime;
  readonly width?: number;
  readonly height?: number;
}

export interface GraphPassExecuteContext {
  readonly passId: PassId;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
}

export interface GraphPassDesc {
  readonly id: string;
  readonly label?: string;
  readonly reads?: readonly string[];
  readonly writes?: readonly string[];
  readonly execute?: (context: GraphPassExecuteContext) => void;
}

export interface ResourceLifetimeInfo {
  readonly name: string;
  readonly kind: GraphResourceKind;
  readonly lifetime: ResourceLifetime;
  readonly firstUse: PassId | undefined;
  readonly lastUse: PassId | undefined;
  readonly producers: readonly PassId[];
  readonly consumers: readonly PassId[];
}

export interface CompiledPass {
  readonly id: PassId;
  readonly label: string;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly execute?: (context: GraphPassExecuteContext) => void;
}

export interface GraphDebugView {
  readonly passes: readonly string[];
  readonly schedule: readonly string[];
  readonly resources: readonly string[];
  readonly edges: readonly string[];
  readonly warnings: readonly string[];
}

export interface CompiledRenderGraph {
  readonly passes: readonly CompiledPass[];
  readonly schedule: readonly PassId[];
  readonly resources: readonly ResourceLifetimeInfo[];
  readonly warnings: readonly string[];
  debugView(): GraphDebugView;
  execute(): RenderResult<readonly PassId[]>;
}

interface BuilderPass {
  readonly id: PassId;
  readonly label: string;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly execute?: (context: GraphPassExecuteContext) => void;
}

const optimizeSchedule = (passIds: readonly PassId[]): PassId[] => {
  // Deterministic: stable lexicographic order among already-topologically-valid set
  // is applied after Kahn; here we re-sort ids for tie-breaking clarity.
  return [...passIds].sort((a, b) => String(a).localeCompare(String(b)));
};

export { optimizeSchedule };

export class RenderGraphBuilder {
  private readonly resources = new Map<string, GraphResourceDesc>();
  private readonly passes = new Map<string, BuilderPass>();

  public addResource(desc: GraphResourceDesc): RenderResult<void> {
    if (this.resources.has(desc.name)) {
      return renderFailure('conflict', `Resource ${desc.name} already declared.`);
    }
    this.resources.set(desc.name, {
      ...desc,
      lifetime: desc.lifetime ?? (desc.kind === 'external' ? 'external' : 'transient')
    });
    return renderSuccess(undefined);
  }

  public addPass(desc: GraphPassDesc): RenderResult<void> {
    if (this.passes.has(desc.id)) {
      return renderFailure('conflict', `Pass ${desc.id} already declared.`);
    }
    const pass: BuilderPass =
      desc.execute !== undefined
        ? {
            id: asPassId(desc.id),
            label: desc.label ?? desc.id,
            reads: Object.freeze([...(desc.reads ?? [])]),
            writes: Object.freeze([...(desc.writes ?? [])]),
            execute: desc.execute
          }
        : {
            id: asPassId(desc.id),
            label: desc.label ?? desc.id,
            reads: Object.freeze([...(desc.reads ?? [])]),
            writes: Object.freeze([...(desc.writes ?? [])])
          };
    this.passes.set(desc.id, pass);
    return renderSuccess(undefined);
  }

  public compile(): RenderResult<CompiledRenderGraph> {
    const warnings: string[] = [];
    const producers = new Map<string, PassId[]>();
    const consumers = new Map<string, PassId[]>();

    for (const pass of this.passes.values()) {
      if (pass.reads.length === 0 && pass.writes.length === 0) {
        warnings.push(`Pass ${String(pass.id)} has no resource reads or writes.`);
      }
      for (const name of pass.writes) {
        if (!this.resources.has(name)) {
          return renderFailure('validation', `Pass ${String(pass.id)} writes unknown resource ${name}.`);
        }
        const list = producers.get(name) ?? [];
        list.push(pass.id);
        producers.set(name, list);
      }
      for (const name of pass.reads) {
        if (!this.resources.has(name)) {
          return renderFailure('validation', `Pass ${String(pass.id)} reads unknown resource ${name}.`);
        }
        const list = consumers.get(name) ?? [];
        list.push(pass.id);
        consumers.set(name, list);
      }
    }

    for (const [name, desc] of this.resources) {
      const produced = producers.get(name) ?? [];
      if (produced.length === 0 && desc.kind !== 'external' && desc.lifetime !== 'external') {
        return renderFailure('validation', `Resource ${name} is never produced.`);
      }
    }

    const adjacency = new Map<string, Set<string>>();
    const indegree = new Map<string, number>();
    for (const pass of this.passes.values()) {
      adjacency.set(String(pass.id), new Set());
      indegree.set(String(pass.id), 0);
    }

    for (const pass of this.passes.values()) {
      for (const read of pass.reads) {
        const resource = this.resources.get(read)!;
        if (resource.kind === 'external' || resource.lifetime === 'external') continue;
        for (const producer of producers.get(read) ?? []) {
          if (producer === pass.id) continue;
          const edges = adjacency.get(String(producer));
          if (edges !== undefined && !edges.has(String(pass.id))) {
            edges.add(String(pass.id));
            indegree.set(String(pass.id), (indegree.get(String(pass.id)) ?? 0) + 1);
          }
        }
      }
    }

    const ready = [...indegree.entries()]
      .filter(([, degree]) => degree === 0)
      .map(([id]) => id)
      .sort((a, b) => a.localeCompare(b));
    const scheduled: string[] = [];
    while (ready.length > 0) {
      const next = ready.shift()!;
      scheduled.push(next);
      for (const downstream of adjacency.get(next) ?? []) {
        const nextDegree = (indegree.get(downstream) ?? 0) - 1;
        indegree.set(downstream, nextDegree);
        if (nextDegree === 0) {
          ready.push(downstream);
          ready.sort((a, b) => a.localeCompare(b));
        }
      }
    }

    if (scheduled.length !== this.passes.size) {
      return renderFailure('validation', 'Render graph contains a cycle.');
    }

    const schedule = optimizeSchedule(scheduled.map((id) => asPassId(id)));
    // Re-apply topological constraints: filter scheduled order but keep deterministic
    // secondary sort only among independent passes — reconstruct from Kahn result.
    const topoOrder = scheduled.map((id) => asPassId(id));

    const lifetimes: ResourceLifetimeInfo[] = [];
    for (const [name, desc] of this.resources) {
      const prod = producers.get(name) ?? [];
      const cons = consumers.get(name) ?? [];
      const users = [...prod, ...cons];
      let firstUse: PassId | undefined;
      let lastUse: PassId | undefined;
      for (const passId of topoOrder) {
        if (users.some((user) => user === passId)) {
          if (firstUse === undefined) firstUse = passId;
          lastUse = passId;
        }
      }
      lifetimes.push({
        name,
        kind: desc.kind,
        lifetime: desc.lifetime ?? 'transient',
        firstUse,
        lastUse,
        producers: Object.freeze([...prod]),
        consumers: Object.freeze([...cons])
      });
    }

    const compiledPasses: CompiledPass[] = topoOrder.map((id) => {
      const pass = this.passes.get(String(id))!;
      return pass.execute !== undefined
        ? {
            id: pass.id,
            label: pass.label,
            reads: pass.reads,
            writes: pass.writes,
            execute: pass.execute
          }
        : {
            id: pass.id,
            label: pass.label,
            reads: pass.reads,
            writes: pass.writes
          };
    });

    const warningsFrozen = Object.freeze([...warnings]);
    const resourcesFrozen = Object.freeze(lifetimes);
    const passesFrozen = Object.freeze(compiledPasses);
    const scheduleFrozen = Object.freeze([...topoOrder]);

    const graph: CompiledRenderGraph = {
      passes: passesFrozen,
      schedule: scheduleFrozen,
      resources: resourcesFrozen,
      warnings: warningsFrozen,
      debugView: (): GraphDebugView => {
        const edges: string[] = [];
        for (const [from, tos] of adjacency) {
          for (const to of tos) edges.push(`${from}->${to}`);
        }
        return {
          passes: Object.freeze(compiledPasses.map((pass) => String(pass.id))),
          schedule: Object.freeze(topoOrder.map((id) => String(id))),
          resources: Object.freeze(lifetimes.map((resource) => resource.name)),
          edges: Object.freeze(edges.sort((a, b) => a.localeCompare(b))),
          warnings: warningsFrozen
        };
      },
      execute: (): RenderResult<readonly PassId[]> => {
        const executed: PassId[] = [];
        for (const pass of compiledPasses) {
          if (pass.execute !== undefined) {
            pass.execute({
              passId: pass.id,
              reads: pass.reads,
              writes: pass.writes
            });
          }
          executed.push(pass.id);
        }
        return renderSuccess(Object.freeze(executed));
      }
    };

    void schedule;
    return renderSuccess(graph);
  }
}
