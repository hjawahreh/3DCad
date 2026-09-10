/**
 * ClinicalPreparationPipeline — tool orchestration registry (activation only).
 */

import type { ClinicalPreparationStage } from './ClinicalPreparationStage.js';

export type PreparationOrchestrationToolId =
  | 'trim'
  | 'close-base'
  | 'segment'
  | 'move'
  | 'analyze'
  | 'measure'
  | 'manufacturing';

export interface PreparationToolDefinition {
  readonly id: PreparationOrchestrationToolId;
  readonly title: string;
  readonly group: 'preparation' | 'segmentation' | 'treatment' | 'analysis' | 'manufacturing';
  readonly stage: ClinicalPreparationStage | 'any';
  readonly enabled: boolean;
  readonly tooltip: string;
}

export const PREPARATION_TOOL_DEFINITIONS: readonly PreparationToolDefinition[] = Object.freeze([
  Object.freeze({
    id: 'trim' as const,
    title: 'Trim',
    group: 'preparation' as const,
    stage: 'ready-for-trim' as const,
    enabled: true,
    tooltip: 'Trim orchestration — geometry in CLN-006'
  }),
  Object.freeze({
    id: 'close-base' as const,
    title: 'Close Base',
    group: 'preparation' as const,
    stage: 'ready-for-close-base' as const,
    enabled: true,
    tooltip: 'Close base — Geometry Services offset.uniform / repair.fill-holes'
  }),
  Object.freeze({
    id: 'segment' as const,
    title: 'Segmentation',
    group: 'segmentation' as const,
    stage: 'ready-for-segmentation' as const,
    enabled: true,
    tooltip: 'Segmentation orchestration — geometry in a later milestone'
  }),
  Object.freeze({
    id: 'move' as const,
    title: 'Movement',
    group: 'treatment' as const,
    stage: 'ready-for-movement' as const,
    enabled: true,
    tooltip: 'Movement orchestration — geometry in a later milestone'
  }),
  Object.freeze({
    id: 'analyze' as const,
    title: 'Analysis',
    group: 'analysis' as const,
    stage: 'any' as const,
    enabled: true,
    tooltip: 'Analysis orchestration — reserved'
  }),
  Object.freeze({
    id: 'measure' as const,
    title: 'Measurement',
    group: 'analysis' as const,
    stage: 'any' as const,
    enabled: true,
    tooltip: 'Measurement orchestration — reserved'
  }),
  Object.freeze({
    id: 'manufacturing' as const,
    title: 'Manufacturing',
    group: 'manufacturing' as const,
    stage: 'preparation-complete' as const,
    enabled: true,
    tooltip: 'Manufacturing orchestration — reserved'
  })
]);

export class ClinicalPreparationPipeline {
  private readonly tools = new Map<PreparationOrchestrationToolId, PreparationToolDefinition>();

  public constructor() {
    for (const def of PREPARATION_TOOL_DEFINITIONS) {
      this.tools.set(def.id, def);
    }
  }

  public list(): readonly PreparationToolDefinition[] {
    return Object.freeze([...this.tools.values()]);
  }

  public get(id: PreparationOrchestrationToolId): PreparationToolDefinition | undefined {
    return this.tools.get(id);
  }

  public isCompatible(stage: ClinicalPreparationStage, toolId: PreparationOrchestrationToolId): boolean {
    const tool = this.tools.get(toolId);
    if (tool === undefined || !tool.enabled) {
      return false;
    }
    if (tool.stage === 'any') {
      return true;
    }
    if (stage === 'preparation-complete') {
      return true;
    }
    return tool.stage === stage;
  }

  public toolsForStage(stage: ClinicalPreparationStage): readonly PreparationToolDefinition[] {
    return Object.freeze(
      [...this.tools.values()].filter(
        (t) => t.enabled && (t.stage === 'any' || t.stage === stage || stage === 'preparation-complete')
      )
    );
  }
}
