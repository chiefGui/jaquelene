import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "@/database";
import { insertThread } from "@/feature/thread/threads";
import { campaignTable } from "./schema";

export function createCampaigns(database: Database, now: () => number = Date.now) {
  return {
    start(scenarioId: string) {
      const startedAt = now();

      return database.transaction((transaction) => {
        const thread = insertThread(transaction, startedAt);
        const campaign = {
          id: randomUUID(),
          scenarioId,
          threadId: thread.id,
          startedAt,
        };

        transaction.insert(campaignTable).values(campaign).run();
        return campaign;
      });
    },

    listForScenario(scenarioId: string) {
      return database
        .select()
        .from(campaignTable)
        .where(eq(campaignTable.scenarioId, scenarioId))
        .orderBy(desc(campaignTable.startedAt), desc(campaignTable.id))
        .all();
    },

    get(id: string) {
      return database.select().from(campaignTable).where(eq(campaignTable.id, id)).get() ?? null;
    },
  };
}

export type Campaigns = ReturnType<typeof createCampaigns>;
