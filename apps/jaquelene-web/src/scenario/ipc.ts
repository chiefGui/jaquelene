import { Scenarios, type Scenario } from "@jaquelene/ipc/renderer";

export type { Scenario };

if (!Scenarios?.create || !Scenarios.list || !Scenarios.get || !Scenarios.rename) {
  throw new Error("The Jaquelene application IPC is unavailable.");
}

const {
  create: createScenario,
  get: getScenario,
  list: listScenarios,
  rename: renameScenario,
} = Scenarios;

function normalizeScenarioTitle(value: string) {
  const title = value.trim();
  return title || undefined;
}

export const scenarioIpc = {
  async create(value: string) {
    const title = normalizeScenarioTitle(value);

    return title
      ? { status: "created" as const, scenario: await createScenario(title) }
      : { status: "empty-title" as const };
  },
  list: listScenarios,
  get: getScenario,
  async rename(id: string, value: string) {
    const title = normalizeScenarioTitle(value);

    if (!title) {
      return { status: "empty-title" as const };
    }

    const scenario = await renameScenario(id, title);
    return scenario ? { status: "renamed" as const, scenario } : { status: "not-found" as const };
  },
};
