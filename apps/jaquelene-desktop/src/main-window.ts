import type { Campaigns, Scenarios, Storage, Threads } from "@jaquelene/backend";
import { BrowserWindow, screen, shell } from "electron";
import { join } from "node:path";
import { exposeUserInterfacePreferences } from "./feature/appearance/user-interface/ipc";
import { getInterfaceScaleFactor } from "./feature/appearance/user-interface/preferences";
import { exposeCampaignPreferences, exposeCampaigns } from "./feature/campaign/ipc";
import type { ModelCatalog } from "./feature/model/catalog";
import { exposeModelCatalog } from "./feature/model/catalog-ipc";
import type { FavoriteModels } from "./feature/model/favorite-models";
import { exposeFavoriteModels } from "./feature/model/favorite-models-ipc";
import type { OpenRouterConnection } from "./feature/provider/openrouter/connection";
import { exposeOpenRouterConnection } from "./feature/provider/openrouter/ipc";
import { exposeScenarios } from "./feature/scenario/ipc";
import { exposeThreads } from "./feature/thread/ipc";
import type { LocalState } from "./local-state";
import type { Preferences } from "./preferences/preferences";
import { exposeStorage } from "./storage/ipc";

const preloadPath = join(import.meta.dirname, "../preload/preload.cjs");

function isSafeExternalUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function createMainWindow({
  rendererUrl,
  localState,
  scenarios,
  campaigns,
  threads,
  modelCatalog,
  favoriteModels,
  preferences,
  openRouterConnection,
  storage,
}: {
  rendererUrl: string;
  localState: LocalState;
  scenarios: Scenarios;
  campaigns: Campaigns;
  threads: Threads;
  modelCatalog: ModelCatalog;
  favoriteModels: FavoriteModels;
  preferences: Preferences;
  openRouterConnection: OpenRouterConnection;
  storage: Storage;
}) {
  let currentWindow:
    | {
        browserWindow: BrowserWindow;
        loaded: Promise<void>;
        restoreMaximized: boolean;
      }
    | undefined;

  function openWindow() {
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
      title: "Jaquelene",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadPath,
        sandbox: true,
        webSecurity: true,
        zoomFactor: getInterfaceScaleFactor(preferences.appearance.userInterface.get().scale),
        zoomMode: "manual",
      },
    });

    exposeScenarios(browserWindow.webContents.mainFrame, scenarios);
    exposeCampaigns(browserWindow.webContents.mainFrame, campaigns);
    exposeThreads(browserWindow.webContents.mainFrame, threads);
    exposeCampaignPreferences(browserWindow.webContents.mainFrame, preferences.campaign);
    exposeModelCatalog(browserWindow.webContents.mainFrame, modelCatalog);
    exposeFavoriteModels(browserWindow.webContents.mainFrame, favoriteModels);
    exposeUserInterfacePreferences(browserWindow.webContents, preferences.appearance.userInterface);
    exposeOpenRouterConnection(browserWindow.webContents.mainFrame, openRouterConnection);
    exposeStorage(browserWindow.webContents.mainFrame, storage);

    browserWindow.on("close", () => {
      localState.saveMainWindowState({
        bounds: browserWindow.getNormalBounds(),
        maximized: browserWindow.isMaximized(),
      });
    });
    browserWindow.removeMenu();

    browserWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) {
        void shell.openExternal(url);
      }

      return { action: "deny" };
    });

    browserWindow.webContents.on("will-navigate", (event, url) => {
      if (url !== browserWindow.webContents.getURL()) {
        event.preventDefault();
      }
    });

    const opened = {
      browserWindow,
      loaded: browserWindow.loadURL(rendererUrl),
      restoreMaximized: mainWindowState?.maximized ?? false,
    };

    currentWindow = opened;
    browserWindow.once("closed", () => {
      if (currentWindow === opened) {
        currentWindow = undefined;
      }
    });

    return opened;
  }

  return {
    async show() {
      const existingWindow = currentWindow;
      const opened = existingWindow ?? openWindow();
      await opened.loaded;
      const { browserWindow } = opened;

      if (currentWindow !== opened || browserWindow.isDestroyed()) {
        return;
      }

      if (!existingWindow && opened.restoreMaximized) {
        browserWindow.maximize();
      }

      if (browserWindow.isMinimized()) {
        browserWindow.restore();
      }

      browserWindow.show();
    },
  };
}
