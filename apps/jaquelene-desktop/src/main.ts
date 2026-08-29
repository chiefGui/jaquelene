import { createBackend, type Backend } from "@jaquelene/backend";
import { ErrorSeverity } from "@jaquelene/diagnostics";
import { app, safeStorage, shell } from "electron";
import { join } from "node:path";
import { applicationId } from "./application";
import { appUrl, handleAppScheme, registerAppScheme } from "./app-protocol";
import {
  developmentProfileEnvironmentVariable,
  prepareApplicationInstance,
} from "./development-profile";
import { createApplicationDiagnostics, getDiagnosticsStoragePath } from "./diagnostics/diagnostics";
import { createFavoriteModels } from "./feature/model/favorite-models";
import { createFavoriteModelsStorage } from "./feature/model/favorite-models-store";
import { createOpenRouterProvider } from "./feature/provider/openrouter/provider";
import { verifyOpenRouterApiKey } from "./feature/provider/openrouter/verification";
import { createLocalState } from "./local-state";
import { createMainWindow } from "./main-window";
import { createPathOpener } from "./path-opener";
import { createPreferences } from "./preferences/preferences";
import { createStorageAreas } from "./storage/areas";

if (process.platform === "win32") {
  app.setAppUserModelId(applicationId);
}

const { developmentProfile, hasSingleInstanceLock } = prepareApplicationInstance(
  app,
  process.env[developmentProfileEnvironmentVariable],
);

if (developmentProfile) {
  console.info(`Jaquelene development profile: ${developmentProfile.userDataDirectory}`);
}

if (!hasSingleInstanceLock) {
  app.quit();
}

async function requireSecureStorage() {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error("Secure credential storage is unavailable.");
  }
}

function startPrimaryApplication() {
  const userDataDirectory = app.getPath("userData");
  const diagnosticsDirectory = getDiagnosticsStoragePath(userDataDirectory);
  const openPath = createPathOpener((path) => shell.openPath(path));
  const diagnostics = createApplicationDiagnostics(diagnosticsDirectory, openPath);
  let backend: Backend | undefined;
  let startup = Promise.resolve();
  let canQuit = false;
  let closePromise: Promise<void> | undefined;

  app.on("before-quit", (event) => {
    if (canQuit) {
      return;
    }

    event.preventDefault();

    closePromise ??= (async () => {
      await startup;

      try {
        await backend?.close();
      } catch (error) {
        diagnostics.report({
          severity: ErrorSeverity.Error,
          operation: "backend.close",
          error,
        });
      }

      await diagnostics.close();
      canQuit = true;
      app.quit();
    })();
  });

  function quitAfterFatalError(operation: string, error: unknown) {
    diagnostics.report({ severity: ErrorSeverity.Fatal, operation, error });
    app.quit();
  }

  try {
    app.setAppLogsPath(diagnosticsDirectory);
    registerAppScheme();
  } catch (error) {
    quitAfterFatalError("application.configure", error);
    return;
  }

  const developmentServerUrl = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL;

  startup = app
    .whenReady()
    .then(async () => {
      if (!developmentServerUrl) {
        const webAppDirectory = app.isPackaged
          ? join(process.resourcesPath, "web")
          : join(app.getAppPath(), "../jaquelene-web/dist");

        handleAppScheme(webAppDirectory);
      }

      const databasePath = join(userDataDirectory, "jaquelene.sqlite");
      const localState = createLocalState(userDataDirectory, diagnostics);
      const openRouter = createOpenRouterProvider(userDataDirectory, {
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
      const favoriteModels = createFavoriteModels(createFavoriteModelsStorage(userDataDirectory));
      const preferences = createPreferences(userDataDirectory);
      backend = await createBackend({
        databasePath,
        providers: [openRouter],
        storageAreas: createStorageAreas({
          diagnostics,
          favoriteModels,
          localState,
          preferences,
          userDataDirectory,
        }),
      });

      const mainWindow = createMainWindow({
        rendererUrl: developmentServerUrl ?? appUrl,
        diagnostics,
        localState,
        scenarios: backend.scenarios,
        campaigns: backend.campaigns,
        turns: backend.turns,
        modelCatalog: backend.models,
        favoriteModels,
        preferences,
        providers: backend.providers,
        storage: backend.storage,
      });

      app.on("second-instance", () => {
        void mainWindow
          .show()
          .catch((error: unknown) => quitAfterFatalError("window.restore", error));
      });

      await mainWindow.show();

      app.on("activate", () => {
        void mainWindow
          .show()
          .catch((error: unknown) => quitAfterFatalError("window.activate", error));
      });
    })
    .catch((error: unknown) => quitAfterFatalError("application.start", error));

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

if (hasSingleInstanceLock) {
  startPrimaryApplication();
}
