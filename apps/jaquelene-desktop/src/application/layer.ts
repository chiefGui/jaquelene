import * as NodePath from "@effect/platform-node/NodePath";
import { BackendService, nodeFileTreeLayer } from "@jaquelene/backend";
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
import { RendererService } from "./renderer";

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
        storageAreas: createStorageAreas(configuration.userDataDirectory),
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
  const baseLayer = Layer.mergeAll(configurationLayer, diagnosticsLayer, preferencesLayer);
  const rendererLayer = RendererService.layer.pipe(Layer.provideMerge(baseLayer));
  const localCapabilitiesLayer = Layer.merge(LocalStateService.layer, FavoriteModelsService.layer);
  const environmentLayer = localCapabilitiesLayer.pipe(Layer.provideMerge(rendererLayer));
  const filesystemLayer = nodeFileTreeLayer.pipe(Layer.provideMerge(NodePath.layer));
  const backendLayer = createBackendLayer().pipe(
    Layer.provide(filesystemLayer),
    Layer.provideMerge(environmentLayer),
  );

  return MainWindowService.layer.pipe(Layer.provide(backendLayer));
}
