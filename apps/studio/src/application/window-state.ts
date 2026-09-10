/**
 * Window state manager — size/position restore contracts for the desktop host.
 */

export interface WindowState {
  readonly width: number;
  readonly height: number;
  readonly x: number | null;
  readonly y: number | null;
  readonly maximized: boolean;
}

export class WindowStateManager {
  private readonly storageKey = 'cad-studio.window.v1';
  private state: WindowState;

  public constructor(defaults: { readonly width: number; readonly height: number }) {
    const loaded = this.load();
    this.state = Object.freeze({
      width: loaded?.width ?? defaults.width,
      height: loaded?.height ?? defaults.height,
      x: loaded?.x ?? null,
      y: loaded?.y ?? null,
      maximized: loaded?.maximized ?? false
    });
  }

  public get(): WindowState {
    return this.state;
  }

  public update(partial: Partial<WindowState>): WindowState {
    this.state = Object.freeze({ ...this.state, ...partial });
    this.persist();
    return this.state;
  }

  private load(): WindowState | undefined {
    if (typeof localStorage === 'undefined') {
      return undefined;
    }
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw === null) {
        return undefined;
      }
      return JSON.parse(raw) as WindowState;
    } catch {
      return undefined;
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch {
      // ignore
    }
  }
}
