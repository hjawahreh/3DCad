import type { ExecutionContext } from './contracts.js';
import { failure, success, type Result, type RuntimeError, runtimeError } from './result.js';

export interface Query<TName extends string = string, TPayload = unknown> {
  readonly name: TName;
  readonly payload: Readonly<TPayload>;
  readonly cacheKey?: string;
}

export interface QueryHandler<TQuery extends Query, TValue> {
  readonly name: TQuery['name'];
  execute(query: TQuery, context: ExecutionContext): Promise<Result<TValue, RuntimeError>>;
}

export type QueryInterceptor = (
  query: Query,
  context: ExecutionContext,
  next: () => Promise<Result<unknown, RuntimeError>>
) => Promise<Result<unknown, RuntimeError>>;

export class QueryBus {
  private readonly handlers = new Map<string, QueryHandler<Query, unknown>>();
  private readonly interceptors: QueryInterceptor[] = [];
  private readonly cache = new Map<string, unknown>();

  public register<TQuery extends Query, TValue>(handler: QueryHandler<TQuery, TValue>): void {
    if (this.handlers.has(handler.name)) throw new Error('Duplicate query handler.');
    this.handlers.set(handler.name, handler);
  }

  public use(interceptor: QueryInterceptor): void {
    this.interceptors.push(interceptor);
  }

  public async execute<T>(
    query: Query,
    context: ExecutionContext
  ): Promise<Result<T, RuntimeError>> {
    if (context.signal.aborted)
      return failure(runtimeError('cancelled', 'Query cancelled before execution.'));
    if (query.cacheKey && this.cache.has(query.cacheKey))
      return success(this.cache.get(query.cacheKey) as T);
    const handler = this.handlers.get(query.name);
    if (!handler) return failure(runtimeError('not-found', `No handler for query ${query.name}.`));
    const invoke = (): Promise<Result<unknown, RuntimeError>> => handler.execute(query, context);
    const result = await this.interceptors.reduceRight<
      () => Promise<Result<unknown, RuntimeError>>
    >((next, current) => () => current(query, context, next), invoke)();
    if (!result.ok) return result;
    if (query.cacheKey) this.cache.set(query.cacheKey, result.value);
    return success(result.value as T);
  }

  public invalidate(cacheKey: string): void {
    this.cache.delete(cacheKey);
  }
  public clearCache(): void {
    this.cache.clear();
  }
}
