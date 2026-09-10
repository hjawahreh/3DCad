/**
 * ClinicalAnalysisRuntime — façade for CLN-010 analysis tool.
 */

import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import type { ClinicalSegmentationRuntime } from '../segmentation/ClinicalSegmentationRuntime.js';
import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalResult } from '../runtime/types.js';
import { ClinicalAnalysisController } from './ClinicalAnalysisController.js';
import type { AnalysisMode } from './ClinicalAnalysisSession.js';
import type { AnalysisVec3, ClinicalAnalysisResult } from './types.js';

export class ClinicalAnalysisRuntime {
  public readonly controller: ClinicalAnalysisController;

  public constructor(
    session: ClinicalSession,
    preparation: ClinicalPreparationRuntime,
    segmentation: ClinicalSegmentationRuntime
  ) {
    this.controller = new ClinicalAnalysisController(session, preparation, segmentation);
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

  public get registry() {
    return this.controller.registry;
  }

  public get cache() {
    return this.controller.cache;
  }

  public enter(preferredId?: ClinicalObjectId): ClinicalResult<void> {
    return this.controller.enter(preferredId);
  }

  public setMode(mode: AnalysisMode): ClinicalResult<void> {
    return this.controller.setMode(mode);
  }

  public pickPoint(
    point: AnalysisVec3,
    objectId: string,
    vertexIndex?: number
  ): ClinicalResult<void> {
    return this.controller.pickPoint(point, objectId, vertexIndex);
  }

  public clearMeasurement(): ClinicalResult<void> {
    return this.controller.clearMeasurement();
  }

  public analyzeTooth(instanceId?: string): ClinicalResult<ClinicalAnalysisResult> {
    return this.controller.analyzeTooth(instanceId);
  }

  public analyzeArch(): ClinicalResult<ClinicalAnalysisResult> {
    return this.controller.analyzeArch();
  }

  public analyzeSpacing(): ClinicalResult<ClinicalAnalysisResult> {
    return this.controller.analyzeSpacing();
  }

  public analyzeCrowding(): ClinicalResult<ClinicalAnalysisResult> {
    return this.controller.analyzeCrowding();
  }

  public analyzeOcclusion(): ClinicalResult<ClinicalAnalysisResult> {
    return this.controller.analyzeOcclusion();
  }

  public analyzeCollision(): ClinicalResult<ClinicalAnalysisResult> {
    return this.controller.analyzeCollision();
  }

  public analyzeBolton(): ClinicalResult<ClinicalAnalysisResult> {
    return this.controller.analyzeBolton();
  }

  public saveResult(): ClinicalResult<void> {
    return this.controller.saveResult();
  }

  public cancel(): ClinicalResult<void> {
    return this.controller.cancel();
  }

  public selectInstance(id: string | undefined): ClinicalResult<void> {
    return this.controller.selectInstance(id);
  }

  public isActive(): boolean {
    return this.controller.isActive();
  }

  public meshFingerprint(objectId: string): string | undefined {
    return this.controller.meshFingerprint(objectId);
  }

  public dispose(): void {
    this.controller.dispose();
  }
}
