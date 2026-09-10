/**
 * Clinical tool registry — registration only; no geometry/tool algorithms.
 */

import {
  asClinicalToolId,
  clinicalFailure,
  clinicalSuccess,
  type ClinicalResult,
  type ClinicalToolId
} from '../runtime/types.js';

export type ClinicalToolGroup =
  | 'case'
  | 'preparation'
  | 'segmentation'
  | 'treatment'
  | 'analysis'
  | 'manufacturing';

export interface ClinicalToolDefinition {
  readonly id: ClinicalToolId;
  readonly title: string;
  readonly group: ClinicalToolGroup;
  readonly shortcut: string | undefined;
  readonly tooltip: string;
  readonly enabled: boolean;
  readonly icon: string;
}

export const CLINICAL_TOOL_DEFINITIONS: readonly Omit<ClinicalToolDefinition, 'id'>[] =
  Object.freeze([
    Object.freeze({
      title: 'Import',
      group: 'case' as const,
      shortcut: 'Mod+I',
      tooltip: 'Import scan or model (host + Import Runtime)',
      enabled: true,
      icon: 'import'
    }),
    Object.freeze({
      title: 'Orientation',
      group: 'preparation' as const,
      shortcut: 'Mod+O',
      tooltip: 'Orient model into treatment coordinate system',
      enabled: true,
      icon: 'orient'
    }),
    Object.freeze({
      title: 'Trim',
      group: 'preparation' as const,
      shortcut: 'Mod+T',
      tooltip: 'Trim mesh with interactive boundary (CLN-006)',
      enabled: true,
      icon: 'trim'
    }),
    Object.freeze({
      title: 'Close Base',
      group: 'preparation' as const,
      shortcut: 'Mod+B',
      tooltip: 'Close base beneath the model (CLN-007)',
      enabled: true,
      icon: 'close-base'
    }),
    Object.freeze({
      title: 'Segmentation',
      group: 'segmentation' as const,
      shortcut: undefined,
      tooltip: 'Segmentation — available in a later clinical milestone',
      enabled: false,
      icon: 'segment'
    }),
    Object.freeze({
      title: 'Movement',
      group: 'treatment' as const,
      shortcut: undefined,
      tooltip: 'Tooth movement — available in a later clinical milestone',
      enabled: false,
      icon: 'move'
    }),
    Object.freeze({
      title: 'Measurement',
      group: 'analysis' as const,
      shortcut: undefined,
      tooltip: 'Measurement — available in a later clinical milestone',
      enabled: false,
      icon: 'measure'
    }),
    Object.freeze({
      title: 'Analysis',
      group: 'analysis' as const,
      shortcut: undefined,
      tooltip: 'Analysis — available in a later clinical milestone',
      enabled: false,
      icon: 'analyze'
    })
  ]);

export class ClinicalToolRegistry {
  private readonly tools = new Map<string, ClinicalToolDefinition>();
  private activeToolId: ClinicalToolId | undefined;

  public constructor() {
    for (const def of CLINICAL_TOOL_DEFINITIONS) {
      const id = asClinicalToolId(def.icon);
      this.tools.set(id, Object.freeze({ ...def, id }));
    }
  }

  public list(): readonly ClinicalToolDefinition[] {
    return Object.freeze([...this.tools.values()]);
  }

  public get(id: ClinicalToolId): ClinicalToolDefinition | undefined {
    return this.tools.get(id);
  }

  public getActive(): ClinicalToolDefinition | undefined {
    return this.activeToolId === undefined ? undefined : this.tools.get(this.activeToolId);
  }

  public activate(id: ClinicalToolId): ClinicalResult<ClinicalToolDefinition> {
    const tool = this.tools.get(id);
    if (tool === undefined) {
      return clinicalFailure('not-found', `Unknown tool ${id}`);
    }
    if (!tool.enabled) {
      return clinicalFailure('unavailable', `${tool.title} is not enabled in CLN-001`);
    }
    this.activeToolId = id;
    return clinicalSuccess(tool);
  }

  public deactivate(): void {
    this.activeToolId = undefined;
  }

  public enabledCount(): number {
    let n = 0;
    for (const tool of this.tools.values()) {
      if (tool.enabled) {
        n += 1;
      }
    }
    return n;
  }
}
