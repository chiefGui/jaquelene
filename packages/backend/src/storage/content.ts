import { eq } from "drizzle-orm";
import { campaignTable } from "#backend/campaign/schema";
import { getDatabaseStoragePaths, type Database } from "#backend/database/database";
import { generationTable } from "#backend/generation/schema";
import { scenarioTable } from "#backend/scenario/schema";
import { StorageAreaId, StorageCategory, type StorageArea } from "#backend/storage/storage";
import { threadTable } from "#backend/thread/schema";

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

    transaction.delete(campaignTable).run();
    transaction.delete(generationTable).run();
    transaction.delete(threadTable).run();
    transaction.delete(scenarioTable).run();
  });

  database.$client.exec("VACUUM; PRAGMA wal_checkpoint(TRUNCATE);");
}

export function createContentStorageArea(database: Database, databasePath: string): StorageArea {
  return {
    id: StorageAreaId.Content,
    category: StorageCategory.Content,
    paths: getDatabaseStoragePaths(databasePath),
    delete: () => deleteContent(database),
  };
}
