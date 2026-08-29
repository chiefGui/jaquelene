import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { Context, Effect, Layer } from "effect";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

class DatabaseOpeningError extends Error {
  override readonly name = "DatabaseOpeningError";

  constructor(cause: unknown) {
    super("Could not open the database.", { cause });
  }
}

export function getDatabaseStoragePaths(path: string) {
  return [path, `${path}-journal`, `${path}-shm`, `${path}-wal`] as const;
}

export function openDatabase(path: string) {
  const client = new DatabaseSync(path);

  try {
    client.exec("PRAGMA foreign_keys = ON;");

    const database = drizzle({ client });
    migrate(database, { migrationsFolder: join(import.meta.dirname, "../migrations") });

    return database;
  } catch (error) {
    try {
      client.close();
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        "Could not close the database after it failed to open.",
      );
    }

    throw error;
  }
}

export type Database = ReturnType<typeof openDatabase>;

export function closeDatabase(database: Database) {
  if (database.$client.isOpen) {
    database.$client.close();
  }
}

export class DatabaseService extends Context.Service<DatabaseService, Database>()(
  "@jaquelene/backend/Database",
) {
  static readonly layer = (path: string) =>
    Layer.effect(
      this,
      Effect.acquireRelease(
        Effect.try({
          try: () => openDatabase(path),
          catch: (cause) => new DatabaseOpeningError(cause),
        }),
        (database) => Effect.sync(() => closeDatabase(database)),
      ),
    );
}
