import type {
  Campaigns,
  InstructionCatalog,
  Providers,
  Scenarios,
  Storage,
  Turns,
} from "@jaquelene/backend";
import { ErrorSeverity } from "@jaquelene/diagnostics";
import { Effect, Exit, Scope } from "effect";
import { app, BrowserWindow, screen, shell } from "electron";
import { join } from "node:path";
import type { ApplicationDiagnostics } from "../diagnostics/diagnostics";
import { exposeDiagnostics, exposeDiagnosticsPreferences } from "../diagnostics/ipc";
import { exposeUserInterfacePreferences } from "../feature/appearance/user-interface/ipc";
import { createInterfaceScaleWebPreferences } from "../feature/appearance/user-interface/zoom";
import { exposeCampaignPreferences, exposeCampaigns } from "../feature/campaign/ipc";
import type { ModelCatalog } from "../feature/model/catalog";
import { exposeModelCatalog } from "../feature/model/catalog-ipc";
import type { FavoriteModels } from "../feature/model/favorite-models";
import { exposeFavoriteModels } from "../feature/model/favorite-models-ipc";
import { exposeProviders } from "../feature/provider/ipc";
import { exposeScenarios } from "../feature/scenario/ipc";
import { exposeInstructions } from "../feature/instruction/ipc";
import { createThreadMessaging } from "../feature/thread/ipc";
import type { LocalState } from "../local-state";
import type { Preferences } from "../preferences/preferences";
import { exposeStorage } from "../storage/ipc";

const preloadPath = join(import.meta.dirname, "../preload/preload.cjs");

type WindowState = "absent" | "opening" | "open" | "closing";

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

function isSafeExternalUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function addFinalizer(scope: Scope.Closeable, finalize: () => void) {
  Effect.runSync(Scope.addFinalizer(scope, Effect.sync(finalize)));
}

function interrupted(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Window operation was interrupted.", { cause: signal.reason });
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
  scenarios,
  campaigns,
  instructions,
  turns,
  modelCatalog,
  favoriteModels,
  preferences,
  providers,
  storage,
}: {
  rendererUrl: string;
  diagnostics: ApplicationDiagnostics;
  localState: LocalState;
  scenarios: Scenarios;
  campaigns: Campaigns;
  instructions: InstructionCatalog;
  turns: Turns;
  modelCatalog: ModelCatalog;
  favoriteModels: FavoriteModels;
  preferences: Preferences;
  providers: Providers;
  storage: Storage;
}): MainWindowManager {
  const threadMessaging = createThreadMessaging(turns, diagnostics);
  let state: "open" | "closing" | "closed" = "open";
  let windowState: WindowState = "absent";
  let currentWindow: OpenWindow | undefined;
  let opening: Promise<OpenWindow> | undefined;
  let closePromise: Promise<void> | undefined;

  function requireOpen() {
    if (state !== "open") {
      throw new Error("Main window manager is closed.");
    }
  }

  function closeWindow(opened: OpenWindow) {
    if (!opened.closePromise) {
      windowState = "closing";
      const closing = Effect.runPromise(Scope.close(opened.scope, Exit.void));
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
    const scope = Scope.makeUnsafe("sequential");
    addFinalizer(scope, () => {
      if (!browserWindow.isDestroyed()) {
        browserWindow.destroy();
      }
    });

    const opened: OpenWindow = {
      browserWindow,
      scope,
      loaded: Promise.resolve(),
      restoreMaximized: mainWindowState?.maximized ?? false,
      maximizedRestored: false,
    };
    currentWindow = opened;
    windowState = "opening";

    const onClosed = () => {
      void closeWindow(opened).catch((error: unknown) => {
        diagnostics.report({
          severity: ErrorSeverity.Error,
          operation: "window.release",
          error,
        });
      });
    };
    browserWindow.once("closed", onClosed);
    addFinalizer(scope, () => browserWindow.off("closed", onClosed));

    try {
      exposeScenarios(browserWindow.webContents.mainFrame, scenarios);
      exposeInstructions(browserWindow.webContents.mainFrame, instructions);
      exposeDiagnostics(browserWindow.webContents.mainFrame, diagnostics);
      exposeDiagnosticsPreferences(browserWindow.webContents.mainFrame, preferences.diagnostics);
      exposeCampaigns(browserWindow.webContents.mainFrame, campaigns);
      addFinalizer(scope, threadMessaging.expose(browserWindow.webContents.mainFrame));
      exposeCampaignPreferences(browserWindow.webContents.mainFrame, preferences.campaign);
      addFinalizer(scope, exposeModelCatalog(browserWindow.webContents, modelCatalog));
      exposeFavoriteModels(browserWindow.webContents.mainFrame, favoriteModels);
      addFinalizer(
        scope,
        exposeUserInterfacePreferences(
          browserWindow.webContents,
          preferences.appearance.userInterface,
        ),
      );
      exposeProviders(browserWindow.webContents.mainFrame, providers);
      exposeStorage(browserWindow.webContents.mainFrame, storage);

      const saveWindowState = () => {
        localState.saveMainWindowState({
          bounds: browserWindow.getNormalBounds(),
          maximized: browserWindow.isMaximized(),
        });
      };
      browserWindow.on("close", saveWindowState);
      addFinalizer(scope, () => browserWindow.off("close", saveWindowState));
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
      addFinalizer(scope, () =>
        browserWindow.webContents.off("will-navigate", preventExternalNavigation),
      );

      opened.loaded = browserWindow.loadURL(rendererUrl);
      return opened;
    } catch (error) {
      try {
        await closeWindow(opened);
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
