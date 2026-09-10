/**
 * Reserved parser contracts (COD-013: contracts only — do not implement parsers).
 */

export type ReservedParserFormat =
  | 'STL'
  | 'OBJ'
  | 'PLY'
  | 'OFF'
  | '3MF'
  | 'GLTF'
  | 'STEP'
  | 'IGES';

export interface ReservedParserContract {
  readonly readonly: true;
  readonly format: ReservedParserFormat;
  readonly extensions: readonly string[];
}

export const RESERVED_PARSER_CONTRACTS: readonly ReservedParserContract[] = Object.freeze([
  Object.freeze({ readonly: true as const, format: 'STL' as const, extensions: Object.freeze(['stl']) }),
  Object.freeze({ readonly: true as const, format: 'OBJ' as const, extensions: Object.freeze(['obj']) }),
  Object.freeze({ readonly: true as const, format: 'PLY' as const, extensions: Object.freeze(['ply']) }),
  Object.freeze({ readonly: true as const, format: 'OFF' as const, extensions: Object.freeze(['off']) }),
  Object.freeze({ readonly: true as const, format: '3MF' as const, extensions: Object.freeze(['3mf']) }),
  Object.freeze({
    readonly: true as const,
    format: 'GLTF' as const,
    extensions: Object.freeze(['gltf', 'glb'])
  }),
  Object.freeze({
    readonly: true as const,
    format: 'STEP' as const,
    extensions: Object.freeze(['step', 'stp'])
  }),
  Object.freeze({
    readonly: true as const,
    format: 'IGES' as const,
    extensions: Object.freeze(['iges', 'igs'])
  })
]);

export const RESERVED_IMPORT_FORMATS = Object.freeze([
  'stl',
  'obj',
  'ply',
  'off',
  '3mf',
  'gltf',
  'step',
  'iges'
] as const);
