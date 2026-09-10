export type SelectionPolicyMode = 'single' | 'multi';

export interface SelectionConfiguration {
  readonly policyMode: SelectionPolicyMode;
  readonly maxSelectionSize: number;
  readonly suppressDuplicates: boolean;
  readonly rejectEmptyIds: boolean;
  readonly historyLimit: number;
  readonly enableClipboard: boolean;
}

export const DEFAULT_SELECTION_CONFIGURATION: SelectionConfiguration = Object.freeze({
  policyMode: 'multi',
  maxSelectionSize: 10_000,
  suppressDuplicates: true,
  rejectEmptyIds: true,
  historyLimit: 128,
  enableClipboard: true
});

export const resolveSelectionConfiguration = (
  partial: Partial<SelectionConfiguration> = {}
): SelectionConfiguration =>
  Object.freeze({
    policyMode: partial.policyMode ?? DEFAULT_SELECTION_CONFIGURATION.policyMode,
    maxSelectionSize:
      partial.maxSelectionSize ?? DEFAULT_SELECTION_CONFIGURATION.maxSelectionSize,
    suppressDuplicates:
      partial.suppressDuplicates ?? DEFAULT_SELECTION_CONFIGURATION.suppressDuplicates,
    rejectEmptyIds: partial.rejectEmptyIds ?? DEFAULT_SELECTION_CONFIGURATION.rejectEmptyIds,
    historyLimit: partial.historyLimit ?? DEFAULT_SELECTION_CONFIGURATION.historyLimit,
    enableClipboard: partial.enableClipboard ?? DEFAULT_SELECTION_CONFIGURATION.enableClipboard
  });
