/**
 * ClinicalOrientationRuntime — clinical façade for orientation workflow.
 */

import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalResult } from '../runtime/types.js';
import { ClinicalOrientationController } from './ClinicalOrientationController.js';
import type {
  OrientationIncrement,
  OrientationMode
} from './ClinicalOrientationState.js';

export class ClinicalOrientationRuntime {
  public readonly controller: ClinicalOrientationController;

  public constructor(session: ClinicalSession, sceneBuilder: ClinicalSceneBuilder) {
    this.controller = new ClinicalOrientationController(session, sceneBuilder);
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

  public get gizmo() {
    return this.controller.gizmo;
  }

  public enter(preferredId?: ClinicalObjectId): ClinicalResult<void> {
    return this.controller.enter(preferredId);
  }

  public setMode(mode: OrientationMode): ClinicalResult<void> {
    return this.controller.setMode(mode);
  }

  public setIncrement(degrees: OrientationIncrement): ClinicalResult<void> {
    return this.controller.setIncrement(degrees);
  }

  public rotateBy(degrees: number, axis?: 'x' | 'y' | 'z' | 'free'): ClinicalResult<void> {
    return this.controller.rotateBy(degrees, axis);
  }

  public rotateIncremental(sign?: 1 | -1): ClinicalResult<void> {
    return this.controller.rotateIncremental(sign);
  }

  public snap(): ClinicalResult<void> {
    return this.controller.snap();
  }

  public reset(): ClinicalResult<void> {
    return this.controller.resetOrientation();
  }

  public accept(): ClinicalResult<void> {
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
