import type { ProjectMetadata } from './metadata.js';
import { touchMetadata } from './metadata.js';
import type { ProjectSettings } from './settings.js';
import { resolveProjectSettings } from './settings.js';
import {
  freezeProjectSnapshot,
  type ImmutableProjectSnapshot
} from './state.js';
import type { ProjectLifecyclePhase } from './lifecycle.js';
import type { ProjectClock, ProjectId, ProjectLocationRef } from './types.js';
import { asProjectRevision } from './types.js';

/**
 * Owns working project state and publishes immutable snapshots.
 */
export class ProjectManager {
  private metadata: ProjectMetadata;
  private settings: ProjectSettings;
  private revision = 0;
  private documentRevision = 0;
  private readOnly: boolean;
  private snapshot: ImmutableProjectSnapshot;

  public constructor(
    metadata: ProjectMetadata,
    settings: ProjectSettings,
    readOnly: boolean,
    private readonly clock: ProjectClock,
    phase: ProjectLifecyclePhase
  ) {
    this.metadata = metadata;
    this.settings = settings;
    this.readOnly = readOnly;
    this.snapshot = this.publish(phase);
  }

  public getId(): ProjectId {
    return this.metadata.id;
  }

  public getMetadata(): ProjectMetadata {
    return this.metadata;
  }

  public getSettings(): ProjectSettings {
    return this.settings;
  }

  public getSnapshot(): ImmutableProjectSnapshot {
    return this.snapshot;
  }

  public isReadOnly(): boolean {
    return this.readOnly;
  }

  public setReadOnly(value: boolean, phase: ProjectLifecyclePhase): ImmutableProjectSnapshot {
    this.readOnly = value;
    this.revision += 1;
    this.snapshot = this.publish(phase);
    return this.snapshot;
  }

  public updateMetadata(
    phase: ProjectLifecyclePhase,
    patch: { readonly name?: string; readonly location?: ProjectLocationRef }
  ): ImmutableProjectSnapshot {
    this.metadata = touchMetadata(this.metadata, this.clock.now(), patch);
    this.revision += 1;
    this.snapshot = this.publish(phase);
    return this.snapshot;
  }

  public updateSettings(
    phase: ProjectLifecyclePhase,
    partial: Partial<ProjectSettings>
  ): ImmutableProjectSnapshot {
    this.settings = resolveProjectSettings({ ...this.settings, ...partial });
    this.revision += 1;
    this.snapshot = this.publish(phase);
    return this.snapshot;
  }

  public bumpDocumentRevision(phase: ProjectLifecyclePhase): ImmutableProjectSnapshot {
    this.documentRevision += 1;
    this.metadata = touchMetadata(this.metadata, this.clock.now());
    this.revision += 1;
    this.snapshot = this.publish(phase);
    return this.snapshot;
  }

  public markOpened(phase: ProjectLifecyclePhase): ImmutableProjectSnapshot {
    const at = this.clock.now();
    this.metadata = Object.freeze({
      ...this.metadata,
      openedAt: at,
      modifiedAt: this.metadata.modifiedAt
    });
    this.revision += 1;
    this.snapshot = this.publish(phase);
    return this.snapshot;
  }

  public refresh(phase: ProjectLifecyclePhase, dirty: boolean): ImmutableProjectSnapshot {
    this.snapshot = freezeProjectSnapshot({
      id: this.metadata.id,
      metadata: this.metadata,
      settings: this.settings,
      revision: asProjectRevision(this.revision),
      dirty,
      readOnly: this.readOnly,
      documentRevision: this.documentRevision,
      phase,
      createdAt: this.clock.now()
    });
    return this.snapshot;
  }

  public getDocumentRevision(): number {
    return this.documentRevision;
  }

  private publish(phase: ProjectLifecyclePhase): ImmutableProjectSnapshot {
    return freezeProjectSnapshot({
      id: this.metadata.id,
      metadata: this.metadata,
      settings: this.settings,
      revision: asProjectRevision(this.revision),
      dirty: false,
      readOnly: this.readOnly,
      documentRevision: this.documentRevision,
      phase,
      createdAt: this.clock.now()
    });
  }
}
