import type { SegmentationProvider, SegmentationProviderCapability } from '../SegmentationProvider.js';
import { createScaffoldProvider } from './ScaffoldProvider.js';

export class TSegFormerAdapter implements SegmentationProvider {
  private readonly inner = createScaffoldProvider(
    Object.freeze({
      id: 'tsegformer',
      displayName: 'TSegFormer (adapter scaffold)',
      modelId: 'tsegformer',
      modelVersion: '0.0.0-scaffold',
      operational: false,
      licenseNotes:
        'Research geometry-guided transformer — enable only after code/weights/dataset licenses verified',
      capabilities: Object.freeze([
        'semantic',
        'instance',
        'gpu',
        'cpu'
      ] as SegmentationProviderCapability[])
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
