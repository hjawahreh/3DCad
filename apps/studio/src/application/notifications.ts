/**
 * Notification host model — progress / error / info toasts for the shell.
 * Success/info auto-dismiss; errors/warnings stay until dismissed.
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

const AUTO_DISMISS_MS: Readonly<Partial<Record<NotificationKind, number>>> = Object.freeze({
  success: 3200,
  info: 4000
});

export class NotificationHost {
  private readonly items: StudioNotification[] = [];
  private cached: readonly StudioNotification[] = Object.freeze([]);
  private readonly listeners = new Set<NotificationListener>();
  private serial = 0;
  private expireTimer: ReturnType<typeof setTimeout> | undefined;

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
    this.purgeExpiredSilent();
    // Deduplicate identical active toast (same kind+title+message).
    const duplicate = this.items.find(
      (n) => n.kind === kind && n.title === title && n.message === message
    );
    if (duplicate !== undefined) {
      return duplicate;
    }
    this.serial += 1;
    const ttl = AUTO_DISMISS_MS[kind];
    const item: StudioNotification = Object.freeze({
      id: `n-${String(this.serial)}`,
      kind,
      title,
      message,
      ...(progress !== undefined ? { progress } : {}),
      createdAt: Date.now(),
      ...(ttl === undefined ? {} : { expiresAt: Date.now() + ttl })
    });
    this.items.unshift(item);
    if (this.items.length > 8) {
      this.items.pop();
    }
    this.emit();
    this.scheduleExpiry();
    return item;
  }

  public updateProgress(id: string, progress: number, message?: string): void {
    const index = this.items.findIndex((n) => n.id === id);
    if (index < 0) {
      return;
    }
    const prev = this.items[index];
    if (prev === undefined) {
      return;
    }
    this.items[index] = Object.freeze({
      ...prev,
      progress,
      ...(message !== undefined ? { message } : {})
    });
    this.emit();
  }

  public dismiss(id: string): void {
    const index = this.items.findIndex((n) => n.id === id);
    if (index >= 0) {
      this.items.splice(index, 1);
      this.emit();
    }
  }

  public clearTransient(): void {
    const kept = this.items.filter((n) => n.kind === 'error' || n.kind === 'warning');
    if (kept.length === this.items.length) {
      return;
    }
    this.items.length = 0;
    this.items.push(...kept);
    this.emit();
  }

  public subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Drop expired items without notifying (used before mutating pushes). */
  private purgeExpiredSilent(): void {
    const now = Date.now();
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i];
      if (item?.expiresAt !== undefined && item.expiresAt <= now) {
        this.items.splice(i, 1);
      }
    }
  }

  private purgeExpiredAndEmit(): void {
    const before = this.items.length;
    this.purgeExpiredSilent();
    if (this.items.length !== before) {
      this.emit();
    }
  }

  private scheduleExpiry(): void {
    if (this.expireTimer !== undefined) {
      clearTimeout(this.expireTimer);
      this.expireTimer = undefined;
    }
    const next = this.items
      .map((n) => n.expiresAt)
      .filter((t): t is number => t !== undefined)
      .sort((a, b) => a - b)[0];
    if (next === undefined) {
      return;
    }
    const delay = Math.max(50, next - Date.now());
    this.expireTimer = setTimeout(() => {
      this.purgeExpiredAndEmit();
      this.scheduleExpiry();
    }, delay);
  }

  private emit(): void {
    this.cached = Object.freeze([...this.items]);
    for (const listener of this.listeners) {
      listener(this.cached);
    }
  }
}
