import { scenarioPromptKindKey } from "@jaquelene/domain";
import type { PromptKindModule } from "#backend/prompt/module";

export const scenarioPromptModule = Object.freeze({
  definition: Object.freeze({
    key: scenarioPromptKindKey,
    name: "Scenarios",
    description: "Reusable settings and universes to copy into your campaigns.",
  }),
  builtInPrompts: Object.freeze([]),
}) satisfies PromptKindModule;
