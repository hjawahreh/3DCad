/**
 * Preview descriptors are transient and never enter document history.
 * Scene/viewport may render them; Domain must ignore them.
 */
export type PreviewKind =
  | 'stroke'
  | 'mesh-overlay'
  | 'boundary'
  | 'transform-gizmo'
  | 'measurement'
  | 'diagnostic'
  | 'generic';

export interface PreviewDescriptor {
  readonly id: string;
  readonly kind: PreviewKind;
  readonly operationId: string;
  readonly revision: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly opaque: true;
}

export const createPreviewDescriptor = (input: {
  readonly id: string;
  readonly kind: PreviewKind;
  readonly operationId: string;
  readonly revision: number;
  readonly payload?: Readonly<Record<string, unknown>>;
}): PreviewDescriptor =>
  Object.freeze({
    id: input.id,
    kind: input.kind,
    operationId: input.operationId,
    revision: input.revision,
    payload: Object.freeze({ ...(input.payload ?? {}) }),
    opaque: true as const
  });
