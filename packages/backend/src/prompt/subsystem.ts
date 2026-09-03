import type { Database } from "#backend/database/database";
import { createPromptApplicationRegistry } from "./application-registry";
import type { PromptKindModule } from "./module";
import { createPrompts } from "./prompts";

export function createPromptSubsystem(
  database: Database,
  modules: readonly PromptKindModule[],
  now: () => number = Date.now,
) {
  const prompts = createPrompts(database, modules, now);
  const applications = createPromptApplicationRegistry(
    modules.map((module) => ({
      kind: module.definition.key,
      apply: module.createApplication(prompts).apply,
    })),
  );

  return { applications, prompts };
}
