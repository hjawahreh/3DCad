/**
 * ClinicalApplication — production clinical CAD façade over StudioApplication.
 */

import {
  StudioApplication,
  type StudioCompositionRootOptions
} from '../application/index.js';
import type { StudioCompositionRoot } from '../application/composition-root.js';
import { ClinicalBootstrap, type ClinicalBootstrapResult } from './ClinicalBootstrap.js';
import type { ClinicalRuntime } from './runtime/ClinicalRuntime.js';
import type { ClinicalSession } from './runtime/session.js';
import type { ClinicalWorkspace } from './workspace/ClinicalWorkspace.js';

export class ClinicalApplication {
  private readonly studio = new StudioApplication();
  private clinical: ClinicalBootstrapResult | undefined;

  public start(options: StudioCompositionRootOptions = {}): {
    readonly host: StudioCompositionRoot;
    readonly runtime: ClinicalRuntime;
    readonly session: ClinicalSession;
    readonly workspace: ClinicalWorkspace;
  } {
    const host = this.studio.start(options);
    if (this.clinical === undefined) {
      this.clinical = new ClinicalBootstrap().bootstrap(host);
    }
    return Object.freeze({
      host,
      runtime: this.clinical.runtime,
      session: this.clinical.session,
      workspace: this.clinical.workspace
    });
  }

  public get(): ClinicalBootstrapResult | undefined {
    return this.clinical;
  }

  public getHost(): StudioCompositionRoot | undefined {
    return this.studio.getRoot();
  }

  public async shutdown(): Promise<void> {
    this.clinical?.runtime.dispose();
    this.clinical = undefined;
    await this.studio.shutdown();
  }
}
