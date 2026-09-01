import { eq } from "drizzle-orm";
import type { Database } from "#backend/database/database";
import { generationTable } from "#backend/generation/schema";
import { createProviderAttempts } from "./provider-attempts";
import { createUsageOverviewReader } from "./overview";
import { providerAttemptTable } from "./schema";

export type UsageHistory = ReturnType<typeof createUsageHistory>;
export type Usage = Pick<UsageHistory, "getOverview" | "clear" | "subscribe">;

export function createUsageHistory(database: Database) {
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  const overview = createUsageOverviewReader(database);
  const attempts = createProviderAttempts(database, changed);

  return {
    attempts,
    getOverview: overview.get,
    clear() {
      const deletedAttempts = database.transaction((transaction) => {
        const pendingGeneration = transaction
          .select({ id: generationTable.id })
          .from(generationTable)
          .where(eq(generationTable.status, "pending"))
          .get();

        if (pendingGeneration) {
          throw new Error("Usage history cannot be cleared while a reply is being generated.");
        }

        const pending = transaction
          .select({ id: providerAttemptTable.id })
          .from(providerAttemptTable)
          .where(eq(providerAttemptTable.status, "pending"))
          .get();

        if (pending) {
          throw new Error("Usage history cannot be cleared while a provider attempt is active.");
        }

        return transaction.delete(providerAttemptTable).run().changes;
      });

      if (deletedAttempts > 0) {
        changed();
      }

      return { deletedAttempts };
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
