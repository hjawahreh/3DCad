/**
 * Clinical workspace layout persistence.
 */

export interface ClinicalLayoutState {
  readonly leftWidth: number;
  readonly rightWidth: number;
  readonly bottomHeight: number;
  readonly leftCollapsed: boolean;
  readonly rightCollapsed: boolean;
  readonly bottomCollapsed: boolean;
  readonly leftSection: ClinicalLeftSection;
  readonly rightTab: ClinicalRightTab;
  readonly bottomTab: ClinicalBottomTab;
}

export type ClinicalLeftSection =
  | 'case'
  | 'scene'
  | 'objects'
  | 'preparation'
  | 'segmentation'
  | 'treatment'
  | 'manufacturing';

export type ClinicalRightTab =
  | 'inspector'
  | 'properties'
  | 'selection'
  | 'camera'
  | 'display'
  | 'tool';

export type ClinicalBottomTab = 'notifications' | 'logs' | 'diagnostics' | 'import' | 'jobs';

export const DEFAULT_CLINICAL_LAYOUT: ClinicalLayoutState = Object.freeze({
  leftWidth: 280,
  rightWidth: 300,
  bottomHeight: 200,
  leftCollapsed: false,
  rightCollapsed: false,
  bottomCollapsed: false,
  leftSection: 'case',
  rightTab: 'inspector',
  bottomTab: 'logs'
});

export class ClinicalLayout {
  private readonly storageKey = 'cad-studio.clinical.layout.v1';
  private state: ClinicalLayoutState;
  private readonly listeners = new Set<() => void>();

  public constructor(initial?: Partial<ClinicalLayoutState>) {
    this.state = Object.freeze({
      ...DEFAULT_CLINICAL_LAYOUT,
      ...this.load(),
      ...(initial ?? {})
    });
  }

  public get(): ClinicalLayoutState {
    return this.state;
  }

  public update(partial: Partial<ClinicalLayoutState>): ClinicalLayoutState {
    this.state = Object.freeze({ ...this.state, ...partial });
    this.persist();
    for (const listener of this.listeners) {
      listener();
    }
    return this.state;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private load(): Partial<ClinicalLayoutState> | undefined {
    if (typeof localStorage === 'undefined') {
      return undefined;
    }
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw === null) {
        return undefined;
      }
      return JSON.parse(raw) as Partial<ClinicalLayoutState>;
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
