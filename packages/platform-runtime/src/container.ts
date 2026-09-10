export type ServiceToken<T> = symbol & { readonly __serviceType?: T };

export const serviceToken = <T>(description: string): ServiceToken<T> => Symbol(description);

export type ServiceLifetime = 'singleton' | 'scoped' | 'transient';

export interface ServiceResolver {
  resolve<T>(token: ServiceToken<T>): T;
  tryResolve<T>(token: ServiceToken<T>): T | undefined;
}

export type ServiceFactory<T> = (resolver: ServiceResolver) => T;

export interface ServiceDescriptor<T> {
  readonly token: ServiceToken<T>;
  readonly lifetime: ServiceLifetime;
  readonly factory: ServiceFactory<T>;
  readonly when?: () => boolean;
}

export interface Lazy<T> {
  readonly value: T;
}

export const lazy = <T>(factory: () => T): Lazy<T> => {
  let initialized = false;
  let instance: T;
  return {
    get value(): T {
      if (!initialized) {
        instance = factory();
        initialized = true;
      }
      return instance;
    }
  };
};

export class ServiceContainer implements ServiceResolver {
  private readonly descriptors = new Map<ServiceToken<unknown>, ServiceDescriptor<unknown>>();
  private readonly singletons: Map<ServiceToken<unknown>, unknown>;
  private readonly scoped = new Map<ServiceToken<unknown>, unknown>();
  private readonly resolving = new Set<ServiceToken<unknown>>();

  public constructor(
    descriptors: readonly ServiceDescriptor<unknown>[],
    private readonly parent?: ServiceContainer,
    singletonInstances?: Map<ServiceToken<unknown>, unknown>
  ) {
    this.singletons = singletonInstances ?? new Map<ServiceToken<unknown>, unknown>();
    for (const descriptor of descriptors) {
      if (descriptor.when?.() ?? true) {
        if (this.descriptors.has(descriptor.token))
          throw new Error('Duplicate service token registration.');
        this.descriptors.set(descriptor.token, descriptor);
      }
    }
  }

  public createScope(overrides: readonly ServiceDescriptor<unknown>[] = []): ServiceContainer {
    return new ServiceContainer(overrides, this, this.singletons);
  }

  public resolve<T>(token: ServiceToken<T>): T {
    const value = this.tryResolve(token);
    if (value === undefined) throw new Error(`Unregistered service: ${String(token.description)}`);
    return value;
  }

  public tryResolve<T>(token: ServiceToken<T>): T | undefined {
    const descriptor = this.descriptors.get(token) ?? this.parent?.findDescriptor(token);
    if (!descriptor) return undefined;
    return this.instantiate(token, descriptor) as T;
  }

  private findDescriptor(token: ServiceToken<unknown>): ServiceDescriptor<unknown> | undefined {
    return this.descriptors.get(token) ?? this.parent?.findDescriptor(token);
  }

  private instantiate(
    token: ServiceToken<unknown>,
    descriptor: ServiceDescriptor<unknown>
  ): unknown {
    const cache = descriptor.lifetime === 'singleton' ? this.singletons : this.scoped;
    if (descriptor.lifetime !== 'transient' && cache.has(token)) return cache.get(token);
    if (this.resolving.has(token)) throw new Error('Circular service dependency detected.');
    this.resolving.add(token);
    try {
      const instance = descriptor.factory(this);
      if (descriptor.lifetime !== 'transient') cache.set(token, instance);
      return instance;
    } finally {
      this.resolving.delete(token);
    }
  }
}
