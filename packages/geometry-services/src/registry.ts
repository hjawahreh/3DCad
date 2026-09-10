import type { ProgressReporter } from '@cad-studio/platform-runtime';
import {
  createKernelPortSet,
  KernelSessionManager,
  MockKernelBridge,
  type KernelBridge,
  type KernelPortSet,
  type ManagedKernelSession
} from '@cad-studio/kernel-bridge';
import {
  createPortAdapter,
  type GeometryService,
  type GeometryServiceRequest,
  type GeometryServiceResult
} from './service.js';
import {
  GEOMETRY_SERVICE_FAMILIES,
  geoFailure,
  geoSuccess,
  type GeometryResult,
  type GeometryServiceFamily
} from './types.js';

/**
 * Registry + facade used by Operation Runtime adapters.
 * Owns geometric policy; depends only on abstract kernel ports.
 */
export class GeometryServices {
  private readonly services = new Map<GeometryServiceFamily, GeometryService>();
  private readonly sessions: KernelSessionManager;
  private readonly ports: KernelPortSet;

  public constructor(bridge: KernelBridge = new MockKernelBridge()) {
    this.sessions = new KernelSessionManager(bridge);
    this.ports = createKernelPortSet();
    for (const family of GEOMETRY_SERVICE_FAMILIES) {
      this.services.set(family, createPortAdapter(family, this.ports[family]));
    }
  }

  public listFamilies(): readonly GeometryServiceFamily[] {
    return GEOMETRY_SERVICE_FAMILIES;
  }

  public register(service: GeometryService): GeometryResult<void> {
    if (this.services.has(service.family)) {
      return geoFailure('conflict', `Geometry service ${service.family} already registered`);
    }
    this.services.set(service.family, service);
    return geoSuccess(undefined);
  }

  public replace(service: GeometryService): void {
    this.services.set(service.family, service);
  }

  public get(family: GeometryServiceFamily): GeometryResult<GeometryService> {
    const service = this.services.get(family);
    if (service === undefined) {
      return geoFailure('not-found', `No geometry service for ${family}`);
    }
    return geoSuccess(service);
  }

  public openSession(): ManagedKernelSession {
    return this.sessions.open();
  }

  public getSession(): GeometryResult<ManagedKernelSession> {
    const current = this.sessions.current();
    if (!current.ok) {
      return geoFailure('unavailable', current.error.message);
    }
    return geoSuccess(current.value);
  }

  public closeSession(): void {
    this.sessions.close();
  }

  public async execute(
    request: GeometryServiceRequest,
    signal: AbortSignal,
    report: ProgressReporter = () => undefined
  ): Promise<GeometryResult<GeometryServiceResult>> {
    const service = this.get(request.family);
    if (!service.ok) {
      return service;
    }
    const existing = this.sessions.current();
    const session = existing.ok ? existing.value : this.sessions.open();
    return service.value.execute(session, request, signal, report);
  }
}
