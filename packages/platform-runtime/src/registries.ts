import type { Revision } from './contracts.js';
import { failure, success, type Result, type RuntimeError, runtimeError } from './result.js';

export type FeatureFlagState = 'experimental' | 'internal' | 'stable' | 'disabled';
export interface FeatureFlag {
  readonly id: string;
  readonly state: FeatureFlagState;
  readonly enabled: boolean;
}

export class FeatureFlagRegistry {
  private readonly flags = new Map<string, FeatureFlag>();
  public register(flag: FeatureFlag): Result<void, RuntimeError> {
    if (this.flags.has(flag.id))
      return failure(runtimeError('conflict', 'Feature flag already registered.'));
    this.flags.set(flag.id, Object.freeze({ ...flag }));
    return success(undefined);
  }
  public isEnabled(id: string): boolean {
    return this.flags.get(id)?.enabled ?? false;
  }
  public all(): readonly FeatureFlag[] {
    return Object.freeze([...this.flags.values()]);
  }
}

export interface Capability {
  readonly id: string;
  readonly version: string;
}
export class CapabilityRegistry {
  private readonly capabilities = new Map<string, Capability>();
  public register(capability: Capability): Result<void, RuntimeError> {
    if (this.capabilities.has(capability.id))
      return failure(runtimeError('conflict', 'Capability already registered.'));
    this.capabilities.set(capability.id, Object.freeze({ ...capability }));
    return success(undefined);
  }
  public has(id: string): boolean {
    return this.capabilities.has(id);
  }
}

export interface VersionedContract {
  readonly id: string;
  readonly version: string;
}
export class VersionRegistry {
  private readonly contracts = new Map<string, VersionedContract>();
  public register(contract: VersionedContract): Result<void, RuntimeError> {
    if (this.contracts.has(contract.id))
      return failure(runtimeError('conflict', 'Contract version already registered.'));
    this.contracts.set(contract.id, Object.freeze({ ...contract }));
    return success(undefined);
  }
  public compatible(id: string, version: string): boolean {
    return this.contracts.get(id)?.version === version;
  }
}

export interface ProjectMetadata {
  readonly id: string;
  readonly formatVersion: string;
  readonly readOnly: boolean;
}
export interface ProjectLifecycleState {
  readonly project?: ProjectMetadata;
  readonly dirty: boolean;
  readonly revision: Revision;
}

export class ProjectLifecycle {
  private state: ProjectLifecycleState = Object.freeze({ dirty: false, revision: 0 as Revision });
  public current(): ProjectLifecycleState {
    return this.state;
  }
  public open(metadata: ProjectMetadata): Result<ProjectLifecycleState, RuntimeError> {
    if (this.state.project) return failure(runtimeError('conflict', 'A project is already open.'));
    this.state = Object.freeze({
      project: Object.freeze({ ...metadata }),
      dirty: false,
      revision: (this.state.revision + 1) as Revision
    });
    return success(this.state);
  }
  public markDirty(): Result<ProjectLifecycleState, RuntimeError> {
    if (!this.state.project || this.state.project.readOnly)
      return failure(runtimeError('forbidden', 'Project cannot become dirty.'));
    this.state = Object.freeze({
      ...this.state,
      dirty: true,
      revision: (this.state.revision + 1) as Revision
    });
    return success(this.state);
  }
  public close(): Result<ProjectLifecycleState, RuntimeError> {
    if (!this.state.project) return failure(runtimeError('not-found', 'No project is open.'));
    this.state = Object.freeze({ dirty: false, revision: (this.state.revision + 1) as Revision });
    return success(this.state);
  }
}
