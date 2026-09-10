/**
 * StudioApplication — top-level host façade over composition + bootstrap.
 */

import { StudioBootstrap, type BootstrapResult } from './bootstrap.js';
import type { StudioCompositionRoot } from './composition-root.js';
import type { StudioCompositionRootOptions } from './composition-root.js';

export class StudioApplication {
  private boot: BootstrapResult | undefined;

  public start(options: StudioCompositionRootOptions = {}): StudioCompositionRoot {
    if (this.boot !== undefined) {
      return this.boot.root;
    }
    this.boot = new StudioBootstrap().bootstrap(options);
    return this.boot.root;
  }

  public getRoot(): StudioCompositionRoot | undefined {
    return this.boot?.root;
  }

  public getBootstrapResult(): BootstrapResult | undefined {
    return this.boot;
  }

  public async shutdown(): Promise<void> {
    const root = this.boot?.root;
    if (root === undefined) {
      return;
    }
    root.crashRecovery.markCleanShutdown();
    root.dispose();
    this.boot = undefined;
  }
}
