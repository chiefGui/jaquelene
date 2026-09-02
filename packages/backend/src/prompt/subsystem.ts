import type { Database } from "#backend/database/database";
import { createPromptApplicationRegistry, type PromptApplication } from "./application-registry";
import { createPrompts, type PromptEngine } from "./prompts";
import type { PromptKindRegistration } from "./types";

export type PromptKindModule = PromptKindRegistration &
  Readonly<{
    createApplication: (
      prompts: Pick<PromptEngine, "resolveCampaignPrompt">,
    ) => Pick<PromptApplication, "apply">;
  }>;

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
