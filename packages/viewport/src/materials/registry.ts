import {
  asMaterialId,
  type ColorRgba,
  type Disposable,
  type MaterialId,
  type MaterialKind,
  type RenderResult,
  renderFailure,
  renderSuccess
} from '../types.js';

export interface MaterialParams {
  readonly color?: ColorRgba;
  readonly metallic?: number;
  readonly roughness?: number;
  readonly opacity?: number;
  readonly emissive?: ColorRgba;
  readonly custom?: Readonly<Record<string, number | string | boolean>>;
}

export interface MaterialDescriptor {
  readonly id: MaterialId;
  readonly kind: MaterialKind;
  readonly params: MaterialParams;
  readonly version: number;
  readonly parentId?: MaterialId;
}

const DEFAULT_PARAMS: Record<MaterialKind, MaterialParams> = {
  pbr: {
    color: { r: 0.8, g: 0.8, b: 0.8, a: 1 },
    metallic: 0,
    roughness: 0.5,
    opacity: 1
  },
  unlit: {
    color: { r: 1, g: 1, b: 1, a: 1 },
    opacity: 1
  },
  wireframe: {
    color: { r: 0.2, g: 0.9, b: 0.4, a: 1 },
    opacity: 1
  },
  points: {
    color: { r: 1, g: 0.85, b: 0.2, a: 1 },
    opacity: 1
  },
  lines: {
    color: { r: 0.3, g: 0.6, b: 1, a: 1 },
    opacity: 1
  },
  transparent: {
    color: { r: 0.7, g: 0.7, b: 0.9, a: 0.5 },
    opacity: 0.5,
    roughness: 0.2
  },
  custom: {
    opacity: 1
  }
};

export class MaterialRegistry implements Disposable {
  private readonly materials = new Map<MaterialId, MaterialDescriptor>();
  private nextId = 1;

  public create(
    kind: MaterialKind,
    params?: MaterialParams,
    id?: MaterialId
  ): RenderResult<MaterialDescriptor> {
    const materialId = id ?? asMaterialId(`mat-${this.nextId++}`);
    if (this.materials.has(materialId)) {
      return renderFailure('conflict', `Material ${String(materialId)} already exists.`);
    }
    const descriptor: MaterialDescriptor = {
      id: materialId,
      kind,
      params: Object.freeze({ ...DEFAULT_PARAMS[kind], ...params }),
      version: 1
    };
    this.materials.set(materialId, descriptor);
    return renderSuccess(descriptor);
  }

  public createInstance(
    parentId: MaterialId,
    params?: MaterialParams
  ): RenderResult<MaterialDescriptor> {
    const parent = this.materials.get(parentId);
    if (parent === undefined) {
      return renderFailure('not-found', `Parent material ${String(parentId)} not found.`);
    }
    const id = asMaterialId(`mat-${this.nextId++}`);
    const descriptor: MaterialDescriptor = {
      id,
      kind: parent.kind,
      params: Object.freeze({ ...parent.params, ...params }),
      version: 1,
      parentId
    };
    this.materials.set(id, descriptor);
    return renderSuccess(descriptor);
  }

  public resolve(id: MaterialId): RenderResult<MaterialDescriptor> {
    const material = this.materials.get(id);
    if (material === undefined) {
      return renderFailure('not-found', `Material ${String(id)} not found.`);
    }
    return renderSuccess(material);
  }

  public update(id: MaterialId, params: MaterialParams): RenderResult<MaterialDescriptor> {
    const material = this.materials.get(id);
    if (material === undefined) {
      return renderFailure('not-found', `Material ${String(id)} not found.`);
    }
    const updated: MaterialDescriptor = {
      id: material.id,
      kind: material.kind,
      params: Object.freeze({ ...material.params, ...params }),
      version: material.version + 1,
      ...(material.parentId !== undefined ? { parentId: material.parentId } : {})
    };
    this.materials.set(id, updated);
    return renderSuccess(updated);
  }

  public list(): readonly MaterialDescriptor[] {
    return Object.freeze([...this.materials.values()]);
  }

  public remove(id: MaterialId): RenderResult<void> {
    if (!this.materials.delete(id)) {
      return renderFailure('not-found', `Material ${String(id)} not found.`);
    }
    return renderSuccess(undefined);
  }

  public clear(): void {
    this.materials.clear();
  }

  public defaultParams(kind: MaterialKind): MaterialParams {
    return Object.freeze({ ...DEFAULT_PARAMS[kind] });
  }

  public dispose(): void {
    this.clear();
  }
}
