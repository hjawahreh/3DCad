import type { SegmentationProvider, SegmentationProviderCapability } from '../SegmentationProvider.js';
import { createScaffoldProvider } from './ScaffoldProvider.js';

export class MeshSegNetAdapter implements SegmentationProvider {
  private readonly inner = createScaffoldProvider(
    Object.freeze({
      id: 'meshsegnet',
      displayName: 'MeshSegNet (adapter scaffold)',
      modelId: 'meshsegnet',
      modelVersion: '0.0.0-scaffold',
      operational: false,
      licenseNotes:
        'Code: MIT (Tai-Hsien/MeshSegNet). Weights present upstream but not redistributed here. Requires ONNX export + fixture benchmarks before enablement. Dataset unavailable upstream.',
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
  public modelInformation = this.inner.modelInformation.bind(this.inner);
  public runtimeInformation = this.inner.runtimeInformation.bind(this.inner);
  public validateInput = this.inner.validateInput.bind(this.inner);
  public preprocess = this.inner.preprocess.bind(this.inner);
  public infer = this.inner.infer.bind(this.inner);
  public cancel = this.inner.cancel.bind(this.inner);
  public dispose = this.inner.dispose.bind(this.inner);
}
