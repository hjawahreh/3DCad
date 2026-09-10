import {
  asPassId,
  type Disposable,
  type PassId,
  type PassKind,
  type RenderResult,
  renderFailure,
  renderSuccess
} from '../types.js';

export interface PassContext {
  readonly passId: PassId;
  readonly kind: PassKind;
  readonly frameIndex: number;
}

export interface RenderPass extends Disposable {
  readonly id: PassId;
  readonly kind: PassKind;
  readonly label: string;
  setup(context: PassContext): RenderResult<void>;
  execute(context: PassContext): RenderResult<void>;
  teardown(context: PassContext): RenderResult<void>;
}

export type PassFactory = (id: PassId, label?: string) => RenderPass;

export class BasePass implements RenderPass {
  private setupDone = false;
  private disposed = false;

  public constructor(
    public readonly id: PassId,
    public readonly kind: PassKind,
    public readonly label: string
  ) {}

  public setup(_context: PassContext): RenderResult<void> {
    if (this.disposed) {
      return renderFailure('unavailable', `Pass ${String(this.id)} is disposed.`);
    }
    this.setupDone = true;
    return renderSuccess(undefined);
  }

  public execute(context: PassContext): RenderResult<void> {
    if (this.disposed) {
      return renderFailure('unavailable', `Pass ${String(this.id)} is disposed.`);
    }
    if (!this.setupDone) {
      const setupResult = this.setup(context);
      if (!setupResult.ok) return setupResult;
    }
    return this.onExecute(context);
  }

  public teardown(_context: PassContext): RenderResult<void> {
    if (this.disposed) {
      return renderFailure('unavailable', `Pass ${String(this.id)} is disposed.`);
    }
    this.setupDone = false;
    return renderSuccess(undefined);
  }

  public dispose(): void {
    this.disposed = true;
    this.setupDone = false;
  }

  protected onExecute(_context: PassContext): RenderResult<void> {
    return renderSuccess(undefined);
  }
}

class KindPass extends BasePass {
  public constructor(id: PassId, kind: PassKind, label: string) {
    super(id, kind, label);
  }
}

export const ALL_PASS_KINDS: readonly PassKind[] = [
  'geometry',
  'depth',
  'picking',
  'selection',
  'overlay',
  'transparency',
  'shadow',
  'outline',
  'hud',
  'diagnostics',
  'post-process',
  'custom'
] as const;

const defaultFactory =
  (kind: PassKind): PassFactory =>
  (id, label) =>
    new KindPass(id, kind, label ?? `${kind}-pass`);

export class PassRegistry implements Disposable {
  private readonly factories = new Map<PassKind, PassFactory>();
  private readonly instances = new Map<PassId, RenderPass>();
  private nextSerial = 1;

  public registerFactory(kind: PassKind, factory: PassFactory): RenderResult<void> {
    if (this.factories.has(kind)) {
      return renderFailure('conflict', `Factory for pass kind ${kind} already registered.`);
    }
    this.factories.set(kind, factory);
    return renderSuccess(undefined);
  }

  public create(kind: PassKind, label?: string): RenderResult<RenderPass> {
    const factory = this.factories.get(kind) ?? defaultFactory(kind);
    const id = asPassId(`${kind}-${this.nextSerial++}`);
    const pass = factory(id, label);
    this.instances.set(pass.id, pass);
    return renderSuccess(pass);
  }

  public get(id: PassId): RenderPass | undefined {
    return this.instances.get(id);
  }

  public kinds(): readonly PassKind[] {
    return ALL_PASS_KINDS;
  }

  public list(): readonly RenderPass[] {
    return Object.freeze([...this.instances.values()]);
  }

  public dispose(): void {
    for (const pass of this.instances.values()) pass.dispose();
    this.instances.clear();
  }
}
