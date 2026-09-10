export type Entity = number & { readonly __entity: 'Entity' };

export interface ComponentType<T> {
  readonly id: symbol;
  readonly name: string;
  readonly __componentType?: T;
}
export const componentType = <T>(name: string): ComponentType<T> =>
  Object.freeze({ id: Symbol(name), name });

interface ComponentStore<T> {
  readonly type: ComponentType<T>;
  readonly values: Map<Entity, Readonly<T>>;
}

export interface EcsQuery {
  readonly with: readonly ComponentType<unknown>[];
  readonly without?: readonly ComponentType<unknown>[];
}
export interface EcsMatch {
  readonly entity: Entity;
  readonly components: ReadonlyMap<ComponentType<unknown>, unknown>;
}

export class EcsWorld {
  private nextEntity = 1;
  private readonly alive = new Set<Entity>();
  private readonly stores = new Map<symbol, ComponentStore<unknown>>();

  public createEntity(): Entity {
    const entity = this.nextEntity++ as Entity;
    this.alive.add(entity);
    return entity;
  }

  public destroyEntity(entity: Entity): void {
    this.alive.delete(entity);
    for (const store of this.stores.values()) store.values.delete(entity);
  }

  public set<T>(entity: Entity, type: ComponentType<T>, component: T): void {
    this.requireAlive(entity);
    this.store(type).values.set(entity, deepFreeze(structuredClone(component)));
  }

  public get<T>(entity: Entity, type: ComponentType<T>): Readonly<T> | undefined {
    return this.store(type).values.get(entity);
  }

  public remove<T>(entity: Entity, type: ComponentType<T>): void {
    this.store(type).values.delete(entity);
  }

  public query(query: EcsQuery): readonly EcsMatch[] {
    const matches: EcsMatch[] = [];
    for (const entity of this.alive) {
      if (!query.with.every((type) => this.store(type).values.has(entity))) continue;
      if ((query.without ?? []).some((type) => this.store(type).values.has(entity))) continue;
      const components = new Map<ComponentType<unknown>, unknown>();
      for (const type of query.with) components.set(type, this.store(type).values.get(entity));
      matches.push(Object.freeze({ entity, components }));
    }
    return Object.freeze(matches);
  }

  public archetype(entity: Entity): readonly string[] {
    this.requireAlive(entity);
    return Object.freeze(
      [...this.stores.values()]
        .filter((store) => store.values.has(entity))
        .map((store) => store.type.name)
        .sort()
    );
  }

  private store<T>(type: ComponentType<T>): ComponentStore<T> {
    let store = this.stores.get(type.id);
    if (!store) {
      store = { type, values: new Map() };
      this.stores.set(type.id, store);
    }
    return store as ComponentStore<T>;
  }
  private requireAlive(entity: Entity): void {
    if (!this.alive.has(entity)) throw new Error('Entity is not alive.');
  }
}

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }
  return value;
};
