import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ScenarioId } from "#backend/id";

export const scenarioTable = sqliteTable("scenarios", {
  id: text().$type<ScenarioId>().notNull().primaryKey(),
  title: text().notNull(),
});
