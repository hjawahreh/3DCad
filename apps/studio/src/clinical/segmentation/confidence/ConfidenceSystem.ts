/**
 * Confidence helpers + optional calibration tracking (architecture support).
 */

import { confidenceBand, type ConfidenceBand } from '../prediction/types.js';

export interface CalibrationSample {
  readonly predicted: number;
  readonly correct: boolean;
  readonly at: number;
}

export class ConfidenceCalibrationTracker {
  private readonly samples: CalibrationSample[] = [];

  public record(predicted: number, correct: boolean, at = Date.now()): void {
    this.samples.push(Object.freeze({ predicted, correct, at }));
  }

  public reliabilityBins(binCount = 5): readonly {
    readonly lo: number;
    readonly hi: number;
    readonly meanPredicted: number;
    readonly empiricalAccuracy: number;
    readonly count: number;
  }[] {
    const bins = Array.from({ length: binCount }, (_, i) => ({
      lo: i / binCount,
      hi: (i + 1) / binCount,
      sumPred: 0,
      correct: 0,
      count: 0
    }));
    for (const s of this.samples) {
      const idx = Math.min(binCount - 1, Math.floor(s.predicted * binCount));
      const b = bins[idx]!;
      b.sumPred += s.predicted;
      b.count += 1;
      if (s.correct) b.correct += 1;
    }
    return Object.freeze(
      bins.map((b) =>
        Object.freeze({
          lo: b.lo,
          hi: b.hi,
          meanPredicted: b.count === 0 ? 0 : b.sumPred / b.count,
          empiricalAccuracy: b.count === 0 ? 0 : b.correct / b.count,
          count: b.count
        })
      )
    );
  }

  public calibrationError(): number {
    const bins = this.reliabilityBins();
    let err = 0;
    let n = 0;
    for (const b of bins) {
      if (b.count === 0) continue;
      err += Math.abs(b.meanPredicted - b.empiricalAccuracy) * b.count;
      n += b.count;
    }
    return n === 0 ? 0 : err / n;
  }

  public snapshot() {
    return Object.freeze({
      samples: this.samples.length,
      calibrationError: this.calibrationError(),
      bins: this.reliabilityBins()
    });
  }
}

export const describeConfidence = (value: number): { band: ConfidenceBand; label: string } => {
  const band = confidenceBand(value);
  // Documented thresholds (prediction/types.ts confidenceBand):
  // high ≥ 0.85 → High; moderate ≥ 0.65 → Medium; low ≥ 0.4 → Low; else Needs review
  const label =
    band === 'high'
      ? 'High'
      : band === 'moderate'
        ? 'Medium'
        : band === 'low'
          ? 'Low'
          : 'Needs review';
  return { band, label };
};
