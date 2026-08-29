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
    const storage = createStorage({
      userContent: [join(directory, "jaquelene.sqlite"), join(directory, "attachments")],
      applicationData: [join(directory, "preferences.json")],
    });

    await expect(storage.measureUsage()).resolves.toEqual({
      userContentBytes: 0,
      applicationDataBytes: 0,
    });
  });

  it("rejects usage for invalid owned paths", async () => {
    const directory = createUserDataDirectory();

    const storage = createStorage({
      userContent: [`${directory}\0`],
      applicationData: [],
    });

    await expect(storage.measureUsage()).rejects.toMatchObject({ code: "ERR_INVALID_ARG_VALUE" });
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

    await expect(
      createStorage({
        userContent: [databasePath, attachmentsPath],
        applicationData: [localStatePath],
      }).measureUsage(),
    ).resolves.toEqual({
      userContentBytes: 2_561,
      applicationDataBytes: 137,
    });
  });
});
