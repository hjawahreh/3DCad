/**
 * Notification host model — exactly ONE visible notification at a time.
 * New notifications replace the previous immediately (timers cleared).
 * Ordinary info/success/warning auto-dismiss after 10s; errors stay until dismissed.
 * Progress toasts are replaced by stage updates and do not stack.
 *
 * CRITICAL: getSnapshot (list) MUST return a stable reference when contents
 * are unchanged — otherwise React useSyncExternalStore infinite-loops and
 * blanks the entire clinical UI.
 */

export type NotificationKind = 'info' | 'success' | 'warning' | 'error' | 'progress';

export interface StudioNotification {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly message: string;
  readonly progress?: number;
  readonly createdAt: number;
  /** When set, the host auto-dismisses at this timestamp. */
  readonly expiresAt?: number;
}

export type NotificationListener = (items: readonly StudioNotification[]) => void;

/** Ordinary informational notifications auto-dismiss after 10 seconds. */
const AUTO_DISMISS_MS: Readonly<Partial<Record<NotificationKind, number>>> = Object.freeze({
  success: 10_000,
  info: 10_000,
  warning: 10_000
  // progress / error: no auto-dismiss (progress replaced by next stage or clearProgress)
});

export class NotificationHost {
  private current: StudioNotification | undefined;
  private cached: readonly StudioNotification[] = Object.freeze([]);
  private readonly listeners = new Set<NotificationListener>();
  private serial = 0;
  private expireTimer: ReturnType<typeof setTimeout> | undefined;
  /** Stable identity for an in-flight progress sequence (title-scoped). */
  private progressIdentity: string | undefined;

  /**
   * Stable snapshot for React useSyncExternalStore.
   * Must not allocate a new array when nothing changed.
   */
  public list(): readonly StudioNotification[] {
    return this.cached;
  }

  public push(
    kind: NotificationKind,
    title: string,
    message: string,
    progress?: number
  ): StudioNotification {
    // Reuse stable identity when updating the same progress sequence.
    if (
      kind === 'progress' &&
      this.current !== undefined &&
      this.current.kind === 'progress' &&
      this.current.title === title &&
      this.progressIdentity !== undefined
    ) {
      const updated: StudioNotification = Object.freeze({
        id: this.progressIdentity,
        kind,
        title,
        message,
        ...(progress !== undefined ? { progress } : {}),
        createdAt: this.current.createdAt
      });
      this.clearExpireTimer();
      this.current = updated;
      this.emit();
      return updated;
    }

    this.clearExpireTimer();
    this.serial += 1;
    const id = `n-${String(this.serial)}`;
    if (kind === 'progress') {
      this.progressIdentity = id;
    } else {
      this.progressIdentity = undefined;
    }
    const ttl = AUTO_DISMISS_MS[kind];
    const item: StudioNotification = Object.freeze({
      id,
      kind,
      title,
      message,
      ...(progress !== undefined ? { progress } : {}),
      createdAt: Date.now(),
      ...(ttl === undefined ? {} : { expiresAt: Date.now() + ttl })
    });
    // Exactly one active notification — replace previous immediately.
    this.current = item;
    this.emit();
    this.scheduleExpiry();
    return item;
  }

  public updateProgress(id: string, progress: number, message?: string): void {
    if (this.current === undefined || this.current.id !== id) {
      return;
    }
    this.current = Object.freeze({
      ...this.current,
      progress,
      ...(message !== undefined ? { message } : {})
    });
    this.emit();
  }

  /** Clear a progress toast (e.g. when an operation completes). */
  public clearProgress(title?: string): void {
    if (this.current === undefined || this.current.kind !== 'progress') {
      return;
    }
    if (title !== undefined && this.current.title !== title) {
      return;
    }
    this.clearExpireTimer();
    this.current = undefined;
    this.progressIdentity = undefined;
    this.emit();
  }

  public dismiss(id: string): void {
    if (this.current?.id !== id) {
      return;
    }
    this.clearExpireTimer();
    if (this.progressIdentity === id) {
      this.progressIdentity = undefined;
    }
    this.current = undefined;
    this.emit();
  }

  public clearTransient(): void {
    if (this.current === undefined) {
      return;
    }
    if (this.current.kind === 'error') {
      return;
    }
    this.clearExpireTimer();
    this.current = undefined;
    this.progressIdentity = undefined;
    this.emit();
  }

  public subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private clearExpireTimer(): void {
    if (this.expireTimer !== undefined) {
      clearTimeout(this.expireTimer);
      this.expireTimer = undefined;
    }
  }

  private scheduleExpiry(): void {
    this.clearExpireTimer();
    const expiresAt = this.current?.expiresAt;
    if (expiresAt === undefined) {
      return;
    }
    const delay = Math.max(50, expiresAt - Date.now());
    this.expireTimer = setTimeout(() => {
      if (this.current?.expiresAt !== undefined && this.current.expiresAt <= Date.now()) {
        this.current = undefined;
        this.progressIdentity = undefined;
        this.emit();
      }
    }, delay);
  }

  private emit(): void {
    this.cached =
      this.current === undefined ? Object.freeze([]) : Object.freeze([this.current]);
    for (const listener of this.listeners) {
      listener(this.cached);
    }
  }
}
