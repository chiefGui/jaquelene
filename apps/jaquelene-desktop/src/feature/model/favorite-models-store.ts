import { StorageAreaDeleteError, StorageCategory, type StorageArea } from "@jaquelene/backend";
import { Effect } from "effect";
import { join } from "node:path";
import Store, { type Schema } from "electron-store";
import { deleteStoreFile } from "@/storage/delete-store-file";
import type { ModelReference } from "./catalog";
import type { FavoriteModels, FavoriteModelsStorage } from "./favorite-models";

type FavoriteModelsData = {
  models?: ModelReference[];
};

const storeName = "favorite-models";

const schema = {
  models: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        providerId: { type: "string", minLength: 1 },
        modelId: { type: "string", minLength: 1 },
      },
      required: ["providerId", "modelId"],
    },
    uniqueItems: true,
  },
} satisfies Schema<FavoriteModelsData>;

export function getFavoriteModelsStoragePaths(userDataDirectory: string) {
  return [join(userDataDirectory, `${storeName}.json`)] as const;
}

export function createFavoriteModelsStorage(userDataDirectory: string): FavoriteModelsStorage {
  const store = new Store<FavoriteModelsData>({
    clearInvalidConfig: true,
    cwd: userDataDirectory,
    name: storeName,
    schema,
    rootSchema: { additionalProperties: false },
  });

  return {
    read: () => store.get("models"),
    write: (models) => store.set("models", models),
    deleteAll: () => deleteStoreFile(store),
  };
}

export function createFavoriteModelsStorageArea(
  userDataDirectory: string,
  favoriteModels: FavoriteModels,
): StorageArea {
  return {
    id: "favorite-models",
    category: StorageCategory.AppData,
    paths: getFavoriteModelsStoragePaths(userDataDirectory),
    delete: Effect.try({
      try: () => favoriteModels.deleteAll(),
      catch: (cause) => new StorageAreaDeleteError({ areaId: "favorite-models", cause }),
    }),
  };
}
