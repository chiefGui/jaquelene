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
  it("reports no usage when owned paths do not exist", async () => {
    const directory = createUserDataDirectory();
    const storage = createStorage([
      join(directory, "jaquelene.sqlite"),
      join(directory, "attachments"),
    ]);

    await expect(storage.measureUsage()).resolves.toEqual({ totalBytes: 0 });
  });

  it("measures only owned files and directories", async () => {
    const directory = createUserDataDirectory();
    const databasePath = join(directory, "jaquelene.sqlite");
    const localStatePath = join(directory, "local-state.json");
    const attachmentsPath = join(directory, "attachments");
    const cachePath = join(directory, "Cache");
    mkdirSync(attachmentsPath);
    mkdirSync(cachePath);
    writeFileSync(databasePath, Buffer.alloc(2_049));
    writeFileSync(localStatePath, Buffer.alloc(137));
    writeFileSync(join(attachmentsPath, "portrait.png"), Buffer.alloc(512));
    writeFileSync(join(cachePath, "ignored"), Buffer.alloc(10_000));

    await expect(
      createStorage([databasePath, localStatePath, attachmentsPath]).measureUsage(),
    ).resolves.toEqual({
      totalBytes: 2_698,
    });
  });
});
