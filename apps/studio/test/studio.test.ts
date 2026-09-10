import { describe, expect, it } from 'vitest';
import { StudioApplication } from '../src/application/StudioApplication.js';
import { StudioBootstrap } from '../src/application/bootstrap.js';
import { DEFAULT_APPLICATION_CONFIGURATION } from '../src/application/configuration.js';
import { PLATFORM_PACKAGES } from '../src/application/diagnostics.js';
import { StudioCompositionRoot } from '../src/application/composition-root.js';
import { DEFAULT_LAYOUT } from '../src/application/layout-persistence.js';
import { STUDIO_MENUS } from '../src/menus/menu-definitions.js';

describe('bootstrap', () => {
  it('bootstraps composition root under cold-start budget', () => {
    const result = new StudioBootstrap().bootstrap({
      forceMockViewportBackend: true,
      clock: { now: () => 1000 }
    });
    expect(result.root.isDisposed()).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.durationMs).toBeLessThan(DEFAULT_APPLICATION_CONFIGURATION.coldStartupBudgetMs);
    result.root.dispose();
  });
});

describe('composition', () => {
  it('composes required platform packages without disposing early', () => {
    const root = new StudioCompositionRoot({
      forceMockViewportBackend: true,
      clock: { now: () => 1 }
    });
    expect(root.runtimes.project).toBeDefined();
    expect(root.runtimes.import).toBeDefined();
    expect(root.runtimes.viewport).toBeDefined();
    expect(root.runtimes.interaction).toBeDefined();
    expect(root.runtimes.camera).toBeDefined();
    expect(root.runtimes.selection).toBeDefined();
    expect(root.runtimes.scene).toBeDefined();
    expect(root.runtimes.geometry).toBeDefined();
    expect(root.runtimes.tools).toBeDefined();
    expect(root.runtimes.kernel).toBeDefined();
    expect(root.runtimes.platform).toBeDefined();
    expect(PLATFORM_PACKAGES.length).toBeGreaterThanOrEqual(12);
    root.dispose();
  });
});

describe('application startup', () => {
  it('starts and shuts down StudioApplication', async () => {
    const app = new StudioApplication();
    const root = app.start({ forceMockViewportBackend: true, clock: { now: () => 42 } });
    expect(app.getRoot()).toBe(root);
    expect(root.commands.get('project.new')?.enabled).toBe(true);
    await app.shutdown();
    expect(app.getRoot()).toBeUndefined();
  });
});

describe('workspace / layout', () => {
  it('persists panel collapse defaults and updates', () => {
    const root = new StudioCompositionRoot({ forceMockViewportBackend: true });
    expect(root.layout.get().leftWidth).toBe(DEFAULT_LAYOUT.leftWidth);
    root.layout.update({ leftCollapsed: true, bottomCollapsed: false });
    expect(root.layout.get().leftCollapsed).toBe(true);
    expect(root.layout.get().bottomCollapsed).toBe(false);
    root.dispose();
  });
});

describe('window', () => {
  it('restores window state manager defaults', () => {
    const root = new StudioCompositionRoot({
      forceMockViewportBackend: true,
      configuration: { defaultWindowWidth: 1280, defaultWindowHeight: 800 }
    });
    expect(root.windowState.get().width).toBeGreaterThanOrEqual(1024);
    expect(root.windowState.get().height).toBeGreaterThanOrEqual(640);
    root.windowState.update({ width: 1300, height: 850, maximized: false });
    expect(root.windowState.get().width).toBe(1300);
    root.dispose();
  });
});

describe('menu', () => {
  it('defines File Edit View Window Help menus', () => {
    expect(Object.keys(STUDIO_MENUS)).toEqual(['File', 'Edit', 'View', 'Window', 'Help']);
    expect(STUDIO_MENUS.File.some((i) => i.id === 'project.new')).toBe(true);
    expect(STUDIO_MENUS.Help.some((i) => i.id === 'app.about')).toBe(true);
  });
});

describe('runtime integration', () => {
  it('creates project, lists importers, and attaches mock viewport', async () => {
    const root = new StudioCompositionRoot({
      forceMockViewportBackend: true,
      clock: { now: () => 10 }
    });
    await root.commands.invoke('project.new');
    expect(root.sessions.projectSession).toBeDefined();
    expect(root.runtimes.import.getPlugins().list().length).toBeGreaterThan(0);

    const canvas = {
      width: 640,
      height: 480,
      clientWidth: 640,
      clientHeight: 480,
      getContext: () => null
    };
    const attached = await root.attachViewport(canvas);
    expect(attached).toBe(true);
    expect(root.sessions.viewportSession).toBeDefined();
    expect(root.sessions.cameraSession).toBeDefined();
    expect(root.sessions.interactionSession).toBeDefined();
    expect(root.sessions.selectionSession).toBeDefined();
    root.handleRawInput({
      kind: 'wheel',
      position: { x: 10, y: 10 },
      deltaX: 0,
      deltaY: 40,
      deltaZ: 0,
      deltaMode: 'pixel',
      modifiers: { alt: false, ctrl: false, meta: false, shift: false },
      timestamp: 11
    });
    root.resizeViewport(800, 600);
    root.dispose();
  });
});

describe('smoke', () => {
  it('registers command palette hotkey Mod+Shift+P', () => {
    const root = new StudioCompositionRoot({ forceMockViewportBackend: true });
    const id = root.hotkeys.resolve({
      key: 'P',
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      altKey: false
    });
    expect(id).toBe('app.commandPalette');
    root.dispose();
  });
});
