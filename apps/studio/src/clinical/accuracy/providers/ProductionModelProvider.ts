/**
 * CLN-001A — production clinical segmentation provider.
 * Refuses fake neural-network output until a licensed checkpoint is configured.
 */

import { createScaffoldProvider } from '../../segmentation/provider/adapters/ScaffoldProvider.js';
import type { SegmentationProvider } from '../../segmentation/provider/SegmentationProvider.js';

export const ProductionModelProviderInfo = Object.freeze({
  id: 'production-clinical-model',
  displayName: 'Production Clinical Segmentation Model',
  modelId: 'unset',
  modelVersion: 'none',
  operational: false,
  licenseNotes:
    'No production checkpoint registered. Do not emit synthetic or heuristic teeth as clinical output.',
  capabilities: Object.freeze(['semantic', 'instance', 'identification', 'cpu'] as const)
});

/** Alias for ClinicalSegmentationProvider production slot. */
export const createProductionModelProvider = (): SegmentationProvider =>
  createScaffoldProvider(ProductionModelProviderInfo);

export type ClinicalSegmentationProvider = SegmentationProvider;
