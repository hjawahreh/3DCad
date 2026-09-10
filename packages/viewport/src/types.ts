import { failure, success, type Result } from '@cad-studio/platform-runtime';

export type RenderErrorCode =
  | 'cancelled'
  | 'invalid'
  | 'not-found'
  | 'conflict'
  | 'unavailable'
  | 'backend'
  | 'validation'
  | 'exhausted'
  | 'unexpected';

export interface RenderError {
  readonly code: RenderErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export type RenderResult<T> = Result<T, RenderError>;

export const renderSuccess = <T>(value: T): RenderResult<T> => success(value);

export const renderFailure = (
  code: RenderErrorCode,
  message: string,
  cause?: unknown
): RenderResult<never> => failure({ code, message, cause });

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type RendererId = Brand<string, 'RendererId'>;
export type PassId = Brand<string, 'PassId'>;
export type ResourceId = Brand<string, 'ResourceId'>;
export type MaterialId = Brand<string, 'MaterialId'>;
export type ShaderId = Brand<string, 'ShaderId'>;
export type PipelineId = Brand<string, 'PipelineId'>;
export type FrameId = Brand<number, 'FrameId'>;
export type GpuHandle = Brand<number, 'GpuHandle'>;

export const asRendererId = (value: string): RendererId => value as RendererId;
export const asPassId = (value: string): PassId => value as PassId;
export const asResourceId = (value: string): ResourceId => value as ResourceId;
export const asMaterialId = (value: string): MaterialId => value as MaterialId;
export const asShaderId = (value: string): ShaderId => value as ShaderId;
export const asPipelineId = (value: string): PipelineId => value as PipelineId;
export const asFrameId = (value: number): FrameId => value as FrameId;
export const asGpuHandle = (value: number): GpuHandle => value as GpuHandle;

export type BackendKind = 'webgpu' | 'webgl2' | 'mock';
export type ResourceLifetime = 'transient' | 'persistent' | 'external';
export type ResourceKind =
  | 'vertex-buffer'
  | 'index-buffer'
  | 'uniform-buffer'
  | 'storage-buffer'
  | 'texture'
  | 'cubemap'
  | 'framebuffer'
  | 'render-target'
  | 'pipeline'
  | 'shader'
  | 'command-buffer'
  | 'mesh-buffer'
  | 'sampler';
export type MaterialKind =
  | 'pbr'
  | 'unlit'
  | 'wireframe'
  | 'points'
  | 'lines'
  | 'transparent'
  | 'custom';
export type PassKind =
  | 'geometry'
  | 'depth'
  | 'picking'
  | 'selection'
  | 'overlay'
  | 'transparency'
  | 'shadow'
  | 'outline'
  | 'hud'
  | 'diagnostics'
  | 'post-process'
  | 'custom';
export type Priority = 'critical' | 'high' | 'normal' | 'low' | 'idle';

export interface Size2D {
  readonly width: number;
  readonly height: number;
}

export interface ColorRgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface Disposable {
  dispose(): void;
}
