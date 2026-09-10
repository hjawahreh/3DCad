import type {
  BufferCreateInfo,
  GpuBackend,
  PipelineCreateInfo,
  RenderTargetCreateInfo,
  TextureCreateInfo,
  TextureFormat
} from '../backend/types.js';
import type { ResolvedRendererConfig } from '../config.js';
import {
  asResourceId,
  type Disposable,
  type GpuHandle,
  type RenderResult,
  type ResourceId,
  type ResourceKind,
  type ResourceLifetime,
  renderFailure,
  renderSuccess
} from '../types.js';

export interface ManagedResource {
  readonly id: ResourceId;
  readonly kind: ResourceKind;
  readonly handle: GpuHandle;
  readonly lifetime: ResourceLifetime;
  readonly byteSize: number;
  readonly key: string;
  readonly label?: string;
  refCount: number;
}

export interface ResourceBudgetSnapshot {
  readonly transientBytes: number;
  readonly persistentBytes: number;
  readonly maxTransientBytes: number;
  readonly maxPersistentBytes: number;
  readonly resourceCount: number;
}

export interface MeshBufferCreateInfo {
  readonly key: string;
  readonly vertexByteLength: number;
  readonly indexByteLength?: number;
  readonly lifetime?: ResourceLifetime;
  readonly label?: string;
}

export interface TextureResourceCreateInfo {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly format?: TextureFormat;
  readonly cubemap?: boolean;
  readonly lifetime?: ResourceLifetime;
  readonly label?: string;
  readonly mipLevels?: number;
}

export interface FramebufferCreateInfo {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly colorFormats?: readonly TextureFormat[];
  readonly depthFormat?: TextureFormat;
  readonly lifetime?: ResourceLifetime;
  readonly label?: string;
}

export interface PipelineResourceCreateInfo {
  readonly key: string;
  readonly shaderHandle: GpuHandle;
  readonly lifetime?: ResourceLifetime;
  readonly label?: string;
  readonly topology?: PipelineCreateInfo['topology'];
  readonly depthTest?: boolean;
  readonly blend?: boolean;
}

export class GpuResourceManager implements Disposable {
  private readonly resources = new Map<ResourceId, ManagedResource>();
  private readonly byKey = new Map<string, ResourceId>();
  private readonly pool = new Map<string, ResourceId[]>();
  private nextId = 1;
  private transientBytes = 0;
  private persistentBytes = 0;
  private disposed = false;

  public constructor(
    private readonly backend: GpuBackend,
    private readonly config: ResolvedRendererConfig
  ) {}

  public createMeshBuffer(info: MeshBufferCreateInfo): RenderResult<ManagedResource> {
    const lifetime = info.lifetime ?? 'persistent';
    const indexBytes = info.indexByteLength ?? 0;
    const byteSize = info.vertexByteLength + indexBytes;
    const budget = this.checkBudget(lifetime, byteSize);
    if (!budget.ok) return budget;

    const cached = this.acquireFromCache(info.key);
    if (cached !== undefined) {
      return renderSuccess(cached);
    }

    const vertex = this.backend.createBuffer({
      size: info.vertexByteLength,
      usage: ['vertex', 'copy-dst'],
      ...(info.label !== undefined ? { label: `${info.label}:vertex` } : {})
    } satisfies BufferCreateInfo);
    if (!vertex.ok) return vertex;

    let indexHandle: GpuHandle | undefined;
    if (indexBytes > 0) {
      const index = this.backend.createBuffer({
        size: indexBytes,
        usage: ['index', 'copy-dst'],
        ...(info.label !== undefined ? { label: `${info.label}:index` } : {})
      });
      if (!index.ok) {
        this.backend.destroyResource(vertex.value);
        return index;
      }
      indexHandle = index.value;
    }

    void indexHandle;
    return this.track({
      kind: 'mesh-buffer',
      handle: vertex.value,
      lifetime,
      byteSize,
      key: info.key,
      ...(info.label !== undefined ? { label: info.label } : {})
    });
  }

  public createTexture(info: TextureResourceCreateInfo): RenderResult<ManagedResource> {
    const lifetime = info.lifetime ?? 'persistent';
    const format = info.format ?? 'rgba8unorm';
    const depth = info.cubemap === true ? 6 : 1;
    const mipLevels = info.mipLevels ?? 1;
    const bytesPerPixel = format.includes('float') ? 8 : 4;
    const byteSize = info.width * info.height * depth * bytesPerPixel * mipLevels;
    const budget = this.checkBudget(lifetime, byteSize);
    if (!budget.ok) return budget;

    const cached = this.acquireFromCache(info.key);
    if (cached !== undefined) {
      return renderSuccess(cached);
    }

    const createInfo: TextureCreateInfo = {
      width: info.width,
      height: info.height,
      format,
      ...(info.cubemap === true ? { cubemap: true, depth: 6 } : {}),
      ...(info.mipLevels !== undefined ? { mipLevels: info.mipLevels } : {}),
      ...(info.label !== undefined ? { label: info.label } : {})
    };
    const created = this.backend.createTexture(createInfo);
    if (!created.ok) return created;

    return this.track({
      kind: info.cubemap === true ? 'cubemap' : 'texture',
      handle: created.value,
      lifetime,
      byteSize,
      key: info.key,
      ...(info.label !== undefined ? { label: info.label } : {})
    });
  }

  public createCubemap(info: TextureResourceCreateInfo): RenderResult<ManagedResource> {
    return this.createTexture({ ...info, cubemap: true });
  }

  public createRenderTarget(info: FramebufferCreateInfo): RenderResult<ManagedResource> {
    const lifetime = info.lifetime ?? 'transient';
    const colorFormats = info.colorFormats ?? ['rgba8unorm'];
    const byteSize =
      info.width * info.height * 4 * colorFormats.length +
      (info.depthFormat !== undefined ? info.width * info.height * 4 : 0);
    const budget = this.checkBudget(lifetime, byteSize);
    if (!budget.ok) return budget;

    const cached = this.acquireFromCache(info.key);
    if (cached !== undefined) {
      return renderSuccess(cached);
    }

    const createInfo: RenderTargetCreateInfo = {
      width: info.width,
      height: info.height,
      colorFormats,
      ...(info.depthFormat !== undefined ? { depthFormat: info.depthFormat } : {}),
      ...(info.label !== undefined ? { label: info.label } : {})
    };
    const created = this.backend.createRenderTarget(createInfo);
    if (!created.ok) return created;

    return this.track({
      kind: 'render-target',
      handle: created.value,
      lifetime,
      byteSize,
      key: info.key,
      ...(info.label !== undefined ? { label: info.label } : {})
    });
  }

  public createFramebuffer(info: FramebufferCreateInfo): RenderResult<ManagedResource> {
    const result = this.createRenderTarget(info);
    if (!result.ok) return result;
    const resource = result.value;
    const updated: ManagedResource = {
      ...resource,
      kind: 'framebuffer'
    };
    this.resources.set(resource.id, updated);
    return renderSuccess(updated);
  }

  public createPipeline(info: PipelineResourceCreateInfo): RenderResult<ManagedResource> {
    const lifetime = info.lifetime ?? 'persistent';
    const byteSize = 128;
    const budget = this.checkBudget(lifetime, byteSize);
    if (!budget.ok) return budget;

    const cached = this.acquireFromCache(info.key);
    if (cached !== undefined) {
      return renderSuccess(cached);
    }

    const createInfo: PipelineCreateInfo = {
      shaderHandle: info.shaderHandle,
      ...(info.label !== undefined ? { label: info.label } : {}),
      ...(info.topology !== undefined ? { topology: info.topology } : {}),
      ...(info.depthTest !== undefined ? { depthTest: info.depthTest } : {}),
      ...(info.blend !== undefined ? { blend: info.blend } : {})
    };
    const created = this.backend.createPipeline(createInfo);
    if (!created.ok) return created;

    return this.track({
      kind: 'pipeline',
      handle: created.value,
      lifetime,
      byteSize,
      key: info.key,
      ...(info.label !== undefined ? { label: info.label } : {})
    });
  }

  public acquire(id: ResourceId): RenderResult<ManagedResource> {
    const resource = this.resources.get(id);
    if (resource === undefined) {
      return renderFailure('not-found', `Resource ${String(id)} not found.`);
    }
    resource.refCount += 1;
    return renderSuccess(resource);
  }

  public release(id: ResourceId): RenderResult<void> {
    const resource = this.resources.get(id);
    if (resource === undefined) {
      return renderFailure('not-found', `Resource ${String(id)} not found.`);
    }
    resource.refCount = Math.max(0, resource.refCount - 1);
    if (resource.refCount === 0 && resource.lifetime === 'transient') {
      this.poolKey(resource);
    }
    return renderSuccess(undefined);
  }

  public get(id: ResourceId): ManagedResource | undefined {
    return this.resources.get(id);
  }

  public getByKey(key: string): ManagedResource | undefined {
    const id = this.byKey.get(key);
    return id === undefined ? undefined : this.resources.get(id);
  }

  public list(): readonly ManagedResource[] {
    return Object.freeze([...this.resources.values()]);
  }

  public budgets(): ResourceBudgetSnapshot {
    return {
      transientBytes: this.transientBytes,
      persistentBytes: this.persistentBytes,
      maxTransientBytes: this.config.maxTransientMemoryBytes,
      maxPersistentBytes: this.config.maxPersistentMemoryBytes,
      resourceCount: this.resources.size
    };
  }

  public releaseTransient(): void {
    const toDestroy: ResourceId[] = [];
    for (const resource of this.resources.values()) {
      if (resource.lifetime === 'transient' && resource.refCount <= 0) {
        toDestroy.push(resource.id);
      }
    }
    for (const id of toDestroy) {
      this.destroyInternal(id);
    }
  }

  public cacheStats(): { readonly size: number; readonly pooled: number } {
    let pooled = 0;
    for (const bucket of this.pool.values()) pooled += bucket.length;
    return { size: this.byKey.size, pooled };
  }

  public dispose(): void {
    for (const id of [...this.resources.keys()]) {
      this.destroyInternal(id);
    }
    this.pool.clear();
    this.byKey.clear();
    this.disposed = true;
  }

  private track(input: {
    readonly kind: ResourceKind;
    readonly handle: GpuHandle;
    readonly lifetime: ResourceLifetime;
    readonly byteSize: number;
    readonly key: string;
    readonly label?: string;
  }): RenderResult<ManagedResource> {
    if (this.disposed) {
      this.backend.destroyResource(input.handle);
      return renderFailure('unavailable', 'Resource manager is disposed.');
    }
    const id = asResourceId(`res-${this.nextId++}`);
    const resource: ManagedResource =
      input.label !== undefined
        ? {
            id,
            kind: input.kind,
            handle: input.handle,
            lifetime: input.lifetime,
            byteSize: input.byteSize,
            key: input.key,
            label: input.label,
            refCount: 1
          }
        : {
            id,
            kind: input.kind,
            handle: input.handle,
            lifetime: input.lifetime,
            byteSize: input.byteSize,
            key: input.key,
            refCount: 1
          };
    this.resources.set(id, resource);
    this.byKey.set(input.key, id);
    if (input.lifetime === 'transient') this.transientBytes += input.byteSize;
    else this.persistentBytes += input.byteSize;
    return renderSuccess(resource);
  }

  private acquireFromCache(key: string): ManagedResource | undefined {
    const pooled = this.pool.get(key);
    if (pooled !== undefined && pooled.length > 0) {
      const id = pooled.pop()!;
      const resource = this.resources.get(id);
      if (resource !== undefined) {
        resource.refCount = 1;
        return resource;
      }
    }
    const existingId = this.byKey.get(key);
    if (existingId === undefined) return undefined;
    const existing = this.resources.get(existingId);
    if (existing === undefined) return undefined;
    existing.refCount += 1;
    return existing;
  }

  private poolKey(resource: ManagedResource): void {
    const bucket = this.pool.get(resource.key) ?? [];
    bucket.push(resource.id);
    this.pool.set(resource.key, bucket);
  }

  private checkBudget(lifetime: ResourceLifetime, byteSize: number): RenderResult<void> {
    if (lifetime === 'transient') {
      if (this.transientBytes + byteSize > this.config.maxTransientMemoryBytes) {
        return renderFailure('exhausted', 'Transient memory budget exceeded.');
      }
    } else if (this.persistentBytes + byteSize > this.config.maxPersistentMemoryBytes) {
      return renderFailure('exhausted', 'Persistent memory budget exceeded.');
    }
    return renderSuccess(undefined);
  }

  private destroyInternal(id: ResourceId): void {
    const resource = this.resources.get(id);
    if (resource === undefined) return;
    this.backend.destroyResource(resource.handle);
    this.resources.delete(id);
    if (this.byKey.get(resource.key) === id) this.byKey.delete(resource.key);
    const bucket = this.pool.get(resource.key);
    if (bucket !== undefined) {
      this.pool.set(
        resource.key,
        bucket.filter((entry) => entry !== id)
      );
    }
    if (resource.lifetime === 'transient') {
      this.transientBytes = Math.max(0, this.transientBytes - resource.byteSize);
    } else {
      this.persistentBytes = Math.max(0, this.persistentBytes - resource.byteSize);
    }
  }
}
