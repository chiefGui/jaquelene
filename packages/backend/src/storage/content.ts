import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { campaignTable } from "#backend/campaign/schema";
import {
  DatabaseService,
  getDatabaseStoragePaths,
  type Database,
} from "#backend/database/database";
import { generationTable } from "#backend/generation/schema";
import { skillTable } from "#backend/skill/schema";
import { StorageAreaDeleteError, StorageCategory, type StorageArea } from "#backend/storage/area";
import { threadTable } from "#backend/thread/schema";
import { providerAttemptTable } from "#backend/usage/schema";

function deleteContent(database: Database) {
  database.transaction((transaction) => {
    const pendingGeneration = transaction
      .select({ id: generationTable.id })
      .from(generationTable)
      .where(eq(generationTable.status, "pending"))
      .get();

    if (pendingGeneration) {
      throw new Error("Content cannot be deleted while a reply is being generated.");
    }

    const pendingAttempt = transaction
      .select({ id: providerAttemptTable.id })
      .from(providerAttemptTable)
      .where(eq(providerAttemptTable.status, "pending"))
      .get();

    if (pendingAttempt) {
      throw new Error("Content cannot be deleted while a provider attempt is active.");
    }

    transaction.delete(providerAttemptTable).run();
    transaction.delete(campaignTable).run();
    transaction.delete(skillTable).where(eq(skillTable.origin, "custom")).run();
    transaction.delete(generationTable).run();
    transaction.delete(threadTable).run();
  });

  database.$client.exec("VACUUM; PRAGMA wal_checkpoint(TRUNCATE);");
}

export function createContentStorageArea(databasePath: string): StorageArea<DatabaseService> {
  const id = "content";
  return {
    id,
    category: StorageCategory.Content,
    paths: getDatabaseStoragePaths(databasePath),
    delete: DatabaseService.use((database) =>
      Effect.try({
        try: () => deleteContent(database),
        catch: (cause) => new StorageAreaDeleteError({ areaId: id, cause }),
      }),
    ),
  };
}
