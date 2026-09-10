/**
 * Notification host model — progress / error / info toasts for the shell.
 */

export type NotificationKind = 'info' | 'success' | 'warning' | 'error' | 'progress';

export interface StudioNotification {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly message: string;
  readonly progress?: number;
  readonly createdAt: number;
}

export type NotificationListener = (items: readonly StudioNotification[]) => void;

export class NotificationHost {
  private readonly items: StudioNotification[] = [];
  private cached: readonly StudioNotification[] = Object.freeze([]);
  private readonly listeners = new Set<NotificationListener>();
  private serial = 0;

  public list(): readonly StudioNotification[] {
    return this.cached;
  }

  public push(
    kind: NotificationKind,
    title: string,
    message: string,
    progress?: number
  ): StudioNotification {
    this.serial += 1;
    const item: StudioNotification = Object.freeze({
      id: `n-${String(this.serial)}`,
      kind,
      title,
      message,
      ...(progress !== undefined ? { progress } : {}),
      createdAt: Date.now()
    });
    this.items.unshift(item);
    if (this.items.length > 20) {
      this.items.pop();
    }
    this.emit();
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

  public subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    this.cached = Object.freeze([...this.items]);
    for (const listener of this.listeners) {
      listener(this.cached);
    }
  }
}
