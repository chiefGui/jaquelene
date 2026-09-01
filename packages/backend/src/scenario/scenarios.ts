import {
  parseCreateScenarioInput,
  parseScenarioTitle,
  type CreateScenarioInput,
} from "@jaquelene/domain";
import { eq } from "drizzle-orm";
import type { Database } from "#backend/database/database";
import { ids, type ScenarioId } from "#backend/id";
import { scenarioTable } from "./schema";

export function createScenarios(database: Database) {
  return {
    create(input: CreateScenarioInput) {
      const { title } = parseCreateScenarioInput(input);
      const scenario = { id: ids.scenario.create(), title };
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
      const title = parseScenarioTitle(value);

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
