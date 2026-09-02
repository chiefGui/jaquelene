import { SCENARIO_TITLE_MAX_LENGTH, type ScenarioTitle } from "@jaquelene/domain";
import { sql } from "drizzle-orm";
import { check, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ScenarioId } from "#backend/id";

// SQLite trims only ASCII spaces by default. This set matches ECMAScript
// String.prototype.trim so direct writes preserve the domain's canonical form.
const sqliteWhitespaceCharacters = sql.raw(
  "char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)",
);

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
