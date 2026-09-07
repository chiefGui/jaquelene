import { openingScenePromptKindKey } from "@jaquelene/domain";
import type { PromptKindModule } from "#backend/prompt/module";

export const openingScenePromptModule = Object.freeze({
  definition: Object.freeze({
    key: openingScenePromptKindKey,
    name: "Opening scenes",
    description: "Reusable first scenes to copy into your campaigns.",
  }),
  builtInPrompts: Object.freeze([]),
}) satisfies PromptKindModule;
