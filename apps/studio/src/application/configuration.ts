/**
 * Application configuration — host-owned defaults for Studio.
 * Ownership: StudioCompositionRoot.
 */

export interface ApplicationConfiguration {
  readonly appName: string;
  readonly appVersion: string;
  readonly minWindowWidth: number;
  readonly minWindowHeight: number;
  readonly defaultWindowWidth: number;
  readonly defaultWindowHeight: number;
  readonly coldStartupBudgetMs: number;
  readonly forceMockViewportBackend: boolean;
  readonly enableGridPlaceholder: boolean;
  readonly autosaveIntervalMs: number;
}

export const DEFAULT_APPLICATION_CONFIGURATION: ApplicationConfiguration = Object.freeze({
  appName: 'Aligner Studio',
  appVersion: '0.1.0',
  minWindowWidth: 1024,
  minWindowHeight: 640,
  defaultWindowWidth: 1440,
  defaultWindowHeight: 900,
  coldStartupBudgetMs: 5000,
  forceMockViewportBackend: false,
  enableGridPlaceholder: true,
  autosaveIntervalMs: 60_000
});

export const resolveApplicationConfiguration = (
  partial?: Partial<ApplicationConfiguration>
): ApplicationConfiguration =>
  Object.freeze({
    ...DEFAULT_APPLICATION_CONFIGURATION,
    ...(partial ?? {})
  });
