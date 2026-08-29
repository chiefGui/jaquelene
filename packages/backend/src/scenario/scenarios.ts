import { eq } from "drizzle-orm";
import type { Database } from "../database/database";
import { ids, type ScenarioId } from "../id";
import { scenarioTable } from "./schema";

function requireScenarioTitle(value: string) {
  const title = value.trim();

  if (!title) {
    throw new TypeError("Scenario title must contain text.");
  }

  return title;
}

export function createScenarios(database: Database) {
  return {
    create(value: string) {
      const scenario = { id: ids.scenario.create(), title: requireScenarioTitle(value) };
      database.insert(scenarioTable).values(scenario).run();
      return scenario;
    },

    list() {
      return database.select().from(scenarioTable).all();
    },

    get(id: ScenarioId) {
      return database.select().from(scenarioTable).where(eq(scenarioTable.id, id)).get() ?? null;
    },

    rename(id: ScenarioId, value: string) {
      const title = requireScenarioTitle(value);

      return (
        database
          .update(scenarioTable)
          .set({ title })
          .where(eq(scenarioTable.id, id))
          .returning()
          .get() ?? null
      );
    },
  };
}

export type Scenarios = ReturnType<typeof createScenarios>;
