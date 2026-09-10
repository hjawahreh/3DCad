/**
 * ClinicalBootstrap — deterministic clinical framework startup over Studio host.
 */

import type { StudioCompositionRoot } from '../application/composition-root.js';
import { ClinicalRuntime } from './runtime/ClinicalRuntime.js';
import type { ClinicalSession } from './runtime/session.js';
import { ClinicalWorkspace } from './workspace/ClinicalWorkspace.js';
import { registerClinicalCommands } from './register-commands.js';
import { createClinicalTrimOperationHandler } from './trim/ClinicalTrimHandler.js';
import { createClinicalCloseBaseOperationHandler } from './close-base/ClinicalCloseBaseHandler.js';
import { createClinicalSegmentationOperationHandler } from './segmentation/ClinicalSegmentationHandler.js';

export interface ClinicalBootstrapResult {
  readonly runtime: ClinicalRuntime;
  readonly session: ClinicalSession;
  readonly workspace: ClinicalWorkspace;
  readonly durationMs: number;
}

export class ClinicalBootstrap {
  public bootstrap(host: StudioCompositionRoot): ClinicalBootstrapResult {
    const started =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const runtime = new ClinicalRuntime({ host });
    const created = runtime.createSession();
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    const session = created.value;
    const workspace = new ClinicalWorkspace(session);
    const trimHandler = createClinicalTrimOperationHandler();
    const registeredTrim = host.runtimes.tools.registerHandler(trimHandler);
    if (!registeredTrim.ok) {
      throw new Error(registeredTrim.error.message);
    }
    const closeBaseHandler = createClinicalCloseBaseOperationHandler();
    const registeredCloseBase = host.runtimes.tools.registerHandler(closeBaseHandler);
    if (!registeredCloseBase.ok) {
      throw new Error(registeredCloseBase.error.message);
    }
    const segmentationHandler = createClinicalSegmentationOperationHandler();
    const registeredSegmentation = host.runtimes.tools.registerHandler(segmentationHandler);
    if (!registeredSegmentation.ok) {
      throw new Error(registeredSegmentation.error.message);
    }
    registerClinicalCommands(session, workspace);
    const durationMs =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
    session.getMetrics().recordBootstrap(durationMs);
    session
      .getDiagnostics()
      .record('info', `Clinical bootstrap completed in ${String(Math.round(durationMs))}ms`, 'bootstrap');
    return Object.freeze({ runtime, session, workspace, durationMs });
  }
}
