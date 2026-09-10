/**
 * Command palette registry — runtime / project / viewport / application commands.
 * No clinical commands.
 */

export type CommandCategory =
  | 'application'
  | 'project'
  | 'viewport'
  | 'runtime'
  | 'import'
  | 'view'
  | 'window';

export interface StudioCommand {
  readonly id: string;
  readonly title: string;
  readonly category: CommandCategory;
  readonly shortcut?: string;
  readonly enabled: boolean;
  readonly run: () => void | Promise<void>;
}

export type CommandListener = (commands: readonly StudioCommand[]) => void;

export class CommandRegistry {
  private readonly commands = new Map<string, StudioCommand>();
  private readonly listeners = new Set<CommandListener>();

  public register(command: StudioCommand): void {
    this.commands.set(command.id, command);
    this.emit();
  }

  public unregister(id: string): void {
    this.commands.delete(id);
    this.emit();
  }

  public list(): readonly StudioCommand[] {
    return Object.freeze([...this.commands.values()]);
  }

  public get(id: string): StudioCommand | undefined {
    return this.commands.get(id);
  }

  public async invoke(id: string): Promise<boolean> {
    const command = this.commands.get(id);
    if (command === undefined || !command.enabled) {
      return false;
    }
    await command.run();
    return true;
  }

  public subscribe(listener: CommandListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.list();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
