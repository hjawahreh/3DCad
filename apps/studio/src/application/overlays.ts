/**
 * Modal / dialog host models for Studio shell overlays.
 */

export interface StudioModal {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
}

export interface StudioDialog {
  readonly id: string;
  readonly title: string;
  readonly kind:
    | 'import'
    | 'settings'
    | 'diagnostics'
    | 'about'
    | 'open-project'
    | 'new-case'
    | 'open-case';
}

export type ModalListener = (modal: StudioModal | undefined) => void;
export type DialogListener = (dialog: StudioDialog | undefined) => void;

export class ModalHost {
  private modal: StudioModal | undefined;
  private readonly listeners = new Set<ModalListener>();
  private serial = 0;

  public get(): StudioModal | undefined {
    return this.modal;
  }

  public open(input: Omit<StudioModal, 'id'>): StudioModal {
    this.serial += 1;
    this.modal = Object.freeze({ ...input, id: `modal-${String(this.serial)}` });
    this.emit();
    return this.modal;
  }

  public close(): void {
    this.modal = undefined;
    this.emit();
  }

  public subscribe(listener: ModalListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.modal);
    }
  }
}

export class DialogHost {
  private dialog: StudioDialog | undefined;
  private readonly listeners = new Set<DialogListener>();
  private serial = 0;

  public get(): StudioDialog | undefined {
    return this.dialog;
  }

  public open(kind: StudioDialog['kind'], title: string): StudioDialog {
    this.serial += 1;
    this.dialog = Object.freeze({
      id: `dialog-${String(this.serial)}`,
      kind,
      title
    });
    this.emit();
    return this.dialog;
  }

  public close(): void {
    this.dialog = undefined;
    this.emit();
  }

  public subscribe(listener: DialogListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.dialog);
    }
  }
}
