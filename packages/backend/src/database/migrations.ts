import { resolve } from "node:path";

const migrationsDirectoryName = "migrations";

export function resolveDatabaseMigrationsDirectory(moduleDirectory: string) {
  return resolve(moduleDirectory, "..", migrationsDirectoryName);
}

export const databaseMigrationsDirectory = resolveDatabaseMigrationsDirectory(import.meta.dirname);
