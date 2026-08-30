import { app, shell } from "electron";
import { registerAppScheme } from "../app-protocol";
import {
  developmentProfileEnvironmentVariable,
  prepareApplicationInstance,
} from "../development-profile";
import {
  createApplicationDiagnostics,
  getDiagnosticsStoragePath,
} from "../diagnostics/diagnostics";
import { createPathOpener } from "../path-opener";
import { createPreferences, type Preferences } from "../preferences/preferences";
import { launchDesktopApplication } from "./desktop-application";
import { createDesktopHost } from "./host";
import { applicationId } from "./identity";

export function bootstrapDesktopApplication() {
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
    return undefined;
  }

  const userDataDirectory = app.getPath("userData");
  const diagnosticsDirectory = getDiagnosticsStoragePath(userDataDirectory);
  let preferences: Preferences | undefined;
  const diagnostics = createApplicationDiagnostics({
    directoryPath: diagnosticsDirectory,
    openPath: createPathOpener((path) => shell.openPath(path)),
    shouldWriteToDisk: () => preferences?.diagnostics.get().writeToDisk ?? true,
  });

  return createDesktopHost({
    application: app,
    diagnostics,
    launch() {
      preferences = createPreferences(userDataDirectory);
      app.setAppLogsPath(diagnosticsDirectory);
      registerAppScheme();
      return launchDesktopApplication({
        diagnostics,
        preferences,
        userDataDirectory,
        ...(!app.isPackaged && process.env.VITE_DEV_SERVER_URL
          ? { developmentServerUrl: process.env.VITE_DEV_SERVER_URL }
          : {}),
      });
    },
  });
}
