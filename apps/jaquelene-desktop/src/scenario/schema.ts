import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const scenarioTable = sqliteTable("scenarios", {
  id: text().notNull().primaryKey(),
  title: text().notNull(),
});
