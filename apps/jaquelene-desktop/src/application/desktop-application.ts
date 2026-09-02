import { createBackend } from "@jaquelene/backend";
import { ErrorSeverity } from "@jaquelene/diagnostics";
import { Cause, Effect, Exit, Fiber } from "effect";
import { app, safeStorage } from "electron";
import { join } from "node:path";
import { appUrl, handleAppScheme } from "../app-protocol";
import type { ApplicationDiagnostics } from "../diagnostics/diagnostics";
import { createFavoriteModels } from "../feature/model/favorite-models";
import { createFavoriteModelsStorage } from "../feature/model/favorite-models-store";
import { createOpenRouterProviderFactory } from "../feature/provider/openrouter/provider";
import { verifyOpenRouterApiKey } from "../feature/provider/openrouter/verification";
import { createLocalState } from "../local-state";
import type { Preferences } from "../preferences/preferences";
import { createStorageAreas } from "../storage/areas";
import { createMainWindowManager, type MainWindowInspection } from "./main-window";

export type DesktopApplicationInspection = Readonly<{
  state: "starting" | "running" | "stopping" | "stopped";
  window?: MainWindowInspection;
}>;

export type DesktopApplication = Readonly<{
  ready: Promise<void>;
  result: Promise<Exit.Exit<void, Error>>;
  show: () => Promise<void>;
  inspect: () => DesktopApplicationInspection;
  stop: () => Promise<Exit.Exit<void, Error>>;
}>;

function asError(error: unknown, message: string) {
  return error instanceof Error ? error : new Error(message, { cause: error });
}

function errorFromCause(cause: Cause.Cause<Error>, message: string) {
  const errors = Cause.prettyErrors(cause);

  return errors.length === 1 ? errors[0]! : new AggregateError(errors, message);
}

function waitForSignal<Result>(result: Promise<Result>, signal: AbortSignal) {
  if (signal.aborted) {
    result.catch(() => undefined);
    return Promise.reject(signal.reason);
  }

  let removeListener: (() => void) | undefined;
  const interruption = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    removeListener = () => signal.removeEventListener("abort", onAbort);
  });

  return Promise.race([result, interruption]).finally(removeListener);
}

async function requireSecureStorage() {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error("Secure credential storage is unavailable.");
  }
}

export function launchDesktopApplication({
  diagnostics,
  preferences,
  userDataDirectory,
  developmentServerUrl,
}: {
  diagnostics: ApplicationDiagnostics;
  preferences: Preferences;
  userDataDirectory: string;
  developmentServerUrl?: string;
}): DesktopApplication {
  const ready = Promise.withResolvers<void>();
  let readySettled = false;
  let state: DesktopApplicationInspection["state"] = "starting";
  let mainWindowInspection: (() => MainWindowInspection) | undefined;
  let showMainWindow: (() => Promise<void>) | undefined;

  const program = Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: (signal) => waitForSignal(app.whenReady(), signal),
        catch: (error) => asError(error, "Electron did not become ready."),
      });

      if (!developmentServerUrl) {
        const webAppDirectory = app.isPackaged
          ? join(process.resourcesPath, "web")
          : join(app.getAppPath(), "../jaquelene-web/dist");
        yield* Effect.acquireRelease(
          Effect.sync(() => handleAppScheme(webAppDirectory)),
          (registration) => Effect.sync(() => registration[Symbol.dispose]()),
        );
      }

      const databasePath = join(userDataDirectory, "jaquelene.sqlite");
      const cachePath = join(userDataDirectory, "jaquelene-cache.sqlite");
      const localState = createLocalState(userDataDirectory, diagnostics);
      const favoriteModels = createFavoriteModels(createFavoriteModelsStorage(userDataDirectory));
      const openRouter = createOpenRouterProviderFactory(userDataDirectory, {
        async encrypt(apiKey) {
          await requireSecureStorage();
          return safeStorage.encryptStringAsync(apiKey);
        },
        async decrypt(encryptedApiKey) {
          await requireSecureStorage();
          const { result } = await safeStorage.decryptStringAsync(encryptedApiKey);
          return result;
        },
        verify: verifyOpenRouterApiKey,
      });
      const backend = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: (signal) =>
            createBackend(
              {
                databasePath,
                cache: {
                  path: cachePath,
                  reportFailure: (failure) =>
                    diagnostics.report({
                      severity: ErrorSeverity.Warning,
                      operation: `cache.${failure.operation}`,
                      error: failure.error,
                    }),
                },
                providers: [openRouter],
                storageAreas: createStorageAreas({
                  diagnostics,
                  favoriteModels,
                  localState,
                  preferences,
                  userDataDirectory,
                }),
              },
              signal,
            ),
          catch: (error) => asError(error, "Could not start the backend."),
        }),
        (ownedBackend) => Effect.promise(() => ownedBackend[Symbol.asyncDispose]()),
        { interruptible: true },
      );
      const mainWindow = yield* Effect.acquireRelease(
        Effect.sync(() =>
          createMainWindowManager({
            rendererUrl: developmentServerUrl ?? appUrl,
            diagnostics,
            localState,
            campaigns: backend.campaigns,
            campaignUsage: backend.campaignUsage,
            prompts: backend.prompts,
            turns: backend.turns,
            modelCatalog: backend.models,
            favoriteModels,
            preferences,
            providers: backend.providers,
            storage: backend.storage,
            usage: backend.usage,
          }),
        ),
        (windowManager) => Effect.promise(() => windowManager[Symbol.asyncDispose]()),
      );
      mainWindowInspection = mainWindow.inspect;
      showMainWindow = () => mainWindow.show();
      yield* Effect.tryPromise({
        try: (signal) => mainWindow.show(signal),
        catch: (error) => asError(error, "Could not show the main window."),
      });

      state = "running";
      readySettled = true;
      ready.resolve();
      yield* Effect.never;
    }),
  );
  const fiber = Effect.runFork(program);
  const result = Effect.runPromise(Fiber.await(fiber));
  let stopPromise: Promise<Exit.Exit<void, Error>> | undefined;

  void result.then((exit) => {
    state = "stopped";

    if (!readySettled) {
      readySettled = true;
      ready.reject(
        Exit.isFailure(exit)
          ? errorFromCause(exit.cause, "Desktop application startup failed.")
          : new Error("Desktop application stopped before becoming ready."),
      );
    }
  });

  function stop() {
    if (!stopPromise) {
      if (state !== "stopped") {
        state = "stopping";
      }

      stopPromise = Effect.runPromise(Fiber.interrupt(fiber)).then(() => result);
    }

    return stopPromise;
  }

  return {
    ready: ready.promise,
    result,
    show: async () => {
      await ready.promise;

      if (!showMainWindow || state !== "running") {
        throw new Error("Desktop application is not running.");
      }
      await showMainWindow();
    },
    inspect: () => ({
      state,
      ...(mainWindowInspection ? { window: mainWindowInspection() } : {}),
    }),
    stop,
  };
}
