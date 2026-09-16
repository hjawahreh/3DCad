/**
 * StudioCompositionRoot — wires certified platform packages into host-owned services.
 * Does not implement geometry, parsers, or clinical tools.
 */

import { CameraRuntime, type CameraSession } from '@cad-studio/camera-runtime';
import { GeometryServices } from '@cad-studio/geometry-services';
import { ImportRuntime } from '@cad-studio/import-runtime';
import {
  InteractionRuntime,
  type InteractionSession
} from '@cad-studio/interaction-runtime';
import { RuntimeBuilder, systemClock } from '@cad-studio/platform-runtime';
import { ProjectRuntime, type ProjectSession } from '@cad-studio/project-runtime';
import {
  asDocumentRevisionId,
  createDocumentRevision,
  SceneProjectionEngine
} from '@cad-studio/scene';
import { SelectionRuntime, type SelectionSession } from '@cad-studio/selection-runtime';
import { OperationHost } from '@cad-studio/tool-runtime';
import { GeometryServicesKernelPort } from '../clinical/trim/GeometryServicesKernelPort.js';
import { ClinicalGeometryKernelBridge } from '../geometry-kernel/ClinicalGeometryKernelBridge.js';
import {
  HybridGeometryBackend
} from '../geometry-kernel/index.js';
import {
  ViewportRuntime,
  type ViewportCanvasElement,
  type ViewportSession
} from '@cad-studio/viewport-runtime';
import {
  resolveApplicationConfiguration,
  type ApplicationConfiguration
} from './configuration.js';
import { CrashRecoveryHooks } from './crash-recovery.js';
import { ApplicationDiagnostics } from './diagnostics.js';
import { LayoutPersistence } from './layout-persistence.js';
import { ApplicationMetrics } from './metrics.js';
import { NotificationHost } from './notifications.js';
import { screenDeltaToOrbitRadians } from './camera-orbit-mapping.js';
import { DialogHost, ModalHost } from './overlays.js';
import { ClinicalProcessFeedbackHost } from '../clinical/shell/ClinicalProcessFeedback.js';
import { CommandRegistry } from './commands.js';
import { HotkeyRegistration } from './hotkeys.js';
import { ApplicationSettingsStore, DEFAULT_APPLICATION_SETTINGS } from './settings.js';
import { ThemeManager } from './theme.js';
import { WindowStateManager } from './window-state.js';
import { registerStudioCommands } from './register-commands.js';
import { registerStudioHotkeys } from './register-hotkeys.js';

export interface StudioRuntimes {
  readonly platform: ReturnType<RuntimeBuilder['build']>;
  readonly project: ProjectRuntime;
  readonly import: ImportRuntime;
  readonly scene: SceneProjectionEngine;
  readonly viewport: ViewportRuntime;
  readonly interaction: InteractionRuntime;
  readonly camera: CameraRuntime;
  readonly selection: SelectionRuntime;
  readonly geometry: GeometryServices;
  readonly tools: OperationHost;
  readonly kernel: ClinicalGeometryKernelBridge;
}

export interface StudioWorkspaceSessions {
  projectSession: ProjectSession | undefined;
  viewportSession: ViewportSession | undefined;
  interactionSession: InteractionSession | undefined;
  cameraSession: CameraSession | undefined;
  selectionSession: SelectionSession | undefined;
}

export interface StudioCompositionRootOptions {
  readonly configuration?: Partial<ApplicationConfiguration>;
  readonly forceMockViewportBackend?: boolean;
  readonly clock?: { now: () => number };
}

export class StudioCompositionRoot {
  public readonly configuration: ApplicationConfiguration;
  public readonly settings: ApplicationSettingsStore;
  public readonly theme: ThemeManager;
  public readonly layout: LayoutPersistence;
  public readonly windowState: WindowStateManager;
  public readonly diagnostics: ApplicationDiagnostics;
  public readonly metrics: ApplicationMetrics;
  public readonly notifications: NotificationHost;
  public readonly processFeedback: ClinicalProcessFeedbackHost;
  public readonly modals: ModalHost;
  public readonly dialogs: DialogHost;
  public readonly commands: CommandRegistry;
  public readonly hotkeys: HotkeyRegistration;
  public readonly crashRecovery: CrashRecoveryHooks;
  public readonly runtimes: StudioRuntimes;
  public readonly sessions: StudioWorkspaceSessions = {
    projectSession: undefined,
    viewportSession: undefined,
    interactionSession: undefined,
    cameraSession: undefined,
    selectionSession: undefined
  };

  private disposed = false;
  private interactionUnsub: (() => void) | undefined;
  private dragActive = false;
  private lastPointer = { x: 0, y: 0 };
  private uiRevision = 0;
  private readonly uiListeners = new Set<() => void>();

  public constructor(options: StudioCompositionRootOptions = {}) {
    this.configuration = resolveApplicationConfiguration(options.configuration);
    this.settings = new ApplicationSettingsStore({
      autosave: {
        enabled: true,
        intervalMs: this.configuration.autosaveIntervalMs
      },
      viewport: {
        showGrid: this.configuration.enableGridPlaceholder,
        targetFps: DEFAULT_APPLICATION_SETTINGS.viewport.targetFps,
        preferredBackend: DEFAULT_APPLICATION_SETTINGS.viewport.preferredBackend
      }
    });
    this.theme = new ThemeManager();
    this.layout = new LayoutPersistence();
    this.windowState = new WindowStateManager({
      width: this.configuration.defaultWindowWidth,
      height: this.configuration.defaultWindowHeight
    });
    this.diagnostics = new ApplicationDiagnostics();
    this.metrics = new ApplicationMetrics();
    this.notifications = new NotificationHost();
    this.processFeedback = new ClinicalProcessFeedbackHost();
    this.modals = new ModalHost();
    this.dialogs = new DialogHost();
    this.commands = new CommandRegistry();
    this.hotkeys = new HotkeyRegistration();
    this.crashRecovery = new CrashRecoveryHooks();

    const clock = options.clock ?? { now: () => systemClock.now() };
    const forceMock =
      options.forceMockViewportBackend === true ||
      this.configuration.forceMockViewportBackend ||
      this.settings.get().viewport.preferredBackend === 'mock';

    const platform = new RuntimeBuilder(systemClock).build();
    const hybrid = new HybridGeometryBackend();
    const kernel = new ClinicalGeometryKernelBridge(undefined, undefined, undefined, hybrid);
    // Non-blocking health probe — enables VTK when sidecar is up.
    void hybrid.refreshVtkHealth().then((ok) => {
      if (ok) {
        console.info('[geometry] VTK HTTP worker available — hybrid backend enabled');
      } else {
        console.info('[geometry] VTK HTTP worker unavailable — clinical-reference-v1 active');
      }
    });
    // Re-probe periodically in DEV so starting the sidecar later still works.
    if (typeof window !== 'undefined') {
      window.setInterval(() => {
        void hybrid.refreshVtkHealth();
      }, 10_000);
    }
    const geometry = new GeometryServices(kernel);
    const tools = new OperationHost({ kernel: new GeometryServicesKernelPort(geometry) });
    const project = new ProjectRuntime({
      clock,
      defaultConfiguration: {
        autosaveIntervalMs: this.settings.get().autosave.intervalMs
      }
    });
    const importRuntime = new ImportRuntime({
      clock,
      configuration: {
        maxConcurrentSessions: this.settings.get().performance.limitConcurrentImports,
        allowDuplicateRequests: true
      }
    });
    importRuntime.getFactory().registerPassthrough(importRuntime.getPlugins(), {
      id: 'studio-passthrough',
      name: 'Studio Passthrough Importer',
      extensions: ['stl', 'obj', 'ply', 'off', '3mf', 'gltf', 'glb', 'step', 'stp', 'iges', 'igs'],
      mimeTypes: ['model/stl', 'model/obj', 'model/gltf+json', 'model/gltf-binary'],
      priority: 1
    });

    const scene = new SceneProjectionEngine({ now: () => clock.now() });
    const viewport = new ViewportRuntime({
      clock: {
        now: () => clock.now(),
        requestFrame: (cb) =>
          typeof requestAnimationFrame !== 'undefined'
            ? requestAnimationFrame(cb)
            : (setTimeout(() => cb(clock.now()), 16) as unknown as number),
        cancelFrame: (handle) => {
          if (typeof cancelAnimationFrame !== 'undefined') {
            cancelAnimationFrame(handle);
          } else {
            clearTimeout(handle);
          }
        }
      },
      forceMockBackend: forceMock,
      defaultConfiguration: {
        targetFps: this.settings.get().viewport.targetFps,
        allowMockBackend: true,
        allowBackendFallback: true
      }
    });
    const interaction = new InteractionRuntime({ clock });
    const camera = new CameraRuntime({ clock });
    const selection = new SelectionRuntime({ clock });

    this.runtimes = Object.freeze({
      platform,
      project,
      import: importRuntime,
      scene,
      viewport,
      interaction,
      camera,
      selection,
      geometry,
      tools,
      kernel
    });

    registerStudioCommands(this);
    registerStudioHotkeys(this);
  }

  public isDisposed(): boolean {
    return this.disposed;
  }

  public getUiRevision(): number {
    return this.uiRevision;
  }

  public subscribeUi(listener: () => void): () => void {
    this.uiListeners.add(listener);
    return () => {
      this.uiListeners.delete(listener);
    };
  }

  public notifyUi(): void {
    this.uiRevision += 1;
    for (const listener of this.uiListeners) {
      listener();
    }
  }

  public async attachViewport(canvas: ViewportCanvasElement): Promise<boolean> {
    if (this.disposed) {
      return false;
    }
    if (this.sessions.viewportSession !== undefined) {
      return true;
    }

    const created = this.runtimes.viewport.createSession();
    if (!created.ok) {
      this.diagnostics.record('error', created.error.message, 'viewport');
      return false;
    }

    const boot = await this.runtimes.viewport.bootstrapSession(created.value, canvas);
    if (!boot.ok) {
      this.diagnostics.record('error', boot.error.message, 'viewport');
      created.value.dispose();
      return false;
    }

    const viewportSession = boot.value;
    this.sessions.viewportSession = viewportSession;
    this.metrics.recordViewportAttach();

    const interactionBoot = this.runtimes.interaction.bootstrapSession({
      viewportId: viewportSession.viewportId
    });
    if (!interactionBoot.ok) {
      this.diagnostics.record('error', interactionBoot.error.message, 'interaction');
      return false;
    }
    this.sessions.interactionSession = interactionBoot.value;

    const size = {
      width: canvas.clientWidth ?? canvas.width,
      height: canvas.clientHeight ?? canvas.height
    };
    const cameraBoot = this.runtimes.camera.bootstrapSession({
      viewportId: viewportSession.viewportId,
      interactionSessionId: interactionBoot.value.sessionId,
      viewportSize: size
    });
    if (!cameraBoot.ok) {
      this.diagnostics.record('error', cameraBoot.error.message, 'camera');
      return false;
    }
    this.sessions.cameraSession = cameraBoot.value;

    const selectionBoot = this.runtimes.selection.bootstrapSession({
      interactionSessionId: interactionBoot.value.sessionId
    });
    if (!selectionBoot.ok) {
      this.diagnostics.record('error', selectionBoot.error.message, 'selection');
      return false;
    }
    this.sessions.selectionSession = selectionBoot.value;

    this.wireCameraNavigation(interactionBoot.value, cameraBoot.value);

    const empty = this.runtimes.scene.project(
      createDocumentRevision(asDocumentRevisionId(1), [])
    );
    if (empty.ok) {
      viewportSession.publishScene(empty.value.snapshot);
    }

    const run = viewportSession.run();
    if (!run.ok) {
      this.diagnostics.record('warning', run.error.message, 'viewport');
    }

    const backend = viewportSession.getDiagnostics().snapshot().backend;
    this.diagnostics.setGpuBackend(backend);
    this.diagnostics.record('info', `Viewport attached (${backend ?? 'unknown'})`, 'viewport');
    this.notifyUi();
    return true;
  }

  public resizeViewport(width: number, height: number): void {
    const viewport = this.sessions.viewportSession;
    const camera = this.sessions.cameraSession;
    if (viewport !== undefined) {
      viewport.resize({ width, height });
    }
    if (camera !== undefined) {
      camera.synchronize({ width, height });
    }
  }

  public handleRawInput(input: Parameters<InteractionSession['handle']>[0]): void {
    this.sessions.interactionSession?.handle(input);
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.interactionUnsub?.();
    this.sessions.selectionSession?.dispose();
    this.sessions.cameraSession?.dispose();
    this.sessions.interactionSession?.dispose();
    this.sessions.viewportSession?.dispose();
    this.sessions.projectSession?.dispose();
    this.runtimes.selection.dispose();
    this.runtimes.camera.dispose();
    this.runtimes.interaction.dispose();
    this.runtimes.viewport.dispose();
    this.runtimes.import.dispose();
    this.runtimes.project.dispose();
    this.runtimes.scene.dispose();
    this.crashRecovery.markCleanShutdown();
  }

  private wireCameraNavigation(
    interaction: InteractionSession,
    camera: CameraSession
  ): void {
    this.interactionUnsub = interaction.getEvents().subscribe((event) => {
      if (event.kind === 'wheel') {
        // Camera Runtime zoom multiplies eye–target radius by factor (>0).
        // Wheel down (deltaY > 0) → zoom out (factor > 1); wheel up → zoom in.
        // Never pass ≤0 — ZoomController treats that as identity (no-op).
        const step = 1.1;
        camera.zoom(event.deltaY > 0 ? step : 1 / step);
        this.sessions.viewportSession?.invalidate('camera');
        return;
      }
      if (event.kind === 'pointer' || event.kind === 'mouse') {
        const phase = event.phase;
        const x = event.position.x;
        const y = event.position.y;
        const button = event.button;
        if (phase === 'down' && (button === 'primary' || button === 'secondary')) {
          this.dragActive = true;
          this.lastPointer = { x, y };
          return;
        }
        if (phase === 'up' || phase === 'cancel') {
          this.dragActive = false;
          return;
        }
        if (phase === 'move' && this.dragActive) {
          const dx = x - this.lastPointer.x;
          const dy = y - this.lastPointer.y;
          this.lastPointer = { x, y };
          if (button === 'secondary' || event.modifiers.shift) {
            // Pan semantics unchanged (PanController owns screen→view-plane signs).
            camera.pan(dx, dy);
          } else {
            // GEO-003A: single authoritative orbit sign mapping (see camera-orbit-mapping.ts).
            const orbit = screenDeltaToOrbitRadians(dx, dy);
            camera.orbit(orbit.yaw, orbit.pitch);
          }
          this.sessions.viewportSession?.invalidate('camera');
        }
      }
    });
  }
}
