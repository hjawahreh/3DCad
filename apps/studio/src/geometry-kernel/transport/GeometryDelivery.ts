/**
 * GEO-001H — geometry result delivery transports.
 *
 * LOCAL DESKTOP: Tauri IPC (host talks to worker, returns raw CGF1 via Response).
 * WEB DEVELOPMENT FALLBACK: Chromium fetch HTTP CGF1 (GEO-001G).
 * NODE HOST (tests): Node-side fetch — models desktop host timing without Tauri.
 */

export type GeometryDeliveryMode = 'tauri-ipc' | 'http-fallback' | 'node-host';

export interface GeometryDeliveryResult {
  readonly bytes: ArrayBuffer;
  readonly deliveryMode: GeometryDeliveryMode;
  readonly roundTripMs: number;
  readonly httpMs: number | 'unavailable';
  readonly ipcMs: number | 'unavailable';
  readonly status: number;
  readonly contentType: string;
}

export interface GeometryDeliveryClient {
  readonly mode: GeometryDeliveryMode;
  post(input: {
    readonly baseUrl: string;
    readonly bodyJson: string;
    readonly accept: string;
    readonly signal?: AbortSignal;
  }): Promise<GeometryDeliveryResult>;
}

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

interface GeometryWorkerPostMeta {
  readonly status: number;
  readonly contentType: string;
  readonly hostHttpMs: number;
  readonly hostReadMs: number;
  readonly byteLength: number;
  readonly framePath?: string;
  readonly jsonText?: string;
  readonly delivery: string;
}

const readCadEnv = (key: string): string | undefined => {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const value = proc?.env?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export const isTauriRuntime = (): boolean => {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return w.__TAURI_INTERNALS__ !== undefined || w.__TAURI__ !== undefined;
};

const tryGetTauriInvoke = async (): Promise<TauriInvoke | null> => {
  if (!isTauriRuntime()) return null;
  try {
    const mod = await import('@tauri-apps/api/core');
    return mod.invoke as TauriInvoke;
  } catch {
    return null;
  }
};

const toArrayBuffer = (raw: Uint8Array | ArrayBuffer | number[]): ArrayBuffer => {
  if (raw instanceof ArrayBuffer) return raw;
  if (ArrayBuffer.isView(raw)) {
    const view = raw as Uint8Array;
    const out = new ArrayBuffer(view.byteLength);
    new Uint8Array(out).set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return out;
  }
  const arr = Uint8Array.from(raw);
  const out = new ArrayBuffer(arr.byteLength);
  new Uint8Array(out).set(arr);
  return out;
};

/** Chromium / Vite web fallback — GEO-001G HTTP CGF1. */
export class HttpGeometryDeliveryClient implements GeometryDeliveryClient {
  public readonly mode: GeometryDeliveryMode = 'http-fallback';

  public async post(input: {
    readonly baseUrl: string;
    readonly bodyJson: string;
    readonly accept: string;
    readonly signal?: AbortSignal;
  }): Promise<GeometryDeliveryResult> {
    const t0 = performance.now();
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: input.accept
      },
      body: input.bodyJson
    };
    if (input.signal !== undefined) init.signal = input.signal;
    const res = await fetch(`${input.baseUrl.replace(/\/$/, '')}/v1/geometry`, init);
    const bytes = await res.arrayBuffer();
    const roundTripMs = performance.now() - t0;
    return {
      bytes,
      deliveryMode: 'http-fallback',
      roundTripMs,
      httpMs: roundTripMs,
      ipcMs: 'unavailable',
      status: res.status,
      contentType: res.headers.get('content-type') ?? ''
    };
  }
}

/**
 * Desktop path: Tauri host POSTs to the worker, stages CGF1 on disk when large,
 * returns raw bytes via `geometry_frame_bytes` → `tauri::ipc::Response`.
 */
export class TauriIpcGeometryDeliveryClient implements GeometryDeliveryClient {
  public readonly mode: GeometryDeliveryMode = 'tauri-ipc';
  private invoke: TauriInvoke | null = null;

  public async post(input: {
    readonly baseUrl: string;
    readonly bodyJson: string;
    readonly accept: string;
    readonly signal?: AbortSignal;
  }): Promise<GeometryDeliveryResult> {
    if (input.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    this.invoke ??= await tryGetTauriInvoke();
    if (this.invoke === null) {
      throw new Error('Tauri invoke unavailable');
    }
    const t0 = performance.now();
    const meta = await this.invoke<GeometryWorkerPostMeta>('geometry_worker_post', {
      workerUrl: input.baseUrl.replace(/\/$/, ''),
      bodyJson: input.bodyJson,
      accept: input.accept
    });

    if (typeof meta.jsonText === 'string' && meta.jsonText.length > 0) {
      const encoded = new TextEncoder().encode(meta.jsonText);
      const bytes = toArrayBuffer(encoded);
      const ipcMs = performance.now() - t0;
      return {
        bytes,
        deliveryMode: 'tauri-ipc',
        roundTripMs: ipcMs,
        httpMs: meta.hostHttpMs,
        ipcMs,
        status: meta.status,
        contentType: meta.contentType || 'application/json'
      };
    }

    if (typeof meta.framePath !== 'string' || meta.framePath.length === 0) {
      throw new Error('geometry_worker_post omitted framePath and jsonText');
    }
    const raw = await this.invoke<Uint8Array | ArrayBuffer | number[]>(
      'geometry_frame_bytes',
      { path: meta.framePath }
    );
    const ipcMs = performance.now() - t0;
    return {
      bytes: toArrayBuffer(raw),
      deliveryMode: 'tauri-ipc',
      roundTripMs: ipcMs,
      httpMs: meta.hostHttpMs,
      ipcMs,
      status: meta.status,
      contentType: meta.contentType || 'application/vnd.clinical.geometry-frame'
    };
  }
}

/**
 * Models the desktop host: Node performs the worker HTTP round-trip.
 * Used in Vitest to prove host-side delivery without requiring a Tauri window.
 */
export class NodeHostGeometryDeliveryClient implements GeometryDeliveryClient {
  public readonly mode: GeometryDeliveryMode = 'node-host';

  public async post(input: {
    readonly baseUrl: string;
    readonly bodyJson: string;
    readonly accept: string;
    readonly signal?: AbortSignal;
  }): Promise<GeometryDeliveryResult> {
    const t0 = performance.now();
    // GEO-002: node-host uses inline CGF1 (local fetch) — file staging is Tauri-only.
    // Avoids extra disk round-trips while preserving binary end-to-end delivery.
    const bodyJson = input.bodyJson;
    const res = await fetch(`${input.baseUrl.replace(/\/$/, '')}/v1/geometry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: input.accept
      },
      body: bodyJson,
      ...(input.signal !== undefined ? { signal: input.signal } : {})
    });
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('json')) {
      const json = (await res.json()) as Record<string, unknown>;
      if (typeof json.frame_path === 'string') {
        const fs = await import('node:fs/promises');
        const fileBytes = await fs.readFile(String(json.frame_path));
        await fs.unlink(String(json.frame_path)).catch(() => undefined);
        const roundTripMs = performance.now() - t0;
        const copy = toArrayBuffer(fileBytes);
        return {
          bytes: copy,
          deliveryMode: 'node-host',
          roundTripMs,
          httpMs: roundTripMs,
          ipcMs: 'unavailable',
          status: res.status,
          contentType: 'application/vnd.clinical.geometry-frame'
        };
      }
      const text = JSON.stringify(json);
      const roundTripMs = performance.now() - t0;
      return {
        bytes: toArrayBuffer(new TextEncoder().encode(text)),
        deliveryMode: 'node-host',
        roundTripMs,
        httpMs: roundTripMs,
        ipcMs: 'unavailable',
        status: res.status,
        contentType
      };
    }
    const bytes = await res.arrayBuffer();
    const roundTripMs = performance.now() - t0;
    return {
      bytes,
      deliveryMode: 'node-host',
      roundTripMs,
      httpMs: roundTripMs,
      ipcMs: 'unavailable',
      status: res.status,
      contentType
    };
  }
}

let overrideClient: GeometryDeliveryClient | null = null;

export const setGeometryDeliveryClientForTests = (
  client: GeometryDeliveryClient | null
): void => {
  overrideClient = client;
};

export const resolveGeometryDeliveryClient = async (): Promise<GeometryDeliveryClient> => {
  if (overrideClient !== null) return overrideClient;
  const forced = (readCadEnv('CAD_GEOMETRY_DELIVERY') ?? '').toLowerCase();
  if (forced === 'http' || forced === 'http-fallback') {
    return new HttpGeometryDeliveryClient();
  }
  if (forced === 'node-host' || forced === 'node') {
    return new NodeHostGeometryDeliveryClient();
  }
  if (forced === 'ipc' || forced === 'tauri-ipc' || forced === 'tauri') {
    if (isTauriRuntime()) return new TauriIpcGeometryDeliveryClient();
    return new HttpGeometryDeliveryClient();
  }
  if (isTauriRuntime()) {
    return new TauriIpcGeometryDeliveryClient();
  }
  const isNode =
    typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions
      ?.node === 'string';
  if (isNode && typeof window === 'undefined') {
    return new NodeHostGeometryDeliveryClient();
  }
  return new HttpGeometryDeliveryClient();
};
