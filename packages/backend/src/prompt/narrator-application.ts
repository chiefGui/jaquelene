import type { PromptKindKey } from "@jaquelene/domain";
import type { PromptApplication } from "./application-registry";
import { narratorPromptKind } from "./factory/narrator";
import type { PromptEngine } from "./prompts";

export function createNarratorPromptApplication(
  prompts: Pick<PromptEngine, "resolveCampaignPrompt">,
): PromptApplication {
  return {
    kind: narratorPromptKind.key as PromptKindKey,
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
}
