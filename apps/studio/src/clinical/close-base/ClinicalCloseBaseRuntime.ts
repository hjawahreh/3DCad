/**
 * ClinicalCloseBaseRuntime — clinical façade for production Close Base tool.
 */

import type { ClinicalArchRole, ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import type { ClinicalViewportRuntime } from '../display/ClinicalViewportRuntime.js';
import type { ClinicalResult } from '../runtime/types.js';
import type { ClinicalSession } from '../runtime/session.js';
import { ClinicalCloseBaseController } from './ClinicalCloseBaseController.js';
import type { ClinicalCloseBaseParameters } from './ClinicalCloseBaseParameters.js';
import type { CloseBaseStrategyId } from './ClinicalCloseBaseStrategy.js';

export class ClinicalCloseBaseRuntime {
  public readonly controller: ClinicalCloseBaseController;

  public constructor(
    session: ClinicalSession,
    preparation: ClinicalPreparationRuntime,
    sceneBuilder: ClinicalSceneBuilder,
    viewport?: ClinicalViewportRuntime
  ) {
    this.controller = new ClinicalCloseBaseController(
      session,
      preparation,
      sceneBuilder,
      viewport
    );
  }

  public get session() {
    return this.controller.session;
  }

  public get history() {
    return this.controller.history;
  }

  public get diagnostics() {
    return this.controller.diagnostics;
  }

  public get metrics() {
    return this.controller.metrics;
  }

  public get preferences() {
    return this.controller.preferences;
  }

  public enter(preferredId?: ClinicalObjectId): ClinicalResult<void> {
    return this.controller.enter(preferredId);
  }

  public setActiveArch(arch: ClinicalArchRole): ClinicalResult<void> {
    return this.controller.setActiveArch(arch);
  }

  public setStrategy(strategy: CloseBaseStrategyId): ClinicalResult<void> {
    return this.controller.setStrategy(strategy);
  }

  public setParameters(
    partial: Partial<ClinicalCloseBaseParameters> & { readonly offset?: number }
  ): ClinicalResult<void> {
    return this.controller.setParameters(partial);
  }

  public bumpHeight(delta: number): ClinicalResult<void> {
    return this.controller.bumpHeight(delta);
  }

  public bumpThickness(delta: number): ClinicalResult<void> {
    return this.controller.bumpThickness(delta);
  }

  public bumpMargin(delta: number): ClinicalResult<void> {
    return this.controller.bumpMargin(delta);
  }

  public bumpOffset(delta: number): ClinicalResult<void> {
    return this.controller.bumpOffset(delta);
  }

  public cycleOrientation(): ClinicalResult<void> {
    return this.controller.cycleOrientation();
  }

  public toggleSmoothing(): ClinicalResult<void> {
    return this.controller.toggleSmoothing();
  }

  public reset(): ClinicalResult<void> {
    return this.controller.reset();
  }

  public validate(): ClinicalResult<void> {
    return this.controller.validate(false);
  }

  public preview() {
    return this.controller.preview();
  }

  public enterManualMode(): ClinicalResult<void> {
    return this.controller.enterManualMode();
  }

  public autoCloseBase() {
    return this.controller.autoCloseBase();
  }

  public submit() {
    return this.controller.submit();
  }

  public accept() {
    return this.controller.accept();
  }

  public cancel(): ClinicalResult<void> {
    return this.controller.cancel();
  }

  public undo(): ClinicalResult<void> {
    return this.controller.undo();
  }

  public redo(): ClinicalResult<void> {
    return this.controller.redo();
  }

  public isActive(): boolean {
    return this.controller.isActive();
  }

  public getToolStatus() {
    return this.controller.getToolStatus();
  }

  public dispose(): void {
    this.controller.dispose();
  }
}
