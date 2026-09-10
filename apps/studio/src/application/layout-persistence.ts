/**
 * Layout persistence — dock sizes and panel collapse state.
 */

export interface StudioLayoutState {
  readonly leftWidth: number;
  readonly rightWidth: number;
  readonly bottomHeight: number;
  readonly leftCollapsed: boolean;
  readonly rightCollapsed: boolean;
  readonly bottomCollapsed: boolean;
}

export const DEFAULT_LAYOUT: StudioLayoutState = Object.freeze({
  leftWidth: 260,
  rightWidth: 280,
  bottomHeight: 180,
  leftCollapsed: false,
  rightCollapsed: false,
  bottomCollapsed: true
});

export class LayoutPersistence {
  private readonly storageKey = 'cad-studio.layout.v1';
  private state: StudioLayoutState;

  public constructor(initial?: Partial<StudioLayoutState>) {
    this.state = Object.freeze({
      ...DEFAULT_LAYOUT,
      ...this.load(),
      ...(initial ?? {})
    });
  }

  public get(): StudioLayoutState {
    return this.state;
  }

  public update(partial: Partial<StudioLayoutState>): StudioLayoutState {
    this.state = Object.freeze({ ...this.state, ...partial });
    this.persist();
    return this.state;
  }

  private load(): Partial<StudioLayoutState> | undefined {
    if (typeof localStorage === 'undefined') {
      return undefined;
    }
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw === null) {
        return undefined;
      }
      return JSON.parse(raw) as Partial<StudioLayoutState>;
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
