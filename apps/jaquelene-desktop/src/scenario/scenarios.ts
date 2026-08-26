import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "../database";
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
      const scenario = { id: randomUUID(), title: requireScenarioTitle(value) };
      database.insert(scenarioTable).values(scenario).run();
      return scenario;
    },

    list() {
      return database.select().from(scenarioTable).all();
    },

    get(id: string) {
      return database.select().from(scenarioTable).where(eq(scenarioTable.id, id)).get() ?? null;
    },

    rename(id: string, value: string) {
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
