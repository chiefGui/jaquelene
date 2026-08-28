import { describe, expect, it } from "vite-plus/test";
import type { ModelReference } from "./catalog";
import { createFavoriteModels } from "./favorite-models";

function createStorage(initialModels?: ModelReference[]) {
  let storedModels = initialModels;

  return {
    favoriteModels: createFavoriteModels({
      read: () => storedModels,
      write: (models) => {
        storedModels = models;
      },
    }),
    read: () => storedModels,
  };
}

describe("favorite models", () => {
  it("sets membership idempotently", () => {
    const { favoriteModels } = createStorage();
    const reference = { providerId: "provider-a", modelId: "model-a" };

    expect(favoriteModels.set(reference, true)).toEqual([reference]);
    expect(favoriteModels.set(reference, true)).toEqual([reference]);
    expect(favoriteModels.set(reference, false)).toEqual([]);
    expect(favoriteModels.set(reference, false)).toEqual([]);
  });

  it("identifies models by provider and model", () => {
    const { favoriteModels } = createStorage();
    const first = { providerId: "provider-a", modelId: "shared-model" };
    const second = { providerId: "provider-b", modelId: "shared-model" };

    favoriteModels.set(first, true);
    expect(favoriteModels.set(second, true)).toEqual([first, second]);
    expect(favoriteModels.set(first, false)).toEqual([second]);
  });

  it("does not expose mutable stored references", () => {
    const reference = { providerId: "provider-a", modelId: "model-a" };
    const { favoriteModels, read } = createStorage();
    const models = favoriteModels.set(reference, true);

    models[0]!.modelId = "changed";
    models.push({ providerId: "provider-b", modelId: "model-b" });

    expect(favoriteModels.list()).toEqual([reference]);
    expect(read()).toEqual([reference]);
  });

  it("rejects references without provider or model identity", () => {
    const { favoriteModels } = createStorage();

    expect(() => favoriteModels.set({ providerId: " ", modelId: "model-a" }, true)).toThrow(
      TypeError,
    );
    expect(() => favoriteModels.set({ providerId: "provider-a", modelId: " " }, true)).toThrow(
      TypeError,
    );
  });
});
