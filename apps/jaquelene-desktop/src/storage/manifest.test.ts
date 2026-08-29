import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { createStorageManifest } from "./manifest";

describe("storage manifest", () => {
  it("classifies every app-owned storage path", () => {
    const userDataDirectory = join("user", "data");
    const databasePath = join(userDataDirectory, "jaquelene.sqlite");

    expect(createStorageManifest({ databasePath, userDataDirectory })).toEqual({
      userContent: [
        databasePath,
        `${databasePath}-journal`,
        `${databasePath}-shm`,
        `${databasePath}-wal`,
      ],
      applicationData: [
        join(userDataDirectory, "local-state.json"),
        join(userDataDirectory, "local-state.json.invalid"),
        join(userDataDirectory, "openrouter.json"),
        join(userDataDirectory, "favorite-models.json"),
        join(userDataDirectory, "preferences.json"),
      ],
    });
  });
});
