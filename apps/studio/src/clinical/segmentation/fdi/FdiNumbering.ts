/**
 * Centralized FDI World Dental Federation numbering (ISO 3950).
 * Permanent dentition only for CLN-009.
 */

export type FdiQuadrant = 1 | 2 | 3 | 4;

export type FdiToothClass =
  | 'central'
  | 'lateral'
  | 'canine'
  | 'first-premolar'
  | 'second-premolar'
  | 'first-molar'
  | 'second-molar'
  | 'third-molar';

export type FdiNumber =
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18
  | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28
  | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38
  | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48;

export interface FdiToothDefinition {
  readonly fdi: FdiNumber;
  readonly quadrant: FdiQuadrant;
  readonly position: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  readonly arch: 'upper' | 'lower';
  readonly side: 'right' | 'left';
  readonly toothClass: FdiToothClass;
  readonly label: string;
}

const CLASS_BY_POSITION: readonly FdiToothClass[] = [
  'central',
  'lateral',
  'canine',
  'first-premolar',
  'second-premolar',
  'first-molar',
  'second-molar',
  'third-molar'
];

const buildQuadrant = (
  quadrant: FdiQuadrant,
  arch: 'upper' | 'lower',
  side: 'right' | 'left'
): FdiToothDefinition[] => {
  const defs: FdiToothDefinition[] = [];
  for (let position = 1; position <= 8; position += 1) {
    const fdi = (quadrant * 10 + position) as FdiNumber;
    const toothClass = CLASS_BY_POSITION[position - 1]!;
    defs.push(
      Object.freeze({
        fdi,
        quadrant,
        position: position as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
        arch,
        side,
        toothClass,
        label: `FDI ${String(fdi)}`
      })
    );
  }
  return defs;
};

export const FDI_PERMANENT_TEETH: readonly FdiToothDefinition[] = Object.freeze([
  ...buildQuadrant(1, 'upper', 'right'),
  ...buildQuadrant(2, 'upper', 'left'),
  ...buildQuadrant(3, 'lower', 'left'),
  ...buildQuadrant(4, 'lower', 'right')
]);

const BY_FDI = new Map<number, FdiToothDefinition>(
  FDI_PERMANENT_TEETH.map((d) => [d.fdi, d])
);

export const ALL_FDI_NUMBERS: readonly FdiNumber[] = Object.freeze(
  FDI_PERMANENT_TEETH.map((d) => d.fdi)
);

export const isFdiNumber = (value: unknown): value is FdiNumber =>
  typeof value === 'number' && BY_FDI.has(value);

export const getFdiDefinition = (fdi: number): FdiToothDefinition | undefined =>
  BY_FDI.get(fdi);

export const fdiQuadrant = (fdi: FdiNumber): FdiQuadrant =>
  Math.floor(fdi / 10) as FdiQuadrant;

export const fdiPositionInQuadrant = (fdi: FdiNumber): number => fdi % 10;

export const isUpperArch = (fdi: FdiNumber): boolean => {
  const q = fdiQuadrant(fdi);
  return q === 1 || q === 2;
};

export const isLowerArch = (fdi: FdiNumber): boolean => {
  const q = fdiQuadrant(fdi);
  return q === 3 || q === 4;
};

export const antagonistFdi = (fdi: FdiNumber): FdiNumber | undefined => {
  const q = fdiQuadrant(fdi);
  const pos = fdiPositionInQuadrant(fdi);
  const map: Record<FdiQuadrant, FdiQuadrant> = { 1: 4, 2: 3, 3: 2, 4: 1 };
  return getFdiDefinition(map[q] * 10 + pos)?.fdi;
};

export const contralateralFdi = (fdi: FdiNumber): FdiNumber | undefined => {
  const q = fdiQuadrant(fdi);
  const pos = fdiPositionInQuadrant(fdi);
  const map: Record<FdiQuadrant, FdiQuadrant> = { 1: 2, 2: 1, 3: 4, 4: 3 };
  return getFdiDefinition(map[q] * 10 + pos)?.fdi;
};

/** Arch-order index 0..15 for upper (18→11 then 21→28) or lower (48→41 then 31→38). */
export const archOrderIndex = (fdi: FdiNumber): number => {
  const q = fdiQuadrant(fdi);
  const pos = fdiPositionInQuadrant(fdi);
  if (q === 1) return 8 - pos;
  if (q === 2) return 7 + pos;
  if (q === 4) return 8 - pos;
  return 7 + pos;
};

export const expectedFdiForArchSlot = (
  arch: 'upper' | 'lower',
  slotIndex: number,
  slotCount: number
): FdiNumber | undefined => {
  if (slotCount <= 0 || slotIndex < 0 || slotIndex >= slotCount) {
    return undefined;
  }
  const order =
    arch === 'upper'
      ? ([18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28] as const)
      : ([48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38] as const);
  if (slotCount === 1) {
    return arch === 'upper' ? 11 : 41;
  }
  const t = slotIndex / (slotCount - 1);
  const idx = Math.round(t * (order.length - 1));
  return order[idx];
};
