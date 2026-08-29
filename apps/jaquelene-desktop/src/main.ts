import { createBackend, type Backend } from "@jaquelene/backend";
import { app, safeStorage } from "electron";
import { join } from "node:path";
import { appUrl, handleAppScheme, registerAppScheme } from "./app-protocol";
import {
  developmentProfileEnvironmentVariable,
  prepareApplicationInstance,
} from "./development-profile";
import { createModelCatalog } from "./feature/model/catalog";
import { createFavoriteModels } from "./feature/model/favorite-models";
import { createFavoriteModelsStorage } from "./feature/model/favorite-models-store";
import { createOpenRouterConnection } from "./feature/provider/openrouter/connection";
import { createOpenRouterGenerationProvider } from "./feature/provider/openrouter/generation";
import { createOpenRouterModelProvider } from "./feature/provider/openrouter/models";
import { verifyOpenRouterApiKey } from "./feature/provider/openrouter/verification";
import { createLocalState } from "./local-state";
import { createMainWindow } from "./main-window";
import { createPreferences } from "./preferences/preferences";
import { createStorageManifest } from "./storage/manifest";

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

registerAppScheme();

const developmentServerUrl = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL;

function quitAfterFatalError(error: unknown) {
  console.error("Jaquelene encountered a fatal error.", error);
  app.quit();
}

async function requireSecureStorage() {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error("Secure credential storage is unavailable.");
  }
}

function closeBackendBeforeQuit(backend: Backend) {
  let canQuit = false;
  let closePromise: Promise<void> | undefined;

  app.on("before-quit", (event) => {
    if (canQuit) {
      return;
    }

    event.preventDefault();

    closePromise ??= backend
      .close()
      .catch((error: unknown) => {
        console.error("Could not close the backend cleanly.", error);
      })
      .finally(() => {
        canQuit = true;
        app.quit();
      });
  });
}

void app
  .whenReady()
  .then(async () => {
    if (!hasSingleInstanceLock) {
      return;
    }

    if (!developmentServerUrl) {
      const webAppDirectory = app.isPackaged
        ? join(process.resourcesPath, "web")
        : join(app.getAppPath(), "../jaquelene-web/dist");

      handleAppScheme(webAppDirectory);
    }

    const userDataDirectory = app.getPath("userData");
    const databasePath = join(userDataDirectory, "jaquelene.sqlite");
    const localState = createLocalState(userDataDirectory);
    const openRouterConnection = createOpenRouterConnection(userDataDirectory, {
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
    const backend = await createBackend({
      databasePath,
      generationProviders: [createOpenRouterGenerationProvider(openRouterConnection)],
      storageManifest: createStorageManifest({ databasePath, userDataDirectory }),
    });
    closeBackendBeforeQuit(backend);
    const modelCatalog = createModelCatalog([createOpenRouterModelProvider(openRouterConnection)]);
    const favoriteModels = createFavoriteModels(createFavoriteModelsStorage(userDataDirectory));
    const preferences = createPreferences(userDataDirectory);

    const mainWindow = createMainWindow({
      rendererUrl: developmentServerUrl ?? appUrl,
      localState,
      scenarios: backend.scenarios,
      campaigns: backend.campaigns,
      threads: backend.threads,
      modelCatalog,
      favoriteModels,
      preferences,
      openRouterConnection,
      storage: backend.storage,
    });

    app.on("second-instance", () => {
      void mainWindow.show().catch(quitAfterFatalError);
    });

    await mainWindow.show();

    app.on("activate", () => {
      void mainWindow.show().catch(quitAfterFatalError);
    });
  })
  .catch(quitAfterFatalError);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
