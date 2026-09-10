/**
 * Analysis provider contract + registry.
 */

import type { ClinicalAnalysisResult, AnalysisTypeId } from '../types.js';

export interface AnalysisProviderContext {
  readonly now: number;
  readonly sourceRevision: number;
  readonly segmentationRevision: number | undefined;
  readonly geometryFingerprint: string | undefined;
  readonly sourceObjectId: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface ClinicalAnalysisProvider {
  readonly id: AnalysisTypeId;
  readonly displayName: string;
  readonly algorithmVersion: string;
  readonly operational: boolean;
  run(context: AnalysisProviderContext): ClinicalAnalysisResult;
}

export class ClinicalAnalysisRegistry {
  private readonly providers = new Map<AnalysisTypeId, ClinicalAnalysisProvider>();

  public register(provider: ClinicalAnalysisProvider): void {
    this.providers.set(provider.id, provider);
  }

  public get(id: AnalysisTypeId): ClinicalAnalysisProvider | undefined {
    return this.providers.get(id);
  }

  public list(): readonly ClinicalAnalysisProvider[] {
    return Object.freeze([...this.providers.values()]);
  }

  public listOperational(): readonly ClinicalAnalysisProvider[] {
    return Object.freeze([...this.providers.values()].filter((p) => p.operational));
  }
}
