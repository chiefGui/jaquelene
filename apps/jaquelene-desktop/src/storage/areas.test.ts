import { StorageAreaId, StorageCategory } from "@jaquelene/backend";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createFavoriteModels } from "@/feature/model/favorite-models";
import { createFavoriteModelsStorage } from "@/feature/model/favorite-models-store";
import { createOpenRouterConnection } from "@/feature/provider/openrouter/connection";
import { createLocalState } from "@/local-state";
import { createPreferences } from "@/preferences/preferences";
import { createStorageAreas } from "./areas";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("storage areas", () => {
  it("registers every persistence owner under a stable identity", () => {
    const userDataDirectory = mkdtempSync(join(tmpdir(), "jaquelene-storage-areas-"));
    const favoriteModels = createFavoriteModels(createFavoriteModelsStorage(userDataDirectory));
    const localState = createLocalState(userDataDirectory);
    const openRouterConnection = createOpenRouterConnection(userDataDirectory, {
      encrypt: async (value) => Buffer.from(value),
      decrypt: async (value) => value.toString(),
      verify: async () => ({ state: "connected", keyLabel: "sk-or-v1-test...000" }),
    });
    const preferences = createPreferences(userDataDirectory);
    directories.push(userDataDirectory);

    const areas = createStorageAreas({
      favoriteModels,
      localState,
      openRouterConnection,
      preferences,
      userDataDirectory,
    });

    expect(
      areas.map(({ id, category, paths, delete: deleteArea }) => ({
        id,
        category,
        paths,
        deletable: typeof deleteArea === "function",
      })),
    ).toEqual([
      {
        id: StorageAreaId.FavoriteModels,
        category: StorageCategory.AppData,
        paths: [join(userDataDirectory, "favorite-models.json")],
        deletable: true,
      },
      {
        id: StorageAreaId.Preferences,
        category: StorageCategory.AppData,
        paths: [join(userDataDirectory, "preferences.json")],
        deletable: true,
      },
      {
        id: StorageAreaId.OpenRouterConnection,
        category: StorageCategory.AppData,
        paths: [join(userDataDirectory, "openrouter.json")],
        deletable: true,
      },
      {
        id: StorageAreaId.LocalState,
        category: StorageCategory.AppData,
        paths: [
          join(userDataDirectory, "local-state.json"),
          join(userDataDirectory, "local-state.json.invalid"),
        ],
        deletable: true,
      },
    ]);
  });

  it("deletes every app-data owner through one category", async () => {
    const userDataDirectory = mkdtempSync(join(tmpdir(), "jaquelene-storage-areas-"));
    const favoriteModels = createFavoriteModels(createFavoriteModelsStorage(userDataDirectory));
    const localState = createLocalState(userDataDirectory);
    const openRouterConnection = createOpenRouterConnection(userDataDirectory, {
      encrypt: async (value) => Buffer.from(value),
      decrypt: async (value) => value.toString(),
      verify: async () => ({ state: "connected", keyLabel: "sk-or-v1-test...000" }),
    });
    const preferences = createPreferences(userDataDirectory);
    directories.push(userDataDirectory);
    favoriteModels.set({ providerId: "provider-a", modelId: "model-a" }, true);
    localState.saveMainWindowState({
      bounds: { x: 0, y: 0, width: 1280, height: 720 },
      maximized: false,
    });
    preferences.campaign.setDefaultModel({
      providerId: "provider-a",
      modelId: "model-a",
      name: "Model A",
      brandId: "brand-a",
    });
    await openRouterConnection.connect("openrouter-test-key");

    const areas = createStorageAreas({
      favoriteModels,
      localState,
      openRouterConnection,
      preferences,
      userDataDirectory,
    });
    await Promise.all(
      areas
        .filter(({ category }) => category === StorageCategory.AppData)
        .map((area) => area.delete()),
    );

    expect(favoriteModels.list()).toEqual([]);
    expect(
      localState.loadMainWindowState([{ x: 0, y: 0, width: 1920, height: 1080 }]),
    ).toBeUndefined();
    expect(preferences.campaign.getDefaultModel()).toBeNull();
    expect(openRouterConnection.getConfiguration()).toEqual({ state: "disconnected" });

    for (const path of areas.flatMap(({ paths }) => paths)) {
      expect(existsSync(path)).toBe(false);
    }
  });
});
