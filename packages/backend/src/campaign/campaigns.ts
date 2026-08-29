import { desc, eq } from "drizzle-orm";
import type { Database } from "../database/database";
import { ids, type CampaignId, type ScenarioId } from "../id";
import { insertThread } from "../thread/threads";
import { campaignTable } from "./schema";

export function createCampaigns(database: Database, now: () => number = Date.now) {
  return {
    start(scenarioId: ScenarioId) {
      const startedAt = now();

      return database.transaction((transaction) => {
        const thread = insertThread(transaction, startedAt);
        const campaign = {
          id: ids.campaign.create(),
          scenarioId,
          threadId: thread.id,
          startedAt,
        };

        transaction.insert(campaignTable).values(campaign).run();
        return campaign;
      });
    },

    listForScenario(scenarioId: ScenarioId) {
      return database
        .select()
        .from(campaignTable)
        .where(eq(campaignTable.scenarioId, scenarioId))
        .orderBy(desc(campaignTable.startedAt), desc(campaignTable.id))
        .all();
    },

    get(id: CampaignId) {
      return database.select().from(campaignTable).where(eq(campaignTable.id, id)).get() ?? null;
    },
  };
}

export type Campaigns = ReturnType<typeof createCampaigns>;
