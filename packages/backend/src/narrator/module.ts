import { narratorPromptKindKey, parsePromptContent, parsePromptKey } from "@jaquelene/domain";
import type { PromptKindModule } from "#backend/prompt/module";
import type { BuiltInPromptDefinition, PromptKind } from "#backend/prompt/types";

export const narratorPromptKind = Object.freeze({
  key: narratorPromptKindKey,
  name: "Narrator",
  description:
    "Reusable instructions for how AI models narrate across campaigns, regardless of setting or universe.",
}) satisfies PromptKind;

const jaqueleneContent = parsePromptContent({
  title: "Jaquelene",
  body: "You are the narrator of an interactive roleplay. Use the provided context to portray the world and its characters, maintain continuity, and continue the story through narration and dialogue.",
});

export const jaqueleneNarratorPromptDefinition = Object.freeze({
  key: parsePromptKey("builtin.narrator.jaquelene"),
  ...jaqueleneContent,
}) satisfies BuiltInPromptDefinition;

export const narratorPromptModule = Object.freeze({
  definition: narratorPromptKind,
  builtInPrompts: Object.freeze([jaqueleneNarratorPromptDefinition]),
  fallbackPromptKey: jaqueleneNarratorPromptDefinition.key,
  createApplication(prompts) {
    return {
      apply({ campaign }) {
        if (!campaign) {
          return [];
        }

        const prompt = prompts.resolveCampaignPrompt(campaign.id, narratorPromptKind.key);

        if (!prompt) {
          throw new Error(`Campaign "${campaign.id}" has no narrator prompt.`);
        }

        return [{ key: prompt.key, content: prompt.body }];
      },
    };
  },
}) satisfies PromptKindModule;
