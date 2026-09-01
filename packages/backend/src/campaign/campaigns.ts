import { desc, eq, getTableColumns } from "drizzle-orm";
import type { Database } from "#backend/database/database";
import { ids, type CampaignId, type ScenarioId, type ThreadId } from "#backend/id";
import {
  requireCampaignGenerationPreferences,
  type CampaignGenerationPreferences,
} from "#backend/provider/provider";
import { insertThread } from "#backend/thread/threads";
import { campaignGenerationPreferencesTable, campaignTable } from "./schema";

export type Campaign = Readonly<{
  id: CampaignId;
  scenarioId: ScenarioId;
  threadId: ThreadId;
  startedAt: number;
  generationPreferences?: CampaignGenerationPreferences;
}>;

type StoredCampaign = typeof campaignTable.$inferSelect & {
  generationPreferences: Omit<
    typeof campaignGenerationPreferencesTable.$inferSelect,
    "campaignId"
  > | null;
};

const campaignSelection = {
  ...getTableColumns(campaignTable),
  generationPreferences: {
    providerId: campaignGenerationPreferencesTable.providerId,
    modelId: campaignGenerationPreferencesTable.modelId,
    name: campaignGenerationPreferencesTable.name,
    brandId: campaignGenerationPreferencesTable.brandId,
    reasoningPreset: campaignGenerationPreferencesTable.reasoningPreset,
  },
};

function toCampaign({ generationPreferences, ...campaign }: StoredCampaign): Campaign {
  if (!generationPreferences) {
    return campaign;
  }

  const { providerId, modelId, name, brandId, reasoningPreset } = generationPreferences;
  const model =
    providerId !== null && modelId !== null && name !== null && brandId !== null
      ? { providerId, modelId, name, brandId }
      : undefined;

  if (!model && (providerId !== null || modelId !== null || name !== null || brandId !== null)) {
    throw new Error(`Campaign "${campaign.id}" has incomplete generation model preferences.`);
  }

  const preferences: CampaignGenerationPreferences = {
    ...(model ? { model } : {}),
    ...(reasoningPreset === null ? {} : { reasoningPreset }),
  };
  requireCampaignGenerationPreferences(preferences);

  return {
    ...campaign,
    generationPreferences: preferences,
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
        .select(campaignSelection)
        .from(campaignTable)
        .leftJoin(
          campaignGenerationPreferencesTable,
          eq(campaignGenerationPreferencesTable.campaignId, campaignTable.id),
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
          campaignGenerationPreferencesTable,
          eq(campaignGenerationPreferencesTable.campaignId, campaignTable.id),
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
          })
          .from(campaignTable)
          .where(eq(campaignTable.threadId, threadId))
          .get() ?? null
      );
    },

    setGenerationPreferences(id: CampaignId, preferences: CampaignGenerationPreferences | null) {
      if (preferences) {
        requireCampaignGenerationPreferences(preferences);
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

        if (preferences) {
          const model = preferences.model;
          const values = {
            providerId: model?.providerId ?? null,
            modelId: model?.modelId ?? null,
            name: model?.name ?? null,
            brandId: model?.brandId ?? null,
            reasoningPreset: preferences.reasoningPreset ?? null,
          };
          transaction
            .insert(campaignGenerationPreferencesTable)
            .values({ campaignId: id, ...values })
            .onConflictDoUpdate({
              target: campaignGenerationPreferencesTable.campaignId,
              set: values,
            })
            .run();

          return {
            ...campaign,
            generationPreferences: {
              ...(model ? { model: { ...model } } : {}),
              ...(preferences.reasoningPreset === undefined
                ? {}
                : { reasoningPreset: preferences.reasoningPreset }),
            },
          };
        }

        transaction
          .delete(campaignGenerationPreferencesTable)
          .where(eq(campaignGenerationPreferencesTable.campaignId, id))
          .run();
        return campaign;
      });
    },
  };
}

export type CampaignEngine = ReturnType<typeof createCampaigns>;
export type Campaigns = Omit<CampaignEngine, "getContextForThread">;
