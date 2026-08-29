import { isAbsolute, relative, sep } from "node:path";
import {
  databaseMigrationsDirectory,
  resolveDatabaseMigrationsDirectory,
} from "#backend/database/migrations";

export interface BackendBuildDirectory {
  readonly sourceDirectory: string;
  readonly destinationDirectory: string;
}

function containsDirectory(parent: string, candidate: string) {
  const path = relative(parent, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

export function getBackendBuildDirectories(
  bundleDirectory: string,
): readonly BackendBuildDirectory[] {
  if (!isAbsolute(bundleDirectory)) {
    throw new TypeError("The backend bundle directory must be absolute.");
  }

  const destinationDirectory = resolveDatabaseMigrationsDirectory(bundleDirectory);

  if (
    containsDirectory(databaseMigrationsDirectory, destinationDirectory) ||
    containsDirectory(destinationDirectory, databaseMigrationsDirectory)
  ) {
    throw new TypeError("Backend build and source directories must not overlap.");
  }

  return [
    {
      sourceDirectory: databaseMigrationsDirectory,
      destinationDirectory,
    },
  ];
}
