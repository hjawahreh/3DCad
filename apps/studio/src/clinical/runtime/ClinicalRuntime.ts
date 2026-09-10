/**
 * ClinicalRuntime — clinical framework entry composed over Studio host runtimes.
 */

import type { StudioCompositionRoot } from '../../application/composition-root.js';
import { RecentCasesRegistry } from '../case/RecentCases.js';
import { ClinicalToolRegistry } from '../tools/ClinicalToolRegistry.js';
import { ClinicalSession } from './session.js';
import {
  asClinicalSessionId,
  clinicalFailure,
  clinicalSuccess,
  createDefaultClinicalClock,
  type ClinicalClock,
  type ClinicalResult,
  type ClinicalSessionId
} from './types.js';

export interface ClinicalRuntimeOptions {
  readonly host: StudioCompositionRoot;
  readonly clock?: ClinicalClock;
}

let sessionSerial = 0;

export class ClinicalRuntime {
  private readonly host: StudioCompositionRoot;
  private readonly clock: ClinicalClock;
  private readonly tools = new ClinicalToolRegistry();
  private readonly recent = new RecentCasesRegistry();
  private session: ClinicalSession | undefined;
  private disposed = false;

  public constructor(options: ClinicalRuntimeOptions) {
    this.host = options.host;
    this.clock = options.clock ?? createDefaultClinicalClock();
  }

  public getTools(): ClinicalToolRegistry {
    return this.tools;
  }

  public getRecentCases(): RecentCasesRegistry {
    return this.recent;
  }

  public getSession(): ClinicalSession | undefined {
    return this.session;
  }

  public createSessionId(prefix = 'clinical-session'): ClinicalSessionId {
    sessionSerial += 1;
    return asClinicalSessionId(`${prefix}-${String(sessionSerial)}`);
  }

  public createSession(
    sessionId?: ClinicalSessionId
  ): ClinicalResult<ClinicalSession> {
    if (this.disposed) {
      return clinicalFailure('unavailable', 'ClinicalRuntime disposed');
    }
    if (this.session !== undefined) {
      return clinicalFailure('conflict', 'Clinical session already active');
    }
    const session = new ClinicalSession({
      sessionId: sessionId ?? this.createSessionId(),
      host: this.host,
      tools: this.tools,
      recent: this.recent,
      clock: this.clock
    });
    const boot = session.bootstrap();
    if (!boot.ok) {
      session.dispose();
      return boot;
    }
    this.session = session;
    return clinicalSuccess(session);
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.session?.dispose();
    this.session = undefined;
  }

  public isDisposed(): boolean {
    return this.disposed;
  }
}
