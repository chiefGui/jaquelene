import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDatabase(path: string) {
  const client = new DatabaseSync(path);

  try {
    client.exec("PRAGMA foreign_keys = ON;");

    const database = drizzle({ client });
    migrate(database, { migrationsFolder: join(import.meta.dirname, "migrations") });

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
