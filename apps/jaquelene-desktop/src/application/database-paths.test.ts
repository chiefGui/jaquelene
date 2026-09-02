import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { getApplicationDatabasePaths } from "./database-paths";

describe("application database paths", () => {
  it("keeps content and cache databases inside user data", () => {
    expect(getApplicationDatabasePaths("user-data")).toEqual({
      databasePath: join("user-data", "jaquelene.sqlite"),
      cachePath: join("user-data", "jaquelene-cache.sqlite"),
    });
  });
});
