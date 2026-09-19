/**
 * Application settings persisted locally (theme, viewport, performance, autosave).
 * Ownership: ApplicationSettings store; host provides persistence adapter.
 */

export type ThemeId = 'dark';
export type LanguageId = 'en' | 'future';

export interface ViewportPreferences {
  readonly showGrid: boolean;
  readonly targetFps: number;
  readonly preferredBackend: 'auto' | 'webgl2' | 'webgpu' | 'mock';
}

export interface PerformancePreferences {
  readonly reduceMotion: boolean;
  readonly limitConcurrentImports: number;
}

export interface AutosavePreferences {
  readonly enabled: boolean;
  readonly intervalMs: number;
}

export interface ApplicationSettings {
  readonly theme: ThemeId;
  readonly language: LanguageId;
  readonly viewport: ViewportPreferences;
  readonly performance: PerformancePreferences;
  readonly autosave: AutosavePreferences;
}

export const DEFAULT_APPLICATION_SETTINGS: ApplicationSettings = Object.freeze({
  theme: 'dark',
  language: 'en',
  viewport: Object.freeze({
    showGrid: true,
    targetFps: 60,
    preferredBackend: 'auto'
  }),
  performance: Object.freeze({
    reduceMotion: false,
    limitConcurrentImports: 2
  }),
  autosave: Object.freeze({
    enabled: true,
    intervalMs: 60_000
  })
});

export const resolveApplicationSettings = (
  partial?: Partial<ApplicationSettings>
): ApplicationSettings =>
  Object.freeze({
    theme: 'dark',
    language: partial?.language ?? DEFAULT_APPLICATION_SETTINGS.language,
    viewport: Object.freeze({
      ...DEFAULT_APPLICATION_SETTINGS.viewport,
      ...(partial?.viewport ?? {})
    }),
    performance: Object.freeze({
      ...DEFAULT_APPLICATION_SETTINGS.performance,
      ...(partial?.performance ?? {})
    }),
    autosave: Object.freeze({
      ...DEFAULT_APPLICATION_SETTINGS.autosave,
      ...(partial?.autosave ?? {})
    })
  });

export type SettingsListener = (settings: ApplicationSettings) => void;

export class ApplicationSettingsStore {
  private settings: ApplicationSettings;
  private readonly listeners = new Set<SettingsListener>();
  private readonly storageKey = 'cad-studio.settings.v1';

  public constructor(initial?: Partial<ApplicationSettings>) {
    this.settings = resolveApplicationSettings({
      ...this.load(),
      ...(initial ?? {})
    });
  }

  public get(): ApplicationSettings {
    return this.settings;
  }

  public update(partial: Partial<ApplicationSettings>): ApplicationSettings {
    this.settings = resolveApplicationSettings({
      ...this.settings,
      ...partial,
      viewport: { ...this.settings.viewport, ...(partial.viewport ?? {}) },
      performance: { ...this.settings.performance, ...(partial.performance ?? {}) },
      autosave: { ...this.settings.autosave, ...(partial.autosave ?? {}) }
    });
    this.persist();
    for (const listener of this.listeners) {
      listener(this.settings);
    }
    return this.settings;
  }

  public subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private load(): Partial<ApplicationSettings> | undefined {
    if (typeof localStorage === 'undefined') {
      return undefined;
    }
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw === null) {
        return undefined;
      }
      return JSON.parse(raw) as Partial<ApplicationSettings>;
    } catch {
      return undefined;
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
    } catch {
      // Persistence is best-effort in restricted environments.
    }
  }
}
