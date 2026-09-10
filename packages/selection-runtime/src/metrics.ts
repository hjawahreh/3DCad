export interface SelectionMetricsSnapshot {
  readonly selectionCount: number;
  readonly selectionChanges: number;
  readonly clipboardOperations: number;
  readonly historyEntries: number;
  readonly policyViolations: number;
}

export class SelectionMetrics {
  private selectionCount = 0;
  private selectionChanges = 0;
  private clipboardOperations = 0;
  private historyEntries = 0;
  private policyViolations = 0;

  public recordCommit(count: number): void {
    this.selectionCount = count;
    this.selectionChanges += 1;
  }

  public recordClipboard(): void {
    this.clipboardOperations += 1;
  }

  public recordHistory(): void {
    this.historyEntries += 1;
  }

  public recordPolicyViolation(count = 1): void {
    this.policyViolations += count;
  }

  public snapshot(): SelectionMetricsSnapshot {
    return Object.freeze({
      selectionCount: this.selectionCount,
      selectionChanges: this.selectionChanges,
      clipboardOperations: this.clipboardOperations,
      historyEntries: this.historyEntries,
      policyViolations: this.policyViolations
    });
  }

  public reset(): void {
    this.selectionCount = 0;
    this.selectionChanges = 0;
    this.clipboardOperations = 0;
    this.historyEntries = 0;
    this.policyViolations = 0;
  }
}
