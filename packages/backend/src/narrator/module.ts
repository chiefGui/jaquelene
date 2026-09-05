import { narratorSkillKindKey, parseSkillContent, parseSkillKey } from "@jaquelene/domain";
import type { CampaignInstructionApplication } from "#backend/campaign/instructions";
import type { CampaignSkillEngine } from "#backend/campaign/skills";
import type {
  BuiltInSkillDefinition,
  SkillKind,
  SkillKindRegistration,
} from "#backend/skill/types";

export const narratorSkillKind = Object.freeze({
  key: narratorSkillKindKey,
  name: "Narrator",
  description:
    "Reusable instructions for how AI models narrate across campaigns, regardless of setting or universe.",
}) satisfies SkillKind;

const jaqueleneContent = parseSkillContent({
  title: "Jaquelene",
  prompt:
    "You are the narrator of an interactive roleplay. Use the provided context to portray the world and its characters, maintain continuity, and continue the story through narration and dialogue.",
});

export const jaqueleneNarratorSkillDefinition = Object.freeze({
  key: parseSkillKey("builtin.narrator.jaquelene"),
  ...jaqueleneContent,
}) satisfies BuiltInSkillDefinition;

export const narratorSkillRegistration = Object.freeze({
  definition: narratorSkillKind,
  builtInSkills: Object.freeze([jaqueleneNarratorSkillDefinition]),
  fallbackSkillKey: jaqueleneNarratorSkillDefinition.key,
}) satisfies SkillKindRegistration;

export function createNarratorApplication(
  skills: Pick<CampaignSkillEngine, "resolve">,
): CampaignInstructionApplication {
  return {
    kind: narratorSkillKind.key,
    apply({ campaign }) {
      if (!campaign) {
        return [];
      }

      const skill = skills.resolve(campaign.id, narratorSkillKind.key);

      if (!skill) {
        throw new Error(`Campaign "${campaign.id}" has no narrator prompt.`);
      }

      return [{ sourceKey: skill.key, content: skill.prompt }];
    },
  };
}
