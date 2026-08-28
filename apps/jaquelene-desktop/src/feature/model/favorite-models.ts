import { requireModelReference, type ModelReference } from "./catalog";

export type FavoriteModelsStorage = {
  read(): ModelReference[] | undefined;
  write(models: ModelReference[]): void;
};

function sameModel(left: ModelReference, right: ModelReference) {
  return left.providerId === right.providerId && left.modelId === right.modelId;
}

function copyModels(models: ModelReference[] | undefined) {
  return models?.map((model) => ({ ...model })) ?? [];
}

export function createFavoriteModels(storage: FavoriteModelsStorage) {
  function list() {
    return copyModels(storage.read());
  }

  return {
    list,

    set(reference: ModelReference, favorite: boolean) {
      requireModelReference(reference);

      const models = list();
      const index = models.findIndex((candidate) => sameModel(candidate, reference));

      if ((favorite && index >= 0) || (!favorite && index < 0)) {
        return models;
      }

      if (favorite) {
        models.push({ ...reference });
      } else {
        models.splice(index, 1);
      }

      storage.write(models);
      return copyModels(models);
    },
  };
}

export type FavoriteModels = ReturnType<typeof createFavoriteModels>;
