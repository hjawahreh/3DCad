/**
 * ClinicalTrimRuntime — clinical façade for production trim tool.
 */

import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { ClinicalMeshPicker } from '../display/ClinicalMeshPicker.js';
import type { ClinicalViewportRuntime } from '../display/ClinicalViewportRuntime.js';
import type { ClinicalArchContext } from '../shell/ClinicalArchContext.js';
import type { ClinicalResult } from '../runtime/types.js';
import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import { ClinicalTrimController } from './ClinicalTrimController.js';
import type { TrimDrawMode } from './ClinicalTrimState.js';
import type { TrimBoundaryPoint } from './ClinicalTrimBoundaryMath.js';
import type { ClinicalArchVisibilityMode } from '../shell/ClinicalArchContext.js';

export class ClinicalTrimRuntime {
  public readonly controller: ClinicalTrimController;

  public constructor(
    session: ClinicalSession,
    preparation: ClinicalPreparationRuntime,
    sceneBuilder: ClinicalSceneBuilder,
    meshPicker?: ClinicalMeshPicker,
    viewport?: ClinicalViewportRuntime,
    archContext?: ClinicalArchContext
  ) {
    this.controller = new ClinicalTrimController(
      session,
      preparation,
      sceneBuilder,
      meshPicker,
      viewport,
      archContext
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

  public get manager() {
    return this.controller.manager;
  }

  public enter(preferredId?: ClinicalObjectId): ClinicalResult<void> {
    return this.controller.enter(preferredId);
  }

  public setActiveArch(arch: 'upper' | 'lower'): ClinicalResult<void> {
    return this.controller.setActiveArch(arch);
  }

  public setArchVisibility(mode: ClinicalArchVisibilityMode): ClinicalResult<void> {
    return this.controller.setArchVisibility(mode);
  }

  public setDrawMode(mode: TrimDrawMode): ClinicalResult<void> {
    return this.controller.setDrawMode(mode);
  }

  public addPoint(point: TrimBoundaryPoint): ClinicalResult<void> {
    return this.controller.addPoint(point);
  }

  public undoPoint(): ClinicalResult<void> {
    return this.controller.undoPoint();
  }

  public clearBoundary(): ClinicalResult<void> {
    return this.controller.clearBoundary();
  }

  public resetDrawing(): ClinicalResult<void> {
    return this.controller.resetDrawing();
  }

  public closeBoundary(): ClinicalResult<void> {
    return this.controller.closeBoundary();
  }

  public validate(): ClinicalResult<void> {
    return this.controller.validate();
  }

  public submit() {
    return this.controller.submit();
  }

  public preview() {
    return this.controller.preview();
  }

  public completeGestureAndTrim() {
    return this.controller.completeGestureAndTrim();
  }

  public accept() {
    return this.controller.accept();
  }

  public cancelPreview(): ClinicalResult<void> {
    return this.controller.cancelPreview();
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

  public isEditingReady(): boolean {
    return this.controller.isEditingReady();
  }

  public getEditingReadyMessage(): string | undefined {
    return this.controller.getEditingReadyMessage();
  }

  public dispose(): void {
    this.controller.dispose();
  }
}
