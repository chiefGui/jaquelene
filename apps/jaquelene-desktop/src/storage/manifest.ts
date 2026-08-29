import { getDatabaseStoragePaths } from "../database";
import { getFavoriteModelsStoragePaths } from "../feature/model/favorite-models-store";
import { getOpenRouterConnectionStoragePaths } from "../feature/provider/openrouter/connection";
import { getLocalStateStoragePaths } from "../local-state";
import { getPreferencesStoragePaths } from "../preferences/preferences";
import type { StorageManifest } from "./storage";

type StorageLocations = {
  databasePath: string;
  userDataDirectory: string;
};

export function createStorageManifest({
  databasePath,
  userDataDirectory,
}: StorageLocations): StorageManifest {
  return {
    userContent: getDatabaseStoragePaths(databasePath),
    applicationData: [
      ...getLocalStateStoragePaths(userDataDirectory),
      ...getOpenRouterConnectionStoragePaths(userDataDirectory),
      ...getFavoriteModelsStoragePaths(userDataDirectory),
      ...getPreferencesStoragePaths(userDataDirectory),
    ],
  };
}
