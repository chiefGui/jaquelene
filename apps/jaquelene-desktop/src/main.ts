import { app, BrowserWindow, safeStorage, screen, shell } from "electron";
import { join } from "node:path";
import { appUrl, handleAppScheme, registerAppScheme } from "./app-protocol";
import { closeDatabase, getDatabaseStoragePaths, openDatabase } from "./database";
import { exposeUserInterfacePreferences } from "./feature/appearance/user-interface/ipc";
import { getInterfaceScaleFactor } from "./feature/appearance/user-interface/preferences";
import { createCampaigns, type Campaigns } from "./feature/campaign/campaigns";
import { exposeCampaigns } from "./feature/campaign/ipc";
import { createModelCatalog, type ModelCatalog } from "./feature/model/catalog";
import { exposeModelCatalog } from "./feature/model/catalog-ipc";
import { exposeModelPreferences } from "./feature/model/preferences-ipc";
import {
  createOpenRouterConnection,
  getOpenRouterConnectionStoragePaths,
  type OpenRouterConnection,
} from "./feature/provider/openrouter/connection";
import { exposeOpenRouterConnection } from "./feature/provider/openrouter/ipc";
import { createOpenRouterModelProvider } from "./feature/provider/openrouter/models";
import { verifyOpenRouterApiKey } from "./feature/provider/openrouter/verification";
import { exposeScenarios } from "./feature/scenario/ipc";
import { createScenarios, type Scenarios } from "./feature/scenario/scenarios";
import { createLocalState, getLocalStateStoragePaths, type LocalState } from "./local-state";
import {
  createPreferences,
  getPreferencesStoragePaths,
  type Preferences,
} from "./preferences/preferences";
import { exposeStorage } from "./storage/ipc";
import { createStorage, type AppStorage } from "./storage/storage";

registerAppScheme();

const developmentServerUrl = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL;
const preloadPath = join(import.meta.dirname, "../preload/preload.cjs");

function isSafeExternalUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function quitAfterFatalError(error: unknown) {
  console.error("Jaquelene encountered a fatal error.", error);
  app.quit();
}

async function createWindow(
  localState: LocalState,
  scenarios: Scenarios,
  campaigns: Campaigns,
  modelCatalog: ModelCatalog,
  preferences: Preferences,
  openRouterConnection: OpenRouterConnection,
  storage: AppStorage,
) {
  const mainWindowState = localState.loadMainWindowState(
    screen.getAllDisplays().map(({ workArea }) => workArea),
  );

  const window = new BrowserWindow({
    ...(mainWindowState?.bounds ?? { width: 1180, height: 780 }),
    minWidth: 860,
    minHeight: 620,
    // Electron's native window background parser does not support OKLCH.
    backgroundColor: "rgb(7, 8, 12)",
    show: false,
    title: "Jaquelene",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
      webSecurity: true,
      zoomFactor: getInterfaceScaleFactor(preferences.appearance.userInterface.get().scale),
    },
  });

  exposeScenarios(window.webContents.mainFrame, scenarios);
  exposeCampaigns(window.webContents.mainFrame, campaigns);
  exposeModelCatalog(window.webContents.mainFrame, modelCatalog);
  exposeModelPreferences(window.webContents.mainFrame, preferences.model);
  exposeUserInterfacePreferences(window.webContents, preferences.appearance.userInterface);
  exposeOpenRouterConnection(window.webContents.mainFrame, openRouterConnection);
  exposeStorage(window.webContents.mainFrame, storage);

  if (mainWindowState?.maximized) {
    window.maximize();
  }

  window.on("close", () => {
    localState.saveMainWindowState({
      bounds: window.getNormalBounds(),
      maximized: window.isMaximized(),
    });
  });
  window.removeMenu();
  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
    }
  });

  if (developmentServerUrl) {
    await window.loadURL(developmentServerUrl);
  } else {
    await window.loadURL(appUrl);
  }
}

async function requireSecureStorage() {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error("Secure credential storage is unavailable.");
  }
}

void app
  .whenReady()
  .then(async () => {
    if (!developmentServerUrl) {
      const webAppDirectory = app.isPackaged
        ? join(process.resourcesPath, "web")
        : join(app.getAppPath(), "../jaquelene-web/dist");

      handleAppScheme(webAppDirectory);
    }

    const userDataDirectory = app.getPath("userData");
    const databasePath = join(userDataDirectory, "jaquelene.sqlite");
    const localState = createLocalState(userDataDirectory);
    const database = openDatabase(databasePath);
    const scenarios = createScenarios(database);
    const campaigns = createCampaigns(database);
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
    const modelCatalog = createModelCatalog([createOpenRouterModelProvider(openRouterConnection)]);
    const preferences = createPreferences(userDataDirectory);
    const storage = createStorage([
      ...getDatabaseStoragePaths(databasePath),
      ...getLocalStateStoragePaths(userDataDirectory),
      ...getOpenRouterConnectionStoragePaths(userDataDirectory),
      ...getPreferencesStoragePaths(userDataDirectory),
    ]);

    app.once("will-quit", () => closeDatabase(database));

    await createWindow(
      localState,
      scenarios,
      campaigns,
      modelCatalog,
      preferences,
      openRouterConnection,
      storage,
    );

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow(
          localState,
          scenarios,
          campaigns,
          modelCatalog,
          preferences,
          openRouterConnection,
          storage,
        ).catch(quitAfterFatalError);
      }
    });
  })
  .catch(quitAfterFatalError);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
