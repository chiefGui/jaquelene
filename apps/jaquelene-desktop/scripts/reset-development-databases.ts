import { existsSync, realpathSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabaseStoragePaths } from "@jaquelene/backend";
import { getApplicationDatabasePaths } from "../src/application/database-paths";
import {
  createDevelopmentProfileId,
  developmentProfileEnvironmentVariable,
  getDevelopmentProfileUserDataDirectory,
  requireDevelopmentProfileId,
} from "../src/development-profile";

function getAppDataDirectory() {
  switch (process.platform) {
    case "win32":
      return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    case "darwin":
      return join(homedir(), "Library", "Application Support");
    default:
      return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  }
}

const worktreeRoot = realpathSync.native(fileURLToPath(new URL("../../..", import.meta.url)));
const profileId = requireDevelopmentProfileId(
  process.env[developmentProfileEnvironmentVariable] ?? createDevelopmentProfileId(worktreeRoot),
);
const userDataDirectory = getDevelopmentProfileUserDataDirectory(getAppDataDirectory(), profileId);
const { databasePath, cachePath } = getApplicationDatabasePaths(userDataDirectory);
const storagePaths = [databasePath, cachePath].flatMap((path) => getDatabaseStoragePaths(path));
const resolvedUserDataDirectory = resolve(userDataDirectory);

for (const path of storagePaths) {
  if (dirname(resolve(path)) !== resolvedUserDataDirectory) {
    throw new Error(`Refusing to remove a file outside ${resolvedUserDataDirectory}.`);
  }
}

const existingPaths = storagePaths.filter((path) => existsSync(path));

for (const path of existingPaths) {
  try {
    rmSync(path, { force: true });
  } catch (cause) {
    throw new Error(`Could not remove ${path}. Close Jaquelene and try again.`, { cause });
  }
}

if (existingPaths.length === 0) {
  console.log(`No SQLite files found for development profile ${profileId}.`);
} else {
  console.log(`Reset development profile ${profileId}:`);
  for (const path of existingPaths) {
    console.log(`- ${path}`);
  }
}
