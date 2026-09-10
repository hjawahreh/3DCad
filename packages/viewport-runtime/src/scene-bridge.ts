import type { SceneSnapshot } from '@cad-studio/scene';

/**
 * SceneBridge acquires and holds immutable SceneSnapshots for the frame pipeline.
 * Does not project documents and does not mutate Scene.
 * Ownership: session-owned; snapshot references are immutable values.
 */
export class SceneBridge {
  private snapshot: SceneSnapshot | undefined;
  private acquisitionCount = 0;

  public publish(snapshot: SceneSnapshot): void {
    this.snapshot = snapshot;
  }

  public clear(): void {
    this.snapshot = undefined;
  }

  public acquire(): SceneSnapshot | undefined {
    this.acquisitionCount += 1;
    return this.snapshot;
  }

  public peek(): SceneSnapshot | undefined {
    return this.snapshot;
  }

  public getAcquisitionCount(): number {
    return this.acquisitionCount;
  }

  public sceneRevision(): number | undefined {
    return this.snapshot?.sceneRevision;
  }

  public documentRevision(): number | undefined {
    return this.snapshot?.documentRevision;
  }
}
