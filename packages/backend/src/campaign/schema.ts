import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { CampaignId, ScenarioId, ThreadId } from "#backend/id";
import { reasoningPresets } from "#backend/model/reasoning";
import { scenarioTable } from "#backend/scenario/schema";
import { threadTable } from "#backend/thread/schema";

export const campaignTable = sqliteTable(
  "campaigns",
  {
    id: text().$type<CampaignId>().notNull(),
    scenarioId: text("scenario_id")
      .$type<ScenarioId>()
      .notNull()
      .references(() => scenarioTable.id),
    threadId: text("thread_id")
      .$type<ThreadId>()
      .notNull()
      .references(() => threadTable.id),
    startedAt: integer("started_at").notNull(),
  },
  (campaign) => [
    primaryKey({ columns: [campaign.id] }),
    index("campaigns_scenario_started_at_index").on(
      campaign.scenarioId,
      campaign.startedAt,
      campaign.id,
    ),
    uniqueIndex("campaigns_thread_unique").on(campaign.threadId),
  ],
);

export const campaignGenerationPreferencesTable = sqliteTable(
  "campaign_generation_preferences",
  {
    campaignId: text("campaign_id")
      .$type<CampaignId>()
      .notNull()
      .references(() => campaignTable.id, { onDelete: "cascade" }),
    providerId: text("provider_id"),
    modelId: text("model_id"),
    name: text(),
    brandId: text("brand_id"),
    reasoningPreset: text("reasoning_preset", { enum: reasoningPresets }),
  },
  (preferences) => [
    primaryKey({ columns: [preferences.campaignId] }),
    check(
      "campaign_generation_preferences_values_valid",
      sql`(
          (${preferences.providerId} IS NULL
            AND ${preferences.modelId} IS NULL
            AND ${preferences.name} IS NULL
            AND ${preferences.brandId} IS NULL)
          OR
          (${preferences.providerId} IS NOT NULL
            AND ${preferences.modelId} IS NOT NULL
            AND ${preferences.name} IS NOT NULL
            AND ${preferences.brandId} IS NOT NULL
            AND length(trim(${preferences.providerId})) > 0
            AND length(trim(${preferences.modelId})) > 0
            AND length(trim(${preferences.name})) > 0
            AND length(trim(${preferences.brandId})) > 0)
        )
        AND (${preferences.providerId} IS NOT NULL OR ${preferences.reasoningPreset} IS NOT NULL)
        AND (${preferences.reasoningPreset} IS NULL OR ${preferences.reasoningPreset} IN ('automatic', 'on', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'))`,
    ),
  ],
);
