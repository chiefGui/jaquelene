import { desc, eq } from "drizzle-orm";
import type { Database } from "#backend/database/database";
import { ids, type CampaignId, type ScenarioId, type ThreadId } from "#backend/id";
import { requireModelSelection, type ModelSelection } from "#backend/provider/provider";
import { insertThread } from "#backend/thread/threads";
import { campaignTable } from "./schema";

export type Campaign = Readonly<{
  id: CampaignId;
  scenarioId: ScenarioId;
  threadId: ThreadId;
  startedAt: number;
  modelOverride?: ModelSelection;
}>;

type StoredCampaign = typeof campaignTable.$inferSelect;

function toCampaign({
  modelProviderId,
  modelId,
  modelName,
  modelBrandId,
  ...campaign
}: StoredCampaign): Campaign {
  if (modelProviderId === null && modelId === null && modelName === null && modelBrandId === null) {
    return campaign;
  }

  if (modelProviderId === null || modelId === null || modelName === null || modelBrandId === null) {
    throw new Error(`Campaign "${campaign.id}" has an incomplete model override.`);
  }

  return {
    ...campaign,
    modelOverride: {
      providerId: modelProviderId,
      modelId,
      name: modelName,
      brandId: modelBrandId,
    },
  };
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
        .select()
        .from(campaignTable)
        .where(eq(campaignTable.scenarioId, scenarioId))
        .orderBy(desc(campaignTable.startedAt), desc(campaignTable.id))
        .all()
        .map(toCampaign);
    },

    get(id: CampaignId) {
      const campaign = database.select().from(campaignTable).where(eq(campaignTable.id, id)).get();
      return campaign ? toCampaign(campaign) : null;
    },

    setModelOverride(id: CampaignId, model: ModelSelection | null) {
      if (model) {
        requireModelSelection(model);
      }

      const campaign = database
        .update(campaignTable)
        .set({
          modelProviderId: model?.providerId ?? null,
          modelId: model?.modelId ?? null,
          modelName: model?.name ?? null,
          modelBrandId: model?.brandId ?? null,
        })
        .where(eq(campaignTable.id, id))
        .returning()
        .get();

      return campaign ? toCampaign(campaign) : null;
    },
  };
}

export type Campaigns = ReturnType<typeof createCampaigns>;
