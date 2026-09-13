/**
 * ClinicalSegmentationRuntime — façade for segmentation tool.
 */

import type { ClinicalObjectId, ClinicalArchRole } from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import type { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import type { ClinicalResult } from '../runtime/types.js';
import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalMeshPicker } from '../display/ClinicalMeshPicker.js';
import type { ClinicalViewportRuntime } from '../display/ClinicalViewportRuntime.js';
import { ClinicalSegmentationController } from './ClinicalSegmentationController.js';
import type { SegmentationViewMode } from './ClinicalSegmentationSession.js';
import type { FdiNumber } from './fdi/FdiNumbering.js';
import type { SemanticLabel } from './prediction/types.js';

export class ClinicalSegmentationRuntime {
  public readonly controller: ClinicalSegmentationController;

  public constructor(
    session: ClinicalSession,
    preparation: ClinicalPreparationRuntime,
    sceneBuilder: ClinicalSceneBuilder,
    meshPicker?: ClinicalMeshPicker,
    viewport?: ClinicalViewportRuntime
  ) {
    this.controller = new ClinicalSegmentationController(
      session,
      preparation,
      sceneBuilder,
      undefined,
      meshPicker,
      viewport
    );
  }

  public get session() {
    return this.controller.session;
  }

  public get history() {
    return this.controller.history;
  }

  public get registry() {
    return this.controller.registry;
  }

  public get diagnostics() {
    return this.controller.diagnostics;
  }

  public get metrics() {
    return this.controller.metrics;
  }

  public enter(preferredId?: ClinicalObjectId): ClinicalResult<void> {
    return this.controller.enter(preferredId);
  }

  /** One-click: enter tool (if needed) and run inference. */
  public async segmentTeeth(preferredId?: ClinicalObjectId): Promise<ClinicalResult<void>> {
    return this.controller.segmentTeeth(preferredId);
  }

  public setProvider(providerId: string): ClinicalResult<void> {
    return this.controller.setProvider(providerId);
  }

  public setActiveArch(arch: ClinicalArchRole): ClinicalResult<void> {
    return this.controller.setActiveArch(arch);
  }

  public pickToothAt(screen: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }): ClinicalResult<void> {
    return this.controller.pickToothAt(screen);
  }

  public async runInference(): Promise<ClinicalResult<void>> {
    return this.controller.runInference();
  }

  public async accept(): Promise<ClinicalResult<void>> {
    return this.controller.accept();
  }

  public reject(): ClinicalResult<void> {
    return this.controller.reject();
  }

  public cancel(): ClinicalResult<void> {
    return this.controller.cancel();
  }

  public setViewMode(mode: SegmentationViewMode): ClinicalResult<void> {
    return this.controller.setViewMode(mode);
  }

  public selectInstance(id: string | undefined): ClinicalResult<void> {
    return this.controller.selectInstance(id);
  }

  public acknowledgeReview(): ClinicalResult<void> {
    return this.controller.acknowledgeReview();
  }

  public relabelFdi(instanceId: string, fdi: FdiNumber | undefined): ClinicalResult<void> {
    return this.controller.relabelFdi(instanceId, fdi);
  }

  public merge(aId: string, bId: string): ClinicalResult<void> {
    return this.controller.merge(aId, bId);
  }

  public split(instanceId: string, faceSetA: readonly number[]): ClinicalResult<void> {
    return this.controller.split(instanceId, faceSetA);
  }

  public markUnknown(instanceId: string): ClinicalResult<void> {
    return this.controller.markUnknown(instanceId);
  }

  public markMissing(instanceId: string): ClinicalResult<void> {
    return this.controller.markMissing(instanceId);
  }

  public markSemantic(faces: readonly number[], label: SemanticLabel): ClinicalResult<void> {
    return this.controller.markSemantic(faces, label);
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
