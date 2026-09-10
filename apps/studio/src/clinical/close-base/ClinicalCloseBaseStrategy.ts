/**
 * ClinicalCloseBaseStrategy — maps close-base strategies to existing Geometry Services contracts.
 * Does not invent kernel operations.
 */

import type { GeometryServiceFamily } from '@cad-studio/geometry-services';

export type CloseBaseStrategyId = 'plane' | 'surface' | 'offset';

export type CloseBaseOrientation = 'xy' | 'xz' | 'yz';

export interface CloseBaseStrategyDefinition {
  readonly id: CloseBaseStrategyId;
  readonly title: string;
  readonly family: GeometryServiceFamily;
  readonly geometryOperation: string;
  readonly description: string;
}

export const CLOSE_BASE_STRATEGIES: readonly CloseBaseStrategyDefinition[] = Object.freeze([
  Object.freeze({
    id: 'plane' as const,
    title: 'Plane-based',
    family: 'offset' as const,
    geometryOperation: 'uniform',
    description: 'Generate a base relative to a defined plane (offset.uniform)'
  }),
  Object.freeze({
    id: 'offset' as const,
    title: 'Offset base',
    family: 'offset' as const,
    geometryOperation: 'uniform',
    description: 'Controlled offset base from the trimmed surface (offset.uniform)'
  }),
  Object.freeze({
    id: 'surface' as const,
    title: 'Surface-derived',
    family: 'repair' as const,
    geometryOperation: 'fill-holes',
    description: 'Close open surface using local boundary fill (repair.fill-holes)'
  })
]);

export const getCloseBaseStrategy = (
  id: CloseBaseStrategyId
): CloseBaseStrategyDefinition | undefined =>
  CLOSE_BASE_STRATEGIES.find((s) => s.id === id);

export const planeNormalForOrientation = (
  orientation: CloseBaseOrientation
): readonly [number, number, number] => {
  if (orientation === 'xz') {
    return Object.freeze([0, 1, 0] as const);
  }
  if (orientation === 'yz') {
    return Object.freeze([1, 0, 0] as const);
  }
  return Object.freeze([0, 0, 1] as const);
};
