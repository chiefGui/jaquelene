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

export const campaignContinuationTable = sqliteTable(
  "campaign_continuation",
  {
    id: integer().$type<1>().notNull(),
    campaignId: text("campaign_id")
      .$type<CampaignId>()
      .notNull()
      .references(() => campaignTable.id, { onDelete: "cascade" }),
  },
  (continuation) => [
    primaryKey({ columns: [continuation.id] }),
    check("campaign_continuation_singleton", sql`${continuation.id} = 1`),
  ],
);

export const campaignModelOverrideTable = sqliteTable(
  "campaign_model_overrides",
  {
    campaignId: text("campaign_id")
      .$type<CampaignId>()
      .notNull()
      .references(() => campaignTable.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    modelId: text("model_id").notNull(),
    name: text().notNull(),
    brandId: text("brand_id").notNull(),
  },
  (modelOverride) => [
    primaryKey({ columns: [modelOverride.campaignId] }),
    check(
      "campaign_model_overrides_values_valid",
      sql`length(trim(${modelOverride.providerId})) > 0
        AND length(trim(${modelOverride.modelId})) > 0
        AND length(trim(${modelOverride.name})) > 0
        AND length(trim(${modelOverride.brandId})) > 0`,
    ),
  ],
);
