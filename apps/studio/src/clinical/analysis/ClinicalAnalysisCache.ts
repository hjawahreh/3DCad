/**
 * Analysis result cache — revision + algorithm version keyed.
 */

import type { AnalysisTypeId, ClinicalAnalysisResult } from './types.js';

export interface AnalysisCacheKey {
  readonly analysisType: AnalysisTypeId;
  readonly sourceRevision: number;
  readonly segmentationRevision: number | undefined;
  readonly geometryFingerprint: string | undefined;
  readonly algorithmVersion: string;
  readonly parametersHash: string;
}

export const hashParameters = (params: Readonly<Record<string, unknown>>): string => {
  const keys = Object.keys(params).sort();
  return keys.map((k) => `${k}=${JSON.stringify(params[k])}`).join('&');
};

export const cacheKeyString = (key: AnalysisCacheKey): string =>
  [
    key.analysisType,
    String(key.sourceRevision),
    key.segmentationRevision === undefined ? '-' : String(key.segmentationRevision),
    key.geometryFingerprint ?? '-',
    key.algorithmVersion,
    key.parametersHash
  ].join('|');

export class ClinicalAnalysisCache {
  private readonly map = new Map<string, ClinicalAnalysisResult>();

  public get(key: AnalysisCacheKey): ClinicalAnalysisResult | undefined {
    return this.map.get(cacheKeyString(key));
  }

  public set(key: AnalysisCacheKey, result: ClinicalAnalysisResult): void {
    this.map.set(cacheKeyString(key), result);
  }

  public invalidateForRevision(sourceRevision: number): void {
    for (const [k, v] of this.map) {
      if (v.sourceRevision !== sourceRevision) {
        this.map.delete(k);
      }
    }
  }

  public clear(): void {
    this.map.clear();
  }

  public size(): number {
    return this.map.size;
  }
}
