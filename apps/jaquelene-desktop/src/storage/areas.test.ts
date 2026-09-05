import { StorageCategory } from "@jaquelene/backend";
import { Effect, Fiber, Result } from "effect";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ApplicationDiagnostics } from "@/diagnostics/diagnostics";
import { createDiagnosticsStorageArea } from "@/diagnostics/storage";
import { createFavoriteModels } from "@/feature/model/favorite-models";
import { createFavoriteModelsStorage } from "@/feature/model/favorite-models-store";
import { createLocalState } from "@/local-state";
import { createPreferences } from "@/preferences/preferences";
import { createStorageAreas } from "./areas";

const directories: string[] = [];

function createDiagnostics(
  deleteAll: () => Promise<void> = async () => undefined,
): ApplicationDiagnostics {
  const close = async () => undefined;

  return {
    report() {},
    recordRendererReport() {},
    deleteAll,
    openDirectory: async () => undefined,
    inspect: () => ({ state: "open" }),
    close,
    [Symbol.asyncDispose]: close,
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("storage areas", () => {
  it("registers every persistence owner under a stable identity", () => {
    const userDataDirectory = mkdtempSync(join(tmpdir(), "jaquelene-storage-areas-"));
    const favoriteModels = createFavoriteModels(createFavoriteModelsStorage(userDataDirectory));
    const diagnostics = createDiagnostics();
    const localState = createLocalState(userDataDirectory, diagnostics);
    const preferences = createPreferences(userDataDirectory);
    directories.push(userDataDirectory);

    const areas = createStorageAreas({
      diagnostics,
      favoriteModels,
      localState,
      preferences,
      userDataDirectory,
    });

    expect(
      areas.map(({ id, category, paths, delete: deleteArea }) => ({
        id,
        category,
        paths,
        deletable: Effect.isEffect(deleteArea),
      })),
    ).toEqual([
      {
        id: "diagnostics",
        category: StorageCategory.AppData,
        paths: [join(userDataDirectory, "diagnostics")],
        deletable: true,
      },
      {
        id: "favorite-models",
        category: StorageCategory.AppData,
        paths: [join(userDataDirectory, "favorite-models.json")],
        deletable: true,
      },
      {
        id: "preferences",
        category: StorageCategory.AppData,
        paths: [join(userDataDirectory, "preferences.json")],
        deletable: true,
      },
      {
        id: "local-state",
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
    const deleteDiagnostics = vi.fn(async () => undefined);
    const diagnostics = createDiagnostics(deleteDiagnostics);
    const localState = createLocalState(userDataDirectory, diagnostics);
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
    const areas = createStorageAreas({
      diagnostics,
      favoriteModels,
      localState,
      preferences,
      userDataDirectory,
    });
    await Effect.runPromise(
      Effect.forEach(
        areas.filter(({ category }) => category === StorageCategory.AppData),
        (area) => area.delete,
        { discard: true },
      ),
    );

    expect(favoriteModels.list()).toEqual([]);
    expect(
      localState.loadMainWindowState([{ x: 0, y: 0, width: 1920, height: 1080 }]),
    ).toBeUndefined();
    expect(preferences.campaign.getDefaultModel()).toBeNull();
    expect(deleteDiagnostics).toHaveBeenCalledOnce();

    for (const path of areas.flatMap(({ paths }) => paths)) {
      expect(existsSync(path)).toBe(false);
    }
  });

  it("identifies each owner when its deletion operation fails", async () => {
    const userDataDirectory = mkdtempSync(join(tmpdir(), "jaquelene-storage-areas-"));
    directories.push(userDataDirectory);
    const favoriteModels = createFavoriteModels(createFavoriteModelsStorage(userDataDirectory));
    const diagnostics = createDiagnostics();
    const localState = createLocalState(userDataDirectory, diagnostics);
    const preferences = createPreferences(userDataDirectory);
    const failure = new Error("Could not remove the owned data.");
    const fail = () => {
      throw failure;
    };
    vi.spyOn(diagnostics, "deleteAll").mockImplementation(fail);
    vi.spyOn(favoriteModels, "deleteAll").mockImplementation(fail);
    vi.spyOn(localState, "deleteAll").mockImplementation(fail);
    vi.spyOn(preferences, "deleteAll").mockImplementation(fail);
    const areas = createStorageAreas({
      diagnostics,
      favoriteModels,
      localState,
      preferences,
      userDataDirectory,
    });

    for (const area of areas) {
      await expect(Effect.runPromise(Effect.result(area.delete))).resolves.toEqual(
        Result.fail(
          expect.objectContaining({
            _tag: "StorageAreaDeleteError",
            areaId: area.id,
            cause: failure,
          }),
        ),
      );
    }
  });

  it("finishes an uncancellable owner deletion before releasing its caller", async () => {
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const events: string[] = [];
    const diagnostics = createDiagnostics(async () => {
      events.push("deletion:start");
      started.resolve();
      await release.promise;
      events.push("deletion:finish");
    });
    const area = createDiagnosticsStorageArea("unused", diagnostics);

    await Effect.runPromise(
      Effect.gen(function* () {
        const deleting = yield* Effect.forkChild(
          area.delete.pipe(Effect.onExit(() => Effect.sync(() => events.push("caller:release")))),
        );
        yield* Effect.promise(() => started.promise);
        const interrupting = yield* Effect.forkChild(Fiber.interrupt(deleting));
        yield* Effect.yieldNow;
        const beforeCompletion = [...events];
        release.resolve();
        yield* Fiber.join(interrupting);

        expect(beforeCompletion).toEqual(["deletion:start"]);
        expect(events).toEqual(["deletion:start", "deletion:finish", "caller:release"]);
      }),
    );
  });
});
