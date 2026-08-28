import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createFavoriteModels } from "./favorite-models";
import {
  createFavoriteModelsStorage,
  getFavoriteModelsStoragePaths,
} from "./favorite-models-store";

const directories: string[] = [];

function createUserDataDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-favorite-models-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("favorite model storage", () => {
  it("persists favorite models independently", () => {
    const directory = createUserDataDirectory();
    const reference = { providerId: "provider-a", modelId: "model-a" };
    const favoriteModels = createFavoriteModels(createFavoriteModelsStorage(directory));

    favoriteModels.set(reference, true);

    const restored = createFavoriteModels(createFavoriteModelsStorage(directory));
    expect(restored.list()).toEqual([reference]);
    expect(getFavoriteModelsStoragePaths(directory)).toEqual([
      join(directory, "favorite-models.json"),
    ]);
    expect(existsSync(join(directory, "preferences.json"))).toBe(false);
  });
});
