import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cause, Deferred, Effect, Exit, ManagedRuntime } from "effect";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  StorageAreaDeleteError,
  StorageCategory,
  StorageService,
  type StorageArea,
  type StorageAreaId,
  type StorageCategory as StorageCategoryValue,
  type StorageDeletion,
  type StorageUsage,
} from "./storage";

const closeStorageServices: Array<() => Promise<void>> = [];
const directories: string[] = [];

type TestStorage = Readonly<{
  measureUsage: () => Promise<StorageUsage>;
  deleteArea: (id: StorageAreaId, signal?: AbortSignal) => Promise<StorageDeletion>;
  deleteCategory: (id: StorageCategoryValue) => Promise<StorageDeletion>;
}>;

function createUserDataDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-storage-"));
  directories.push(directory);
  return directory;
}

async function unwrapExit<A, E>(exitPromise: Promise<Exit.Exit<A, E>>) {
  const exit = await exitPromise;

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  throw Cause.squash(exit.cause);
}

async function createTestStorage(storageAreas: readonly StorageArea[]): Promise<TestStorage> {
  const runtime = ManagedRuntime.make(StorageService.layer(storageAreas));

  try {
    await runtime.context();
  } catch (cause) {
    await runtime.dispose();
    throw cause;
  }

  closeStorageServices.push(() => runtime.dispose());

  return {
    measureUsage: () =>
      unwrapExit(runtime.runPromiseExit(StorageService.use((storage) => storage.measureUsage()))),
    deleteArea: (id, signal) =>
      unwrapExit(
        runtime.runPromiseExit(
          StorageService.use((storage) => storage.deleteArea(id)),
          { signal },
        ),
      ),
    deleteCategory: (id) =>
      unwrapExit(
        runtime.runPromiseExit(StorageService.use((storage) => storage.deleteCategory(id))),
      ),
  };
}

afterEach(async () => {
  await Promise.all(closeStorageServices.splice(0).map((close) => close()));

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("storage", () => {
  it("reports no usage when owned paths do not exist", async () => {
    const directory = createUserDataDirectory();
    const storage = await createTestStorage([
      {
        id: "content",
        category: StorageCategory.Content,
        paths: [join(directory, "jaquelene.sqlite"), join(directory, "attachments")],
        delete: Effect.void,
      },
      {
        id: "preferences",
        category: StorageCategory.AppData,
        paths: [join(directory, "preferences.json")],
        delete: Effect.void,
      },
    ]);

    await expect(storage.measureUsage()).resolves.toEqual({
      areas: [
        { id: "content", category: StorageCategory.Content, bytes: 0 },
        { id: "preferences", category: StorageCategory.AppData, bytes: 0 },
      ],
    });
  });

  it("reports invalid owned paths as measurement errors", async () => {
    const directory = createUserDataDirectory();
    const storage = await createTestStorage([
      {
        id: "content",
        category: StorageCategory.Content,
        paths: [`${directory}\0`],
        delete: Effect.void,
      },
    ]);

    await expect(storage.measureUsage()).rejects.toMatchObject({
      _tag: "StorageMeasurementError",
      message: "Could not measure storage usage.",
      cause: { code: "ERR_INVALID_ARG_VALUE" },
    });
  });

  it("measures every owned area without including unowned paths", async () => {
    const directory = createUserDataDirectory();
    const databasePath = join(directory, "jaquelene.sqlite");
    const localStatePath = join(directory, "local-state.json");
    const attachmentsPath = join(directory, "attachments");
    const portraitsPath = join(attachmentsPath, "portraits");
    const cachePath = join(directory, "Cache");
    mkdirSync(portraitsPath, { recursive: true });
    mkdirSync(cachePath);
    writeFileSync(databasePath, Buffer.alloc(2_049));
    writeFileSync(localStatePath, Buffer.alloc(137));
    writeFileSync(join(portraitsPath, "portrait.png"), Buffer.alloc(512));
    writeFileSync(join(cachePath, "ignored"), Buffer.alloc(10_000));

    const storage = await createTestStorage([
      {
        id: "content",
        category: StorageCategory.Content,
        paths: [databasePath, attachmentsPath],
        delete: Effect.void,
      },
      {
        id: "local-state",
        category: StorageCategory.AppData,
        paths: [localStatePath],
        delete: Effect.void,
      },
    ]);

    await expect(storage.measureUsage()).resolves.toEqual({
      areas: [
        { id: "content", category: StorageCategory.Content, bytes: 2_561 },
        { id: "local-state", category: StorageCategory.AppData, bytes: 137 },
      ],
    });
  });

  it("measures current usage on every request", async () => {
    const directory = createUserDataDirectory();
    const databasePath = join(directory, "jaquelene.sqlite");
    const storage = await createTestStorage([
      {
        id: "content",
        category: StorageCategory.Content,
        paths: [databasePath],
        delete: Effect.void,
      },
    ]);

    await expect(storage.measureUsage()).resolves.toEqual({
      areas: [{ id: "content", category: StorageCategory.Content, bytes: 0 }],
    });

    writeFileSync(databasePath, Buffer.alloc(256));

    await expect(storage.measureUsage()).resolves.toEqual({
      areas: [{ id: "content", category: StorageCategory.Content, bytes: 256 }],
    });
  });

  it("returns fresh usage for deleted owners without measuring unrelated areas", async () => {
    const directory = createUserDataDirectory();
    const favoritesPath = join(directory, "favorite-models.json");
    const preferencesPath = join(directory, "preferences.json");
    const deleteContent = vi.fn();
    const deleteFavorites = vi.fn(() => rmSync(favoritesPath));
    const deletePreferences = vi.fn(() => rmSync(preferencesPath));
    writeFileSync(favoritesPath, Buffer.alloc(64));
    writeFileSync(preferencesPath, Buffer.alloc(32));
    const storage = await createTestStorage([
      {
        id: "content",
        category: StorageCategory.Content,
        paths: [`${directory}\0`],
        delete: Effect.sync(deleteContent),
      },
      {
        id: "favorite-models",
        category: StorageCategory.AppData,
        paths: [favoritesPath],
        delete: Effect.sync(deleteFavorites),
      },
      {
        id: "preferences",
        category: StorageCategory.AppData,
        paths: [preferencesPath],
        delete: Effect.sync(deletePreferences),
      },
    ]);

    await expect(storage.deleteCategory(StorageCategory.AppData)).resolves.toEqual({
      areas: [
        { id: "favorite-models", category: StorageCategory.AppData, bytes: 0 },
        { id: "preferences", category: StorageCategory.AppData, bytes: 0 },
      ],
    });
    expect(deleteContent).not.toHaveBeenCalled();
    expect(deleteFavorites).toHaveBeenCalledOnce();
    expect(deletePreferences).toHaveBeenCalledOnce();
  });

  it("attempts every owner while preserving deletion failures", async () => {
    const directory = createUserDataDirectory();
    const failure = new Error("Favorite storage failed.");
    const deletePreferences = vi.fn();
    const storage = await createTestStorage([
      {
        id: "favorite-models",
        category: StorageCategory.AppData,
        paths: [join(directory, "favorite-models.json")],
        delete: Effect.fail(
          new StorageAreaDeleteError({ areaId: "favorite-models", cause: failure }),
        ),
      },
      {
        id: "preferences",
        category: StorageCategory.AppData,
        paths: [join(directory, "preferences.json")],
        delete: Effect.sync(deletePreferences),
      },
    ]);

    await expect(storage.deleteCategory(StorageCategory.AppData)).rejects.toMatchObject({
      _tag: "StorageCategoryDeleteError",
      category: StorageCategory.AppData,
      message: `Could not delete storage category "${StorageCategory.AppData}".`,
      failures: [{ _tag: "StorageAreaDeleteError", areaId: "favorite-models", cause: failure }],
    });
    expect(deletePreferences).toHaveBeenCalledOnce();
  });

  it("preserves every failed owner and its cause when deleting a category", async () => {
    const firstFailure = new StorageAreaDeleteError({
      areaId: "favorite-models",
      cause: new Error("Favorite storage failed."),
    });
    const secondFailure = new StorageAreaDeleteError({
      areaId: "preferences",
      cause: new Error("Preference storage failed."),
    });
    const storage = await createTestStorage([
      {
        id: firstFailure.areaId,
        category: StorageCategory.AppData,
        paths: [],
        delete: Effect.fail(firstFailure),
      },
      {
        id: secondFailure.areaId,
        category: StorageCategory.AppData,
        paths: [],
        delete: Effect.fail(secondFailure),
      },
    ]);

    await expect(storage.deleteCategory(StorageCategory.AppData)).rejects.toMatchObject({
      _tag: "StorageCategoryDeleteError",
      category: StorageCategory.AppData,
      failures: [firstFailure, secondFailure],
      cause: expect.objectContaining({ errors: [firstFailure, secondFailure] }),
    });
  });

  it("runs deletion effects only when requested and reuses them for later requests", async () => {
    const deleteOwner = vi.fn();
    const storage = await createTestStorage([
      {
        id: "preferences",
        category: StorageCategory.AppData,
        paths: [],
        delete: Effect.sync(deleteOwner),
      },
    ]);

    await storage.measureUsage();
    expect(deleteOwner).not.toHaveBeenCalled();

    await storage.deleteArea("preferences");
    await storage.deleteArea("preferences");
    expect(deleteOwner).toHaveBeenCalledTimes(2);
  });

  it("bounds concurrent owner deletions", async () => {
    const firstBatchStarted = Deferred.makeUnsafe<void>();
    const releaseOwners = Deferred.makeUnsafe<void>();
    let started = 0;
    let active = 0;
    let maximumActive = 0;
    const storage = await createTestStorage(
      Array.from({ length: 7 }, (_, index) => ({
        id: `owner:${index}`,
        category: StorageCategory.AppData,
        paths: [],
        delete: Effect.gen(function* () {
          started += 1;
          active += 1;
          maximumActive = Math.max(maximumActive, active);

          if (started === 4) {
            yield* Deferred.succeed(firstBatchStarted, undefined);
          }

          yield* Deferred.await(releaseOwners);
          active -= 1;
        }),
      })),
    );

    const deleting = storage.deleteCategory(StorageCategory.AppData);
    await Effect.runPromise(Deferred.await(firstBatchStarted));
    expect(started).toBe(4);
    await Effect.runPromise(Deferred.succeed(releaseOwners, undefined));
    await deleting;

    expect(started).toBe(7);
    expect(maximumActive).toBe(4);
    expect(active).toBe(0);
  });

  it("interrupts cancellable owners and releases the storage lock after cleanup", async () => {
    const started = Deferred.makeUnsafe<void>();
    const cleanup = vi.fn();
    const storage = await createTestStorage([
      {
        id: "content",
        category: StorageCategory.Content,
        paths: [],
        delete: Effect.gen(function* () {
          yield* Deferred.succeed(started, undefined);
          yield* Effect.never;
        }).pipe(Effect.onInterrupt(() => Effect.sync(cleanup))),
      },
    ]);
    const controller = new AbortController();
    const deleting = storage.deleteArea("content", controller.signal);
    const interrupted = expect(deleting).rejects.toBeDefined();
    await Effect.runPromise(Deferred.await(started));
    controller.abort();
    await interrupted;

    expect(cleanup).toHaveBeenCalledOnce();
    await expect(storage.measureUsage()).resolves.toEqual({
      areas: [{ id: "content", category: StorageCategory.Content, bytes: 0 }],
    });
  });

  it("preserves defects instead of reporting them as expected deletion failures", async () => {
    const defect = new Error("Unexpected owner defect.");
    const storage = await createTestStorage([
      {
        id: "content",
        category: StorageCategory.Content,
        paths: [],
        delete: Effect.die(defect),
      },
    ]);

    await expect(storage.deleteArea("content")).rejects.toBe(defect);
    await expect(storage.measureUsage()).resolves.toEqual({
      areas: [{ id: "content", category: StorageCategory.Content, bytes: 0 }],
    });
  });

  it("serializes deletion operations", async () => {
    const directory = createUserDataDirectory();
    let releaseFirst!: () => void;
    let reportFirstStarted!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      reportFirstStarted = resolve;
    });
    const events: string[] = [];
    const storage = await createTestStorage([
      {
        id: "content",
        category: StorageCategory.Content,
        paths: [join(directory, "jaquelene.sqlite")],
        delete: Effect.promise(async () => {
          events.push("content:start");
          reportFirstStarted();
          await firstCanFinish;
          events.push("content:end");
        }),
      },
      {
        id: "favorite-models",
        category: StorageCategory.AppData,
        paths: [join(directory, "favorite-models.json")],
        delete: Effect.sync(() => {
          events.push("app-data");
        }),
      },
    ]);

    const deletingContent = storage.deleteCategory(StorageCategory.Content);
    await firstStarted;
    const deletingFavoriteModels = storage.deleteArea("favorite-models");
    await Promise.resolve();
    expect(events).toEqual(["content:start"]);

    releaseFirst();
    await Promise.all([deletingContent, deletingFavoriteModels]);
    expect(events).toEqual(["content:start", "content:end", "app-data"]);
  });

  it("deletes one owner without disturbing its category peers", async () => {
    const directory = createUserDataDirectory();
    const diagnosticsPath = join(directory, "diagnostics", "reports.jsonl");
    const preferencesPath = join(directory, "preferences.json");
    mkdirSync(join(directory, "diagnostics"));
    writeFileSync(diagnosticsPath, Buffer.alloc(48));
    writeFileSync(preferencesPath, Buffer.alloc(32));
    const deleteDiagnostics = vi.fn(() =>
      rmSync(join(directory, "diagnostics"), { recursive: true }),
    );
    const deletePreferences = vi.fn();
    const storage = await createTestStorage([
      {
        id: "diagnostics",
        category: StorageCategory.AppData,
        paths: [join(directory, "diagnostics")],
        delete: Effect.sync(deleteDiagnostics),
      },
      {
        id: "preferences",
        category: StorageCategory.AppData,
        paths: [preferencesPath],
        delete: Effect.sync(deletePreferences),
      },
    ]);

    await expect(storage.deleteArea("diagnostics")).resolves.toEqual({
      areas: [{ id: "diagnostics", category: StorageCategory.AppData, bytes: 0 }],
    });
    expect(deleteDiagnostics).toHaveBeenCalledOnce();
    expect(deletePreferences).not.toHaveBeenCalled();
  });

  it("preserves area deletion failures", async () => {
    const failure = new StorageAreaDeleteError({
      areaId: "diagnostics",
      cause: new Error("Diagnostics storage failed."),
    });
    const storage = await createTestStorage([
      {
        id: "diagnostics",
        category: StorageCategory.AppData,
        paths: [join(createUserDataDirectory(), "diagnostics")],
        delete: Effect.fail(failure),
      },
    ]);

    await expect(storage.deleteArea("diagnostics")).rejects.toBe(failure);
    await expect(storage.measureUsage()).resolves.toEqual({
      areas: [{ id: "diagnostics", category: StorageCategory.AppData, bytes: 0 }],
    });
  });

  it("rejects unknown area and category identities", async () => {
    const storage = await createTestStorage([]);

    await expect(storage.deleteArea("unknown" as StorageAreaId)).rejects.toMatchObject({
      _tag: "StorageTargetNotFoundError",
      kind: "area",
      id: "unknown",
      message: 'Storage area "unknown" does not exist.',
    });
    await expect(storage.deleteCategory("unknown" as StorageCategoryValue)).rejects.toMatchObject({
      _tag: "StorageTargetNotFoundError",
      kind: "category",
      id: "unknown",
      message: 'Storage category "unknown" does not exist.',
    });
  });

  it("rejects missing and conflicting owner identities during startup", async () => {
    const directory = createUserDataDirectory();
    const sharedPath = join(directory, "shared.json");

    await expect(
      createTestStorage([
        {
          id: "",
          category: StorageCategory.AppData,
          paths: [join(directory, "unknown.json")],
          delete: Effect.void,
        },
      ]),
    ).rejects.toMatchObject({
      _tag: "StorageConfigurationError",
      cause: { message: "Storage areas require an identity." },
    });

    await expect(
      createTestStorage([
        {
          id: "preferences",
          category: StorageCategory.AppData,
          paths: [sharedPath],
          delete: Effect.void,
        },
        {
          id: "preferences",
          category: StorageCategory.AppData,
          paths: [join(directory, "other.json")],
          delete: Effect.void,
        },
      ]),
    ).rejects.toMatchObject({
      _tag: "StorageConfigurationError",
      cause: {
        message: 'Storage area "preferences" is registered more than once.',
      },
    });

    await expect(
      createTestStorage([
        {
          id: "preferences",
          category: StorageCategory.AppData,
          paths: [sharedPath],
          delete: Effect.void,
        },
        {
          id: "local-state",
          category: StorageCategory.AppData,
          paths: [sharedPath],
          delete: Effect.void,
        },
      ]),
    ).rejects.toMatchObject({
      _tag: "StorageConfigurationError",
      cause: { message: `Storage path "${sharedPath}" is registered more than once.` },
    });

    const ownedDirectory = join(directory, "attachments");
    const nestedPath = join(ownedDirectory, "portrait.png");

    await expect(
      createTestStorage([
        {
          id: "content",
          category: StorageCategory.Content,
          paths: [ownedDirectory],
          delete: Effect.void,
        },
        {
          id: "local-state",
          category: StorageCategory.AppData,
          paths: [nestedPath],
          delete: Effect.void,
        },
      ]),
    ).rejects.toMatchObject({
      _tag: "StorageConfigurationError",
      cause: { message: `Storage paths "${ownedDirectory}" and "${nestedPath}" overlap.` },
    });
  });
});
