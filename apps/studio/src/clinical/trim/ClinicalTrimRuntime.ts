/**
 * ClinicalTrimRuntime — clinical façade for production trim tool.
 */

import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { ClinicalResult } from '../runtime/types.js';
import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import { ClinicalTrimController } from './ClinicalTrimController.js';
import type { TrimDrawMode } from './ClinicalTrimState.js';
import type { TrimBoundaryPoint } from './ClinicalTrimBoundaryMath.js';

export class ClinicalTrimRuntime {
  public readonly controller: ClinicalTrimController;

  public constructor(
    session: ClinicalSession,
    preparation: ClinicalPreparationRuntime,
    sceneBuilder: ClinicalSceneBuilder
  ) {
    this.controller = new ClinicalTrimController(session, preparation, sceneBuilder);
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

  public closeBoundary(): ClinicalResult<void> {
    return this.controller.closeBoundary();
  }

  public validate(): ClinicalResult<void> {
    return this.controller.validate();
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

  public dispose(): void {
    this.controller.dispose();
  }
}
