export type {
  Brand,
  InteractionSessionId,
  SelectionClock,
  SelectionError,
  SelectionErrorCode,
  SelectionMode,
  SelectionResult,
  SelectionRevision,
  SelectionRuntimeId,
  SelectionSessionId,
  SelectionTargetId
} from './types.js';
export {
  asSelectionRevision,
  asSelectionRuntimeId,
  asSelectionSessionId,
  asSelectionTargetId,
  createDefaultSelectionClock,
  selectionFailure,
  selectionSuccess
} from './types.js';

export type { SelectionConfiguration, SelectionPolicyMode } from './configuration.js';
export {
  DEFAULT_SELECTION_CONFIGURATION,
  resolveSelectionConfiguration
} from './configuration.js';

export type { SelectionLifecyclePhase } from './lifecycle.js';
export { SelectionLifecycle } from './lifecycle.js';

export type {
  ImmutableSelectionSnapshot,
  SelectionPublicState,
  SelectionState
} from './state.js';
export { freezeSelectionSnapshot } from './state.js';

export type {
  SelectionClipboardEvent,
  SelectionCommitEvent,
  SelectionClearEvent,
  SelectionErrorEvent,
  SelectionEvent,
  SelectionEventListener,
  SelectionEventType,
  SelectionHistoryEvent,
  SelectionLifecycleEvent,
  SelectionModifyEvent,
  SelectionPolicyEvent,
  SelectionWarningEvent
} from './events.js';
export { SelectionEvents } from './events.js';

export type { FilterResult, PolicyApplication } from './policy.js';
export { SelectionFilter, SelectionPolicy } from './policy.js';

export { SelectionManager } from './manager.js';
export { SelectionClipboard } from './clipboard.js';

export type { SelectionHistoryEntry } from './history.js';
export { SelectionHistory } from './history.js';

export type { SelectionMetricsSnapshot } from './metrics.js';
export { SelectionMetrics } from './metrics.js';

export type {
  SelectionDiagnostic,
  SelectionDiagnosticSeverity,
  SelectionDiagnosticsSnapshot
} from './diagnostics.js';
export { SelectionDiagnostics } from './diagnostics.js';

export type { SelectionContext } from './context.js';

export type {
  AiAssistedSelectionContract,
  GpuPickingIntegrationContract,
  LassoSelectionContract,
  PaintSelectionContract,
  SmartSelectionContract
} from './reserved.js';
export { RESERVED_SELECTION_CHANNELS } from './reserved.js';

export type { SelectionSessionOptions } from './session.js';
export { SelectionSession } from './session.js';

export { SelectionRegistry } from './registry.js';

export type { SelectionRuntimeOptions } from './runtime.js';
export { SelectionRuntime } from './runtime.js';
