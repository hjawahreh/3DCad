/**
 * Hotkey registration — maps keyboard chords to command ids.
 */

export interface HotkeyBinding {
  readonly chord: string;
  readonly commandId: string;
}

export class HotkeyRegistration {
  private readonly bindings = new Map<string, string>();

  public register(chord: string, commandId: string): void {
    this.bindings.set(normalizeChord(chord), commandId);
  }

  public resolve(event: {
    readonly key: string;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly shiftKey: boolean;
    readonly altKey: boolean;
  }): string | undefined {
    const parts: string[] = [];
    if (event.ctrlKey || event.metaKey) {
      parts.push('Mod');
    }
    if (event.shiftKey) {
      parts.push('Shift');
    }
    if (event.altKey) {
      parts.push('Alt');
    }
    parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key);
    return this.bindings.get(parts.join('+'));
  }

  public list(): readonly HotkeyBinding[] {
    return Object.freeze(
      [...this.bindings.entries()].map(([chord, commandId]) =>
        Object.freeze({ chord, commandId })
      )
    );
  }
}

const normalizeChord = (chord: string): string =>
  chord
    .split('+')
    .map((part) => {
      const trimmed = part.trim();
      if (trimmed === 'Ctrl' || trimmed === 'Cmd' || trimmed === 'Meta') {
        return 'Mod';
      }
      return trimmed.length === 1 ? trimmed.toUpperCase() : trimmed;
    })
    .join('+');
