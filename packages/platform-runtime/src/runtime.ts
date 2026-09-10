import { CommandBus, type HistoryPort } from './commands.js';
import type { Clock } from './contracts.js';
import { ServiceContainer, type ServiceDescriptor } from './container.js';
import { DiagnosticsRegistry } from './diagnostics.js';
import { EventBus } from './events.js';
import { LifecycleCoordinator } from './lifecycle.js';
import { PluginRegistry } from './plugins.js';
import { QueryBus } from './queries.js';
import {
  CapabilityRegistry,
  FeatureFlagRegistry,
  ProjectLifecycle,
  VersionRegistry
} from './registries.js';
import { TaskScheduler } from './scheduler.js';

export interface RuntimeServices {
  readonly container: ServiceContainer;
  readonly lifecycle: LifecycleCoordinator;
  readonly events: EventBus;
  readonly commands: CommandBus;
  readonly queries: QueryBus;
  readonly scheduler: TaskScheduler;
  readonly diagnostics: DiagnosticsRegistry;
  readonly plugins: PluginRegistry;
  readonly capabilities: CapabilityRegistry;
  readonly features: FeatureFlagRegistry;
  readonly versions: VersionRegistry;
  readonly projects: ProjectLifecycle;
}

export class RuntimeBuilder {
  private readonly descriptors: ServiceDescriptor<unknown>[] = [];
  public constructor(
    private readonly clock: Clock,
    private readonly history?: HistoryPort
  ) {}
  public register(descriptor: ServiceDescriptor<unknown>): this {
    this.descriptors.push(descriptor);
    return this;
  }
  public build(): RuntimeServices {
    const container = new ServiceContainer(this.descriptors);
    const events = new EventBus(this.clock);
    return Object.freeze({
      container,
      lifecycle: new LifecycleCoordinator(() => this.clock.now()),
      events,
      commands: new CommandBus(events, this.history),
      queries: new QueryBus(),
      scheduler: new TaskScheduler(this.clock),
      diagnostics: new DiagnosticsRegistry(this.clock),
      plugins: new PluginRegistry(),
      capabilities: new CapabilityRegistry(),
      features: new FeatureFlagRegistry(),
      versions: new VersionRegistry(),
      projects: new ProjectLifecycle()
    });
  }
}
