import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cause, Exit, ManagedRuntime } from "effect";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  StorageCategory,
  StorageService,
  type Storage,
  type StorageArea,
  type StorageCategory as StorageCategoryValue,
} from "./storage";

const closeStorageServices: Array<() => Promise<void>> = [];
const directories: string[] = [];

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

async function createTestStorage(storageAreas: readonly StorageArea[]): Promise<Storage> {
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
        delete: vi.fn(),
      },
      {
        id: "preferences",
        category: StorageCategory.AppData,
        paths: [join(directory, "preferences.json")],
        delete: vi.fn(),
      },
    ]);

    await expect(storage.measureUsage()).resolves.toEqual({
      categories: [
        { id: StorageCategory.Content, bytes: 0 },
        { id: StorageCategory.AppData, bytes: 0 },
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
        delete: vi.fn(),
      },
    ]);

    await expect(storage.measureUsage()).rejects.toMatchObject({
      name: "StorageMeasurementError",
      message: "Could not measure storage usage.",
      cause: { code: "ERR_INVALID_ARG_VALUE" },
    });
  });

  it("aggregates owned files and directories by category", async () => {
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
        delete: vi.fn(),
      },
      {
        id: "local-state",
        category: StorageCategory.AppData,
        paths: [localStatePath],
        delete: vi.fn(),
      },
    ]);

    await expect(storage.measureUsage()).resolves.toEqual({
      categories: [
        { id: StorageCategory.Content, bytes: 2_561 },
        { id: StorageCategory.AppData, bytes: 137 },
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
        delete: vi.fn(),
      },
    ]);

    await expect(storage.measureUsage()).resolves.toEqual({
      categories: [
        { id: StorageCategory.Content, bytes: 0 },
        { id: StorageCategory.AppData, bytes: 0 },
      ],
    });

    writeFileSync(databasePath, Buffer.alloc(256));

    await expect(storage.measureUsage()).resolves.toEqual({
      categories: [
        { id: StorageCategory.Content, bytes: 256 },
        { id: StorageCategory.AppData, bytes: 0 },
      ],
    });
  });

  it("delegates category deletion to every owner and returns fresh usage", async () => {
    const directory = createUserDataDirectory();
    const contentPath = join(directory, "jaquelene.sqlite");
    const favoritesPath = join(directory, "favorite-models.json");
    const preferencesPath = join(directory, "preferences.json");
    const deleteContent = vi.fn();
    const deleteFavorites = vi.fn(() => rmSync(favoritesPath));
    const deletePreferences = vi.fn(() => rmSync(preferencesPath));
    writeFileSync(contentPath, Buffer.alloc(128));
    writeFileSync(favoritesPath, Buffer.alloc(64));
    writeFileSync(preferencesPath, Buffer.alloc(32));
    const storage = await createTestStorage([
      {
        id: "content",
        category: StorageCategory.Content,
        paths: [contentPath],
        delete: deleteContent,
      },
      {
        id: "favorite-models",
        category: StorageCategory.AppData,
        paths: [favoritesPath],
        delete: deleteFavorites,
      },
      {
        id: "preferences",
        category: StorageCategory.AppData,
        paths: [preferencesPath],
        delete: deletePreferences,
      },
    ]);

    await expect(storage.deleteCategory(StorageCategory.AppData)).resolves.toEqual({
      categories: [
        { id: StorageCategory.Content, bytes: 128 },
        { id: StorageCategory.AppData, bytes: 0 },
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
        delete: () => {
          throw failure;
        },
      },
      {
        id: "preferences",
        category: StorageCategory.AppData,
        paths: [join(directory, "preferences.json")],
        delete: deletePreferences,
      },
    ]);

    await expect(storage.deleteCategory(StorageCategory.AppData)).rejects.toMatchObject({
      name: "StorageCategoryDeleteError",
      message: `Could not delete storage category "${StorageCategory.AppData}".`,
      cause: failure,
    });
    expect(deletePreferences).toHaveBeenCalledOnce();
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
        delete: async () => {
          events.push("content:start");
          reportFirstStarted();
          await firstCanFinish;
          events.push("content:end");
        },
      },
      {
        id: "favorite-models",
        category: StorageCategory.AppData,
        paths: [join(directory, "favorite-models.json")],
        delete: () => {
          events.push("app-data");
        },
      },
    ]);

    const deletingContent = storage.deleteCategory(StorageCategory.Content);
    await firstStarted;
    const deletingAppData = storage.deleteCategory(StorageCategory.AppData);
    await Promise.resolve();
    expect(events).toEqual(["content:start"]);

    releaseFirst();
    await Promise.all([deletingContent, deletingAppData]);
    expect(events).toEqual(["content:start", "content:end", "app-data"]);
  });

  it("rejects unknown category identities", async () => {
    const storage = await createTestStorage([]);

    await expect(storage.deleteCategory("unknown" as StorageCategoryValue)).rejects.toMatchObject({
      name: "StorageCategoryDeleteError",
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
          delete: vi.fn(),
        },
      ]),
    ).rejects.toMatchObject({
      name: "StorageConfigurationError",
      cause: { message: "Storage areas require an identity." },
    });

    await expect(
      createTestStorage([
        {
          id: "preferences",
          category: StorageCategory.AppData,
          paths: [sharedPath],
          delete: vi.fn(),
        },
        {
          id: "preferences",
          category: StorageCategory.AppData,
          paths: [join(directory, "other.json")],
          delete: vi.fn(),
        },
      ]),
    ).rejects.toMatchObject({
      name: "StorageConfigurationError",
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
          delete: vi.fn(),
        },
        {
          id: "local-state",
          category: StorageCategory.AppData,
          paths: [sharedPath],
          delete: vi.fn(),
        },
      ]),
    ).rejects.toMatchObject({
      name: "StorageConfigurationError",
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
          delete: vi.fn(),
        },
        {
          id: "local-state",
          category: StorageCategory.AppData,
          paths: [nestedPath],
          delete: vi.fn(),
        },
      ]),
    ).rejects.toMatchObject({
      name: "StorageConfigurationError",
      cause: { message: `Storage paths "${ownedDirectory}" and "${nestedPath}" overlap.` },
    });
  });
});
