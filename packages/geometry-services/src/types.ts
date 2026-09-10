import { failure, success, type Result } from '@cad-studio/platform-runtime';

export type GeometryErrorCode =
  | 'cancelled'
  | 'conflict'
  | 'invalid'
  | 'not-found'
  | 'unavailable'
  | 'validation'
  | 'kernel'
  | 'unsupported'
  | 'unexpected';

export interface GeometryError {
  readonly code: GeometryErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export type GeometryResult<T> = Result<T, GeometryError>;

export const geoSuccess = <T>(value: T): GeometryResult<T> => success(value);

export const geoFailure = (
  code: GeometryErrorCode,
  message: string,
  cause?: unknown
): GeometryResult<never> => failure({ code, message, cause });

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type GeometrySessionId = Brand<string, 'GeometrySessionId'>;
export type GeometryHandleId = Brand<string, 'GeometryHandleId'>;
export type GeometryServiceId = Brand<string, 'GeometryServiceId'>;

export const asGeometrySessionId = (value: string): GeometrySessionId =>
  value as GeometrySessionId;
export const asGeometryHandleId = (value: string): GeometryHandleId =>
  value as GeometryHandleId;
export const asGeometryServiceId = (value: string): GeometryServiceId =>
  value as GeometryServiceId;

export type GeometryServiceFamily =
  | 'boolean'
  | 'transform'
  | 'repair'
  | 'remesh'
  | 'offset'
  | 'collision'
  | 'measurement'
  | 'validation'
  | 'topology';

export const GEOMETRY_SERVICE_FAMILIES: readonly GeometryServiceFamily[] = [
  'boolean',
  'transform',
  'repair',
  'remesh',
  'offset',
  'collision',
  'measurement',
  'validation',
  'topology'
] as const;
