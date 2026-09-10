export interface ImportConfiguration {
  readonly maxConcurrentSessions: number;
  readonly allowDuplicateRequests: boolean;
  readonly defaultPriority: number;
  readonly progressThrottleMs: number;
}

export const DEFAULT_IMPORT_CONFIGURATION: ImportConfiguration = Object.freeze({
  maxConcurrentSessions: 8,
  allowDuplicateRequests: false,
  defaultPriority: 100,
  progressThrottleMs: 16
});

export const resolveImportConfiguration = (
  partial: Partial<ImportConfiguration> = {}
): ImportConfiguration =>
  Object.freeze({
    maxConcurrentSessions:
      partial.maxConcurrentSessions ?? DEFAULT_IMPORT_CONFIGURATION.maxConcurrentSessions,
    allowDuplicateRequests:
      partial.allowDuplicateRequests ?? DEFAULT_IMPORT_CONFIGURATION.allowDuplicateRequests,
    defaultPriority: partial.defaultPriority ?? DEFAULT_IMPORT_CONFIGURATION.defaultPriority,
    progressThrottleMs:
      partial.progressThrottleMs ?? DEFAULT_IMPORT_CONFIGURATION.progressThrottleMs
  });
