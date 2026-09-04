import {
  BackendService,
  type Backend,
  type Campaigns,
  type CampaignUsageReader,
  type Prompts,
  type Providers,
  type Threads,
  type Turns,
  type Usage,
} from "@jaquelene/backend";
import { ErrorSeverity } from "@jaquelene/diagnostics";
import { Context, Effect, Exit, FiberSet, Layer, Schema, Scope } from "effect";
import { app, BrowserWindow, screen, shell } from "electron";
import { join } from "node:path";
import {
  ApplicationDiagnosticsService,
  type ApplicationDiagnostics,
} from "../diagnostics/diagnostics";
import { exposeDiagnostics, exposeDiagnosticsPreferences } from "../diagnostics/ipc";
import { exposeUserInterfacePreferences } from "../feature/appearance/user-interface/ipc";
import { createInterfaceScaleWebPreferences } from "../feature/appearance/user-interface/zoom";
import {
  exposeCampaignPreferences,
  exposeCampaigns,
  exposeCampaignUsage,
} from "../feature/campaign/ipc";
import type { ModelCatalog } from "../feature/model/catalog";
import { exposeModelCatalog } from "../feature/model/catalog-ipc";
import type { FavoriteModels } from "../feature/model/favorite-models";
import { FavoriteModelsService } from "../feature/model/favorite-models-service";
import { exposeFavoriteModels } from "../feature/model/favorite-models-ipc";
import { exposeProviders } from "../feature/provider/ipc";
import { exposePrompts } from "../feature/prompt/ipc";
import { createThreadMessaging } from "../feature/thread/ipc";
import { exposeUsage } from "../feature/usage/ipc";
import { LocalStateService, type LocalState } from "../local-state";
import { PreferencesService, type Preferences } from "../preferences/preferences";
import { exposeStorage } from "../storage/ipc";
import { RendererService } from "./renderer";

const preloadPath = join(import.meta.dirname, "../preload/preload.cjs");

type WindowState = "absent" | "opening" | "open" | "closing";

type EffectRunner = <Success, Failure>(effect: Effect.Effect<Success, Failure>) => Promise<Success>;

type OpenWindow = {
  browserWindow: BrowserWindow;
  scope: Scope.Closeable;
  loaded: Promise<void>;
  restoreMaximized: boolean;
  maximizedRestored: boolean;
  closePromise?: Promise<void>;
};

export type MainWindowInspection = Readonly<{
  state: "open" | "closing" | "closed";
  window: WindowState;
}>;

export type MainWindowManager = Readonly<{
  show: (signal?: AbortSignal) => Promise<void>;
  inspect: () => MainWindowInspection;
  close: () => Promise<void>;
  [Symbol.asyncDispose]: () => Promise<void>;
}>;

export class MainWindowShowError extends Schema.TaggedError<MainWindowShowError>()(
  "MainWindowShowError",
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export type MainWindow = Readonly<{
  show: Effect.Effect<void, MainWindowShowError>;
  inspect: () => MainWindowInspection;
}>;

export class MainWindowService extends Context.Service<MainWindowService, MainWindow>()(
  "@jaquelene/desktop/application/MainWindow",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const backend = yield* BackendService;
      const diagnostics = yield* ApplicationDiagnosticsService;
      const favoriteModels = yield* FavoriteModelsService;
      const localState = yield* LocalStateService;
      const preferences = yield* PreferencesService;
      const renderer = yield* RendererService;
      const runEffect = yield* FiberSet.makeRuntimePromise();

      const manager = yield* Effect.acquireRelease(
        Effect.sync(() =>
          createMainWindowManager({
            rendererUrl: renderer.url,
            diagnostics,
            localState,
            campaigns: backend.campaigns,
            campaignUsage: backend.campaignUsage,
            prompts: backend.prompts,
            threads: backend.threads,
            turns: backend.turns,
            modelCatalog: backend.models,
            favoriteModels,
            preferences,
            providers: backend.providers,
            storage: backend.storage,
            runEffect,
            usage: backend.usage,
          }),
        ),
        (windowManager) => Effect.promise(() => windowManager[Symbol.asyncDispose]()),
      );

      return MainWindowService.of({
        show: Effect.tryPromise({
          try: (signal) => manager.show(signal),
          catch: (cause) =>
            new MainWindowShowError({
              message: "Could not show the main window.",
              cause,
            }),
        }),
        inspect: manager.inspect,
      });
    }),
  );
}

function isSafeExternalUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function interrupted(signal: AbortSignal) {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }

  return new Error("Window operation was interrupted.", { cause: signal.reason });
}

function waitForSignal<Result>(result: Promise<Result>, signal?: AbortSignal) {
  if (!signal) {
    return result;
  }

  if (signal.aborted) {
    result.catch(() => undefined);
    return Promise.reject(interrupted(signal));
  }

  let removeListener: (() => void) | undefined;
  const interruption = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(interrupted(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    removeListener = () => signal.removeEventListener("abort", onAbort);
  });

  return Promise.race([result, interruption]).finally(removeListener);
}

export function createMainWindowManager({
  rendererUrl,
  diagnostics,
  localState,
  campaigns,
  campaignUsage,
  prompts,
  threads,
  turns,
  modelCatalog,
  favoriteModels,
  preferences,
  providers,
  storage,
  runEffect,
  usage,
}: {
  rendererUrl: string;
  diagnostics: ApplicationDiagnostics;
  localState: LocalState;
  campaigns: Campaigns;
  campaignUsage: CampaignUsageReader;
  prompts: Prompts;
  threads: Threads;
  turns: Turns;
  modelCatalog: ModelCatalog;
  favoriteModels: FavoriteModels;
  preferences: Preferences;
  providers: Providers;
  storage: Backend["storage"];
  runEffect: EffectRunner;
  usage: Usage;
}): MainWindowManager {
  const threadMessaging = createThreadMessaging(threads, turns, diagnostics);
  let state: "open" | "closing" | "closed" = "open";
  let windowState: WindowState = "absent";
  let currentWindow: OpenWindow | undefined;
  let opening: Promise<OpenWindow> | undefined;
  let closePromise: Promise<void> | undefined;

  function addFinalizer(scope: Scope.Closeable, finalize: () => void) {
    return runEffect(Scope.addFinalizer(scope, Effect.sync(finalize)));
  }

  function requireOpen() {
    if (state !== "open") {
      throw new Error("Main window manager is closed.");
    }
  }

  function closeWindow(opened: OpenWindow) {
    if (!opened.closePromise) {
      windowState = "closing";
      const closing = runEffect(Scope.close(opened.scope, Exit.void));
      opened.closePromise = closing.finally(() => {
        if (currentWindow === opened) {
          currentWindow = undefined;
          windowState = "absent";
        }
      });
    }

    return opened.closePromise;
  }

  async function openWindow() {
    const scope = await runEffect(Scope.make("sequential"));
    let opened: OpenWindow | undefined;

    try {
      const mainWindowState = localState.loadMainWindowState(
        screen.getAllDisplays().map(({ workArea }) => workArea),
      );
      const browserWindow = new BrowserWindow({
        ...(mainWindowState?.bounds ?? { width: 1180, height: 780 }),
        minWidth: 860,
        minHeight: 620,
        // Electron's native window background parser does not support OKLCH.
        backgroundColor: "rgb(7, 8, 12)",
        show: false,
        title: app.name,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          preload: preloadPath,
          sandbox: true,
          webSecurity: true,
          ...createInterfaceScaleWebPreferences(preferences.appearance.userInterface.get().scale),
        },
      });
      await addFinalizer(scope, () => {
        if (!browserWindow.isDestroyed()) {
          browserWindow.destroy();
        }
      });

      const openedWindow: OpenWindow = {
        browserWindow,
        scope,
        loaded: Promise.resolve(),
        restoreMaximized: mainWindowState?.maximized ?? false,
        maximizedRestored: false,
      };
      opened = openedWindow;
      currentWindow = openedWindow;
      windowState = "opening";

      const onClosed = () => {
        void closeWindow(openedWindow).catch((error: unknown) => {
          diagnostics.report({
            severity: ErrorSeverity.Error,
            operation: "window.release",
            error,
          });
        });
      };
      browserWindow.once("closed", onClosed);
      await addFinalizer(scope, () => browserWindow.off("closed", onClosed));

      exposePrompts(browserWindow.webContents.mainFrame, prompts);
      exposeDiagnostics(browserWindow.webContents.mainFrame, diagnostics);
      exposeDiagnosticsPreferences(browserWindow.webContents.mainFrame, preferences.diagnostics);
      exposeCampaigns(browserWindow.webContents.mainFrame, campaigns);
      exposeCampaignUsage(browserWindow.webContents.mainFrame, campaignUsage);
      await addFinalizer(scope, threadMessaging.expose(browserWindow.webContents.mainFrame));
      exposeCampaignPreferences(browserWindow.webContents.mainFrame, preferences.campaign);
      await addFinalizer(scope, exposeModelCatalog(browserWindow.webContents, modelCatalog));
      exposeFavoriteModels(browserWindow.webContents.mainFrame, favoriteModels);
      await addFinalizer(
        scope,
        exposeUserInterfacePreferences(
          browserWindow.webContents,
          preferences.appearance.userInterface,
        ),
      );
      exposeProviders(browserWindow.webContents.mainFrame, providers);
      exposeStorage(browserWindow.webContents.mainFrame, storage, runEffect);
      await addFinalizer(scope, exposeUsage(browserWindow.webContents, usage));

      const saveWindowState = () => {
        localState.saveMainWindowState({
          bounds: browserWindow.getNormalBounds(),
          maximized: browserWindow.isMaximized(),
        });
      };
      browserWindow.on("close", saveWindowState);
      await addFinalizer(scope, () => browserWindow.off("close", saveWindowState));
      browserWindow.removeMenu();

      browserWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isSafeExternalUrl(url)) {
          void shell.openExternal(url).catch((error: unknown) => {
            diagnostics.report({
              severity: ErrorSeverity.Error,
              operation: "external-link.open",
              error,
            });
          });
        }

        return { action: "deny" };
      });

      const preventExternalNavigation = (event: Electron.Event, url: string) => {
        if (url !== browserWindow.webContents.getURL()) {
          event.preventDefault();
        }
      };
      browserWindow.webContents.on("will-navigate", preventExternalNavigation);
      await addFinalizer(scope, () =>
        browserWindow.webContents.off("will-navigate", preventExternalNavigation),
      );

      openedWindow.loaded = browserWindow.loadURL(rendererUrl);
      return openedWindow;
    } catch (error) {
      try {
        if (opened) {
          await closeWindow(opened);
        } else {
          await runEffect(Scope.close(scope, Exit.void));
        }
      } catch (closeError) {
        throw new AggregateError(
          [error, closeError],
          "Could not close the main window after it failed to open.",
        );
      }

      throw error;
    }
  }

  async function show(signal?: AbortSignal) {
    requireOpen();
    signal?.throwIfAborted();
    const opened =
      currentWindow ??
      (await (opening ??= openWindow().finally(() => {
        opening = undefined;
      })));
    await waitForSignal(opened.loaded, signal);
    const { browserWindow } = opened;

    if (state !== "open" || currentWindow !== opened || browserWindow.isDestroyed()) {
      return;
    }

    windowState = "open";

    if (!opened.maximizedRestored && opened.restoreMaximized) {
      opened.maximizedRestored = true;
      browserWindow.maximize();
    }

    if (browserWindow.isMinimized()) {
      browserWindow.restore();
    }

    browserWindow.show();
  }

  function close() {
    if (!closePromise) {
      state = "closing";
      closePromise = (async () => {
        try {
          await opening;
        } catch {
          // The opening path owns and closes its partially acquired window.
        }

        if (currentWindow) {
          await closeWindow(currentWindow);
        }
      })().finally(() => {
        state = "closed";
        windowState = "absent";
      });
    }

    return closePromise;
  }

  return {
    show,
    inspect: () => ({ state, window: windowState }),
    close,
    [Symbol.asyncDispose]: close,
  };
}
