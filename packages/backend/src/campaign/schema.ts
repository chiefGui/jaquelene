import {
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
