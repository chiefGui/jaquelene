import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createStorage } from "./storage";

const directories: string[] = [];

function createUserDataDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-storage-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("storage", () => {
  it("reports no usage for an empty application-data directory", async () => {
    const storage = createStorage(createUserDataDirectory());

    await expect(storage.measureUsage()).resolves.toEqual({ totalBytes: 0 });
  });

  it("measures files throughout the application-data directory", async () => {
    const directory = createUserDataDirectory();
    const nestedDirectory = join(directory, "nested");
    mkdirSync(nestedDirectory);
    writeFileSync(join(directory, "local-state.json"), Buffer.alloc(137));
    writeFileSync(join(nestedDirectory, "jaquelene.sqlite"), Buffer.alloc(2_049));

    await expect(createStorage(directory).measureUsage()).resolves.toEqual({
      totalBytes: 2_186,
    });
  });
});
