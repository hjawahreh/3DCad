/**
 * Decides whether a prepared frame should be presented.
 * Separates simulation/update pacing from swap presentation.
 */
export class PresentationScheduler {
  private presentRequested = false;

  public requestPresent(): void {
    this.presentRequested = true;
  }

  public shouldPresent(): boolean {
    return this.presentRequested;
  }

  public consumePresent(): boolean {
    const value = this.presentRequested;
    this.presentRequested = false;
    return value;
  }

  public clear(): void {
    this.presentRequested = false;
  }
}
