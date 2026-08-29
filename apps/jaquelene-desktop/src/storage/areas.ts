import type { StorageArea } from "@jaquelene/backend";
import type { ApplicationDiagnostics } from "@/diagnostics/diagnostics";
import { createDiagnosticsStorageArea } from "@/diagnostics/storage";
import type { FavoriteModels } from "@/feature/model/favorite-models";
import { createFavoriteModelsStorageArea } from "@/feature/model/favorite-models-store";
import { createLocalStateStorageArea, type LocalState } from "@/local-state";
import { createPreferencesStorageArea, type Preferences } from "@/preferences/preferences";

type StorageOwners = {
  diagnostics: ApplicationDiagnostics;
  favoriteModels: FavoriteModels;
  localState: LocalState;
  preferences: Preferences;
  userDataDirectory: string;
};

export function createStorageAreas({
  diagnostics,
  favoriteModels,
  localState,
  preferences,
  userDataDirectory,
}: StorageOwners): readonly StorageArea[] {
  return [
    createDiagnosticsStorageArea(userDataDirectory, diagnostics),
    createFavoriteModelsStorageArea(userDataDirectory, favoriteModels),
    createPreferencesStorageArea(userDataDirectory, preferences),
    createLocalStateStorageArea(userDataDirectory, localState),
  ];
}
