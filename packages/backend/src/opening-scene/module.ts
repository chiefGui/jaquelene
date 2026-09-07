import { openingScenePromptKindKey } from "@jaquelene/domain";
import type { PromptKindModule } from "#backend/prompt/module";

export const openingScenePromptModule = Object.freeze({
  definition: Object.freeze({
    key: openingScenePromptKindKey,
    name: "Opening scenes",
    description:
      "The exact first message of a campaign. Helps the AI understand the language and pacing, so you can start your journey exactly the way you want.",
  }),
  builtInPrompts: Object.freeze([]),
}) satisfies PromptKindModule;
