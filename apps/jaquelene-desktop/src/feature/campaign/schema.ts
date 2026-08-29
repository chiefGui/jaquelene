import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { scenarioTable } from "../scenario/schema";
import { threadTable } from "../thread/schema";

export const campaignTable = sqliteTable(
  "campaigns",
  {
    id: text().notNull(),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarioTable.id),
    threadId: text("thread_id")
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
