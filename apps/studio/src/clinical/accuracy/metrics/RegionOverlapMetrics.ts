/**
 * CLN-001A — region / set overlap metrics (precision, recall, F1, Dice).
 */

export interface BinaryOverlapStats {
  readonly truePositive: number;
  readonly falsePositive: number;
  readonly falseNegative: number;
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  readonly dice: number;
}

export const binaryOverlapFromSets = (
  predicted: ReadonlySet<number>,
  reference: ReadonlySet<number>
): BinaryOverlapStats => {
  let tp = 0;
  for (const id of predicted) {
    if (reference.has(id)) tp += 1;
  }
  const fp = predicted.size - tp;
  const fn = reference.size - tp;
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const dice = 2 * tp + fp + fn === 0 ? 0 : (2 * tp) / (2 * tp + fp + fn);
  return Object.freeze({
    truePositive: tp,
    falsePositive: fp,
    falseNegative: fn,
    precision,
    recall,
    f1,
    dice
  });
};
