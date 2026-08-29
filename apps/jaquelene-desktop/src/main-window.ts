import type { Campaigns, Providers, Scenarios, Storage, Turns } from "@jaquelene/backend";
import { ErrorSeverity } from "@jaquelene/diagnostics";
import { app, BrowserWindow, screen, shell } from "electron";
import { join } from "node:path";
import type { ApplicationDiagnostics } from "./diagnostics/diagnostics";
import { exposeDiagnostics } from "./diagnostics/ipc";
import { exposeUserInterfacePreferences } from "./feature/appearance/user-interface/ipc";
import { createInterfaceScaleWebPreferences } from "./feature/appearance/user-interface/zoom";
import { exposeCampaignPreferences, exposeCampaigns } from "./feature/campaign/ipc";
import type { ModelCatalog } from "./feature/model/catalog";
import { exposeModelCatalog } from "./feature/model/catalog-ipc";
import type { FavoriteModels } from "./feature/model/favorite-models";
import { exposeFavoriteModels } from "./feature/model/favorite-models-ipc";
import { exposeProviders } from "./feature/provider/ipc";
import { exposeScenarios } from "./feature/scenario/ipc";
import { exposeThreadMessaging } from "./feature/thread/ipc";
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
  diagnostics,
  localState,
  scenarios,
  campaigns,
  turns,
  modelCatalog,
  favoriteModels,
  preferences,
  providers,
  storage,
}: {
  rendererUrl: string;
  diagnostics: ApplicationDiagnostics;
  localState: LocalState;
  scenarios: Scenarios;
  campaigns: Campaigns;
  turns: Turns;
  modelCatalog: ModelCatalog;
  favoriteModels: FavoriteModels;
  preferences: Preferences;
  providers: Providers;
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
      title: app.name,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadPath,
        sandbox: true,
        webSecurity: true,
        ...createInterfaceScaleWebPreferences(preferences.appearance.userInterface.get().scale),
      },
    });

    exposeScenarios(browserWindow.webContents.mainFrame, scenarios);
    exposeDiagnostics(browserWindow.webContents.mainFrame, diagnostics);
    exposeCampaigns(browserWindow.webContents.mainFrame, campaigns);
    exposeThreadMessaging(browserWindow.webContents.mainFrame, turns, diagnostics);
    exposeCampaignPreferences(browserWindow.webContents.mainFrame, preferences.campaign);
    exposeModelCatalog(browserWindow.webContents.mainFrame, modelCatalog);
    exposeFavoriteModels(browserWindow.webContents.mainFrame, favoriteModels);
    exposeUserInterfacePreferences(browserWindow.webContents, preferences.appearance.userInterface);
    exposeProviders(browserWindow.webContents.mainFrame, providers);
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
