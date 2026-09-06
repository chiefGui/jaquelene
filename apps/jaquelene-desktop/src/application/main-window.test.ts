import { EventEmitter } from "node:events";
import { BackendService, type Backend } from "@jaquelene/backend";
import { Cause, Context, Effect, Exit, Fiber, Layer, Scope } from "effect";
import type { BrowserWindowConstructorOptions } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  ApplicationDiagnosticsService,
  type ApplicationDiagnostics,
} from "../diagnostics/diagnostics";
import { FavoriteModelsService } from "../feature/model/favorite-models-service";
import type { FavoriteModels } from "../feature/model/favorite-models";
import { LocalStateService, type LocalState, type MainWindowState } from "../local-state";
import { PreferencesService, type Preferences } from "../preferences/preferences";
import { MainWindowService } from "./main-window";
import { RendererService } from "./renderer";

const harness = vi.hoisted(() => ({
  windows: [] as TestWindow[],
  release: vi.fn(),
  expose: vi.fn(),
  report: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { name: "Jaquelene" },
  BrowserWindow: vi.fn(function (options: BrowserWindowConstructorOptions) {
    const window = new TestWindow(options);
    harness.windows.push(window);
    return window;
  }),
  screen: { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }] },
  shell: { openExternal: vi.fn(async () => {}) },
}));
vi.mock("../diagnostics/ipc", () => ({
  exposeDiagnostics: vi.fn(),
  exposeDiagnosticsPreferences: vi.fn(),
}));
vi.mock("../feature/campaign/ipc", () => ({
  exposeCampaigns: vi.fn(),
  exposeCampaignUsage: vi.fn(),
  exposeCampaignPreferences: vi.fn(),
}));
vi.mock("../feature/thread/ipc", () => ({
  createThreadMessaging: () => ({ expose: harness.expose }),
}));
vi.mock("../feature/thread/regeneration-preferences-ipc", () => ({
  exposeRegenerationPreferences: vi.fn(),
}));
vi.mock("../feature/model/catalog-ipc", () => ({ exposeModelCatalog: () => vi.fn() }));
vi.mock("../feature/model/favorite-models-ipc", () => ({ exposeFavoriteModels: vi.fn() }));
vi.mock("../feature/provider/ipc", () => ({ exposeProviders: vi.fn() }));
vi.mock("../feature/prompt/ipc", () => ({ exposePrompts: vi.fn() }));
vi.mock("../feature/usage/ipc", () => ({ exposeUsage: () => vi.fn() }));
vi.mock("../feature/appearance/user-interface/ipc", () => ({
  exposeUserInterfacePreferences: () => vi.fn(),
}));
vi.mock("../storage/ipc", () => ({ exposeStorage: vi.fn() }));

class TestWindow extends EventEmitter {
  readonly loading = Promise.withResolvers<void>();
  readonly webContents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    setWindowOpenHandler: vi.fn(),
    getURL: () => "app://renderer",
  });
  destroyed = false;
  minimized = false;
  readonly show = vi.fn();
  readonly maximize = vi.fn();
  readonly restore = vi.fn(() => {
    this.minimized = false;
  });
  readonly removeMenu = vi.fn();
  readonly loadURL = vi.fn(() => this.loading.promise);
  readonly destroy = vi.fn(() => {
    this.destroyed = true;
    this.emit("closed");
  });

  constructor(readonly options: BrowserWindowConstructorOptions) {
    super();
  }
  isDestroyed() {
    return this.destroyed;
  }
  isMinimized() {
    return this.minimized;
  }
  isMaximized() {
    return this.maximize.mock.calls.length > 0;
  }
  getNormalBounds() {
    return { x: 10, y: 20, width: 1200, height: 800 };
  }
  close() {
    this.emit("close");
    this.destroy();
  }
}

const scopes = new Set<Scope.Closeable>();

async function openEnvironment(savedState?: MainWindowState) {
  const saveWindowState = vi.fn();
  const dependencies = Layer.mergeAll(
    Layer.succeed(BackendService, {} as Backend),
    Layer.succeed(ApplicationDiagnosticsService, {
      report: harness.report,
    } as unknown as ApplicationDiagnostics),
    Layer.succeed(FavoriteModelsService, {} as FavoriteModels),
    Layer.succeed(LocalStateService, {
      loadMainWindowState: () => savedState,
      saveMainWindowState: saveWindowState,
    } as unknown as LocalState),
    Layer.succeed(PreferencesService, {
      appearance: { userInterface: { get: () => ({ scale: 1 }) } },
    } as unknown as Preferences),
    Layer.succeed(RendererService, { url: "app://renderer" }),
  );
  const scope = Scope.makeUnsafe();
  scopes.add(scope);
  const context = await Effect.runPromise(
    Layer.build(MainWindowService.layer.pipe(Layer.provide(dependencies))).pipe(
      Scope.provide(scope),
    ),
  );
  return {
    mainWindow: Context.get(context, MainWindowService),
    saveWindowState,
    close() {
      scopes.delete(scope);
      return Effect.runPromiseExit(Scope.close(scope, Exit.void));
    },
  };
}

async function loadingWindow(index = 0) {
  await vi.waitFor(() => expect(harness.windows[index]?.loadURL).toHaveBeenCalledOnce());
  return harness.windows[index]!;
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.windows.length = 0;
  harness.release.mockReset();
  harness.expose.mockReset().mockImplementation(() => harness.release);
});

afterEach(async () => {
  for (const scope of scopes) {
    const exit = await Effect.runPromiseExit(Scope.close(scope, Exit.void));
    expect(Exit.isSuccess(exit)).toBe(true);
  }
  scopes.clear();
});

describe("main window lifecycle", () => {
  it("shares loading, restores window state once, and releases subscriptions before reopening", async () => {
    const saved = { bounds: { x: 10, y: 20, width: 1200, height: 800 }, maximized: true };
    const { mainWindow, saveWindowState } = await openEnvironment(saved);
    expect(mainWindow.inspect()).toEqual({ state: "open", window: "absent" });
    const first = Effect.runPromise(mainWindow.show);
    const second = Effect.runPromise(mainWindow.show);
    const window = await loadingWindow();
    expect(harness.windows).toHaveLength(1);
    expect(harness.expose).toHaveBeenCalledOnce();
    expect(harness.release).not.toHaveBeenCalled();
    expect(window.options).toMatchObject(saved.bounds);
    expect(mainWindow.inspect()).toEqual({ state: "open", window: "opening" });
    window.minimized = true;
    window.loading.resolve();
    await Promise.all([first, second]);
    expect(window.maximize).toHaveBeenCalledOnce();
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledTimes(2);
    expect(mainWindow.inspect()).toEqual({ state: "open", window: "open" });
    window.close();
    const reopened = Effect.runPromise(mainWindow.show);
    const replacement = await loadingWindow(1);
    expect(saveWindowState).toHaveBeenCalledWith(saved);
    expect(harness.release).toHaveBeenCalledOnce();
    expect(window.eventNames()).toEqual([]);
    expect(window.webContents.eventNames()).toEqual([]);
    replacement.loading.resolve();
    await reopened;
    expect(mainWindow.inspect()).toEqual({ state: "open", window: "open" });
  });

  it("cancels one caller without cancelling shared window loading", async () => {
    const { mainWindow } = await openEnvironment();
    const cancelled = Effect.runFork(mainWindow.show);
    const other = Effect.runPromise(mainWindow.show);
    const window = await loadingWindow();
    await Effect.runPromise(Fiber.interrupt(cancelled));
    expect(window.destroy).not.toHaveBeenCalled();
    window.loading.resolve();
    await other;
    expect(window.show).toHaveBeenCalledOnce();
    expect(harness.windows).toHaveLength(1);
  });

  it("settles a pending show when shutdown precedes window creation", async () => {
    const { mainWindow, close } = await openEnvironment();
    const showing = Effect.runPromiseExit(mainWindow.show);
    expect(Exit.isSuccess(await close())).toBe(true);
    const exit = await showing;
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    }
    expect(harness.windows).toEqual([]);
    expect(harness.expose).not.toHaveBeenCalled();
    expect(mainWindow.inspect()).toEqual({ state: "closed", window: "absent" });
  });

  it("interrupts an uncooperative load on shutdown and ignores its late completion", async () => {
    const { mainWindow, close } = await openEnvironment();
    const showing = Effect.runPromiseExit(mainWindow.show);
    const window = await loadingWindow();
    expect(Exit.isSuccess(await close())).toBe(true);
    expect(Exit.isFailure(await showing)).toBe(true);
    expect(window.destroy).toHaveBeenCalledOnce();
    expect(harness.release).toHaveBeenCalledOnce();
    expect(mainWindow.inspect()).toEqual({ state: "closed", window: "absent" });
    window.loading.resolve();
    await Effect.runPromise(Effect.yieldNow);
    expect(window.show).not.toHaveBeenCalled();
    await expect(Effect.runPromise(mainWindow.show)).rejects.toMatchObject({
      _tag: "MainWindowShowError",
      cause: expect.objectContaining({ message: "Main window manager is closed." }),
    });
    expect(harness.windows).toHaveLength(1);
  });

  it("cleans up a failed load before reporting it and permits another opening", async () => {
    const { mainWindow } = await openEnvironment();
    const failure = new Error("Renderer load failed.");
    const showing = Effect.runPromiseExit(mainWindow.show);
    const window = await loadingWindow();
    window.loading.reject(failure);
    const exit = await showing;
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toMatchObject({
        _tag: "MainWindowShowError",
        cause: failure,
      });
    }
    expect(window.destroy).toHaveBeenCalledOnce();
    expect(harness.release).toHaveBeenCalledOnce();
    expect(mainWindow.inspect().window).toBe("absent");
    const retry = Effect.runPromise(mainWindow.show);
    const replacement = await loadingWindow(1);
    replacement.loading.resolve();
    await retry;
  });

  it("releases an acquired window when IPC setup fails", async () => {
    const { mainWindow } = await openEnvironment();
    const failure = new Error("IPC setup failed.");
    harness.expose.mockImplementationOnce(() => {
      throw failure;
    });
    await expect(Effect.runPromise(mainWindow.show)).rejects.toMatchObject({
      _tag: "MainWindowShowError",
      cause: failure,
    });
    expect(harness.windows[0]?.destroy).toHaveBeenCalledOnce();
    expect(harness.windows[0]?.eventNames()).toEqual([]);
    expect(mainWindow.inspect().window).toBe("absent");
  });

  it("owns the window before IPC setup can initiate shutdown", async () => {
    const { mainWindow, close } = await openEnvironment();
    let closing: ReturnType<typeof close> | undefined;
    harness.expose.mockImplementationOnce(() => {
      closing = close();
      return harness.release;
    });
    const exit = await Effect.runPromiseExit(mainWindow.show);
    expect(Exit.isFailure(exit)).toBe(true);
    expect(closing).toBeDefined();
    expect(Exit.isSuccess(await closing!)).toBe(true);
    expect(harness.release).toHaveBeenCalledOnce();
    expect(harness.windows[0]?.destroy).toHaveBeenCalledOnce();
    expect(mainWindow.inspect()).toEqual({ state: "closed", window: "absent" });
  });

  it("reopens after the native window closes during loading", async () => {
    const { mainWindow } = await openEnvironment();
    const showing = Effect.runPromiseExit(mainWindow.show);
    const window = await loadingWindow();
    window.close();
    expect(Exit.isFailure(await showing)).toBe(true);
    expect(harness.release).toHaveBeenCalledOnce();
    const retry = Effect.runPromise(mainWindow.show);
    const replacement = await loadingWindow(1);
    window.loading.resolve();
    replacement.loading.resolve();
    await retry;
    expect(window.show).not.toHaveBeenCalled();
    expect(replacement.show).toHaveBeenCalledOnce();
  });

  it("preserves load and cleanup failures together", async () => {
    const { mainWindow } = await openEnvironment();
    const loadingFailure = new Error("Renderer load failed.");
    const cleanupFailure = new Error("Subscription cleanup failed.");
    const showing = Effect.runPromiseExit(mainWindow.show);
    const window = await loadingWindow();
    harness.release.mockImplementationOnce(() => {
      throw cleanupFailure;
    });
    window.loading.reject(loadingFailure);
    const exit = await showing;
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(exit.cause.reasons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ error: expect.objectContaining({ cause: loadingFailure }) }),
          expect.objectContaining({ defect: cleanupFailure }),
        ]),
      );
    }
    expect(window.destroy).toHaveBeenCalledOnce();
    expect(mainWindow.inspect().window).toBe("absent");
  });

  it("drains remaining cleanup and preserves release defects during shutdown", async () => {
    const { mainWindow, close } = await openEnvironment();
    const showing = Effect.runPromise(mainWindow.show);
    const window = await loadingWindow();
    window.loading.resolve();
    await showing;
    const failure = new Error("Subscription cleanup failed.");
    harness.release.mockImplementationOnce(() => {
      throw failure;
    });
    const exit = await close();
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.prettyErrors(exit.cause).map((error) => error.message)).toContain(
        failure.message,
      );
    }
    expect(window.destroy).toHaveBeenCalledOnce();
    expect(window.eventNames()).toEqual([]);
    expect(mainWindow.inspect()).toEqual({ state: "closed", window: "absent" });
  });

  it("reports native-close cleanup failures without preventing reopening", async () => {
    const { mainWindow } = await openEnvironment();
    const showing = Effect.runPromise(mainWindow.show);
    const window = await loadingWindow();
    window.loading.resolve();
    await showing;
    const failure = new Error("Subscription cleanup failed.");
    harness.release.mockImplementationOnce(() => {
      throw failure;
    });
    window.close();
    await vi.waitFor(() =>
      expect(harness.report).toHaveBeenCalledWith(
        expect.objectContaining({ operation: "window.release", error: failure }),
      ),
    );
    const reopening = Effect.runPromise(mainWindow.show);
    const replacement = await loadingWindow(1);
    replacement.loading.resolve();
    await reopening;
    expect(mainWindow.inspect()).toEqual({ state: "open", window: "open" });
  });
});
