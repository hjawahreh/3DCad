/**
 * ClinicalMeshPicker — studio-owned surface picking registry.
 * ClinicalMeshViewport registers a raycaster; Trim (and others) consume hits.
 * Does not own camera or geometry algorithms beyond Three.js intersection.
 */

export interface ClinicalMeshPickHit {
  readonly objectId: string;
  readonly screenX: number;
  readonly screenY: number;
  readonly worldX: number;
  readonly worldY: number;
  readonly worldZ: number;
  /** Mesh-local 3D hit (authoritative for kernel / VTK loop3d). */
  readonly localX: number;
  readonly localY: number;
  readonly localZ: number;
  /** Mesh-local U/V on the inferred trim projection plane (AABB shortest = normal). */
  readonly meshX: number;
  readonly meshY: number;
  readonly faceIndex: number | undefined;
}

export type ClinicalMeshPickFn = (input: {
  readonly screenX: number;
  readonly screenY: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly preferredObjectId?: string;
}) => ClinicalMeshPickHit | undefined;

export class ClinicalMeshPicker {
  private pickFn: ClinicalMeshPickFn | undefined;
  private lastHit: ClinicalMeshPickHit | undefined;

  public register(fn: ClinicalMeshPickFn): () => void {
    this.pickFn = fn;
    return () => {
      if (this.pickFn === fn) {
        this.pickFn = undefined;
      }
    };
  }

  public pick(input: {
    readonly screenX: number;
    readonly screenY: number;
    readonly canvasWidth: number;
    readonly canvasHeight: number;
    readonly preferredObjectId?: string;
  }): ClinicalMeshPickHit | undefined {
    const hit = this.pickFn?.(input);
    this.lastHit = hit;
    return hit;
  }

  public getLastHit(): ClinicalMeshPickHit | undefined {
    return this.lastHit;
  }

  public isReady(): boolean {
    return this.pickFn !== undefined;
  }
}
