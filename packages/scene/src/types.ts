import { failure, success, type Result } from '@cad-studio/platform-runtime';

export type SceneErrorCode =
  | 'cancelled'
  | 'conflict'
  | 'invalid'
  | 'not-found'
  | 'unavailable'
  | 'validation'
  | 'revision-mismatch'
  | 'unexpected';

export interface SceneError {
  readonly code: SceneErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export type SceneResult<T> = Result<T, SceneError>;

export const sceneSuccess = <T>(value: T): SceneResult<T> => success(value);

export const sceneFailure = (
  code: SceneErrorCode,
  message: string,
  cause?: unknown
): SceneResult<never> => failure({ code, message, cause });

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type DomainEntityId = Brand<string, 'DomainEntityId'>;
export type SceneEntityId = Brand<string, 'SceneEntityId'>;
export type DocumentRevisionId = Brand<number, 'DocumentRevisionId'>;
export type SceneRevisionId = Brand<number, 'SceneRevisionId'>;
export type PickingId = Brand<number, 'PickingId'>;

export const asDomainEntityId = (value: string): DomainEntityId => value as DomainEntityId;
export const asSceneEntityId = (value: string): SceneEntityId => value as SceneEntityId;
export const asDocumentRevisionId = (value: number): DocumentRevisionId =>
  value as DocumentRevisionId;
export const asSceneRevisionId = (value: number): SceneRevisionId => value as SceneRevisionId;
export const asPickingId = (value: number): PickingId => value as PickingId;

export type SceneLayer = 'world' | 'interaction' | 'presentation';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Mat4 {
  readonly elements: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
  ];
}

export interface Aabb {
  readonly min: Vec3;
  readonly max: Vec3;
}

export const IDENTITY_MAT4: Mat4 = Object.freeze({
  elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const
});

export const emptyAabb = (): Aabb =>
  Object.freeze({
    min: Object.freeze({ x: 0, y: 0, z: 0 }),
    max: Object.freeze({ x: 0, y: 0, z: 0 })
  });
