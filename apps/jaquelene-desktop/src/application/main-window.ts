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
import { Cause, Context, Deferred, Effect, Exit, Fiber, FiberSet, Layer, Schema } from "effect";
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
import { exposeRegenerationPreferences } from "../feature/thread/regeneration-preferences-ipc";
import { exposeUsage } from "../feature/usage/ipc";
import { LocalStateService, type LocalState } from "../local-state";
import { PreferencesService, type Preferences } from "../preferences/preferences";
import { exposeStorage } from "../storage/ipc";
import { RendererService } from "./renderer";

const preloadPath = join(import.meta.dirname, "../preload/preload.cjs");

type WindowState = "absent" | "opening" | "open" | "closing";

type EffectRunner = <Success, Failure>(effect: Effect.Effect<Success, Failure>) => Promise<Success>;
type EffectFork = <Success, Failure>(
  effect: Effect.Effect<Success, Failure>,
) => Fiber.Fiber<Success, Failure>;

type ReadyWindow = {
  browserWindow: BrowserWindow;
  restoreMaximized: boolean;
};

type WindowSession = {
  state: Exclude<WindowState, "absent">;
  ready: Deferred.Deferred<ReadyWindow, MainWindowShowError>;
  lifetime: Fiber.Fiber<void, MainWindowShowError>;
};

export type MainWindowInspection = Readonly<{
  state: "open" | "closing" | "closed";
  window: WindowState;
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
      const ipcOperations = yield* FiberSet.make();
      const runEffect = yield* FiberSet.runtimePromise(ipcOperations)();
      const forkEffect = yield* FiberSet.runtime(ipcOperations)();

      return yield* createMainWindow({
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
        forkEffect,
        usage: backend.usage,
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

function showError(cause: unknown) {
  return new MainWindowShowError({ message: "Could not show the main window.", cause });
}

const createMainWindow = Effect.fn("MainWindow.make")(function* ({
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
  forkEffect,
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
  forkEffect: EffectFork;
  usage: Usage;
}) {
  const threadMessaging = createThreadMessaging(threads, turns, diagnostics, {
    runPromise: runEffect,
    runFork: forkEffect,
  });
  let state: MainWindowInspection["state"] = "open";
  let currentWindow: WindowSession | undefined;

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      state = "closing";
      const session = currentWindow;
      if (session) {
        session.state = "closing";
        yield* Fiber.interrupt(session.lifetime);
        const exit = yield* Fiber.await(session.lifetime);
        if (Exit.isFailure(exit)) {
          const reasons = exit.cause.reasons.filter((reason) => !Cause.isInterruptReason(reason));
          if (reasons.length > 0) {
            return yield* Effect.failCause(Cause.fromReasons(reasons)).pipe(Effect.orDie);
          }
        }
      }
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          state = "closed";
        }),
      ),
    ),
  );

  const openWindow = Effect.fn("MainWindow.open")(
    function* (session: WindowSession) {
      const mainWindowState = localState.loadMainWindowState(
        screen.getAllDisplays().map(({ workArea }) => workArea),
      );
      const browserWindow = yield* Effect.acquireRelease(
        Effect.sync(
          () =>
            new BrowserWindow({
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
                ...createInterfaceScaleWebPreferences(
                  preferences.appearance.userInterface.get().scale,
                ),
              },
            }),
        ),
        (window) =>
          Effect.sync(() => {
            if (!window.isDestroyed()) {
              window.destroy();
            }
          }),
      );

      const onClosed = () => {
        session.state = "closing";
        session.lifetime.interruptUnsafe();
      };
      browserWindow.once("closed", onClosed);
      yield* Effect.addFinalizer(() => Effect.sync(() => browserWindow.off("closed", onClosed)));

      exposePrompts(browserWindow.webContents.mainFrame, prompts);
      exposeDiagnostics(browserWindow.webContents.mainFrame, diagnostics);
      exposeDiagnosticsPreferences(browserWindow.webContents.mainFrame, preferences.diagnostics);
      exposeCampaigns(browserWindow.webContents.mainFrame, campaigns);
      exposeCampaignUsage(browserWindow.webContents.mainFrame, campaignUsage);
      yield* Effect.acquireRelease(
        Effect.sync(() => threadMessaging.expose(browserWindow.webContents.mainFrame)),
        (release) => Effect.sync(release),
      );
      exposeCampaignPreferences(browserWindow.webContents.mainFrame, preferences.campaign);
      exposeRegenerationPreferences(browserWindow.webContents.mainFrame, preferences.regeneration);
      yield* Effect.acquireRelease(
        Effect.sync(() => exposeModelCatalog(browserWindow.webContents, modelCatalog, runEffect)),
        (release) => Effect.sync(release),
      );
      exposeFavoriteModels(browserWindow.webContents.mainFrame, favoriteModels);
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          exposeUserInterfacePreferences(
            browserWindow.webContents,
            preferences.appearance.userInterface,
          ),
        ),
        (release) => Effect.sync(release),
      );
      exposeProviders(browserWindow.webContents.mainFrame, providers, runEffect);
      exposeStorage(browserWindow.webContents.mainFrame, storage, runEffect);
      yield* Effect.acquireRelease(
        Effect.sync(() => exposeUsage(browserWindow.webContents, usage)),
        (release) => Effect.sync(release),
      );

      const saveWindowState = () => {
        localState.saveMainWindowState({
          bounds: browserWindow.getNormalBounds(),
          maximized: browserWindow.isMaximized(),
        });
      };
      browserWindow.on("close", saveWindowState);
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => browserWindow.off("close", saveWindowState)),
      );
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
      yield* Effect.addFinalizer(() =>
        Effect.sync(() =>
          browserWindow.webContents.off("will-navigate", preventExternalNavigation),
        ),
      );

      yield* Effect.interruptible(
        Effect.tryPromise({
          try: () => browserWindow.loadURL(rendererUrl),
          catch: showError,
        }),
      );
      yield* Deferred.succeed(session.ready, {
        browserWindow,
        restoreMaximized: mainWindowState?.maximized ?? false,
      });
      yield* Effect.interruptible(Effect.never);
    },
    Effect.catchDefect((cause) => Effect.fail(showError(cause))),
    // Native acquisition and cleanup registration stay atomic; loading and idle waiting can stop.
    Effect.uninterruptible,
  );

  function startWindow(): WindowSession {
    const ready = Deferred.makeUnsafe<ReadyWindow, MainWindowShowError>();
    const session: WindowSession = {
      state: "opening",
      ready,
      // Publish the session before Electron can call back into the application.
      lifetime: forkEffect(
        Effect.yieldNow.pipe(
          Effect.andThen(() => Effect.scoped(openWindow(session))),
          Effect.onExit((exit) =>
            Effect.sync(() => {
              if (currentWindow === session) {
                currentWindow = undefined;
              }
              if (Exit.isFailure(exit)) {
                const notified = Deferred.doneUnsafe(ready, Exit.failCause(exit.cause));
                if (!notified && state === "open" && !Cause.hasInterruptsOnly(exit.cause)) {
                  diagnostics.report({
                    severity: ErrorSeverity.Error,
                    operation: "window.release",
                    error: Cause.squash(exit.cause),
                  });
                }
              }
            }),
          ),
        ),
      ),
    };
    currentWindow = session;
    return session;
  }

  const show = Effect.fn("MainWindow.show")(function* () {
    while (true) {
      const session = yield* Effect.try({
        try: () => {
          if (state !== "open") {
            throw new Error("Main window manager is closed.");
          }
          return currentWindow ?? startWindow();
        },
        catch: showError,
      });
      if (session.state === "closing") {
        yield* Fiber.await(session.lifetime);
        continue;
      }
      const opened = yield* Deferred.await(session.ready);
      yield* Effect.try({
        try: () => {
          const { browserWindow } = opened;
          if (state !== "open" || currentWindow !== session || browserWindow.isDestroyed()) {
            return;
          }
          if (opened.restoreMaximized) {
            browserWindow.maximize();
            opened.restoreMaximized = false;
          }
          if (browserWindow.isMinimized()) {
            browserWindow.restore();
          }
          browserWindow.show();
          session.state = "open";
        },
        catch: showError,
      });
      return;
    }
  });

  return MainWindowService.of({
    show: show(),
    inspect: () => ({ state, window: currentWindow?.state ?? "absent" }),
  });
});
