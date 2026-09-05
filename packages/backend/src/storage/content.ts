import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { campaignTable } from "#backend/campaign/schema";
import { getDatabaseStoragePaths, type Database } from "#backend/database/database";
import { generationTable } from "#backend/generation/schema";
import { promptTable } from "#backend/prompt/schema";
import {
  StorageAreaDeleteError,
  StorageCategory,
  type StorageArea,
} from "#backend/storage/storage";
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
    transaction.delete(promptTable).where(eq(promptTable.origin, "custom")).run();
    transaction.delete(generationTable).run();
    transaction.delete(threadTable).run();
  });

  database.$client.exec("VACUUM; PRAGMA wal_checkpoint(TRUNCATE);");
}

export function createContentStorageArea(database: Database, databasePath: string): StorageArea {
  return {
    id: "content",
    category: StorageCategory.Content,
    paths: getDatabaseStoragePaths(databasePath),
    delete: Effect.try({
      try: () => deleteContent(database),
      catch: (cause) => new StorageAreaDeleteError({ areaId: "content", cause }),
    }),
  };
}
