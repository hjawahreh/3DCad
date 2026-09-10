/**
 * Clinical geometry metrics collector — timings and mesh size samples only.
 */

export interface ClinicalGeometryMeshSizeSample {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly at: number;
}

export interface ClinicalGeometryMetricsSnapshot {
  readonly lastMesh: ClinicalGeometryMeshSizeSample | undefined;
  readonly meshSamples: number;
  readonly preprocessingMsTotal: number;
  readonly preprocessingSamples: number;
  readonly validationMsTotal: number;
  readonly validationSamples: number;
  readonly spatialIndexBuildMsTotal: number;
  readonly spatialIndexBuildSamples: number;
  readonly previewGenerationMsTotal: number;
  readonly previewGenerationSamples: number;
  readonly finalOperationMsTotal: number;
  readonly finalOperationSamples: number;
  readonly memoryEstimateBytesTotal: number;
  readonly memoryEstimateSamples: number;
  readonly peakMemoryEstimateBytes: number;
  readonly commitMsTotal: number;
  readonly commitSamples: number;
  readonly sceneRepublishMsTotal: number;
  readonly sceneRepublishSamples: number;
  readonly averagePreprocessingMs: number;
  readonly averageValidationMs: number;
  readonly averageSpatialIndexBuildMs: number;
  readonly averagePreviewGenerationMs: number;
  readonly averageFinalOperationMs: number;
  readonly averageMemoryEstimateBytes: number;
  readonly averageCommitMs: number;
  readonly averageSceneRepublishMs: number;
}

const average = (total: number, samples: number): number =>
  samples === 0 ? 0 : total / samples;

export class ClinicalGeometryMetrics {
  private lastMesh: ClinicalGeometryMeshSizeSample | undefined;
  private meshSamples = 0;
  private preprocessingMsTotal = 0;
  private preprocessingSamples = 0;
  private validationMsTotal = 0;
  private validationSamples = 0;
  private spatialIndexBuildMsTotal = 0;
  private spatialIndexBuildSamples = 0;
  private previewGenerationMsTotal = 0;
  private previewGenerationSamples = 0;
  private finalOperationMsTotal = 0;
  private finalOperationSamples = 0;
  private memoryEstimateBytesTotal = 0;
  private memoryEstimateSamples = 0;
  private peakMemoryEstimateBytes = 0;
  private commitMsTotal = 0;
  private commitSamples = 0;
  private sceneRepublishMsTotal = 0;
  private sceneRepublishSamples = 0;

  public recordMeshSize(
    vertexCount: number,
    triangleCount: number,
    at = Date.now()
  ): void {
    this.meshSamples += 1;
    this.lastMesh = Object.freeze({ vertexCount, triangleCount, at });
  }

  public recordPreprocessing(durationMs: number): void {
    this.preprocessingMsTotal += durationMs;
    this.preprocessingSamples += 1;
  }

  public recordValidation(durationMs: number): void {
    this.validationMsTotal += durationMs;
    this.validationSamples += 1;
  }

  public recordSpatialIndexBuild(durationMs: number): void {
    this.spatialIndexBuildMsTotal += durationMs;
    this.spatialIndexBuildSamples += 1;
  }

  public recordPreviewGeneration(durationMs: number): void {
    this.previewGenerationMsTotal += durationMs;
    this.previewGenerationSamples += 1;
  }

  public recordFinalOperation(durationMs: number): void {
    this.finalOperationMsTotal += durationMs;
    this.finalOperationSamples += 1;
  }

  public recordMemoryEstimate(bytes: number): void {
    this.memoryEstimateBytesTotal += bytes;
    this.memoryEstimateSamples += 1;
    if (bytes > this.peakMemoryEstimateBytes) {
      this.peakMemoryEstimateBytes = bytes;
    }
  }

  public recordCommit(durationMs: number): void {
    this.commitMsTotal += durationMs;
    this.commitSamples += 1;
  }

  public recordSceneRepublish(durationMs: number): void {
    this.sceneRepublishMsTotal += durationMs;
    this.sceneRepublishSamples += 1;
  }

  public snapshot(): ClinicalGeometryMetricsSnapshot {
    return Object.freeze({
      lastMesh: this.lastMesh,
      meshSamples: this.meshSamples,
      preprocessingMsTotal: this.preprocessingMsTotal,
      preprocessingSamples: this.preprocessingSamples,
      validationMsTotal: this.validationMsTotal,
      validationSamples: this.validationSamples,
      spatialIndexBuildMsTotal: this.spatialIndexBuildMsTotal,
      spatialIndexBuildSamples: this.spatialIndexBuildSamples,
      previewGenerationMsTotal: this.previewGenerationMsTotal,
      previewGenerationSamples: this.previewGenerationSamples,
      finalOperationMsTotal: this.finalOperationMsTotal,
      finalOperationSamples: this.finalOperationSamples,
      memoryEstimateBytesTotal: this.memoryEstimateBytesTotal,
      memoryEstimateSamples: this.memoryEstimateSamples,
      peakMemoryEstimateBytes: this.peakMemoryEstimateBytes,
      commitMsTotal: this.commitMsTotal,
      commitSamples: this.commitSamples,
      sceneRepublishMsTotal: this.sceneRepublishMsTotal,
      sceneRepublishSamples: this.sceneRepublishSamples,
      averagePreprocessingMs: average(this.preprocessingMsTotal, this.preprocessingSamples),
      averageValidationMs: average(this.validationMsTotal, this.validationSamples),
      averageSpatialIndexBuildMs: average(
        this.spatialIndexBuildMsTotal,
        this.spatialIndexBuildSamples
      ),
      averagePreviewGenerationMs: average(
        this.previewGenerationMsTotal,
        this.previewGenerationSamples
      ),
      averageFinalOperationMs: average(this.finalOperationMsTotal, this.finalOperationSamples),
      averageMemoryEstimateBytes: average(
        this.memoryEstimateBytesTotal,
        this.memoryEstimateSamples
      ),
      averageCommitMs: average(this.commitMsTotal, this.commitSamples),
      averageSceneRepublishMs: average(this.sceneRepublishMsTotal, this.sceneRepublishSamples)
    });
  }
}
