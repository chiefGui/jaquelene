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
    modelProviderId: text("model_provider_id"),
    modelId: text("model_id"),
    modelName: text("model_name"),
    modelBrandId: text("model_brand_id"),
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
    check(
      "campaigns_model_override_valid",
      sql`(${campaign.modelProviderId} IS NULL
          AND ${campaign.modelId} IS NULL
          AND ${campaign.modelName} IS NULL
          AND ${campaign.modelBrandId} IS NULL)
        OR (${campaign.modelProviderId} IS NOT NULL
          AND ${campaign.modelId} IS NOT NULL
          AND ${campaign.modelName} IS NOT NULL
          AND ${campaign.modelBrandId} IS NOT NULL
          AND length(trim(${campaign.modelProviderId})) > 0
          AND length(trim(${campaign.modelId})) > 0
          AND length(trim(${campaign.modelName})) > 0
          AND length(trim(${campaign.modelBrandId})) > 0)`,
    ),
  ],
);
