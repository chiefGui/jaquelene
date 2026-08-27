import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { scenarioTable } from "../scenario/schema";

export const campaignTable = sqliteTable(
  "campaigns",
  {
    id: text().notNull(),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarioTable.id),
    startedAt: integer("started_at").notNull(),
  },
  (campaign) => [
    primaryKey({ columns: [campaign.id] }),
    index("campaigns_scenario_started_at_index").on(
      campaign.scenarioId,
      campaign.startedAt,
      campaign.id,
    ),
  ],
);
