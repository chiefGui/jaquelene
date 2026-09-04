import { BackendService } from "@jaquelene/backend";
import { ErrorSeverity } from "@jaquelene/diagnostics";
import { Cause, Effect, Exit, Fiber, FiberSet, Layer } from "effect";
import { app, safeStorage } from "electron";
import { join } from "node:path";
import { appUrl, handleAppScheme } from "../app-protocol";
import {
  ApplicationDiagnosticsService,
  type ApplicationDiagnostics,
} from "../diagnostics/diagnostics";
import { FavoriteModelsService } from "../feature/model/favorite-models-service";
import { createProviderFactories } from "../feature/provider/registry";
import { LocalStateService } from "../local-state";
import { PreferencesService, type Preferences } from "../preferences/preferences";
import { createStorageAreas } from "../storage/areas";
import { DesktopConfigurationService, type DesktopConfiguration } from "./configuration";
import { getApplicationDatabasePaths } from "./database-paths";
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
  if (error instanceof Error) {
    return error;
  }

  return new Error(message, { cause: error });
}

function errorFromCause(cause: Cause.Cause<Error>, message: string) {
  const errors = Cause.prettyErrors(cause);

  if (errors.length === 1) {
    return errors[0]!;
  }

  return new AggregateError(errors, message);
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

type DesktopEnvironmentOptions = Readonly<{
  configuration: DesktopConfiguration;
  diagnostics: ApplicationDiagnostics;
  preferences: Preferences;
}>;

function createDesktopEnvironmentLayer({
  configuration,
  diagnostics,
  preferences,
}: DesktopEnvironmentOptions) {
  const configurationLayer = DesktopConfigurationService.layer(configuration);
  const diagnosticsLayer = ApplicationDiagnosticsService.layer(diagnostics);
  const preferencesLayer = PreferencesService.layer(preferences);
  const localStateLayer = LocalStateService.layer.pipe(
    Layer.provide(Layer.merge(configurationLayer, diagnosticsLayer)),
  );
  const favoriteModelsLayer = FavoriteModelsService.layer.pipe(Layer.provide(configurationLayer));

  return Layer.mergeAll(
    configurationLayer,
    diagnosticsLayer,
    preferencesLayer,
    localStateLayer,
    favoriteModelsLayer,
  );
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
  const environmentLayer = createDesktopEnvironmentLayer({
    configuration: { userDataDirectory, developmentServerUrl },
    diagnostics,
    preferences,
  });

  const applicationProgram = Effect.gen(function* () {
    const configuration = yield* DesktopConfigurationService;
    const diagnostics = yield* ApplicationDiagnosticsService;
    const preferences = yield* PreferencesService;
    const localState = yield* LocalStateService;
    const favoriteModels = yield* FavoriteModelsService;
    const { userDataDirectory, developmentServerUrl } = configuration;

    const { databasePath, cachePath } = getApplicationDatabasePaths(userDataDirectory);
    const credentialProtection = {
      async encrypt(apiKey: string) {
        await requireSecureStorage();
        return safeStorage.encryptStringAsync(apiKey);
      },
      async decrypt(encryptedApiKey: Buffer) {
        await requireSecureStorage();
        const { result } = await safeStorage.decryptStringAsync(encryptedApiKey);
        return result;
      },
    };
    const providers = createProviderFactories(userDataDirectory, credentialProtection);
    const backendLayer = BackendService.layer({
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
      providers,
      storageAreas: createStorageAreas({
        diagnostics,
        favoriteModels,
        localState,
        preferences,
        userDataDirectory,
      }),
    });

    yield* Effect.gen(function* () {
      const backend = yield* BackendService;
      const runBackendEffect = yield* FiberSet.makeRuntimePromise();
      const mainWindow = yield* Effect.acquireRelease(
        Effect.sync(() =>
          createMainWindowManager({
            rendererUrl: developmentServerUrl ?? appUrl,
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
            runBackendEffect,
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
    }).pipe(Effect.provide(backendLayer));
  });
  const program = Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: (signal) => waitForSignal(app.whenReady(), signal),
        catch: (error) => asError(error, "Electron did not become ready."),
      });

      if (!developmentServerUrl) {
        let webAppDirectory = join(app.getAppPath(), "../jaquelene-web/dist");

        if (app.isPackaged) {
          webAppDirectory = join(process.resourcesPath, "web");
        }

        yield* Effect.acquireRelease(
          Effect.sync(() => handleAppScheme(webAppDirectory)),
          (registration) => Effect.sync(() => registration[Symbol.dispose]()),
        );
      }

      yield* applicationProgram.pipe(Effect.provide(environmentLayer));
    }),
  );
  const fiber = Effect.runFork(program);
  const result = Effect.runPromise(Fiber.await(fiber));
  let stopPromise: Promise<Exit.Exit<void, Error>> | undefined;

  void result.then((exit) => {
    state = "stopped";

    if (!readySettled) {
      readySettled = true;
      let error = new Error("Desktop application stopped before becoming ready.");

      if (Exit.isFailure(exit)) {
        error = errorFromCause(exit.cause, "Desktop application startup failed.");
      }

      ready.reject(error);
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
    inspect: () => {
      const inspection: {
        state: DesktopApplicationInspection["state"];
        window?: MainWindowInspection;
      } = { state };

      if (mainWindowInspection) {
        inspection.window = mainWindowInspection();
      }

      return inspection;
    },
    stop,
  };
}
