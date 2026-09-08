import type { Skill } from "#backend/skill/skill";
import type { ModelInput } from "#backend/model/input";
import type { ResolvedModelConfiguration } from "#backend/model/execution";
import type { UsageAttribution } from "#backend/usage/types";

export type ComposerSkillInput = Readonly<{
  executionId: string;
  configuration: ResolvedModelConfiguration;
  context: ModelInput;
  attribution: UsageAttribution;
}>;

export type ComposerSkill = Skill<ComposerSkillInput, string>;
