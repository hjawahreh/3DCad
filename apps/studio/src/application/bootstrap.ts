/**
 * StudioBootstrap — deterministic runtime initialization for the host.
 */

import {
  StudioCompositionRoot,
  type StudioCompositionRootOptions
} from './composition-root.js';

export interface BootstrapResult {
  readonly root: StudioCompositionRoot;
  readonly durationMs: number;
  readonly recoveredFromCrash: boolean;
}

export class StudioBootstrap {
  public bootstrap(options: StudioCompositionRootOptions = {}): BootstrapResult {
    const started = performanceNow();
    const root = new StudioCompositionRoot(options);
    root.theme.apply(root.settings.get().theme);

    const recoveredFromCrash = root.crashRecovery.detectUncleanShutdown();
    if (recoveredFromCrash) {
      root.diagnostics.record(
        'warning',
        'Previous session did not shut down cleanly',
        'crash-recovery'
      );
      root.notifications.push(
        'warning',
        'Recovery',
        'Previous session ended unexpectedly. Workspace restored to defaults.'
      );
    }

    root.crashRecovery.markBootstrap();

    const durationMs = performanceNow() - started;
    root.metrics.recordStartup(durationMs);
    root.diagnostics.record(
      'info',
      `Bootstrap completed in ${String(Math.round(durationMs))}ms`,
      'bootstrap'
    );

    if (durationMs > root.configuration.coldStartupBudgetMs) {
      root.diagnostics.record(
        'warning',
        `Cold startup exceeded budget (${String(Math.round(durationMs))}ms)`,
        'bootstrap'
      );
    }

    return Object.freeze({ root, durationMs, recoveredFromCrash });
  }
}

const performanceNow = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();
