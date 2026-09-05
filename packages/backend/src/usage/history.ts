import { eq } from "drizzle-orm";
import type { Database } from "#backend/database/database";
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
        const pending = transaction
          .select({ id: providerAttemptTable.id })
          .from(providerAttemptTable)
          .where(eq(providerAttemptTable.status, "pending"))
          .get();

        if (pending) {
          throw new Error("Usage history cannot be cleared while a provider attempt is active.");
        }

        const changes = transaction.delete(providerAttemptTable).run().changes;
        const count = Number(changes);

        if (!Number.isSafeInteger(count)) {
          throw new RangeError("Deleted usage count exceeds the supported amount.");
        }

        return count;
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
