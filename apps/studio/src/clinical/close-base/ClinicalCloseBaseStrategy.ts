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

/** Clinically labeled base styles (Plane / Offset / Surface). */
export const CLOSE_BASE_STRATEGIES: readonly CloseBaseStrategyDefinition[] = Object.freeze([
  Object.freeze({
    id: 'plane' as const,
    title: 'Plane Base',
    family: 'offset' as const,
    geometryOperation: 'uniform',
    description: 'Flat base under the trimmed arch'
  }),
  Object.freeze({
    id: 'offset' as const,
    title: 'Offset Base',
    family: 'offset' as const,
    geometryOperation: 'uniform',
    description: 'Offset walls with controlled thickness from the trimmed boundary'
  }),
  Object.freeze({
    id: 'surface' as const,
    title: 'Surface Fill',
    family: 'repair' as const,
    geometryOperation: 'fill-holes',
    description: 'Fill open boundaries in place without a tall pedestal'
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
