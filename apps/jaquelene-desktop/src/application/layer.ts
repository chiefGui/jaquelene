import { BackendService } from "@jaquelene/backend";
import { ErrorSeverity } from "@jaquelene/diagnostics";
import { Effect, Layer } from "effect";
import { safeStorage } from "electron";
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
import { MainWindowService } from "./main-window";

export type DesktopApplicationLayerOptions = Readonly<{
  configuration: DesktopConfiguration;
  diagnostics: ApplicationDiagnostics;
  preferences: Preferences;
}>;

async function requireSecureStorage() {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error("Secure credential storage is unavailable.");
  }
}

function createBackendLayer() {
  return Layer.unwrap(
    Effect.gen(function* () {
      const configuration = yield* DesktopConfigurationService;
      const diagnostics = yield* ApplicationDiagnosticsService;
      const favoriteModels = yield* FavoriteModelsService;
      const localState = yield* LocalStateService;
      const preferences = yield* PreferencesService;
      const { databasePath, cachePath } = getApplicationDatabasePaths(
        configuration.userDataDirectory,
      );
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
      const providers = createProviderFactories(
        configuration.userDataDirectory,
        credentialProtection,
      );

      return BackendService.layer({
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
          userDataDirectory: configuration.userDataDirectory,
        }),
      });
    }),
  );
}

export function createDesktopApplicationLayer({
  configuration,
  diagnostics,
  preferences,
}: DesktopApplicationLayerOptions) {
  const configurationLayer = DesktopConfigurationService.layer(configuration);
  const diagnosticsLayer = ApplicationDiagnosticsService.layer(diagnostics);
  const preferencesLayer = PreferencesService.layer(preferences);
  const localStateLayer = LocalStateService.layer.pipe(
    Layer.provide(Layer.merge(configurationLayer, diagnosticsLayer)),
  );
  const favoriteModelsLayer = FavoriteModelsService.layer.pipe(Layer.provide(configurationLayer));
  const environmentLayer = Layer.mergeAll(
    configurationLayer,
    diagnosticsLayer,
    preferencesLayer,
    localStateLayer,
    favoriteModelsLayer,
  );
  const backendLayer = createBackendLayer().pipe(Layer.provideMerge(environmentLayer));

  return MainWindowService.layer.pipe(Layer.provide(backendLayer));
}
