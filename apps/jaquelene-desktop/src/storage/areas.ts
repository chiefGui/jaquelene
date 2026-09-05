import type { StorageArea } from "@jaquelene/backend";
import type { ApplicationDiagnosticsService } from "@/diagnostics/diagnostics";
import { createDiagnosticsStorageArea } from "@/diagnostics/storage";
import {
  createFavoriteModelsStorageArea,
  type FavoriteModelsService,
} from "@/feature/model/favorite-models-service";
import { createLocalStateStorageArea, type LocalStateService } from "@/local-state";
import { createPreferencesStorageArea, type PreferencesService } from "@/preferences/preferences";

export function createStorageAreas(
  userDataDirectory: string,
): readonly StorageArea<
  ApplicationDiagnosticsService | FavoriteModelsService | LocalStateService | PreferencesService
>[] {
  return [
    createDiagnosticsStorageArea(userDataDirectory),
    createFavoriteModelsStorageArea(userDataDirectory),
    createPreferencesStorageArea(userDataDirectory),
    createLocalStateStorageArea(userDataDirectory),
  ];
}
