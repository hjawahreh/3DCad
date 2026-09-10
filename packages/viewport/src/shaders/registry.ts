import {
  asShaderId,
  type Disposable,
  type RenderResult,
  type ShaderId,
  renderFailure,
  renderSuccess
} from '../types.js';

export interface ShaderBinding {
  readonly name: string;
  readonly group: number;
  readonly binding: number;
  readonly kind: 'uniform' | 'storage' | 'texture' | 'sampler';
}

export interface ShaderReflection {
  readonly entryPoints: readonly string[];
  readonly bindings: readonly ShaderBinding[];
  readonly workgroupSize?: readonly [number, number, number];
}

export interface ShaderDescriptor {
  readonly id: ShaderId;
  readonly label: string;
  readonly source: string;
  readonly hash: string;
  readonly version: number;
  readonly keywords: readonly string[];
  readonly reflection: ShaderReflection;
  readonly dependencies: readonly ShaderId[];
}

export interface ShaderRegisterOptions {
  readonly id?: ShaderId;
  readonly label?: string;
  readonly keywords?: readonly string[];
  readonly dependencies?: readonly ShaderId[];
}

const fnv1a = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const reflectWgsl = (source: string): ShaderReflection => {
  const entryPoints: string[] = [];
  const entryRegex = /@(?:vertex|fragment|compute)\s+fn\s+([A-Za-z_][\w]*)/g;
  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(source)) !== null) {
    const name = match[1];
    if (name !== undefined) entryPoints.push(name);
  }

  const bindings: ShaderBinding[] = [];
  const bindingRegex =
    /@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<(\w+)>)?\s+([A-Za-z_][\w]*)/g;
  while ((match = bindingRegex.exec(source)) !== null) {
    const group = Number(match[1]);
    const binding = Number(match[2]);
    const storageClass = match[3];
    const name = match[4] ?? `binding_${group}_${binding}`;
    let kind: ShaderBinding['kind'] = 'uniform';
    if (storageClass === 'storage') kind = 'storage';
    else if (storageClass === 'uniform') kind = 'uniform';
    else if (/sampler/i.test(name)) kind = 'sampler';
    else if (/texture|tex/i.test(name)) kind = 'texture';
    bindings.push({ name, group, binding, kind });
  }

  const workgroupMatch = source.match(
    /@compute\s*@workgroup_size\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)/
  );
  const reflection: ShaderReflection = {
    entryPoints: Object.freeze(entryPoints),
    bindings: Object.freeze(bindings)
  };
  if (workgroupMatch !== null) {
    const x = Number(workgroupMatch[1]);
    const y = Number(workgroupMatch[2]);
    const z = Number(workgroupMatch[3]);
    return {
      ...reflection,
      workgroupSize: [x, y, z]
    };
  }
  return reflection;
};

export class ShaderRegistry implements Disposable {
  private readonly shaders = new Map<ShaderId, ShaderDescriptor>();
  private readonly byHash = new Map<string, ShaderId>();
  private readonly dependents = new Map<ShaderId, Set<ShaderId>>();
  private nextId = 1;

  public register(
    source: string,
    options: ShaderRegisterOptions = {}
  ): RenderResult<ShaderDescriptor> {
    const trimmed = source.trim();
    if (trimmed.length === 0) {
      return renderFailure('validation', 'Shader source must not be empty.');
    }

    const keywords = options.keywords ?? [];
    const hashKey = `${trimmed}\0${keywords.slice().sort().join(',')}`;
    const hash = fnv1a(hashKey);
    const cachedId = this.byHash.get(hash);
    if (cachedId !== undefined) {
      const cached = this.shaders.get(cachedId);
      if (cached !== undefined) {
        return renderSuccess(cached);
      }
    }

    const id = options.id ?? asShaderId(`shd-${this.nextId++}`);
    if (this.shaders.has(id)) {
      return renderFailure('conflict', `Shader ${String(id)} already exists.`);
    }

    const dependencies = options.dependencies ?? [];
    for (const dep of dependencies) {
      if (!this.shaders.has(dep)) {
        return renderFailure('not-found', `Dependency ${String(dep)} not found.`);
      }
    }

    const descriptor: ShaderDescriptor = {
      id,
      label: options.label ?? String(id),
      source: trimmed,
      hash,
      version: 1,
      keywords: Object.freeze([...keywords]),
      reflection: reflectWgsl(trimmed),
      dependencies: Object.freeze([...dependencies])
    };
    this.shaders.set(id, descriptor);
    this.byHash.set(hash, id);
    for (const dep of dependencies) {
      const set = this.dependents.get(dep) ?? new Set<ShaderId>();
      set.add(id);
      this.dependents.set(dep, set);
    }
    return renderSuccess(descriptor);
  }

  public resolve(id: ShaderId): RenderResult<ShaderDescriptor> {
    const shader = this.shaders.get(id);
    if (shader === undefined) {
      return renderFailure('not-found', `Shader ${String(id)} not found.`);
    }
    return renderSuccess(shader);
  }

  public reflect(id: ShaderId): RenderResult<ShaderReflection> {
    const resolved = this.resolve(id);
    if (!resolved.ok) return resolved;
    return renderSuccess(resolved.value.reflection);
  }

  public createVariant(
    id: ShaderId,
    keywords: readonly string[]
  ): RenderResult<ShaderDescriptor> {
    const base = this.resolve(id);
    if (!base.ok) return base;
    return this.register(base.value.source, {
      label: `${base.value.label}:${keywords.join('+')}`,
      keywords,
      dependencies: [id]
    });
  }

  public hotReload(id: ShaderId, source: string): RenderResult<ShaderDescriptor> {
    const existing = this.shaders.get(id);
    if (existing === undefined) {
      return renderFailure('not-found', `Shader ${String(id)} not found.`);
    }
    const trimmed = source.trim();
    if (trimmed.length === 0) {
      return renderFailure('validation', 'Shader source must not be empty.');
    }
    this.byHash.delete(existing.hash);
    const hash = fnv1a(`${trimmed}\0${existing.keywords.join(',')}`);
    const updated: ShaderDescriptor = {
      id,
      label: existing.label,
      source: trimmed,
      hash,
      version: existing.version + 1,
      keywords: existing.keywords,
      reflection: reflectWgsl(trimmed),
      dependencies: existing.dependencies
    };
    this.shaders.set(id, updated);
    this.byHash.set(hash, id);

    const dependents = this.dependents.get(id);
    if (dependents !== undefined) {
      for (const dependentId of dependents) {
        const dependent = this.shaders.get(dependentId);
        if (dependent !== undefined) {
          void this.hotReload(dependentId, dependent.source);
        }
      }
    }
    return renderSuccess(updated);
  }

  public dependencies(id: ShaderId): RenderResult<readonly ShaderId[]> {
    const shader = this.shaders.get(id);
    if (shader === undefined) {
      return renderFailure('not-found', `Shader ${String(id)} not found.`);
    }
    return renderSuccess(shader.dependencies);
  }

  public list(): readonly ShaderDescriptor[] {
    return Object.freeze([...this.shaders.values()]);
  }

  public clear(): void {
    this.shaders.clear();
    this.byHash.clear();
    this.dependents.clear();
  }

  public dispose(): void {
    this.clear();
  }
}
