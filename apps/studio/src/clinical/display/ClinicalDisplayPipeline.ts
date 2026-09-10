/**
 * ClinicalDisplayPipeline — republish scene with visibility + display metadata; no geometry edits.
 */

import type { StudioCompositionRoot } from '../../application/composition-root.js';
import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { ClinicalDisplayManager } from './ClinicalDisplayManager.js';
import type { ClinicalDisplayDiagnostics } from './ClinicalDisplayObservability.js';
import type { ClinicalDisplayMetrics } from './ClinicalDisplayObservability.js';
import { clinicalSuccess, type ClinicalResult } from '../runtime/types.js';

export class ClinicalDisplayPipeline {
  public constructor(
    private readonly display: ClinicalDisplayManager,
    private readonly sceneBuilder: ClinicalSceneBuilder,
    private readonly diagnostics: ClinicalDisplayDiagnostics,
    private readonly metrics: ClinicalDisplayMetrics
  ) {}

  public refresh(
    session: ClinicalSession,
    host: StudioCompositionRoot,
    reason = 'display-refresh'
  ): ClinicalResult<void> {
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const doc = session.getPublicState().activeCase;
    if (doc === undefined) {
      const empty = this.sceneBuilder.publishEmpty(host, host.runtimes.scene);
      this.markTiming(started, reason);
      return empty;
    }
    const published = this.sceneBuilder.buildAndPublish(host, doc, {
      fitCamera: false,
      clearSelection: false,
      invalidateReason: reason,
      displayMode: this.display.getRenderState().displayMode
    });
    this.markTiming(started, reason);
    if (!published.ok) {
      this.diagnostics.record('error', published.error.message);
      return published;
    }
    host.sessions.viewportSession?.invalidate(reason);
    return clinicalSuccess(undefined);
  }

  private markTiming(started: number, reason: string): void {
    const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const ms = ended - started;
    this.diagnostics.recordFrame(ms, ms);
    this.metrics.recordFrameTime(ms);
    this.diagnostics.record('info', `Viewport refresh (${reason}) ${ms.toFixed(2)}ms`);
  }
}
