import type { ExecutionContext, ProgressReporter } from './contracts.js';
import type { EventBus, EventEnvelope } from './events.js';
import { failure, success, type Result, type RuntimeError, runtimeError } from './result.js';

export interface Command<TName extends string = string, TPayload = unknown> {
  readonly id: string;
  readonly name: TName;
  readonly payload: Readonly<TPayload>;
  readonly undoable: boolean;
}

export interface CommandOutcome<T> {
  readonly value: T;
  readonly events?: readonly Omit<EventEnvelope, 'timestamp'>[];
  readonly history?: { readonly commandId: string; readonly label: string };
}

export interface CommandHandler<TCommand extends Command, TValue> {
  readonly name: TCommand['name'];
  validate(command: TCommand, context: ExecutionContext): Result<void, RuntimeError>;
  authorize(command: TCommand, context: ExecutionContext): Result<void, RuntimeError>;
  execute(
    command: TCommand,
    context: ExecutionContext,
    report: ProgressReporter
  ): Promise<Result<CommandOutcome<TValue>, RuntimeError>>;
}

export type CommandMiddleware = (
  command: Command,
  context: ExecutionContext,
  next: () => Promise<Result<CommandOutcome<unknown>, RuntimeError>>
) => Promise<Result<CommandOutcome<unknown>, RuntimeError>>;

export interface HistoryPort {
  register(entry: {
    readonly commandId: string;
    readonly label: string;
  }): Promise<Result<void, RuntimeError>>;
}

export class CommandBus {
  private readonly handlers = new Map<string, CommandHandler<Command, unknown>>();
  private readonly middleware: CommandMiddleware[] = [];

  public constructor(
    private readonly events: EventBus,
    private readonly history?: HistoryPort
  ) {}

  public register<TCommand extends Command, TValue>(
    handler: CommandHandler<TCommand, TValue>
  ): void {
    if (this.handlers.has(handler.name)) throw new Error('Duplicate command handler.');
    this.handlers.set(handler.name, handler);
  }

  public use(middleware: CommandMiddleware): void {
    this.middleware.push(middleware);
  }

  public async dispatch<T>(
    command: Command,
    context: ExecutionContext,
    report: ProgressReporter = () => undefined
  ): Promise<Result<T, RuntimeError>> {
    const handler = this.handlers.get(command.name);
    if (!handler)
      return failure(runtimeError('not-found', `No handler for command ${command.name}.`));
    const validation = handler.validate(command, context);
    if (!validation.ok) return validation;
    const authorization = handler.authorize(command, context);
    if (!authorization.ok) return authorization;
    if (context.signal.aborted)
      return failure(runtimeError('cancelled', 'Command cancelled before execution.'));
    const invoke = (): Promise<Result<CommandOutcome<unknown>, RuntimeError>> =>
      handler.execute(command, context, report);
    const result = await this.middleware.reduceRight<
      () => Promise<Result<CommandOutcome<unknown>, RuntimeError>>
    >((next, current) => () => current(command, context, next), invoke)();
    if (!result.ok) return result;
    if (result.value.history && command.undoable && this.history) {
      const history = await this.history.register(result.value.history);
      if (!history.ok) return history;
    }
    for (const event of result.value.events ?? []) {
      const published = await this.events.publish(event);
      if (!published.ok) return published;
    }
    return success(result.value.value as T);
  }
}
