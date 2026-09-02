import { join } from "node:path";

export function getApplicationDatabasePaths(userDataDirectory: string) {
  return {
    databasePath: join(userDataDirectory, "jaquelene.sqlite"),
    cachePath: join(userDataDirectory, "jaquelene-cache.sqlite"),
  } as const;
}
