import { isAbsolute } from "node:path";
import {
  databaseMigrationsDirectory,
  resolveDatabaseMigrationsDirectory,
} from "#backend/database/migrations";

export interface BackendBuildDirectory {
  readonly sourceDirectory: string;
  readonly destinationDirectory: string;
}

export function getBackendBuildDirectories(
  bundleDirectory: string,
): readonly BackendBuildDirectory[] {
  if (!isAbsolute(bundleDirectory)) {
    throw new TypeError("The backend bundle directory must be absolute.");
  }

  return [
    {
      sourceDirectory: databaseMigrationsDirectory,
      destinationDirectory: resolveDatabaseMigrationsDirectory(bundleDirectory),
    },
  ];
}
