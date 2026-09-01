import { desc, eq, getTableColumns } from "drizzle-orm";
import type { Database } from "#backend/database/database";
import { ids, type CampaignId, type ScenarioId, type ThreadId } from "#backend/id";
import {
  requireGenerationConfigurationSelection,
  type GenerationConfigurationSelection,
} from "#backend/provider/provider";
import { insertThread } from "#backend/thread/threads";
import { campaignGenerationConfigurationOverrideTable, campaignTable } from "./schema";

export type Campaign = Readonly<{
  id: CampaignId;
  scenarioId: ScenarioId;
  threadId: ThreadId;
  startedAt: number;
  generationConfigurationOverride?: GenerationConfigurationSelection;
}>;

type StoredCampaign = typeof campaignTable.$inferSelect & {
  generationConfigurationOverride: Omit<
    typeof campaignGenerationConfigurationOverrideTable.$inferSelect,
    "campaignId"
  > | null;
};

const campaignSelection = {
  ...getTableColumns(campaignTable),
  generationConfigurationOverride: {
    providerId: campaignGenerationConfigurationOverrideTable.providerId,
    modelId: campaignGenerationConfigurationOverrideTable.modelId,
    name: campaignGenerationConfigurationOverrideTable.name,
    brandId: campaignGenerationConfigurationOverrideTable.brandId,
    reasoningEffort: campaignGenerationConfigurationOverrideTable.reasoningEffort,
  },
};

function toCampaign({ generationConfigurationOverride, ...campaign }: StoredCampaign): Campaign {
  if (!generationConfigurationOverride) {
    return campaign;
  }

  const { reasoningEffort, ...model } = generationConfigurationOverride;
  return {
    ...campaign,
    generationConfigurationOverride: {
      model,
      ...(reasoningEffort === null ? {} : { reasoningEffort }),
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
        .select(campaignSelection)
        .from(campaignTable)
        .leftJoin(
          campaignGenerationConfigurationOverrideTable,
          eq(campaignGenerationConfigurationOverrideTable.campaignId, campaignTable.id),
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
          campaignGenerationConfigurationOverrideTable,
          eq(campaignGenerationConfigurationOverrideTable.campaignId, campaignTable.id),
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

    setGenerationConfigurationOverride(
      id: CampaignId,
      configuration: GenerationConfigurationSelection | null,
    ) {
      if (configuration) {
        requireGenerationConfigurationSelection(configuration);
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

        if (configuration) {
          const values = {
            ...configuration.model,
            reasoningEffort: configuration.reasoningEffort ?? null,
          };
          transaction
            .insert(campaignGenerationConfigurationOverrideTable)
            .values({ campaignId: id, ...values })
            .onConflictDoUpdate({
              target: campaignGenerationConfigurationOverrideTable.campaignId,
              set: values,
            })
            .run();

          return {
            ...campaign,
            generationConfigurationOverride: {
              model: { ...configuration.model },
              ...(configuration.reasoningEffort === undefined
                ? {}
                : { reasoningEffort: configuration.reasoningEffort }),
            },
          };
        }

        transaction
          .delete(campaignGenerationConfigurationOverrideTable)
          .where(eq(campaignGenerationConfigurationOverrideTable.campaignId, id))
          .run();
        return campaign;
      });
    },
  };
}

export type CampaignEngine = ReturnType<typeof createCampaigns>;
export type Campaigns = Omit<CampaignEngine, "getContextForThread">;
