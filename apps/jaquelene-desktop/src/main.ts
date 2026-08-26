import { app, BrowserWindow, screen, shell } from "electron";
import { join } from "node:path";
import { appUrl, handleAppScheme, registerAppScheme } from "./app-protocol";
import { closeDatabase, openDatabase } from "./database";
import { createLocalState, type LocalState } from "./local-state";
import { exposeScenarios } from "./feature/scenario/ipc";
import { createScenarios, type Scenarios } from "./feature/scenario/scenarios";
import { exposeStorage } from "./storage/ipc";
import { createStorage, type AppStorage } from "./storage/storage";

registerAppScheme();

const developmentServerUrl = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL;
const preloadPath = join(import.meta.dirname, "preload.cjs");

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

async function createWindow(localState: LocalState, scenarios: Scenarios, storage: AppStorage) {
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
    const localState = createLocalState(userDataDirectory);
    const database = openDatabase(join(userDataDirectory, "jaquelene.sqlite"));
    const scenarios = createScenarios(database);
    const storage = createStorage(userDataDirectory);

    app.once("will-quit", () => closeDatabase(database));

    await createWindow(localState, scenarios, storage);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow(localState, scenarios, storage).catch(quitAfterFatalError);
      }
    });
  })
  .catch(quitAfterFatalError);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
