/**
 * Clinical context — read-only view composed for UI and tools.
 */

import type { StudioCompositionRoot } from '../../application/composition-root.js';
import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import type { ClinicalToolRegistry } from '../tools/ClinicalToolRegistry.js';
import type { ClinicalDiagnostics } from './diagnostics.js';
import type { ClinicalEvents } from './events.js';
import type { ClinicalLifecyclePhase } from './lifecycle.js';
import type { ClinicalMetrics } from './metrics.js';
import type { ClinicalSessionId, ClinicalToolId } from './types.js';

export interface ClinicalContext {
  readonly sessionId: ClinicalSessionId;
  readonly phase: ClinicalLifecyclePhase;
  readonly document: ClinicalDocumentSnapshot | undefined;
  readonly activeToolId: ClinicalToolId | undefined;
  readonly tools: ClinicalToolRegistry;
  readonly events: ClinicalEvents;
  readonly metrics: ClinicalMetrics;
  readonly diagnostics: ClinicalDiagnostics;
  readonly host: StudioCompositionRoot;
}
