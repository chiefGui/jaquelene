import { narratorPromptKindKey, parsePromptContent, parsePromptKey } from "@jaquelene/domain";
import type { PromptKindModule } from "#backend/prompt/module";
import type { FactoryPromptDefinition, PromptKind } from "#backend/prompt/types";

export const narratorPromptKind = Object.freeze({
  key: narratorPromptKindKey,
  name: "Narrator",
  description:
    "Reusable instructions for how AI models narrate across campaigns, regardless of setting or universe. Use them for rules such as second- or third-person narration.",
}) satisfies PromptKind;

const jaqueleneContent = parsePromptContent({
  title: "Jaquelene",
  body: "You are the narrator of an interactive roleplay. Use the provided context to portray the world and its characters, maintain continuity, and continue the story through narration and dialogue.",
});

export const jaqueleneNarratorPrompt = Object.freeze({
  key: parsePromptKey("factory.narrator.jaquelene"),
  kind: narratorPromptKind.key,
  origin: "factory",
  ...jaqueleneContent,
  createdAt: 0,
}) satisfies FactoryPromptDefinition;

export const narratorPromptModule = Object.freeze({
  definition: narratorPromptKind,
  factoryPrompts: Object.freeze([jaqueleneNarratorPrompt]),
  fallbackPromptKey: jaqueleneNarratorPrompt.key,
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
