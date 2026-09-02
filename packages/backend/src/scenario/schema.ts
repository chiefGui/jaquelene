import { SCENARIO_TITLE_MAX_LENGTH, type ScenarioTitle } from "@jaquelene/domain";
import { sql } from "drizzle-orm";
import { check, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sqliteWhitespaceCharacters } from "#backend/database/sqlite-text";
import type { ScenarioId } from "#backend/id";

// DDL constraints cannot bind parameters, so emit this trusted constant as SQL.
const scenarioTitleMaxLengthSql = sql.raw(String(SCENARIO_TITLE_MAX_LENGTH));

export const scenarioTable = sqliteTable(
  "scenarios",
  {
    id: text().$type<ScenarioId>().notNull(),
    title: text().$type<ScenarioTitle>().notNull(),
  },
  (scenario) => [
    primaryKey({ columns: [scenario.id] }),
    check(
      "scenarios_title_valid",
      sql`${scenario.title} = trim(${scenario.title}, ${sqliteWhitespaceCharacters}) AND length(${scenario.title}) > 0 AND length(${scenario.title}) <= ${scenarioTitleMaxLengthSql}`,
    ),
  ],
);
