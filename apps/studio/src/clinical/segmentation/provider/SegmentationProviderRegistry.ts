/**
 * Provider registry — interchangeable inference providers.
 */

import { SegmentationError } from '../errors.js';
import type { SegmentationProvider } from './SegmentationProvider.js';
import { ReferenceHeuristicProvider } from './ReferenceHeuristicProvider.js';
import { TSegFormerAdapter } from './adapters/TSegFormerAdapter.js';
import { MeshSegNetAdapter } from './adapters/MeshSegNetAdapter.js';
import { TGNetAdapter } from './adapters/TGNetAdapter.js';
import { DentalMAEAdapter } from './adapters/DentalMAEAdapter.js';
import { OnnxSegmentationProvider } from './adapters/OnnxSegmentationProvider.js';
import { createProductionModelProvider } from '../../accuracy/providers/ProductionModelProvider.js';

export class SegmentationProviderRegistry {
  private readonly providers = new Map<string, SegmentationProvider>();
  private defaultId: string | undefined;

  public register(provider: SegmentationProvider): void {
    this.providers.set(provider.info.id, provider);
    if (this.defaultId === undefined && provider.info.operational) {
      this.defaultId = provider.info.id;
    }
  }

  public get(id: string): SegmentationProvider {
    const p = this.providers.get(id);
    if (p === undefined) {
      throw new SegmentationError('PROVIDER_NOT_FOUND', `Unknown provider ${id}`);
    }
    return p;
  }

  public tryGet(id: string): SegmentationProvider | undefined {
    return this.providers.get(id);
  }

  public list(): readonly SegmentationProvider[] {
    return Object.freeze([...this.providers.values()]);
  }

  public listOperational(): readonly SegmentationProvider[] {
    return Object.freeze([...this.providers.values()].filter((p) => p.info.operational));
  }

  public setDefault(id: string): void {
    this.get(id);
    this.defaultId = id;
  }

  public getDefault(): SegmentationProvider {
    if (this.defaultId === undefined) {
      throw new SegmentationError('MODEL_UNAVAILABLE', 'No default segmentation provider');
    }
    return this.get(this.defaultId);
  }
}

export const createDefaultSegmentationRegistry = (): SegmentationProviderRegistry => {
  const registry = new SegmentationProviderRegistry();
  registry.register(new ReferenceHeuristicProvider());
  registry.register(new OnnxSegmentationProvider());
  registry.register(new TSegFormerAdapter());
  registry.register(new MeshSegNetAdapter());
  registry.register(new TGNetAdapter());
  registry.register(new DentalMAEAdapter());
  registry.register(createProductionModelProvider());
  // CLN-SEG-001: Production is preferred only when operational. Otherwise the
  // reference heuristic remains available strictly as Reference / Development.
  // Never silently label heuristic output as Production.
  const production = registry.tryGet('production-clinical-model');
  if (production?.info.operational === true) {
    registry.setDefault('production-clinical-model');
  } else {
    registry.setDefault('reference-heuristic');
  }
  return registry;
};
