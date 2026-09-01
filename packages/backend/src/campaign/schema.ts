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

export const campaignGenerationConfigurationOverrideTable = sqliteTable(
  "campaign_generation_configuration_overrides",
  {
    campaignId: text("campaign_id")
      .$type<CampaignId>()
      .notNull()
      .references(() => campaignTable.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    modelId: text("model_id").notNull(),
    name: text().notNull(),
    brandId: text("brand_id").notNull(),
    reasoningPresetOverride: text("reasoning_preset_override", { enum: reasoningPresets }),
  },
  (configurationOverride) => [
    primaryKey({ columns: [configurationOverride.campaignId] }),
    check(
      "campaign_generation_configuration_overrides_values_valid",
      sql`length(trim(${configurationOverride.providerId})) > 0
        AND length(trim(${configurationOverride.modelId})) > 0
        AND length(trim(${configurationOverride.name})) > 0
        AND length(trim(${configurationOverride.brandId})) > 0
        AND (${configurationOverride.reasoningPresetOverride} IS NULL OR ${configurationOverride.reasoningPresetOverride} IN ('automatic', 'on', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'))`,
    ),
  ],
);
