export interface RetryPolicyConfig {
  readonly maxAttempts: number;
  readonly retryOn: ReadonlySet<string>;
}

export const DEFAULT_RETRY_POLICY: RetryPolicyConfig = {
  maxAttempts: 1,
  retryOn: new Set(['unavailable', 'timeout'])
};

/** Decides whether a failed kernel/validation attempt may be retried. */
export class RetryPolicy {
  public constructor(private readonly config: RetryPolicyConfig = DEFAULT_RETRY_POLICY) {}

  public get maxAttempts(): number {
    return Math.max(1, this.config.maxAttempts);
  }

  public shouldRetry(attempt: number, errorCode: string): boolean {
    if (attempt >= this.maxAttempts) {
      return false;
    }
    return this.config.retryOn.has(errorCode);
  }
}
