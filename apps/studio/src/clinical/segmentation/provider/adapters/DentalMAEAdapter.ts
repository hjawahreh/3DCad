import type { SegmentationProvider, SegmentationProviderCapability } from '../SegmentationProvider.js';
import { createScaffoldProvider } from './ScaffoldProvider.js';

export class DentalMAEAdapter implements SegmentationProvider {
  private readonly inner = createScaffoldProvider(
    Object.freeze({
      id: 'dentalmae',
      displayName: 'DentalMAE (adapter scaffold)',
      modelId: 'dentalmae',
      modelVersion: '0.0.0-scaffold',
      operational: false,
      licenseNotes: 'Research DentalMAE adapter — not operational in CLN-009',
      capabilities: Object.freeze(['semantic', 'gpu', 'cpu'] as SegmentationProviderCapability[])
    })
  );

  public readonly info = this.inner.info;
  public initialize = this.inner.initialize.bind(this.inner);
  public capabilities = this.inner.capabilities.bind(this.inner);
  public validateInput = this.inner.validateInput.bind(this.inner);
  public preprocess = this.inner.preprocess.bind(this.inner);
  public infer = this.inner.infer.bind(this.inner);
  public cancel = this.inner.cancel.bind(this.inner);
  public dispose = this.inner.dispose.bind(this.inner);
}
