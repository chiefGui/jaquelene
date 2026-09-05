import { StorageAreaDeleteError, StorageCategory, type StorageArea } from "@jaquelene/backend";
import { Context, Effect, Layer, Schema } from "effect";
import { DesktopConfigurationService } from "@/application/configuration";
import { createFavoriteModels, type FavoriteModels } from "./favorite-models";
import {
  createFavoriteModelsStorage,
  getFavoriteModelsStoragePaths,
} from "./favorite-models-store";

export function createFavoriteModelsStorageArea(
  userDataDirectory: string,
): StorageArea<FavoriteModelsService> {
  const id = "favorite-models";
  return {
    id,
    category: StorageCategory.AppData,
    paths: getFavoriteModelsStoragePaths(userDataDirectory),
    delete: FavoriteModelsService.use((favoriteModels) =>
      Effect.try({
        try: () => favoriteModels.deleteAll(),
        catch: (cause) => new StorageAreaDeleteError({ areaId: id, cause }),
      }),
    ),
  };
}

export class FavoriteModelsInitializationError extends Schema.TaggedError<FavoriteModelsInitializationError>()(
  "FavoriteModelsInitializationError",
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class FavoriteModelsService extends Context.Service<FavoriteModelsService, FavoriteModels>()(
  "@jaquelene/desktop/feature/model/FavoriteModels",
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const configuration = yield* DesktopConfigurationService;
      return yield* Effect.try({
        try: () =>
          FavoriteModelsService.of(
            createFavoriteModels(createFavoriteModelsStorage(configuration.userDataDirectory)),
          ),
        catch: (cause) =>
          new FavoriteModelsInitializationError({
            message: "Could not initialize favorite models.",
            cause,
          }),
      });
    }),
  );
}
