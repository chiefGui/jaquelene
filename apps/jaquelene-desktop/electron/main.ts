import { app, BrowserWindow, screen, shell } from "electron";
import { join } from "node:path";
import { createLocalState, type LocalState } from "./local-state";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

function isSafeExternalUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function createWindow(localState: LocalState) {
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
      sandbox: true,
      webSecurity: true,
    },
  });

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

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const webAppPath = app.isPackaged
      ? join(process.resourcesPath, "web/index.html")
      : join(app.getAppPath(), "../jaquelene-web/dist/index.html");

    await window.loadFile(webAppPath);
  }
}

app.whenReady().then(async () => {
  const localState = createLocalState(app.getPath("userData"));

  await createWindow(localState);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow(localState);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
