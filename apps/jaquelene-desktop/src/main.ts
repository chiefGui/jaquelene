import { app, BrowserWindow, screen, shell } from "electron";
import { join } from "node:path";
import { appUrl, handleAppScheme, registerAppScheme } from "./app-protocol";
import { closeDatabase, getDatabaseStoragePaths, openDatabase } from "./database";
import { createCampaigns, type Campaigns } from "./feature/campaign/campaigns";
import { exposeCampaigns } from "./feature/campaign/ipc";
import { exposeScenarios } from "./feature/scenario/ipc";
import { createScenarios, type Scenarios } from "./feature/scenario/scenarios";
import { createLocalState, getLocalStateStoragePaths, type LocalState } from "./local-state";
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
  storage: AppStorage,
) {
  const mainWindowState = localState.loadMainWindowState(
    screen.getAllDisplays().map(({ workArea }) => workArea),
  );

  const window = new BrowserWindow({
    ...(mainWindowState?.bounds ?? { width: 1180, height: 780 }),
    minWidth: 860,
    minHeight: 620,
    backgroundColor: "#ffffff",
    show: false,
    title: "Jaquelene",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
      webSecurity: true,
    },
  });

  exposeScenarios(window.webContents.mainFrame, scenarios);
  exposeCampaigns(window.webContents.mainFrame, campaigns);
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
    const storage = createStorage([
      ...getDatabaseStoragePaths(databasePath),
      ...getLocalStateStoragePaths(userDataDirectory),
    ]);

    app.once("will-quit", () => closeDatabase(database));

    await createWindow(localState, scenarios, campaigns, storage);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow(localState, scenarios, campaigns, storage).catch(quitAfterFatalError);
      }
    });
  })
  .catch(quitAfterFatalError);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
