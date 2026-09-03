import { Context, Effect, Layer } from "effect";
import { DatabaseService, type Database } from "#backend/database/database";
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

export type PromptSubsystem = ReturnType<typeof createPromptSubsystem>;

export class PromptService extends Context.Service<PromptService, PromptSubsystem>()(
  "@jaquelene/backend/Prompts",
) {
  static readonly layer = (modules: readonly PromptKindModule[], now: () => number = Date.now) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        return createPromptSubsystem(yield* DatabaseService, modules, now);
      }),
    );
}
