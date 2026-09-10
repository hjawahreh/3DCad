/**
 * ClinicalPreparationRuntime — clinical façade for preparation workflow.
 */

import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalOrientationRuntime } from '../orientation/ClinicalOrientationRuntime.js';
import type { ClinicalViewportRuntime } from '../display/ClinicalViewportRuntime.js';
import type { ClinicalResult } from '../runtime/types.js';
import { ClinicalPreparationController } from './ClinicalPreparationController.js';
import type { PreparationOrchestrationToolId } from './ClinicalPreparationPipeline.js';
import type { ClinicalPreparationStage } from './ClinicalPreparationStage.js';

export class ClinicalPreparationRuntime {
  public readonly controller: ClinicalPreparationController;

  public constructor(
    session: ClinicalSession,
    orientation: ClinicalOrientationRuntime,
    viewport: ClinicalViewportRuntime
  ) {
    this.controller = new ClinicalPreparationController(session, orientation, viewport);
  }

  public get session() {
    return this.controller.session;
  }

  public get manager() {
    return this.controller.manager;
  }

  public get diagnostics() {
    return this.controller.diagnostics;
  }

  public get metrics() {
    return this.controller.metrics;
  }

  public get events() {
    return this.controller.events;
  }

  public get preferences() {
    return this.controller.preferences;
  }

  public start(): ClinicalResult<void> {
    return this.controller.start();
  }

  public validate(): ClinicalResult<void> {
    return this.controller.validate();
  }

  public activateSession(): ClinicalResult<void> {
    return this.controller.activateSession();
  }

  public suspend(): ClinicalResult<void> {
    return this.controller.suspend();
  }

  public resume(): ClinicalResult<void> {
    return this.controller.resume();
  }

  public selectTool(toolId: PreparationOrchestrationToolId): ClinicalResult<void> {
    return this.controller.selectTool(toolId);
  }

  public activateTool(toolId?: PreparationOrchestrationToolId): ClinicalResult<void> {
    return this.controller.activateTool(toolId);
  }

  public advanceStage(): ClinicalResult<ClinicalPreparationStage> {
    return this.controller.advanceStage();
  }

  public complete(): ClinicalResult<void> {
    return this.controller.complete();
  }

  public cancel(): ClinicalResult<void> {
    return this.controller.cancel();
  }

  public notifyOrientationComplete(): void {
    this.controller.notifyOrientationComplete();
  }

  public openPanel(): ClinicalResult<void> {
    return this.controller.openPanel();
  }

  public isActive(): boolean {
    return this.controller.isActive();
  }

  public isReadyForGeometry(): boolean {
    return this.controller.isReadyForGeometry();
  }

  public hasSession(): boolean {
    return this.controller.hasActiveSession();
  }

  public dispose(): void {
    this.controller.dispose();
  }
}
