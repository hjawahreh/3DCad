import { describe, expect, it } from 'vitest';
import {
  EcsWorld,
  EventBus,
  ImmutableStateStore,
  LifecycleCoordinator,
  PluginRegistry,
  QueryBus,
  ServiceContainer,
  TaskScheduler,
  CommandBus,
  componentType,
  failure,
  serviceToken,
  success,
  type Clock,
  type CorrelationId,
  type ExecutionContext
} from '../src/index.js';

const clock: Clock = { now: () => 1000 };
const context: ExecutionContext = {
  clock,
  correlationId: 'test' as CorrelationId,
  signal: new AbortController().signal
};

describe('immutable state', () => {
  it('publishes a new revision without changing prior state', () => {
    const store = new ImmutableStateStore({ count: 1 });
    const first = store.read();
    const second = store.update((value) => ({ count: value.count + 1 }));
    expect(first.value.count).toBe(1);
    expect(second.value.count).toBe(2);
    expect(second.revision).toBe(1);
  });
});

describe('event bus', () => {
  it('delivers higher-priority handlers first', async () => {
    const bus = new EventBus(clock);
    const order: string[] = [];
    bus.subscribe({ priority: 0 }, () => {
      order.push('low');
      return success(undefined);
    });
    bus.subscribe({ priority: 10 }, () => {
      order.push('high');
      return success(undefined);
    });
    const result = await bus.publish({
      id: '1',
      name: 'event',
      stream: 'application',
      payload: {},
      correlationId: context.correlationId
    });
    expect(result.ok).toBe(true);
    expect(order).toEqual(['high', 'low']);
  });
});

describe('scheduler', () => {
  it('runs dependencies before dependent work', async () => {
    const scheduler = new TaskScheduler(clock, 1);
    const order: string[] = [];
    scheduler.submit({
      id: 'first',
      priority: 'normal',
      execute: () => {
        order.push('first');
        return Promise.resolve(success(undefined));
      }
    });
    scheduler.submit({
      id: 'second',
      priority: 'normal',
      dependencies: ['first'],
      execute: () => {
        order.push('second');
        return Promise.resolve(success(undefined));
      }
    });
    await scheduler.drain();
    expect(order).toEqual(['first', 'second']);
  });
  it('does not run work blocked by failed dependencies', async () => {
    const scheduler = new TaskScheduler(clock, 1);
    scheduler.submit({
      id: 'failed',
      priority: 'normal',
      execute: () => Promise.resolve(failure({ code: 'invalid', message: 'failure' }))
    });
    scheduler.submit({
      id: 'blocked',
      priority: 'normal',
      dependencies: ['failed'],
      execute: () => Promise.resolve(success(undefined))
    });
    await scheduler.drain();
    expect(scheduler.snapshot('blocked')?.state).toBe('cancelled');
  });
});

describe('generic ecs', () => {
  it('queries only entities with the requested component signature', () => {
    const world = new EcsWorld();
    const label = componentType<{ readonly value: string }>('label');
    const included = world.createEntity();
    world.set(included, label, { value: 'included' });
    world.createEntity();
    expect(world.query({ with: [label] }).map((match) => match.entity)).toEqual([included]);
  });
});

describe('service tokens', () => {
  it('are nominal at runtime', () => {
    const first = serviceToken<string>('first');
    const second = serviceToken<string>('second');
    expect(first).not.toBe(second);
  });
});

describe('service container', () => {
  it('shares singletons and isolates scoped services', () => {
    const singleton = serviceToken<{ readonly id: number }>('singleton');
    const scoped = serviceToken<{ readonly id: number }>('scoped');
    let sequence = 0;
    const container = new ServiceContainer([
      { token: singleton, lifetime: 'singleton', factory: () => ({ id: ++sequence }) },
      { token: scoped, lifetime: 'scoped', factory: () => ({ id: ++sequence }) }
    ]);
    const first = container.createScope();
    const second = container.createScope();
    expect(first.resolve(singleton)).toBe(second.resolve(singleton));
    expect(first.resolve(scoped)).not.toBe(second.resolve(scoped));
  });
});

describe('lifecycle', () => {
  it('transitions participants in descending priority', async () => {
    const coordinator = new LifecycleCoordinator(() => 1);
    const order: string[] = [];
    coordinator.register({
      id: 'low',
      priority: 0,
      transition: () => {
        order.push('low');
        return Promise.resolve(success(undefined));
      }
    });
    coordinator.register({
      id: 'high',
      priority: 1,
      transition: () => {
        order.push('high');
        return Promise.resolve(success(undefined));
      }
    });
    const result = await coordinator.transition('application-start', new AbortController().signal);
    expect(result.ok).toBe(true);
    expect(coordinator.currentPhase()).toBe('running');
    expect(order).toEqual(['high', 'low']);
  });
});

describe('command and query buses', () => {
  it('validates, executes, publishes, and caches read-only results', async () => {
    const events = new EventBus(clock);
    const commandBus = new CommandBus(events);
    const observed: string[] = [];
    events.subscribe({}, (event) => {
      observed.push(event.name);
      return success(undefined);
    });
    commandBus.register({
      name: 'increment',
      validate: () => success(undefined),
      authorize: () => success(undefined),
      execute: () =>
        Promise.resolve(
          success({
            value: 2,
            events: [
              {
                id: 'event',
                name: 'changed',
                stream: 'domain',
                payload: {},
                correlationId: context.correlationId
              }
            ]
          })
        )
    });
    const commandResult = await commandBus.dispatch<number>(
      { id: 'command', name: 'increment', payload: {}, undoable: false },
      context
    );
    expect(commandResult).toEqual(success(2));
    expect(observed).toEqual(['changed']);
    const queryBus = new QueryBus();
    let executions = 0;
    queryBus.register({
      name: 'read',
      execute: () => {
        executions += 1;
        return Promise.resolve(success('value'));
      }
    });
    await queryBus.execute<string>({ name: 'read', payload: {}, cacheKey: 'read:1' }, context);
    await queryBus.execute<string>({ name: 'read', payload: {}, cacheKey: 'read:1' }, context);
    expect(executions).toBe(1);
  });
});

describe('plugin registry', () => {
  it('enforces declared extension capabilities', () => {
    const plugins = new PluginRegistry();
    plugins.registerExtensionPoint({ id: 'tool', version: '1', requiredCapability: 'tools' });
    plugins.registerPlugin({
      id: 'example',
      version: '1.0.0',
      sdkRange: '^1',
      capabilities: ['tools'],
      permissions: []
    });
    expect(plugins.canContribute('example', 'tool')).toBe(true);
  });
});
