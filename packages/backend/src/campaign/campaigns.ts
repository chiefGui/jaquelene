import { desc, eq, getTableColumns } from "drizzle-orm";
import type { Database } from "#backend/database/database";
import { ids, type CampaignId, type ScenarioId, type ThreadId } from "#backend/id";
import { requireModelSelection, type ModelSelection } from "#backend/provider/provider";
import { insertThread } from "#backend/thread/threads";
import { campaignModelOverrideTable, campaignTable } from "./schema";

export type Campaign = Readonly<{
  id: CampaignId;
  scenarioId: ScenarioId;
  threadId: ThreadId;
  startedAt: number;
  modelOverride?: ModelSelection;
}>;

type StoredCampaign = typeof campaignTable.$inferSelect & {
  modelOverride: ModelSelection | null;
};

const campaignSelection = {
  ...getTableColumns(campaignTable),
  modelOverride: {
    providerId: campaignModelOverrideTable.providerId,
    modelId: campaignModelOverrideTable.modelId,
    name: campaignModelOverrideTable.name,
    brandId: campaignModelOverrideTable.brandId,
  },
};

function toCampaign({ modelOverride, ...campaign }: StoredCampaign): Campaign {
  return modelOverride ? { ...campaign, modelOverride } : campaign;
}

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
        .select(campaignSelection)
        .from(campaignTable)
        .leftJoin(
          campaignModelOverrideTable,
          eq(campaignModelOverrideTable.campaignId, campaignTable.id),
        )
        .where(eq(campaignTable.scenarioId, scenarioId))
        .orderBy(desc(campaignTable.startedAt), desc(campaignTable.id))
        .all()
        .map(toCampaign);
    },

    get(id: CampaignId) {
      const campaign = database
        .select(campaignSelection)
        .from(campaignTable)
        .leftJoin(
          campaignModelOverrideTable,
          eq(campaignModelOverrideTable.campaignId, campaignTable.id),
        )
        .where(eq(campaignTable.id, id))
        .get();
      return campaign ? toCampaign(campaign) : null;
    },

    getContextForThread(threadId: ThreadId) {
      return (
        database
          .select({
            id: campaignTable.id,
            scenarioId: campaignTable.scenarioId,
            threadId: campaignTable.threadId,
          })
          .from(campaignTable)
          .where(eq(campaignTable.threadId, threadId))
          .get() ?? null
      );
    },

    setModelOverride(id: CampaignId, model: ModelSelection | null) {
      if (model) {
        requireModelSelection(model);
      }

      return database.transaction((transaction) => {
        const campaign = transaction
          .select()
          .from(campaignTable)
          .where(eq(campaignTable.id, id))
          .get();

        if (!campaign) {
          return null;
        }

        if (model) {
          transaction
            .insert(campaignModelOverrideTable)
            .values({ campaignId: id, ...model })
            .onConflictDoUpdate({
              target: campaignModelOverrideTable.campaignId,
              set: model,
            })
            .run();

          return { ...campaign, modelOverride: { ...model } };
        }

        transaction
          .delete(campaignModelOverrideTable)
          .where(eq(campaignModelOverrideTable.campaignId, id))
          .run();
        return campaign;
      });
    },
  };
}

export type CampaignEngine = ReturnType<typeof createCampaigns>;
export type Campaigns = Omit<CampaignEngine, "getContextForThread">;
