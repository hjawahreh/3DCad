/**
 * Host for transient operation overlays (preview glyphs, guides).
 * Runtime stores opaque overlay descriptors only — no CAD logic, no Three.js.
 */
export interface OperationOverlayDescriptor {
  readonly id: string;
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export class OperationOverlayHost {
  private readonly overlays = new Map<string, OperationOverlayDescriptor>();

  public set(overlay: OperationOverlayDescriptor): void {
    this.overlays.set(
      overlay.id,
      Object.freeze({
        id: overlay.id,
        kind: overlay.kind,
        payload: Object.freeze({ ...overlay.payload })
      })
    );
  }

  public remove(id: string): void {
    this.overlays.delete(id);
  }

  public clear(): void {
    this.overlays.clear();
  }

  public list(): readonly OperationOverlayDescriptor[] {
    return Object.freeze([...this.overlays.values()]);
  }

  public size(): number {
    return this.overlays.size;
  }
}
