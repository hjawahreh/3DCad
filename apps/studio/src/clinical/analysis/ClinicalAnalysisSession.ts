/**
 * Analysis session state — non-destructive observational tool state.
 */

import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import type { ToothInstancePrediction } from '../segmentation/prediction/types.js';
import type { AnalysisVec3, ClinicalAnalysisResult } from './types.js';
import { ClinicalAnalysisWorkflow, type AnalysisPhase } from './ClinicalAnalysisWorkflow.js';

export type AnalysisMode = 'inspect' | 'distance' | 'angle' | 'tooth' | 'arch';

export interface AnalysisPickPoint {
  readonly point: AnalysisVec3;
  readonly objectId: string;
  readonly vertexIndex?: number | undefined;
}

export interface AnalysisSessionState {
  readonly phase: AnalysisPhase;
  readonly mode: AnalysisMode;
  readonly targetObjectId: ClinicalObjectId | undefined;
  readonly sourceRevision: number;
  readonly segmentationRevision: number | undefined;
  readonly geometryFingerprint: string | undefined;
  readonly toothSnapshot: readonly ToothInstancePrediction[] | undefined;
  readonly picks: readonly AnalysisPickPoint[];
  readonly lastResult: ClinicalAnalysisResult | undefined;
  readonly savedResults: readonly ClinicalAnalysisResult[];
  readonly selectedInstanceId: string | undefined;
  readonly statusMessage: string;
  readonly revision: number;
}

export class ClinicalAnalysisSession {
  private readonly workflow = new ClinicalAnalysisWorkflow();
  private readonly listeners = new Set<() => void>();
  private mode: AnalysisMode = 'inspect';
  private targetObjectId: ClinicalObjectId | undefined;
  private sourceRevision = 0;
  private segmentationRevision: number | undefined;
  private geometryFingerprint: string | undefined;
  private toothSnapshot: readonly ToothInstancePrediction[] | undefined;
  private picks: AnalysisPickPoint[] = [];
  private lastResult: ClinicalAnalysisResult | undefined;
  private savedResults: ClinicalAnalysisResult[] = [];
  private selectedInstanceId: string | undefined;
  private statusMessage = 'Analysis idle';
  private revision = 0;
  private cachedState: AnalysisSessionState = this.buildState();

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getWorkflow(): ClinicalAnalysisWorkflow {
    return this.workflow;
  }

  public getState(): AnalysisSessionState {
    return this.cachedState;
  }

  private buildState(): AnalysisSessionState {
    return Object.freeze({
      phase: this.workflow.getPhase(),
      mode: this.mode,
      targetObjectId: this.targetObjectId,
      sourceRevision: this.sourceRevision,
      segmentationRevision: this.segmentationRevision,
      geometryFingerprint: this.geometryFingerprint,
      toothSnapshot: this.toothSnapshot,
      picks: Object.freeze([...this.picks]),
      lastResult: this.lastResult,
      savedResults: Object.freeze([...this.savedResults]),
      selectedInstanceId: this.selectedInstanceId,
      statusMessage: this.statusMessage,
      revision: this.revision
    });
  }

  public begin(input: {
    readonly targetObjectId: ClinicalObjectId;
    readonly sourceRevision: number;
    readonly segmentationRevision: number | undefined;
    readonly geometryFingerprint: string | undefined;
    readonly toothSnapshot: readonly ToothInstancePrediction[] | undefined;
  }): boolean {
    this.workflow.reset();
    if (!this.workflow.transition('active')) {
      return false;
    }
    this.targetObjectId = input.targetObjectId;
    this.sourceRevision = input.sourceRevision;
    this.segmentationRevision = input.segmentationRevision;
    this.geometryFingerprint = input.geometryFingerprint;
    this.toothSnapshot =
      input.toothSnapshot === undefined
        ? undefined
        : Object.freeze(input.toothSnapshot.map((t) => Object.freeze({ ...t })));
    this.picks = [];
    this.lastResult = undefined;
    this.selectedInstanceId = undefined;
    this.mode = 'inspect';
    this.statusMessage = 'Analysis active — select a measurement or tooth.';
    this.bump();
    return true;
  }

  public setMode(mode: AnalysisMode, status?: string): void {
    this.mode = mode;
    this.picks = [];
    if (mode === 'distance') {
      this.workflow.transition('measuring-distance');
      this.statusMessage = status ?? 'Select two points to measure distance.';
    } else if (mode === 'angle') {
      this.workflow.transition('measuring-angle');
      this.statusMessage = status ?? 'Select three points (A, vertex, B).';
    } else {
      this.workflow.transition('active');
      this.statusMessage = status ?? 'Analysis active';
    }
    this.bump();
  }

  public addPick(pick: AnalysisPickPoint): void {
    this.picks = Object.freeze([...this.picks, Object.freeze(pick)]) as AnalysisPickPoint[];
    this.bump();
  }

  public clearPicks(): void {
    this.picks = [];
    this.bump();
  }

  public setResult(result: ClinicalAnalysisResult): void {
    this.lastResult = result;
    this.workflow.transition('reviewing');
    this.statusMessage = `Result: ${result.validity}`;
    this.bump();
  }

  public saveLastResult(): boolean {
    if (this.lastResult === undefined) {
      return false;
    }
    this.savedResults = Object.freeze([
      ...this.savedResults,
      this.lastResult
    ]) as ClinicalAnalysisResult[];
    this.statusMessage = 'Analysis result saved (metadata only — geometry unchanged).';
    this.bump();
    return true;
  }

  public selectInstance(id: string | undefined): void {
    this.selectedInstanceId = id;
    this.bump();
  }

  public cancel(): void {
    this.workflow.transition('cancelled');
    this.workflow.transition('idle');
    this.picks = [];
    this.lastResult = undefined;
    this.statusMessage = 'Analysis cancelled';
    this.targetObjectId = undefined;
    this.bump();
  }

  public resetIdle(): void {
    this.workflow.reset();
    this.bump();
  }

  private bump(): void {
    this.revision += 1;
    this.cachedState = this.buildState();
    for (const listener of this.listeners) {
      listener();
    }
  }
}
