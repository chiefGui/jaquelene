import * as NodePath from "@effect/platform-node/NodePath";
import { BackendService, StorageCategory, nodeFileTreeLayer } from "@jaquelene/backend";
import { Effect, Fiber, Layer, ManagedRuntime, Result } from "effect";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { DesktopConfigurationService } from "@/application/configuration";
import { getApplicationDatabasePaths } from "@/application/database-paths";
import {
  ApplicationDiagnosticsService,
  type ApplicationDiagnostics,
} from "@/diagnostics/diagnostics";
import { createDiagnosticsStorageArea } from "@/diagnostics/storage";
import { FavoriteModelsService } from "@/feature/model/favorite-models-service";
import { LocalStateService } from "@/local-state";
import { PreferencesService, createPreferences } from "@/preferences/preferences";
import { createStorageAreas } from "./areas";

const directories: string[] = [];
const closeRuntimes: Array<() => Promise<void>> = [];

function createDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-storage-areas-"));
  directories.push(directory);
  return directory;
}

function createStorageRuntime(userDataDirectory: string, diagnostics: ApplicationDiagnostics) {
  const ownersLayer = Layer.merge(LocalStateService.layer, FavoriteModelsService.layer).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        DesktopConfigurationService.layer({ userDataDirectory, developmentServerUrl: undefined }),
        ApplicationDiagnosticsService.layer(diagnostics),
        PreferencesService.layer(createPreferences(userDataDirectory)),
      ),
    ),
  );
  const { databasePath, cachePath } = getApplicationDatabasePaths(userDataDirectory);
  const runtime = ManagedRuntime.make(
    BackendService.layer({
      databasePath,
      cache: { path: cachePath, reportFailure: () => undefined },
      providers: [],
      storageAreas: createStorageAreas(userDataDirectory),
    }).pipe(
      Layer.provideMerge(ownersLayer),
      Layer.provide(nodeFileTreeLayer),
      Layer.provide(NodePath.layer),
    ),
  );
  closeRuntimes.push(() => runtime.dispose());
  return runtime;
}

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

afterEach(async () => {
  await Promise.all(closeRuntimes.splice(0).map((close) => close()));
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("storage areas", () => {
  it("declares every persistence owner without opening its services", () => {
    const userDataDirectory = createDirectory();
    const areas = createStorageAreas(userDataDirectory);

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
    expect(readdirSync(userDataDirectory)).toEqual([]);
  });

  it("deletes every app-data owner through one category", async () => {
    const userDataDirectory = createDirectory();
    const deleteDiagnostics = vi.fn(async () => undefined);
    const diagnostics = createDiagnostics(deleteDiagnostics);
    const runtime = createStorageRuntime(userDataDirectory, diagnostics);
    const favoriteModels = await runtime.runPromise(FavoriteModelsService);
    const localState = await runtime.runPromise(LocalStateService);
    const preferences = await runtime.runPromise(PreferencesService);
    const backend = await runtime.runPromise(BackendService);
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
    const areas = createStorageAreas(userDataDirectory);
    await expect(
      runtime.runPromise(backend.storage.deleteCategory(StorageCategory.AppData)),
    ).resolves.toEqual({
      areas: areas.map(({ id, category }) => ({ id, category, bytes: 0 })),
    });

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
    const userDataDirectory = createDirectory();
    const diagnostics = createDiagnostics();
    const runtime = createStorageRuntime(userDataDirectory, diagnostics);
    const favoriteModels = await runtime.runPromise(FavoriteModelsService);
    const localState = await runtime.runPromise(LocalStateService);
    const preferences = await runtime.runPromise(PreferencesService);
    const backend = await runtime.runPromise(BackendService);
    const failure = new Error("Could not remove the owned data.");
    const fail = () => {
      throw failure;
    };
    vi.spyOn(diagnostics, "deleteAll").mockImplementation(fail);
    vi.spyOn(favoriteModels, "deleteAll").mockImplementation(fail);
    vi.spyOn(localState, "deleteAll").mockImplementation(fail);
    vi.spyOn(preferences, "deleteAll").mockImplementation(fail);
    const areas = createStorageAreas(userDataDirectory);

    for (const area of areas) {
      await expect(
        runtime.runPromise(Effect.result(backend.storage.deleteArea(area.id))),
      ).resolves.toEqual(
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
    const area = createDiagnosticsStorageArea("unused");

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
      }).pipe(Effect.provideService(ApplicationDiagnosticsService, diagnostics)),
    );
  });
});
