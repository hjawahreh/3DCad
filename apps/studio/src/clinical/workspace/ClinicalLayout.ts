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
  leftWidth: 88,
  rightWidth: 280,
  bottomHeight: 180,
  leftCollapsed: false,
  rightCollapsed: true,
  bottomCollapsed: true,
  leftSection: 'case',
  rightTab: 'inspector',
  bottomTab: 'diagnostics'
});

export class ClinicalLayout {
  private readonly storageKey = 'cad-studio.clinical.layout.v3';
  private state: ClinicalLayoutState;
  private readonly listeners = new Set<() => void>();

  public constructor(initial?: Partial<ClinicalLayoutState>) {
    this.state = Object.freeze({
      ...DEFAULT_CLINICAL_LAYOUT,
      ...this.sanitize(this.load()),
      ...(initial ?? {}),
      // CLN-WORKSTATION-001: prefer collapsed inspector + narrow rail.
      leftWidth: initial?.leftWidth ?? Math.min(120, this.load()?.leftWidth ?? 88),
      rightCollapsed: initial?.rightCollapsed ?? true,
      bottomCollapsed: initial?.bottomCollapsed ?? true
    });
  }

  public get(): ClinicalLayoutState {
    return this.state;
  }

  public update(partial: Partial<ClinicalLayoutState>): ClinicalLayoutState {
    this.state = Object.freeze({ ...this.state, ...this.sanitize(partial) });
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

  private sanitize(partial: Partial<ClinicalLayoutState> | undefined): Partial<ClinicalLayoutState> {
    if (partial === undefined) {
      return {};
    }
    const next: {
      leftWidth?: number;
      rightWidth?: number;
      bottomHeight?: number;
    } & Partial<ClinicalLayoutState> = { ...partial };
    if (typeof next.leftWidth === 'number') {
      next.leftWidth = Math.min(200, Math.max(72, Math.round(next.leftWidth)));
    }
    if (typeof next.rightWidth === 'number') {
      next.rightWidth = Math.min(480, Math.max(220, Math.round(next.rightWidth)));
    }
    if (typeof next.bottomHeight === 'number') {
      next.bottomHeight = Math.min(420, Math.max(120, Math.round(next.bottomHeight)));
    }
    return next;
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
