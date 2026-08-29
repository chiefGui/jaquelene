import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createBackend, type Backend, type StorageManifest } from "@jaquelene/backend";

const backends: Backend[] = [];
const directories: string[] = [];

function createUserDataDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-storage-"));
  directories.push(directory);
  return directory;
}

async function createTestBackend(storageManifest: StorageManifest) {
  const databaseDirectory = createUserDataDirectory();
  const backend = await createBackend({
    databasePath: join(databaseDirectory, "jaquelene.sqlite"),
    generationProviders: [],
    storageManifest,
  });
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
  it("reports no usage when owned paths do not exist", async () => {
    const directory = createUserDataDirectory();
    const backend = await createTestBackend({
      userContent: [join(directory, "jaquelene.sqlite"), join(directory, "attachments")],
      applicationData: [join(directory, "preferences.json")],
    });

    await expect(backend.storage.measureUsage()).resolves.toEqual({
      userContentBytes: 0,
      applicationDataBytes: 0,
    });
  });

  it("reports invalid owned paths as measurement errors", async () => {
    const directory = createUserDataDirectory();
    const backend = await createTestBackend({
      userContent: [`${directory}\0`],
      applicationData: [],
    });

    await expect(backend.storage.measureUsage()).rejects.toMatchObject({
      name: "StorageMeasurementError",
      message: "Could not measure storage usage.",
      cause: { code: "ERR_INVALID_ARG_VALUE" },
    });
  });

  it("measures owned files and directories by category", async () => {
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

    const backend = await createTestBackend({
      userContent: [databasePath, attachmentsPath],
      applicationData: [localStatePath],
    });

    await expect(backend.storage.measureUsage()).resolves.toEqual({
      userContentBytes: 2_561,
      applicationDataBytes: 137,
    });
  });

  it("measures current usage on every request", async () => {
    const directory = createUserDataDirectory();
    const databasePath = join(directory, "jaquelene.sqlite");
    const backend = await createTestBackend({
      userContent: [databasePath],
      applicationData: [],
    });

    await expect(backend.storage.measureUsage()).resolves.toEqual({
      userContentBytes: 0,
      applicationDataBytes: 0,
    });

    writeFileSync(databasePath, Buffer.alloc(256));

    await expect(backend.storage.measureUsage()).resolves.toEqual({
      userContentBytes: 256,
      applicationDataBytes: 0,
    });
  });

  it("closes idempotently and rejects new work after closing", async () => {
    const backend = await createTestBackend({ userContent: [], applicationData: [] });

    await expect(backend.close()).resolves.toBeUndefined();
    await expect(backend.close()).resolves.toBeUndefined();
    await expect(backend.storage.measureUsage()).rejects.toThrow("Backend is closed.");
  });
});
