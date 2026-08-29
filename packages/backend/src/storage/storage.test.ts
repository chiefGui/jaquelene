import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  createBackend,
  StorageAreaId,
  StorageCategory,
  type Backend,
  type StorageArea,
  type StorageCategory as StorageCategoryValue,
} from "../index";

const backends: Backend[] = [];
const directories: string[] = [];

function createUserDataDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-storage-"));
  directories.push(directory);
  return directory;
}

function createBackendOptions(storageAreas: readonly StorageArea[]) {
  const databaseDirectory = createUserDataDirectory();

  return {
    databasePath: join(databaseDirectory, "jaquelene.sqlite"),
    generationProviders: [],
    storageAreas,
  } as const;
}

async function createTestBackend(storageAreas: readonly StorageArea[]) {
  const backend = await createBackend(createBackendOptions(storageAreas));
  backends.push(backend);
  return backend;
}

afterEach(async () => {
  await Promise.all(backends.splice(0).map((backend) => backend.close()));

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("storage", () => {
  it("reports missing owned paths as zero bytes", async () => {
    const directory = createUserDataDirectory();
    const backend = await createTestBackend([
      {
        id: StorageAreaId.Preferences,
        category: StorageCategory.AppData,
        paths: [join(directory, "preferences.json")],
        delete: vi.fn(),
      },
    ]);

    const usage = await backend.storage.measureUsage();

    expect(usage.categories).toEqual([
      { id: StorageCategory.Content, bytes: expect.any(Number) },
      { id: StorageCategory.AppData, bytes: 0 },
    ]);
    expect(usage.categories[0]?.bytes).toBeGreaterThan(0);
  });

  it("reports invalid owned paths as measurement errors", async () => {
    const directory = createUserDataDirectory();
    const backend = await createTestBackend([
      {
        id: StorageAreaId.Preferences,
        category: StorageCategory.AppData,
        paths: [`${directory}\0`],
        delete: vi.fn(),
      },
    ]);

    await expect(backend.storage.measureUsage()).rejects.toMatchObject({
      name: "StorageMeasurementError",
      message: "Could not measure storage usage.",
      cause: { code: "ERR_INVALID_ARG_VALUE" },
    });
  });

  it("aggregates owned files and directories while ignoring unowned data", async () => {
    const directory = createUserDataDirectory();
    const localStatePath = join(directory, "local-state.json");
    const attachmentsPath = join(directory, "attachments");
    const portraitsPath = join(attachmentsPath, "portraits");
    const cachePath = join(directory, "Cache");
    mkdirSync(portraitsPath, { recursive: true });
    mkdirSync(cachePath);
    writeFileSync(localStatePath, Buffer.alloc(137));
    writeFileSync(join(portraitsPath, "portrait.png"), Buffer.alloc(512));
    writeFileSync(join(cachePath, "ignored"), Buffer.alloc(10_000));

    const backend = await createTestBackend([
      {
        id: StorageAreaId.LocalState,
        category: StorageCategory.AppData,
        paths: [localStatePath, attachmentsPath],
        delete: vi.fn(),
      },
    ]);

    const usage = await backend.storage.measureUsage();

    expect(usage.categories).toEqual([
      { id: StorageCategory.Content, bytes: expect.any(Number) },
      { id: StorageCategory.AppData, bytes: 649 },
    ]);
  });

  it("measures current usage on every request", async () => {
    const directory = createUserDataDirectory();
    const preferencesPath = join(directory, "preferences.json");
    const backend = await createTestBackend([
      {
        id: StorageAreaId.Preferences,
        category: StorageCategory.AppData,
        paths: [preferencesPath],
        delete: vi.fn(),
      },
    ]);

    await expect(backend.storage.measureUsage()).resolves.toMatchObject({
      categories: [
        { id: StorageCategory.Content, bytes: expect.any(Number) },
        { id: StorageCategory.AppData, bytes: 0 },
      ],
    });

    writeFileSync(preferencesPath, Buffer.alloc(256));

    await expect(backend.storage.measureUsage()).resolves.toMatchObject({
      categories: [
        { id: StorageCategory.Content, bytes: expect.any(Number) },
        { id: StorageCategory.AppData, bytes: 256 },
      ],
    });
  });

  it("delegates category deletion to every owner and returns fresh usage", async () => {
    const directory = createUserDataDirectory();
    const favoritesPath = join(directory, "favorite-models.json");
    const preferencesPath = join(directory, "preferences.json");
    const deleteFavorites = vi.fn(() => rmSync(favoritesPath));
    const deletePreferences = vi.fn(() => rmSync(preferencesPath));
    writeFileSync(favoritesPath, Buffer.alloc(64));
    writeFileSync(preferencesPath, Buffer.alloc(32));
    const backend = await createTestBackend([
      {
        id: StorageAreaId.FavoriteModels,
        category: StorageCategory.AppData,
        paths: [favoritesPath],
        delete: deleteFavorites,
      },
      {
        id: StorageAreaId.Preferences,
        category: StorageCategory.AppData,
        paths: [preferencesPath],
        delete: deletePreferences,
      },
    ]);
    const before = await backend.storage.measureUsage();

    await expect(backend.storage.deleteCategory(StorageCategory.AppData)).resolves.toEqual({
      categories: [
        { id: StorageCategory.Content, bytes: before.categories[0]?.bytes },
        { id: StorageCategory.AppData, bytes: 0 },
      ],
    });
    expect(deleteFavorites).toHaveBeenCalledOnce();
    expect(deletePreferences).toHaveBeenCalledOnce();
  });

  it("attempts every owner while preserving deletion failures", async () => {
    const directory = createUserDataDirectory();
    const failure = new Error("Favorite storage failed.");
    const deletePreferences = vi.fn();
    const backend = await createTestBackend([
      {
        id: StorageAreaId.FavoriteModels,
        category: StorageCategory.AppData,
        paths: [join(directory, "favorite-models.json")],
        delete: () => {
          throw failure;
        },
      },
      {
        id: StorageAreaId.Preferences,
        category: StorageCategory.AppData,
        paths: [join(directory, "preferences.json")],
        delete: deletePreferences,
      },
    ]);

    await expect(backend.storage.deleteCategory(StorageCategory.AppData)).rejects.toMatchObject({
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
    let invocation = 0;
    const backend = await createTestBackend([
      {
        id: StorageAreaId.LocalState,
        category: StorageCategory.AppData,
        paths: [join(directory, "local-state.json")],
        delete: async () => {
          invocation += 1;
          events.push(`start:${invocation}`);

          if (invocation === 1) {
            reportFirstStarted();
            await firstCanFinish;
          }

          events.push(`end:${invocation}`);
        },
      },
    ]);

    const firstDeletion = backend.storage.deleteCategory(StorageCategory.AppData);
    await firstStarted;
    const secondDeletion = backend.storage.deleteCategory(StorageCategory.AppData);
    await Promise.resolve();
    expect(events).toEqual(["start:1"]);

    releaseFirst();
    await Promise.all([firstDeletion, secondDeletion]);
    expect(events).toEqual(["start:1", "end:1", "start:2", "end:2"]);
  });

  it("rejects unknown category identities", async () => {
    const backend = await createTestBackend([]);

    await expect(
      backend.storage.deleteCategory("unknown" as StorageCategoryValue),
    ).rejects.toMatchObject({
      name: "StorageCategoryDeleteError",
      message: 'Storage category "unknown" does not exist.',
    });
  });

  it("rejects duplicate owner identities and paths during startup", async () => {
    const directory = createUserDataDirectory();
    const sharedPath = join(directory, "shared.json");

    await expect(
      createBackend(
        createBackendOptions([
          {
            id: StorageAreaId.Preferences,
            category: StorageCategory.AppData,
            paths: [sharedPath],
            delete: vi.fn(),
          },
          {
            id: StorageAreaId.Preferences,
            category: StorageCategory.AppData,
            paths: [join(directory, "other.json")],
            delete: vi.fn(),
          },
        ]),
      ),
    ).rejects.toMatchObject({
      name: "StorageConfigurationError",
      cause: {
        message: `Storage area "${StorageAreaId.Preferences}" is registered more than once.`,
      },
    });

    await expect(
      createBackend(
        createBackendOptions([
          {
            id: StorageAreaId.Preferences,
            category: StorageCategory.AppData,
            paths: [sharedPath],
            delete: vi.fn(),
          },
          {
            id: StorageAreaId.LocalState,
            category: StorageCategory.AppData,
            paths: [sharedPath],
            delete: vi.fn(),
          },
        ]),
      ),
    ).rejects.toMatchObject({
      name: "StorageConfigurationError",
      cause: { message: `Storage path "${sharedPath}" is registered more than once.` },
    });
  });

  it("closes idempotently and rejects new work after closing", async () => {
    const backend = await createTestBackend([]);

    await expect(backend.close()).resolves.toBeUndefined();
    await expect(backend.close()).resolves.toBeUndefined();
    await expect(backend.storage.measureUsage()).rejects.toThrow("Backend is closed.");
    await expect(backend.storage.deleteCategory(StorageCategory.Content)).rejects.toThrow(
      "Backend is closed.",
    );
  });
});
